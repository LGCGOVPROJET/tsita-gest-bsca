<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\ComplaintStatus;
use App\Enums\DeadlineKind;
use App\Enums\DeliveryStatus;
use App\Enums\EventType;
use App\Enums\ImportStatus;
use App\Enums\Priority;
use App\Enums\RiskLevel;
use App\Enums\Visibility;
use App\Models\Agency;
use App\Models\Category;
use App\Models\Channel;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\ImportAnomaly;
use App\Models\ImportBatch;
use App\Models\Product;
use App\Models\User;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Reprise de l'existant (CSV).
 *
 * - Idempotence : empreinte SHA-256 du fichier (unique) + unicité (source_system, source_id).
 * - Le libellé de statut source est conservé (source_status_label).
 * - Aucune date de réponse n'est inventée : absente ou incohérente → NULL + anomalie.
 * - Toute ligne impossible à interpréter n'est pas créée et est consignée dans import_anomalies.
 */
final class LegacyImportService
{
    public const COLUMNS = [
        'source_id', 'date_reception', 'canal', 'agence_code', 'categorie', 'produit_code', 'client_nom',
        'client_email', 'client_telephone', 'objet', 'description', 'montant', 'devise', 'statut_source', 'date_reponse',
    ];

    /** Correspondance des libellés de statut source (normalisés) vers le statut interne. */
    public const STATUS_MAP = [
        'nouveau' => 'recu', 'recu' => 'recu', 'enregistre' => 'recu',
        'a qualifier' => 'a_qualifier',
        'en cours' => 'en_investigation', 'en traitement' => 'en_investigation', 'en analyse' => 'en_investigation',
        'en attente client' => 'attente_information', 'attente pieces' => 'attente_information',
        'repondu' => 'reponse_envoyee', 'reponse envoyee' => 'reponse_envoyee', 'traite' => 'reponse_envoyee',
        'cloture' => 'cloture', 'clos' => 'cloture', 'ferme' => 'cloture',
    ];

    public function __construct(
        private readonly ReferenceGenerator $references,
        private readonly DeadlineCalculator $deadlines,
        private readonly ComplaintWorkflow $workflow,
        private readonly AuditLogger $audit,
    ) {}

    /** @return array{batch: ImportBatch, already_imported: bool} */
    public function import(string $path, string $originalName, string $sourceSystem, User $user): array
    {
        $content = (string) file_get_contents($path);
        $sha = hash('sha256', $content);

        $existing = ImportBatch::query()->where('file_sha256', $sha)->first();
        if ($existing !== null) {
            $this->audit->log('import.duplicate_file', $existing, null, ['filename' => $originalName, 'sha256' => $sha], 'Fichier déjà importé : aucune création', $user);

            return ['batch' => $existing, 'already_imported' => true];
        }

        $batch = DB::transaction(function () use ($content, $sha, $originalName, $sourceSystem, $user): ImportBatch {
            $batch = ImportBatch::query()->create([
                'filename' => mb_substr(basename($originalName), 0, 255),
                'file_sha256' => $sha,
                'source_system' => $sourceSystem,
                'status' => ImportStatus::EnCours,
                'imported_by' => $user->id,
            ]);
            $this->process($batch, $content, $user);

            return $batch->refresh();
        });

        $this->audit->log('import.run', $batch, null, $batch->only(['filename', 'file_sha256', 'rows_total', 'rows_created', 'rows_skipped', 'rows_anomalies']), null, $user);

        return ['batch' => $batch, 'already_imported' => false];
    }

    private function process(ImportBatch $batch, string $content, User $user): void
    {
        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        }
        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }
        $lines = preg_split('/\r\n|\n|\r/', $content) ?: [];
        $headerLine = array_shift($lines) ?? '';
        $delimiter = substr_count($headerLine, ';') >= substr_count($headerLine, ',') ? ';' : ',';
        $header = array_map(static fn ($h) => strtolower(trim((string) $h)), str_getcsv($headerLine, $delimiter, '"', ''));

        $missing = array_diff(['source_id', 'date_reception', 'canal', 'client_nom', 'objet', 'statut_source'], $header);
        $report = ['delimiter' => $delimiter, 'created_references' => [], 'skipped_source_ids' => [], 'by_status' => [], 'by_month' => [], 'by_channel' => []];
        $total = $created = $skipped = $anomalies = 0;

        if ($missing !== []) {
            $this->anomaly($batch, 1, null, 'Colonnes obligatoires absentes : '.implode(', ', $missing), ['header' => $header]);
            $batch->update(['status' => ImportStatus::Echec, 'rows_anomalies' => 1, 'report' => $report]);

            return;
        }

        $seen = [];
        foreach ($lines as $i => $line) {
            if (trim($line) === '') {
                continue;
            }
            $rowNumber = $i + 2;
            $total++;
            $values = str_getcsv($line, $delimiter, '"', '');
            $raw = [];
            foreach ($header as $k => $col) {
                $raw[$col] = isset($values[$k]) ? trim((string) $values[$k]) : '';
            }

            try {
                $result = $this->importRow($batch, $rowNumber, $raw, $seen, $user);
            } catch (Throwable $e) {
                report($e);
                $this->anomaly($batch, $rowNumber, $raw['source_id'] ?? null, 'Erreur technique à l\'import de la ligne.', $raw);
                $anomalies++;

                continue;
            }
            $anomalies += $result['anomalies'];
            if ($result['outcome'] === 'created') {
                $created++;
                $c = $result['complaint'];
                $report['created_references'][] = $c->reference;
                $report['by_status'][$c->status->value] = ($report['by_status'][$c->status->value] ?? 0) + 1;
                $ym = Dt::parseLocal($c->received_at)->format('Y-m');
                $report['by_month'][$ym] = ($report['by_month'][$ym] ?? 0) + 1;
                $report['by_channel'][$raw['canal']] = ($report['by_channel'][$raw['canal']] ?? 0) + 1;
            } elseif ($result['outcome'] === 'skipped') {
                $skipped++;
                $report['skipped_source_ids'][] = $raw['source_id'];
            }
        }

        $batch->update([
            'status' => $anomalies > 0 ? ImportStatus::TermineAvecAnomalies : ImportStatus::Termine,
            'rows_total' => $total,
            'rows_created' => $created,
            'rows_skipped' => $skipped,
            'rows_anomalies' => $anomalies,
            'report' => $report,
        ]);
    }

    /**
     * @param  array<string, string>  $raw
     * @param  array<string, true>  $seen
     * @return array{outcome: string, anomalies: int, complaint?: Complaint}
     */
    private function importRow(ImportBatch $batch, int $rowNumber, array $raw, array &$seen, User $user): array
    {
        $sourceId = $raw['source_id'] ?? '';
        $system = $batch->source_system;
        if ($sourceId === '') {
            $this->anomaly($batch, $rowNumber, null, 'Identifiant source absent : ligne non importée.', $raw);

            return ['outcome' => 'rejected', 'anomalies' => 1];
        }
        if (isset($seen[$sourceId]) || Complaint::query()->where('source_system', $system)->where('source_id', $sourceId)->exists()) {
            return ['outcome' => 'skipped', 'anomalies' => 0];
        }
        $seen[$sourceId] = true;

        $receivedAt = $this->parseDate($raw['date_reception'] ?? '');
        if ($receivedAt === null) {
            $this->anomaly($batch, $rowNumber, $sourceId, 'Date de réception absente ou illisible : ligne non importée.', $raw);

            return ['outcome' => 'rejected', 'anomalies' => 1];
        }
        $statusKey = self::normalize($raw['statut_source'] ?? '');
        $status = isset(self::STATUS_MAP[$statusKey]) ? ComplaintStatus::from(self::STATUS_MAP[$statusKey]) : null;
        if ($status === null) {
            $this->anomaly($batch, $rowNumber, $sourceId, 'Statut source non reconnu (« '.($raw['statut_source'] ?? '').' ») : décision humaine requise.', $raw);

            return ['outcome' => 'rejected', 'anomalies' => 1];
        }
        $channel = Channel::query()->where('code', self::normalize($raw['canal'] ?? '', '_'))->first()
            ?? Channel::query()->whereRaw('lower(label) = ?', [mb_strtolower($raw['canal'] ?? '')])->first();
        if ($channel === null) {
            $this->anomaly($batch, $rowNumber, $sourceId, 'Canal inconnu (« '.($raw['canal'] ?? '').' ») : ligne non importée.', $raw);

            return ['outcome' => 'rejected', 'anomalies' => 1];
        }
        if (trim($raw['client_nom'] ?? '') === '' || trim($raw['objet'] ?? '') === '') {
            $this->anomaly($batch, $rowNumber, $sourceId, 'Nom du client ou objet absent : ligne non importée.', $raw);

            return ['outcome' => 'rejected', 'anomalies' => 1];
        }

        $issues = [];
        $agency = null;
        if (($raw['agence_code'] ?? '') !== '') {
            $agency = Agency::query()->where('code', $raw['agence_code'])->first();
            if ($agency === null) {
                $issues[] = 'Agence inconnue (« '.$raw['agence_code'].' ») : laissée vide.';
            }
        }
        $category = null;
        if (($raw['categorie'] ?? '') !== '') {
            $category = Category::query()->where('code', $raw['categorie'])
                ->orWhereRaw('lower(label) = ?', [mb_strtolower($raw['categorie'])])->first();
            if ($category === null) {
                $issues[] = 'Catégorie non reconnue (« '.$raw['categorie'].' ») : à qualifier.';
            }
        }
        $product = null;
        if (($raw['produit_code'] ?? '') !== '') {
            $product = Product::query()->where('code', $raw['produit_code'])->first();
            if ($product === null) {
                $issues[] = 'Produit inconnu (« '.$raw['produit_code'].' ») : laissé vide.';
            }
        }

        $amount = null;
        $currency = null;
        $amountRaw = str_replace([' ', "\u{00A0}"], '', $raw['montant'] ?? '');
        if ($amountRaw !== '') {
            $normalized = str_replace(',', '.', $amountRaw);
            if (! is_numeric($normalized)) {
                $issues[] = 'Montant illisible : laissé inconnu (NULL).';
            } elseif (($raw['devise'] ?? '') === '' || preg_match('/^[A-Z]{3}$/', strtoupper($raw['devise'])) !== 1) {
                $issues[] = 'Montant sans devise valide : laissé inconnu (NULL).';
            } else {
                $amount = number_format((float) $normalized, 2, '.', '');
                $currency = strtoupper($raw['devise']);
            }
        }

        $finalResponseAt = null;
        if (($raw['date_reponse'] ?? '') !== '') {
            $finalResponseAt = $this->parseDate($raw['date_reponse']);
            if ($finalResponseAt === null) {
                $issues[] = 'Date de réponse illisible : non renseignée.';
            } elseif ($finalResponseAt->lessThan($receivedAt)) {
                $issues[] = 'Date de réponse antérieure à la réception : non renseignée.';
                $finalResponseAt = null;
            } elseif (! $status->isAnswered()) {
                $issues[] = 'Date de réponse présente alors que le statut source indique un dossier ouvert : à vérifier.';
            }
        } elseif ($status->isAnswered()) {
            $issues[] = 'Statut « répondu/clôturé » sans date de réponse : aucune date inventée, dossier compté ouvert.';
        }

        $customer = Customer::query()->create([
            'full_name' => mb_substr($raw['client_nom'], 0, 150),
            'email' => filter_var($raw['client_email'] ?? '', FILTER_VALIDATE_EMAIL) ?: null,
            'phone' => ($raw['client_telephone'] ?? '') !== '' ? mb_substr($raw['client_telephone'], 0, 40) : null,
            'preferred_channel' => 'courrier',
        ]);
        $complaint = Complaint::query()->create([
            'reference' => $this->references->next($receivedAt),
            // Aucun code de suivi n'est communiqué pour un dossier repris : empreinte inutilisable.
            'tracking_code_hash' => '!import-sans-code',
            'customer_id' => $customer->id,
            'channel_id' => $channel->id,
            'receiving_agency_id' => $agency?->id,
            'category_id' => $category?->id,
            'product_id' => $product?->id,
            'subject' => mb_substr($raw['objet'], 0, 190),
            'description' => ($raw['description'] ?? '') !== '' ? $raw['description'] : '(description absente dans la source)',
            'status' => $status,
            'priority' => Priority::Normale,
            'risk_level' => RiskLevel::Faible,
            'amount' => $amount,
            'currency' => $currency,
            'amount_flagged' => ComplaintWorkflow::isAmountOutOfNorm($amount),
            'received_at' => $receivedAt,
            'acknowledgment_status' => DeliveryStatus::EnAttente,
            'final_response_at' => $finalResponseAt,
            'closed_at' => $status === ComplaintStatus::Cloture ? $finalResponseAt : null,
            'source_system' => $batch->source_system,
            'source_id' => mb_substr($sourceId, 0, 100),
            'source_status_label' => mb_substr($raw['statut_source'], 0, 150),
            'created_by' => $user->id,
        ]);
        $this->deadlines->scheduleFor($complaint);
        if ($finalResponseAt !== null) {
            $this->deadlines->markMet($complaint, DeadlineKind::ReponseFinale, $finalResponseAt);
        }
        $this->workflow->event($complaint, EventType::Created, 'Dossier repris de l\'existant',
            'Source '.$batch->source_system.' · identifiant '.$sourceId.' · statut source « '.$raw['statut_source'].' » · lot n° '.$batch->id,
            Visibility::Internal, $user);

        foreach ($issues as $issue) {
            $this->anomaly($batch, $rowNumber, $sourceId, $issue.' (dossier '.$complaint->reference.' créé)', $raw);
        }

        return ['outcome' => 'created', 'anomalies' => count($issues), 'complaint' => $complaint];
    }

    private function parseDate(string $value): ?CarbonImmutable
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        foreach (['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d', 'd/m/Y H:i', 'd/m/Y'] as $format) {
            try {
                $d = CarbonImmutable::createFromFormat('!'.$format, $value, Dt::tz());
            } catch (Throwable) {
                continue;
            }
            if ($d !== null && $d->format($format) === $value) {
                if (! str_contains($format, 'H')) {
                    $d = $d->setTime(12, 0); // heure inconnue : midi local, date conservée
                }

                return $d->setTimezone('UTC');
            }
        }

        return null;
    }

    public static function normalize(string $value, string $space = ' '): string
    {
        $v = mb_strtolower(trim($value));
        $v = strtr($v, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'û' => 'u', 'ù' => 'u', 'ç' => 'c']);
        $v = preg_replace('/\s+/', ' ', $v) ?? $v;

        return $space === ' ' ? $v : str_replace(' ', $space, $v);
    }

    /** @param array<string, mixed> $raw */
    private function anomaly(ImportBatch $batch, int $row, ?string $sourceId, string $issue, array $raw): void
    {
        ImportAnomaly::query()->create([
            'import_batch_id' => $batch->id,
            'row_number' => $row,
            'source_id' => $sourceId,
            'issue' => mb_substr($issue, 0, 500),
            'raw' => $raw,
        ]);
    }
}
