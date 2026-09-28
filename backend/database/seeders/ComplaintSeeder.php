<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\ComplaintStatus;
use App\Enums\DeadlineKind;
use App\Enums\Role;
use App\Enums\SolutionType;
use App\Models\Agency;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\Complaint;
use App\Models\ComplaintEvent;
use App\Models\Customer;
use App\Models\Message;
use App\Models\ProcessingEntity;
use App\Models\Product;
use App\Models\QualityControl;
use App\Models\ResponseTemplate;
use App\Models\Solution;
use App\Models\Task;
use App\Models\User;
use App\Services\DeadlineCalculator;
use App\Services\ReferenceGenerator;
use App\Services\TrackingCodeService;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * ~240 réclamations 100 % fictives sur les 12 derniers mois (aujourd'hui = 2026-09-28),
 * avec chronologies cohérentes, accusés (dont échecs), affectations, échanges, solutions,
 * approbations, décisions, retards, réouvertures (dossiers enfants) et doublons.
 * Génération déterministe (graine fixe).
 */
class ComplaintSeeder extends Seeder
{
    public const DEMO_REFERENCE = 'TG-BSCA-2026-000018';

    /** Codes de suivi connus (documentés dans le README) pour les dossiers du compte client démo. */
    public const DEMO_TRACKING = [
        'TG-BSCA-2026-000018' => 'K7M4P9QX',
    ];

    private const BASE_COUNT = 222;

    private CarbonImmutable $now;

    private DeadlineCalculator $calc;

    private TrackingCodeService $tracking;

    /** @var array<string, int> */
    private array $cat = [];

    /** @var array<string, int> */
    private array $prod = [];

    /** @var array<string, int> */
    private array $chan = [];

    /** @var array<string, int> */
    private array $agency = [];

    /** @var array<string, int> */
    private array $entity = [];

    /** @var array<string, list<User>> gestionnaires par code d'entité */
    private array $gestionnaires = [];

    /** @var array<string, User> responsable par code d'entité */
    private array $responsables = [];

    /** @var array<string, User> */
    private array $demo = [];

    /** @var array<int, int> compteur de référence par année */
    private array $counters = [];

    private ?int $ackTemplateId = null;

    private int $attachmentsCreated = 0;

    private const CATEGORY_WEIGHTS = ['CARTES' => 22, 'GAB' => 12, 'VIREMENTS' => 16, 'FRAIS' => 14, 'COMPTE' => 10, 'DIGITAL' => 12, 'CREDIT' => 7, 'ACCUEIL' => 7];

    private const CATEGORY_ENTITY = ['CARTES' => 'CARTES', 'GAB' => 'CARTES', 'VIREMENTS' => 'VIREMENTS', 'FRAIS' => 'COMPTES', 'COMPTE' => 'COMPTES', 'DIGITAL' => 'DIGITAL', 'CREDIT' => 'CREDITS', 'ACCUEIL' => 'COMPTES'];

    private const CATEGORY_PRODUCTS = [
        'CARTES' => ['CARTE_VISA'], 'GAB' => ['CARTE_VISA'], 'VIREMENTS' => ['TRANSFERT', 'COMPTE_COURANT'],
        'FRAIS' => ['COMPTE_COURANT', 'COMPTE_EPARGNE'], 'COMPTE' => ['COMPTE_COURANT', 'COMPTE_EPARGNE'],
        'DIGITAL' => ['MOBILE'], 'CREDIT' => ['PRET_PERSO'], 'ACCUEIL' => ['COMPTE_COURANT'],
    ];

    /** [min, max, probabilité de montant absent] en XAF */
    private const CATEGORY_AMOUNTS = [
        'CARTES' => [15000, 450000, 0.10], 'GAB' => [10000, 300000, 0.08], 'VIREMENTS' => [50000, 4500000, 0.12],
        'FRAIS' => [2000, 85000, 0.15], 'COMPTE' => [5000, 50000, 0.85], 'DIGITAL' => [5000, 250000, 0.45],
        'CREDIT' => [100000, 3000000, 0.20], 'ACCUEIL' => [0, 0, 1.0],
    ];

    private const SUBJECTS = [
        'CARTES' => ['Paiement par carte contesté', 'Débit en double sur un paiement par carte', 'Carte bloquée sans explication', 'Paiement en ligne non reconnu'],
        'GAB' => ['Retrait au distributeur non servi mais débité', 'Carte capturée par le distributeur', 'Montant retiré inférieur au montant débité'],
        'VIREMENTS' => ['Virement non reçu par le bénéficiaire', 'Retard d\'exécution d\'un virement', 'Transfert international bloqué'],
        'FRAIS' => ['Frais de tenue de compte contestés', 'Commission prélevée sans information préalable', 'Agios jugés excessifs'],
        'COMPTE' => ['Relevé de compte non reçu', 'Demande de clôture de compte non traitée', 'Mise à jour de coordonnées non prise en compte'],
        'DIGITAL' => ['Accès à l\'application mobile impossible', 'Opération mobile non aboutie mais débitée', 'Code de validation non reçu'],
        'CREDIT' => ['Échéance de prêt prélevée deux fois', 'Demande de remboursement anticipé sans réponse', 'Taux appliqué différent du contrat'],
        'ACCUEIL' => ['Temps d\'attente excessif en agence', 'Information erronée donnée au guichet', 'Accueil jugé inapproprié'],
    ];

    private const FIRST_NAMES = ['Aimée', 'Brice', 'Carine', 'Dieudonné', 'Estelle', 'Fabrice', 'Gloria', 'Hervé', 'Irène', 'Jordan', 'Kévin', 'Laetitia', 'Merveille', 'Nadège', 'Olivier', 'Prisca', 'Rodrigue', 'Sandrine', 'Trésor', 'Urielle', 'Vanessa', 'Wilfried', 'Yannick', 'Zoé', 'Arsène', 'Bénédicte', 'Chancel', 'Daniela', 'Exaucé', 'Flore'];

    private const LAST_NAMES = ['Mabiala', 'Nkounkou', 'Moukala', 'Samba', 'Loubaki', 'Ngoma', 'Bouanga', 'Mavoungou', 'Kimbembe', 'Ibara', 'Okemba', 'Ondongo', 'Mboungou', 'Massengo', 'Bakala', 'Makosso', 'Obambi', 'Nzaba', 'Kiminou', 'Batantou', 'Ngakosso', 'Moussavou', 'Itoua', 'Elenga', 'Mpassi', 'Goma', 'Taty', 'Poaty', 'Mbemba', 'Louzolo'];

    public function run(): void
    {
        Model::unguard();
        mt_srand(20260928);
        // « Aujourd'hui » = 28/09/2026 (10:00 locale), sans jamais dépasser l'heure réelle.
        $anchor = CarbonImmutable::parse('2026-09-28 10:00:00', Dt::tz())->setTimezone('UTC');
        $this->now = Dt::now()->lessThan($anchor) ? Dt::now()->startOfMinute() : $anchor;
        $this->calc = app(DeadlineCalculator::class);
        $this->tracking = app(TrackingCodeService::class);
        $this->loadReferentials();

        // 1) Plan des dossiers de base, triés par date de réception.
        $specs = [];
        for ($i = 0; $i < self::BASE_COUNT; $i++) {
            $specs[] = $this->randomSpec();
        }
        usort($specs, static fn ($a, $b) => $a['received_at'] <=> $b['received_at']);

        // Montants hors norme (3 dossiers de virement).
        $flagged = 0;
        foreach ($specs as &$s) {
            if ($flagged < 3 && $s['category'] === 'VIREMENTS' && $s['received_at']->lessThan($this->now->subDays(60))) {
                $s['amount'] = (string) (60000000 + $flagged * 25000000).'.00';
                $s['currency'] = 'XAF';
                $s['flagged'] = true;
                $flagged++;
            }
        }
        unset($s);

        $created = [];
        foreach ($specs as $spec) {
            $created[] = $this->createComplaint($spec);
        }

        // 2) Dossiers du client démo (dont le clin d'œil à la maquette TG-BSCA-2026-000018).
        $this->createClientDemoComplaints();

        // 3) Réouvertures : dossiers enfants de dossiers répondus.
        $parents = array_values(array_filter($created, fn (Complaint $c) => $c->final_response_at !== null
            && $c->final_response_at->lessThan($this->now->subDays(25))));
        $this->shuffle($parents);
        foreach (array_slice($parents, 0, 8) as $k => $parent) {
            $this->createReopening($parent, $k);
        }

        // 4) Doublons (aucune suppression : rattachement au dossier principal).
        $originals = array_values(array_filter($created, fn (Complaint $c) => $c->received_at->lessThan($this->now->subDays(10))
            && $c->parent_complaint_id === null));
        $this->shuffle($originals);
        foreach (array_slice($originals, 0, 6) as $original) {
            $this->createDuplicate($original);
        }

        // 5) Contrôles qualité sur des dossiers répondus.
        $this->createQualityControls($created);

        // Séquences de références et statut « dépassée » des échéances échues.
        $refs = app(ReferenceGenerator::class);
        foreach ($this->counters as $year => $n) {
            $refs->ensureAtLeast($year, max($n, $year === 2026 ? 18 : 0));
        }
        $this->calc->refreshOverdue($this->now);
        Model::reguard();

        $this->command?->info('Réclamations fictives créées : '.Complaint::query()->count().' ; pièces : '.$this->attachmentsCreated);
    }

    // ================================================================ Référentiels

    private function loadReferentials(): void
    {
        $this->cat = Category::query()->pluck('id', 'code')->all();
        $this->prod = Product::query()->pluck('id', 'code')->all();
        $this->chan = Channel::query()->pluck('id', 'code')->all();
        $this->agency = Agency::query()->pluck('id', 'code')->all();
        $this->entity = ProcessingEntity::query()->pluck('id', 'code')->all();
        $codes = array_flip($this->entity);
        foreach (User::query()->whereIn('role', [Role::Gestionnaire->value, Role::Responsable->value])->get() as $u) {
            $code = $codes[$u->entity_id] ?? null;
            if ($code === null) {
                continue;
            }
            if ($u->role === Role::Gestionnaire) {
                $this->gestionnaires[$code][] = $u;
            } else {
                $this->responsables[$code] ??= $u;
            }
        }
        foreach (['admin', 'accueil', 'gestionnaire', 'responsable', 'qualite', 'conformite', 'direction', 'client'] as $k) {
            $this->demo[$k] = User::query()->where('email', $k.'@bsca.demo')->firstOrFail();
        }
        $this->ackTemplateId = ResponseTemplate::query()->where('code', 'ACCUSE')->value('id');
    }

    // ================================================================ Aléatoire

    private function rnd(): float
    {
        return mt_rand() / mt_getrandmax();
    }

    private function int(int $min, int $max): int
    {
        return mt_rand($min, $max);
    }

    /** @param array<string, int> $weights */
    private function pick(array $weights): string
    {
        $total = array_sum($weights);
        $r = mt_rand(1, $total);
        foreach ($weights as $k => $w) {
            $r -= $w;
            if ($r <= 0) {
                return (string) $k;
            }
        }

        return (string) array_key_first($weights);
    }

    /**
     * @template T
     *
     * @param  list<T>  $list
     * @return T
     */
    private function one(array $list): mixed
    {
        return $list[mt_rand(0, count($list) - 1)];
    }

    /** @param list<mixed> $list */
    private function shuffle(array &$list): void
    {
        for ($i = count($list) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$list[$i], $list[$j]] = [$list[$j], $list[$i]];
        }
    }

    private function between(CarbonImmutable $a, CarbonImmutable $b, float $frac): CarbonImmutable
    {
        $seconds = max(0, $b->getTimestamp() - $a->getTimestamp());

        return $a->addSeconds((int) round($seconds * $frac));
    }

    /** Heure ouvrable locale (8h–17h) du jour donné, en UTC. */
    private function workTime(CarbonImmutable $utc): CarbonImmutable
    {
        $local = $utc->setTimezone(Dt::tz())->setTime($this->int(8, 16), $this->int(0, 59), $this->int(0, 59));

        return $local->setTimezone('UTC');
    }

    private function personName(): string
    {
        return $this->one(self::FIRST_NAMES).' '.$this->one(self::LAST_NAMES);
    }

    // ================================================================ Plan

    /** @return array<string, mixed> */
    private function randomSpec(): array
    {
        $daysAgo = (int) floor(364 * ($this->rnd() ** 1.15)) + 1;
        $received = $this->workTime($this->now->subDays($daysAgo));
        if ($received->greaterThan($this->now->subHours(2))) {
            $received = $this->now->subHours($this->int(2, 20));
        }
        $category = $this->pick(self::CATEGORY_WEIGHTS);
        $channel = $this->pick(['portail' => 30, 'agence' => 30, 'telephone' => 15, 'courriel' => 15, 'courrier' => 10]);
        $agencyWeights = ['BZV-CTR' => 30, 'BZV-PTP' => 20, 'PNR-CTR' => 20, 'PNR-LUM' => 12, 'DOL' => 10, 'OYO' => 8];
        $agency = ($channel === 'portail' && $this->rnd() < 0.5) ? null : $this->pick($agencyWeights);

        [$min, $max, $pNull] = self::CATEGORY_AMOUNTS[$category];
        $amount = null;
        if ($this->rnd() >= $pNull && $max > 0) {
            $amount = number_format(round($this->int($min, $max) / 500) * 500, 2, '.', '');
        }

        return [
            'received_at' => $received,
            'category' => $category,
            'channel' => $channel,
            'agency' => $agency,
            'amount' => $amount,
            'currency' => $amount !== null ? 'XAF' : null,
            'flagged' => false,
        ];
    }

    // ================================================================ Création d'un dossier

    private function nextReference(CarbonImmutable $receivedAt): string
    {
        $year = (int) $receivedAt->setTimezone(Dt::tz())->format('Y');
        $n = ($this->counters[$year] ?? 0) + 1;
        if ($year === 2026 && $n === 18) {
            $n = 19; // Réservé au dossier de démonstration TG-BSCA-2026-000018.
        }
        $this->counters[$year] = $n;

        return ReferenceGenerator::format($year, $n);
    }

    private function hashCode(?string $code = null): string
    {
        // Coût bcrypt réduit pour le jeu de démonstration uniquement (temps de seed).
        return Hash::make(TrackingCodeService::normalize($code ?? $this->tracking->generate()), ['rounds' => 10]);
    }

    /**
     * @param  array<string, mixed>  $spec
     */
    private function createComplaint(array $spec, ?Customer $customer = null, ?string $reference = null, ?string $trackingCode = null, ?string $forcedStatus = null, ?CarbonImmutable $forcedResponse = null, bool $simulate = true): Complaint
    {
        $received = $spec['received_at'];
        $age = ($this->now->getTimestamp() - $received->getTimestamp()) / 86400;
        $category = $spec['category'];
        $entityCode = self::CATEGORY_ENTITY[$category];

        // Cycle de vie simulé.
        $respondedAt = $forcedResponse;
        if ($forcedStatus === null && $age >= 3) {
            $pResp = min(0.93, $age / 55);
            if ($this->rnd() < $pResp) {
                $delayDays = $this->rnd() < 0.13 ? $this->int(46, 80) : $this->int(4, 44);
                $candidate = $this->workTime($received->addDays($delayDays));
                if ($candidate->lessThan($this->now->subHours(1)) && $candidate->greaterThan($received)) {
                    $respondedAt = $candidate;
                }
            }
        }
        if ($forcedStatus !== null) {
            $status = ComplaintStatus::from($forcedStatus);
        } elseif ($respondedAt !== null) {
            $status = ($this->now->diffInDays($respondedAt, true) > 12 && $this->rnd() < 0.75) ? ComplaintStatus::Cloture : ComplaintStatus::ReponseEnvoyee;
        } elseif ($age < 1.5) {
            $status = ComplaintStatus::Recu;
        } elseif ($age < 4) {
            $status = $this->rnd() < 0.5 ? ComplaintStatus::AQualifier : ComplaintStatus::Affecte;
        } elseif ($age < 8) {
            $status = $this->rnd() < 0.4 ? ComplaintStatus::Affecte : ComplaintStatus::EnInvestigation;
        } else {
            $status = ComplaintStatus::from($this->pick([
                'en_investigation' => 40, 'attente_information' => 20, 'solution_proposee' => 15, 'a_valider' => 20, 'affecte' => 5,
            ]));
        }

        $customer ??= Customer::query()->create([
            'full_name' => $this->personName(),
            'email' => $this->rnd() < 0.8 ? 'client'.Str::lower(Str::random(6)).'@exemple.invalid' : null,
            'phone' => '+242 06 '.$this->int(100, 999).' '.$this->int(10, 99).' '.$this->int(10, 99),
            'customer_number' => $this->rnd() < 0.6 ? 'FICT-'.$this->int(100000, 999999) : null,
            'preferred_channel' => $this->one(['courriel', 'courriel', 'telephone', 'courrier']),
        ]);

        $qualified = ! in_array($status, [ComplaintStatus::Recu], true) || $this->rnd() < 0.3;
        $priority = $spec['amount'] !== null && (float) $spec['amount'] >= 2000000 ? 'haute' : $this->pick(['normale' => 62, 'haute' => 18, 'basse' => 12, 'critique' => 8]);
        $subject = $spec['subject'] ?? $this->one(self::SUBJECTS[$category]);

        $complaint = Complaint::query()->create([
            'reference' => $reference ?? $this->nextReference($received),
            'tracking_code_hash' => $this->hashCode($trackingCode),
            'customer_id' => $customer->id,
            'channel_id' => $this->chan[$spec['channel']],
            'receiving_agency_id' => $spec['agency'] ? $this->agency[$spec['agency']] : null,
            'processing_entity_id' => $qualified ? $this->entity[$entityCode] : null,
            'category_id' => $this->cat[$category],
            'product_id' => $this->prod[$this->one(self::CATEGORY_PRODUCTS[$category])],
            'subject' => $subject,
            'description' => $spec['description'] ?? $this->description($subject, $received),
            'operation_date' => $received->subDays($this->int(1, 10))->setTimezone(Dt::tz())->format('Y-m-d'),
            'status' => ComplaintStatus::Recu,
            'priority' => $priority,
            'risk_level' => $spec['flagged'] ? 'eleve' : $this->pick(['faible' => 60, 'moyen' => 30, 'eleve' => 10]),
            'amount' => $spec['amount'],
            'currency' => $spec['currency'],
            'amount_flagged' => (bool) $spec['flagged'],
            'received_at' => $received,
            'acknowledgment_status' => 'en_attente',
            'parent_complaint_id' => $spec['parent_id'] ?? null,
            'consent_at' => $spec['channel'] === 'portail' ? $received : null,
            'created_by' => $spec['channel'] === 'portail' ? null : $this->agentFor($spec['agency'])?->id,
            'created_at' => $received,
            'updated_at' => $received,
        ]);
        $this->calc->scheduleFor($complaint);

        $this->event($complaint, 'created', ($spec['parent_id'] ?? null) ? 'Demande de réouverture enregistrée' : 'Demande enregistrée',
            $spec['channel'] === 'portail' ? 'Dépôt via le portail client' : 'Canal : '.Channel::query()->find($this->chan[$spec['channel']])->label,
            'client', $spec['channel'] === 'portail' ? null : $complaint->created_by, $received);

        if ($simulate) {
            $this->simulate($complaint, $status, $respondedAt, $entityCode, $spec);
        }

        return $complaint->refresh();
    }

    private function agentFor(?string $agencyCode): ?User
    {
        if ($agencyCode === null) {
            return $this->demo['accueil'];
        }

        return User::query()->where('role', Role::AgentAccueil->value)->where('agency_id', $this->agency[$agencyCode])->first() ?? $this->demo['accueil'];
    }

    private function description(string $subject, CarbonImmutable $received): string
    {
        $details = [
            'Le client indique ne pas reconnaître l\'opération et demande une vérification.',
            'Le client joint ses justificatifs et sollicite une régularisation rapide.',
            'Le client signale avoir déjà relancé l\'agence sans obtenir de réponse.',
            'Le client demande des explications écrites sur l\'origine du problème.',
            'Situation signalée pour la première fois ; aucun antécédent sur le dossier.',
        ];

        return $subject.'. '.$this->one($details).' (Dossier fictif de démonstration.)';
    }

    // ================================================================ Simulation du cycle de vie

    /**
     * @param  array<string, mixed>  $spec
     */
    private function simulate(Complaint $c, ComplaintStatus $target, ?CarbonImmutable $respondedAt, string $entityCode, array $spec): void
    {
        $received = $c->received_at->toImmutable();
        $end = $respondedAt ?? $this->now->subMinutes($this->int(30, 600));
        if ($end->lessThanOrEqualTo($received)) {
            $end = $received->addMinutes(30);
        }
        $responsable = $this->responsables[$entityCode] ?? $this->demo['responsable'];
        $owner = $this->pickOwner($entityCode);
        $deputy = $this->rnd() < 0.35 ? $this->pickOwner($entityCode, $owner) : null;

        // --- Accusé de réception
        $this->simulateAcknowledgment($c, $target, $received, $end, $respondedAt);

        // --- Chaîne de statuts
        $chain = $this->chainFor($target, $c->parent_complaint_id !== null);
        $n = count($chain);
        $start = $received->addMinutes($this->int(30, 240));
        $solutionTimes = [];
        $prev = $c->parent_complaint_id !== null ? ComplaintStatus::Reouvert : ComplaintStatus::Recu;
        if ($c->parent_complaint_id !== null) {
            $c->status = ComplaintStatus::Reouvert;
        }
        foreach ($chain as $i => $st) {
            $status = ComplaintStatus::from($st);
            if ($status === ComplaintStatus::ReponseEnvoyee) {
                $at = $respondedAt ?? $end;
            } elseif ($status === ComplaintStatus::Cloture) {
                $at = ($respondedAt ?? $end)->addDays($this->int(3, 12));
                if ($at->greaterThan($this->now)) {
                    $at = $this->now->subHours(2);
                }
            } else {
                $frac = ($i + 1) / ($n + 1);
                $at = $this->between($start, $end, min(0.97, $frac + ($this->rnd() - 0.5) * 0.08));
            }

            if ($status === ComplaintStatus::AQualifier) {
                $this->event($c, 'qualified', 'Qualification réalisée', 'Nature, produit et entité de traitement renseignés.', 'internal', $responsable->id, $at->subMinutes(5), 'Qualification initiale');
                $c->processing_entity_id ??= $this->entity[$entityCode];
            }
            if ($status === ComplaintStatus::Affecte) {
                $c->owner_id = $owner->id;
                $c->deputy_id = $deputy?->id;
                $this->event($c, 'assigned', 'Affectation : '.$owner->name, $deputy ? 'Suppléant : '.$deputy->name : null, 'internal', $responsable->id, $at->subMinutes(2), 'Affectation selon l\'entité de traitement');
                $this->audit('complaint.assign', $c, ['owner_id' => null], ['owner_id' => $owner->id, 'deputy_id' => $deputy?->id], 'Affectation selon l\'entité de traitement', $responsable->id, $at);
            }
            if ($status === ComplaintStatus::AttenteInformation) {
                $this->message($c, 'client_message', 'sortant', $owner->id, false, 'Merci de nous transmettre le justificatif de l\'opération (relevé ou ticket) afin de poursuivre l\'analyse.', 'envoye', $at);
            }
            if ($status === ComplaintStatus::SolutionProposee) {
                $solutionTimes['proposed'] = $at;
            }
            if ($status === ComplaintStatus::AValider) {
                $solutionTimes['submitted'] = $at;
            }

            $actor = match ($status) {
                ComplaintStatus::AQualifier => $responsable->id,
                ComplaintStatus::Affecte => $responsable->id,
                default => $owner->id,
            };
            $auto = in_array($status, [ComplaintStatus::AQualifier, ComplaintStatus::Affecte, ComplaintStatus::SolutionProposee, ComplaintStatus::AValider, ComplaintStatus::ReponseEnvoyee], true);
            $reason = $auto ? null : match ($status) {
                ComplaintStatus::EnInvestigation => 'Début de l\'instruction',
                ComplaintStatus::AttenteInformation => 'Justificatif demandé au client',
                ComplaintStatus::Cloture => 'Aucune contestation reçue après la réponse',
                default => 'Changement de statut',
            };
            $this->event($c, 'status_changed', 'Statut : '.$prev->label().' → '.$status->label(), null,
                $prev->clientStatus() !== $status->clientStatus() ? 'client' : 'internal', $actor, $at, $reason, $prev, $status);
            $this->audit('complaint.transition', $c, ['status' => $prev->value], ['status' => $status->value], $reason, $actor, $at);
            if ($prev === ComplaintStatus::AttenteInformation && $status === ComplaintStatus::EnInvestigation) {
                $this->message($c, 'client_message', 'entrant', null, true, 'Bonjour, vous trouverez ci-joint le justificatif demandé. Merci.', 'envoye', $at->subHours(3));
            }
            $prev = $status;
            $c->status = $status;
            if ($status === ComplaintStatus::Cloture) {
                $c->closed_at = $at;
            }
        }

        // --- Pièces jointes fictives (client ou internes)
        if ($this->rnd() < 0.12) {
            $this->attachment($c, 'justificatif-client.pdf', 'client', 'client', true, null, $received->addMinutes(5));
        }
        if ($c->owner_id !== null && $this->rnd() < 0.08) {
            $this->attachment($c, 'note-analyse-interne.pdf', 'interne', 'internal', false, $c->owner_id, $this->between($received, $end, 0.6));
        }

        // --- Échanges et notes
        if ($this->rnd() < 0.3) {
            $this->message($c, 'client_message', 'entrant', null, true, 'Bonjour, pouvez-vous me dire où en est le traitement de ma demande ?', 'envoye', $this->between($received, $end, 0.4));
        }
        if ($c->owner_id !== null && $this->rnd() < 0.55) {
            $this->message($c, 'internal_note', null, $c->owner_id, false, $this->one([
                'Vérification effectuée dans le système : opération retrouvée, analyse en cours.',
                'Contact pris avec le service concerné ; retour attendu sous 48 h.',
                'Pièces du client conformes ; pas d\'antécédent sur ce compte.',
                'Point d\'attention : délai de réponse à surveiller.',
            ]), null, $this->between($received, $end, 0.55));
        }
        if (in_array($target, [ComplaintStatus::EnInvestigation, ComplaintStatus::AttenteInformation], true) && $c->owner_id && $this->rnd() < 0.35) {
            Task::query()->create([
                'complaint_id' => $c->id, 'title' => 'Vérifier l\'opération dans le système concerné', 'assignee_id' => $c->owner_id,
                'due_at' => $this->now->addDays($this->int(-3, 7)), 'status' => $this->rnd() < 0.5 ? 'en_cours' : 'a_faire',
                'created_at' => $end, 'updated_at' => $end,
            ]);
        }

        // --- Solutions, approbations, réponse
        if (isset($solutionTimes['proposed'])) {
            $this->simulateSolutions($c, $target, $solutionTimes, $respondedAt ?? $end, $owner, $responsable);
        }
        if ($respondedAt !== null && in_array($target, [ComplaintStatus::ReponseEnvoyee, ComplaintStatus::Cloture], true)) {
            $c->final_response_at = $respondedAt;
            $this->message($c, 'client_message', 'sortant', $c->owner_id, false, $this->responseBody($c), 'envoye', $respondedAt, 'Réponse à votre réclamation '.$c->reference);
            $this->event($c, 'response_sent', 'Réponse définitive envoyée', 'Canal : Courriel', 'client', $c->owner_id, $respondedAt);
            $this->audit('complaint.send_response', $c, ['final_response_at' => null], ['final_response_at' => $respondedAt->toIso8601String(), 'decision' => $c->decision?->value], null, $c->owner_id, $respondedAt);
        }

        $c->updated_at = $respondedAt ?? $end;
        $c->save();
        if ($c->final_response_at !== null) {
            $this->calc->markMet($c, DeadlineKind::ReponseFinale, $c->final_response_at);
        }
        if ($c->acknowledged_at !== null) {
            $this->calc->markMet($c, DeadlineKind::Accuse, $c->acknowledged_at);
        }
    }

    private function pickOwner(string $entityCode, ?User $except = null): User
    {
        $pool = $this->gestionnaires[$entityCode] ?? [$this->demo['gestionnaire']];
        if ($entityCode === 'CARTES' && $except === null && $this->rnd() < 0.6) {
            return $this->demo['gestionnaire'];
        }
        $pool = array_values(array_filter($pool, fn (User $u) => $except === null || $u->id !== $except->id));
        if ($pool === []) {
            return $this->responsables[$entityCode] ?? $this->demo['responsable'];
        }

        return $this->one($pool);
    }

    /** @return list<string> */
    private function chainFor(ComplaintStatus $target, bool $reopened): array
    {
        $head = $reopened ? [] : ['a_qualifier', 'affecte'];
        $inv = ['en_investigation'];
        if (! in_array($target, [ComplaintStatus::Recu, ComplaintStatus::AQualifier, ComplaintStatus::Affecte, ComplaintStatus::Reouvert], true) && $this->rnd() < 0.2) {
            $inv = ['en_investigation', 'attente_information', 'en_investigation'];
        }

        return match ($target) {
            ComplaintStatus::Recu, ComplaintStatus::Brouillon, ComplaintStatus::Reouvert => [],
            ComplaintStatus::AQualifier => ['a_qualifier'],
            ComplaintStatus::Affecte => ['a_qualifier', 'affecte'],
            ComplaintStatus::EnInvestigation => [...$head, ...$inv],
            ComplaintStatus::AttenteInformation => [...$head, 'en_investigation', 'attente_information'],
            ComplaintStatus::SolutionProposee => [...$head, ...$inv, 'solution_proposee'],
            ComplaintStatus::AValider => [...$head, ...$inv, 'solution_proposee', 'a_valider'],
            ComplaintStatus::ReponseEnvoyee => [...$head, ...$inv, 'solution_proposee', 'a_valider', 'reponse_envoyee'],
            ComplaintStatus::Cloture => [...$head, ...$inv, 'solution_proposee', 'a_valider', 'reponse_envoyee', 'cloture'],
        };
    }

    private function simulateAcknowledgment(Complaint $c, ComplaintStatus $target, CarbonImmutable $received, CarbonImmutable $end, ?CarbonImmutable $respondedAt): void
    {
        $channelId = $this->chan['courriel'];
        if ($target === ComplaintStatus::Recu && $this->rnd() < 0.6) {
            return; // Accusé pas encore envoyé (dossier très récent).
        }
        $r = $this->rnd();
        $delayDays = $r < 0.07 ? $this->int(11, 16) : $this->int(0, 6);
        $ackAt = $this->calc->addBusinessDays($received, $delayDays)->setTimezone(Dt::tz())->setTime($this->int(8, 16), $this->int(0, 59))->setTimezone('UTC');
        if ($ackAt->lessThanOrEqualTo($received)) {
            $ackAt = $received->addHours(2);
        }
        $limit = $respondedAt ?? $this->now->subMinutes(10);
        if ($ackAt->greaterThan($limit)) {
            $ackAt = $this->between($received, $limit, 0.3);
        }

        if ($r > 0.92) {
            // Échec d'envoi, éventuellement renvoyé avec succès.
            $this->message($c, 'client_message', 'sortant', $c->created_by, false, $this->ackBody($c), 'echec', $ackAt, 'Accusé de réception '.$c->reference);
            $this->event($c, 'acknowledged', 'Échec d\'envoi de l\'accusé de réception', 'Canal : Courriel — adresse injoignable', 'internal', $c->created_by, $ackAt);
            $retryAt = $ackAt->addDays($this->int(1, 4));
            if ($respondedAt !== null || $this->rnd() < 0.5) {
                if ($retryAt->greaterThan($limit)) {
                    $retryAt = $this->between($ackAt, $limit, 0.5);
                }
                $this->message($c, 'client_message', 'sortant', $c->created_by, false, $this->ackBody($c), 'envoye', $retryAt, 'Accusé de réception '.$c->reference, $this->chan['courrier']);
                $this->event($c, 'acknowledged', 'Accusé de réception envoyé', 'Canal : Courrier (renvoi après échec)', 'client', $c->created_by, $retryAt);
                $c->acknowledged_at = $retryAt;
                $c->acknowledgment_status = 'envoye';
            } else {
                $c->acknowledgment_status = 'echec';
            }

            return;
        }
        $this->message($c, 'client_message', 'sortant', $c->created_by, false, $this->ackBody($c), 'envoye', $ackAt, 'Accusé de réception '.$c->reference, $channelId);
        $this->event($c, 'acknowledged', 'Accusé de réception envoyé', 'Canal : Courriel', 'client', $c->created_by, $ackAt);
        $this->audit('complaint.acknowledge', $c, ['acknowledgment_status' => 'en_attente'], ['acknowledgment_status' => 'envoye'], null, $c->created_by, $ackAt);
        $c->acknowledged_at = $ackAt;
        $c->acknowledgment_status = 'envoye';
    }

    /**
     * @param  array<string, CarbonImmutable>  $times
     */
    private function simulateSolutions(Complaint $c, ComplaintStatus $target, array $times, CarbonImmutable $end, User $owner, User $responsable): void
    {
        $decision = $this->pick(['fondee' => 35, 'partiellement_fondee' => 20, 'non_fondee' => 35, 'irrecevable_motivee' => 10]);
        $type = match ($decision) {
            'fondee' => $c->amount !== null ? 'remboursement' : 'correction_operation',
            'partiellement_fondee' => $c->amount !== null ? 'remboursement' : 'autre_mesure',
            'non_fondee' => 'explication_motivee',
            default => 'non_fondement',
        };
        $amount = null;
        if ($type === 'remboursement' && $c->amount !== null) {
            $amount = $decision === 'partiellement_fondee' ? number_format((float) $c->amount / 2, 2, '.', '') : (string) $c->amount;
        }
        $requiresN2 = $amount !== null && (float) $amount >= 500000;
        $proposed = $times['proposed'];
        $submitted = $times['submitted'] ?? null;
        $answered = in_array($target, [ComplaintStatus::ReponseEnvoyee, ComplaintStatus::Cloture], true);

        $version = 1;
        // 15 % : une première version rejetée au niveau 1, puis une nouvelle version.
        if ($submitted !== null && $this->rnd() < 0.15) {
            $s1 = Solution::query()->create([
                'complaint_id' => $c->id, 'version' => 1, 'type' => $type, 'description' => 'Proposition initiale : '.$this->solutionText($type),
                'root_cause' => 'Cause à confirmer', 'amount' => $amount, 'currency' => $amount ? 'XAF' : null, 'decision' => $decision,
                'status' => 'rejetee', 'requires_n2' => $requiresN2, 'proposed_by' => $owner->id, 'submitted_at' => $proposed->addHours(2),
                'created_at' => $proposed, 'updated_at' => $proposed->addHours(20),
            ]);
            $s1->approvals()->create(['level' => 1, 'approver_id' => $responsable->id, 'decision' => 'rejete', 'comment' => 'Motivation insuffisante : compléter l\'analyse de la cause.', 'decided_at' => $proposed->addHours(20)]);
            $this->event($c, 'approval', 'Solution v1 : Rejeté (niveau 1)', 'Motivation insuffisante : compléter l\'analyse de la cause.', 'internal', $responsable->id, $proposed->addHours(20));
            $version = 2;
        }

        $status = match (true) {
            $answered => 'approuvee',
            $submitted === null => 'brouillon',
            default => $requiresN2 ? $this->one(['soumise', 'approuvee_n1', 'approuvee']) : $this->one(['soumise', 'approuvee']),
        };
        $solution = Solution::query()->create([
            'complaint_id' => $c->id, 'version' => $version, 'type' => $type, 'description' => $this->solutionText($type),
            'root_cause' => $this->one(['Erreur de traitement opérationnel', 'Incident technique ponctuel', 'Information client incomplète', 'Application conforme des conditions tarifaires', 'Délai de traitement d\'un correspondant']),
            'amount' => $amount, 'currency' => $amount ? 'XAF' : null, 'decision' => $decision, 'status' => $status,
            'requires_n2' => $requiresN2, 'proposed_by' => $owner->id, 'submitted_at' => $submitted,
            'created_at' => $proposed, 'updated_at' => $submitted ?? $proposed,
        ]);
        $this->event($c, 'solution', 'Solution v'.$version.' proposée : '.SolutionType::from($type)->label(), null, 'internal', $owner->id, $proposed->addMinutes(1));

        if (in_array($status, ['approuvee_n1', 'approuvee'], true) && $submitted !== null) {
            $n1 = $this->between($submitted, $end, 0.4);
            $solution->approvals()->create(['level' => 1, 'approver_id' => $responsable->id, 'decision' => 'approuve', 'comment' => null, 'decided_at' => $n1]);
            $this->event($c, 'approval', 'Solution v'.$version.' : Approuvé (niveau 1)', null, 'internal', $responsable->id, $n1);
            if ($requiresN2 && $status === 'approuvee') {
                $n2 = $this->between($n1, $end, 0.5);
                $solution->approvals()->create(['level' => 2, 'approver_id' => $this->demo['conformite']->id, 'decision' => 'approuve', 'comment' => 'Montant vérifié.', 'decided_at' => $n2]);
                $this->event($c, 'approval', 'Solution v'.$version.' : Approuvé (niveau 2)', 'Montant vérifié.', 'internal', $this->demo['conformite']->id, $n2);
            }
        }
        if ($answered) {
            $c->decision = $decision;
        }
    }

    private function solutionText(string $type): string
    {
        return match ($type) {
            'remboursement' => 'Remboursement du montant contesté sur le compte du client après vérification.',
            'correction_operation' => 'Correction de l\'opération et régularisation de la situation du compte.',
            'explication_motivee' => 'Explication motivée : l\'opération est conforme aux conditions contractuelles.',
            'autre_mesure' => 'Geste commercial et accompagnement du client.',
            default => 'Réclamation non fondée au regard des éléments fournis ; décision motivée.',
        };
    }

    private function responseBody(Complaint $c): string
    {
        $d = $c->decision?->label() ?? 'À déterminer';

        return "Madame, Monsieur,\n\nÀ l'issue de l'examen de votre réclamation {$c->reference}, notre décision est la suivante : {$d}.\n"
            ."Le détail de la mesure retenue vous est présenté ci-dessus. Vous pouvez demander une réouverture depuis votre espace de suivi si vous contestez cette réponse.\n\nBSCA Bank — Service réclamations (message fictif de démonstration)";
    }

    private function ackBody(Complaint $c): string
    {
        return "Nous accusons réception de votre réclamation {$c->reference}. Elle est en cours d'examen par nos services. (message fictif de démonstration)";
    }

    // ================================================================ Écritures bas niveau

    private function event(Complaint $c, string $type, string $title, ?string $description, string $visibility, ?int $actorId, CarbonImmutable $at, ?string $reason = null, ?ComplaintStatus $from = null, ?ComplaintStatus $to = null): void
    {
        ComplaintEvent::query()->create([
            'complaint_id' => $c->id, 'type' => $type, 'from_status' => $from, 'to_status' => $to, 'title' => $title,
            'description' => $description, 'visibility' => $visibility, 'actor_id' => $actorId, 'reason' => $reason, 'created_at' => $at,
        ]);
    }

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    private function audit(string $action, Complaint $c, ?array $before, ?array $after, ?string $reason, ?int $userId, CarbonImmutable $at): void
    {
        AuditLog::query()->create([
            'user_id' => $userId, 'action' => $action, 'auditable_type' => 'Complaint', 'auditable_id' => $c->id,
            'before' => $before, 'after' => $after, 'reason' => $reason, 'ip' => '10.0.0.'.$this->int(10, 250),
            'user_agent' => 'Jeu de données de démonstration', 'created_at' => $at,
        ]);
    }

    private function message(Complaint $c, string $kind, ?string $direction, ?int $authorId, bool $fromClient, string $body, ?string $delivery, CarbonImmutable $at, ?string $subject = null, ?int $channelId = null): void
    {
        Message::query()->create([
            'complaint_id' => $c->id, 'kind' => $kind, 'direction' => $direction,
            'channel_id' => $kind === 'internal_note' ? null : ($channelId ?? ($fromClient ? $this->chan['portail'] : $this->chan['courriel'])),
            'author_id' => $authorId, 'author_is_client' => $fromClient, 'subject' => $subject, 'body' => $body,
            'delivery_status' => $kind === 'internal_note' ? null : $delivery,
            'sent_at' => $kind === 'internal_note' || $delivery !== 'envoye' ? null : $at,
            'template_id' => str_starts_with((string) $subject, 'Accusé') ? $this->ackTemplateId : null,
            'created_at' => $at, 'updated_at' => $at,
        ]);
        if ($kind === 'client_message' && $fromClient) {
            $this->event($c, 'message', 'Message du client', null, 'client', null, $at);
        } elseif ($kind === 'internal_note') {
            $this->event($c, 'message', 'Note interne ajoutée', null, 'internal', $authorId, $at);
        } elseif ($delivery === 'envoye' && ! str_starts_with((string) $subject, 'Accusé') && ! str_starts_with((string) $subject, 'Réponse')) {
            $this->event($c, 'message', 'Message de BSCA au client', null, 'client', $authorId, $at);
        }
    }

    /** Pièce jointe fictive (PDF minimal) chiffrée sur le disque privé. */
    private function attachment(Complaint $c, string $name, string $classification, string $visibility, bool $byClient, ?int $userId, CarbonImmutable $at): void
    {
        $text = 'Document fictif de demonstration - '.$c->reference;
        $pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
            .'4 0 obj<</Length '.(strlen($text) + 30).">>stream\nBT /F1 14 Tf 60 780 Td ({$text}) Tj ET\nendstream endobj\n"
            ."5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
        $path = $at->format('Y/m').'/'.Str::random(40).'.enc';
        Storage::disk('attachments')->put($path, Crypt::encryptString($pdf));
        $c->attachments()->create([
            'uploaded_by' => $userId, 'uploaded_by_client' => $byClient, 'original_name' => $name, 'stored_path' => $path,
            'mime' => 'application/pdf', 'size' => strlen($pdf), 'sha256' => hash('sha256', $pdf),
            'classification' => $classification, 'visibility' => $visibility, 'scan_status' => 'sain',
            'created_at' => $at, 'updated_at' => $at,
        ]);
        $this->event($c, 'attachment', $byClient ? 'Document transmis par le client' : 'Pièce jointe ajoutée', $name, $visibility, $byClient ? null : $userId, $at);
        $this->attachmentsCreated++;
    }

    // ================================================================ Cas particuliers

    private function createClientDemoComplaints(): void
    {
        $customer = Customer::query()->where('email', 'client@bsca.demo')->firstOrFail();
        $gest = $this->demo['gestionnaire'];
        $resp = $this->demo['responsable'];
        $accueil = $this->demo['accueil'];

        // --- TG-BSCA-2026-000018 : « Paiement par carte contesté », portail, 12/09/2026, en investigation, à risque.
        $received = CarbonImmutable::parse('2026-09-12 10:24:00', Dt::tz())->setTimezone('UTC');
        $c = Complaint::query()->create([
            'reference' => self::DEMO_REFERENCE,
            'tracking_code_hash' => $this->hashCode(self::DEMO_TRACKING[self::DEMO_REFERENCE]),
            'customer_id' => $customer->id, 'channel_id' => $this->chan['portail'], 'receiving_agency_id' => null,
            'processing_entity_id' => $this->entity['CARTES'], 'category_id' => $this->cat['CARTES'], 'product_id' => $this->prod['CARTE_VISA'],
            'subject' => 'Paiement par carte contesté',
            'description' => 'Le client conteste un paiement par carte de 185 000 XAF daté du 10/09/2026 chez un commerçant en ligne qu\'il déclare ne pas connaître. Relevé joint. (Dossier fictif de démonstration.)',
            'operation_date' => '2026-09-10', 'status' => 'en_investigation', 'priority' => 'haute', 'risk_level' => 'moyen',
            'amount' => '185000.00', 'currency' => 'XAF', 'amount_flagged' => false, 'received_at' => $received,
            'acknowledgment_status' => 'en_attente', 'owner_id' => $gest->id, 'deputy_id' => $this->gestionnaires['CARTES'][1]->id ?? null,
            'consent_at' => $received, 'created_at' => $received, 'updated_at' => $received,
        ]);
        $this->calc->scheduleFor($c);
        $this->event($c, 'created', 'Demande enregistrée', 'Dépôt via le portail client — référence attribuée', 'client', null, $received);
        $this->attachment($c, 'releve-operation-carte.pdf', 'client', 'client', true, null, $received->addMinutes(2));
        $this->message($c, 'client_message', 'sortant', $accueil->id, false, $this->ackBody($c), 'en_attente', $received->addHours(20), 'Accusé de réception '.$c->reference);
        $this->event($c, 'acknowledged', 'Accusé de réception préparé', 'Confirmation préparée, envoi non effectué', 'internal', $accueil->id, $received->addHours(20));
        $q = CarbonImmutable::parse('2026-09-13 09:40:00', Dt::tz())->setTimezone('UTC');
        $this->event($c, 'qualified', 'Qualification réalisée', 'Motif « Paiement par carte » ; pièce justificative signalée.', 'internal', $accueil->id, $q, 'Qualification initiale');
        $this->event($c, 'status_changed', 'Statut : Reçu → À qualifier', null, 'internal', $accueil->id, $q->addMinutes(1), null, ComplaintStatus::Recu, ComplaintStatus::AQualifier);
        $a = CarbonImmutable::parse('2026-09-14 08:55:00', Dt::tz())->setTimezone('UTC');
        $this->event($c, 'assigned', 'Affectation : '.$gest->name, 'Propriétaire : équipe Cartes et paiements', 'internal', $resp->id, $a, 'Affectation à l\'équipe Cartes et paiements');
        $this->event($c, 'status_changed', 'Statut : À qualifier → Affecté', null, 'client', $resp->id, $a->addMinutes(1), null, ComplaintStatus::AQualifier, ComplaintStatus::Affecte);
        $inv = CarbonImmutable::parse('2026-09-15 11:10:00', Dt::tz())->setTimezone('UTC');
        $this->event($c, 'status_changed', 'Statut : Affecté → En investigation', null, 'internal', $gest->id, $inv, 'Vérification de l\'opération signalée', ComplaintStatus::Affecte, ComplaintStatus::EnInvestigation);
        $this->audit('complaint.transition', $c, ['status' => 'affecte'], ['status' => 'en_investigation'], 'Vérification de l\'opération signalée', $gest->id, $inv);
        $this->message($c, 'internal_note', null, $gest->id, false, 'Demande de relevé des autorisations adressée au service monétique. Préparer une proposition pour le responsable.', null, $inv->addHours(3));
        $this->attachment($c, 'extrait-journal-autorisations.pdf', 'confidentiel', 'internal', false, $gest->id, $inv->addDays(2));
        Task::query()->create([
            'complaint_id' => $c->id, 'title' => 'Vérifier l\'opération signalée dans le système monétique', 'assignee_id' => $gest->id,
            'due_at' => CarbonImmutable::parse('2026-09-29 17:00:00', Dt::tz())->setTimezone('UTC'), 'status' => 'en_cours',
            'created_at' => $inv, 'updated_at' => $inv,
        ]);

        // --- Dossier répondu du client démo (réouverture possible).
        $spec = ['received_at' => $this->workTime($this->now->subDays(70)), 'category' => 'FRAIS', 'channel' => 'portail', 'agency' => null,
            'amount' => '25000.00', 'currency' => 'XAF', 'flagged' => false, 'subject' => 'Frais de tenue de compte contestés'];
        $this->createClientComplaint($spec, $customer, 'reponse_envoyee', 30);
        // --- Dossier clôturé du client démo.
        $spec = ['received_at' => $this->workTime($this->now->subDays(160)), 'category' => 'DIGITAL', 'channel' => 'courriel', 'agency' => null,
            'amount' => null, 'currency' => null, 'flagged' => false, 'subject' => 'Code de validation non reçu'];
        $this->createClientComplaint($spec, $customer, 'cloture', 25);
    }

    /**
     * @param  array<string, mixed>  $spec
     */
    private function createClientComplaint(array $spec, Customer $customer, string $status, int $responseDelay): void
    {
        $spec['description'] = $spec['subject'].'. Dossier fictif du compte client de démonstration.';
        $respondedAt = $this->workTime($spec['received_at']->addDays($responseDelay));
        $this->createComplaint($spec, $customer, null, null, $status, $respondedAt);
    }

    private function createReopening(Complaint $parent, int $k): void
    {
        $childReceived = $this->workTime($parent->final_response_at->toImmutable()->addDays($this->int(2, 15)));
        if ($childReceived->greaterThan($this->now->subDays(1))) {
            $childReceived = $this->now->subDays(1);
        }
        $target = match (true) {
            $k < 3 => 'reouvert',
            $k < 6 => 'en_investigation',
            default => 'reponse_envoyee',
        };
        $categoryCode = array_search($parent->category_id, $this->cat, true) ?: 'CARTES';
        $spec = [
            'received_at' => $childReceived, 'category' => $categoryCode, 'channel' => 'portail',
            'agency' => array_search($parent->receiving_agency_id, $this->agency, true) ?: null,
            'amount' => $parent->amount !== null ? (string) $parent->amount : null, 'currency' => $parent->currency, 'flagged' => (bool) $parent->amount_flagged,
            'subject' => mb_substr('Réouverture : '.$parent->subject, 0, 190),
            'description' => 'Le client conteste la réponse apportée au dossier '.$parent->reference.' et demande un réexamen. (Dossier fictif.)',
            'parent_id' => $parent->id,
        ];
        $c = $this->createComplaint($spec, $parent->customer, null, null, 'reouvert', null, false);
        $c->owner_id = $parent->owner_id;
        $c->save();
        $respondedAt = null;
        if ($target === 'reponse_envoyee') {
            $respondedAt = $this->workTime($childReceived->addDays($this->int(5, 12)));
            if ($respondedAt->greaterThan($this->now->subHours(2))) {
                $respondedAt = null;
                $target = 'en_investigation';
            }
        }
        $c->status = ComplaintStatus::Reouvert;
        $c->save();
        $this->event($c, 'reopened', 'Dossier ouvert suite à la réouverture de '.$parent->reference, null, 'client', null, $childReceived->addMinutes(1), 'Contestation de la réponse', null, ComplaintStatus::Reouvert);
        $this->event($parent, 'reopened', 'Réouverture demandée : nouveau dossier '.$c->reference, null, 'client', null, $childReceived->addMinutes(1), 'Contestation de la réponse');
        $this->audit('complaint.reopen', $parent, null, ['child_reference' => $c->reference, 'by_client' => true], 'Contestation de la réponse', null, $childReceived);
        $this->simulate($c, ComplaintStatus::from($target), $respondedAt, self::CATEGORY_ENTITY[$categoryCode], $spec);
    }

    private function createDuplicate(Complaint $original): void
    {
        $received = $original->received_at->toImmutable()->addHours($this->int(3, 60));
        if ($received->greaterThan($this->now->subHours(3))) {
            $received = $this->now->subHours(3);
        }
        $categoryCode = array_search($original->category_id, $this->cat, true) ?: 'CARTES';
        $spec = [
            'received_at' => $received, 'category' => $categoryCode, 'channel' => $this->one(['telephone', 'courriel', 'agence']),
            'agency' => array_search($original->receiving_agency_id, $this->agency, true) ?: 'BZV-CTR',
            'amount' => $original->amount !== null ? (string) $original->amount : null, 'currency' => $original->currency, 'flagged' => false,
            'subject' => $original->subject, 'description' => 'Même demande transmise par un second canal. (Dossier fictif.)',
        ];
        $dup = $this->createComplaint($spec, $original->customer, null, null, 'a_qualifier');
        $actor = $this->responsables[self::CATEGORY_ENTITY[$categoryCode]] ?? $this->demo['responsable'];
        $at = $received->addHours($this->int(4, 30));
        if ($at->greaterThan($this->now)) {
            $at = $this->now->subMinutes(30);
        }
        $dup->duplicate_of_id = $original->id;
        $dup->save();
        $this->event($dup, 'duplicate', 'Marqué comme doublon de '.$original->reference, null, 'internal', $actor->id, $at, 'Même client, même objet, même opération');
        $this->event($original, 'duplicate', 'Doublon rattaché : '.$dup->reference, null, 'internal', $actor->id, $at, 'Même client, même objet, même opération');
        $this->audit('complaint.mark_duplicate', $dup, ['duplicate_of_id' => null], ['duplicate_of_id' => $original->id], 'Même client, même objet, même opération', $actor->id, $at);
    }

    /** @param list<Complaint> $complaints */
    private function createQualityControls(array $complaints): void
    {
        $answered = array_values(array_filter($complaints, fn (Complaint $c) => $c->final_response_at !== null));
        $this->shuffle($answered);
        $findings = [
            'conforme' => null,
            'a_revoir' => 'Motivation de la réponse à préciser ; référence contractuelle manquante.',
            'non_conforme' => 'Réponse envoyée sans justificatif de la correction effectuée.',
        ];
        foreach (array_slice($answered, 0, 28) as $c) {
            $result = $this->pick(['conforme' => 70, 'a_revoir' => 20, 'non_conforme' => 10]);
            $at = $c->final_response_at->toImmutable()->addDays($this->int(1, 8));
            if ($at->greaterThan($this->now)) {
                $at = $this->now->subHours(1);
            }
            QualityControl::query()->create([
                'complaint_id' => $c->id, 'controller_id' => $this->demo['qualite']->id, 'result' => $result,
                'findings' => $findings[$result], 'controlled_at' => $at, 'created_at' => $at, 'updated_at' => $at,
            ]);
            $this->audit('complaint.quality_control', $c, null, ['result' => $result], null, $this->demo['qualite']->id, $at);
        }
    }
}
