<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\ComplaintStatus;
use App\Models\Complaint;
use App\Models\User;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Indicateurs (§8). Définitions uniques, mêmes filtres partout (tableau de bord, rapports, exports).
 *
 * Base commune : dossiers non brouillon, hors doublons (références uniques), dans le périmètre de
 * l'utilisateur, filtrés par agence, entité, catégorie, produit, canal et statut.
 */
final class KpiService
{
    public const DEFINITIONS = [
        'received' => 'Références uniques dont la date de réception se situe dans la période (filtres actifs).',
        'responded' => 'Références uniques dont la date de réponse finale se situe dans la période.',
        'cohort_treated' => 'Dossiers reçus dans la période ayant reçu une réponse finale au plus tard à la date de calcul.',
        'stock' => 'Dossiers reçus jusqu\'à la date de calcul sans réponse finale à cette date. Une réouverture crée un dossier enfant compté comme nouvelle entrée.',
        'treatment_rate' => 'Cohorte traitée ÷ reçues de la période (numérateur et dénominateur affichés).',
        'late_open' => 'Dossiers ouverts à la date de calcul dont l\'échéance de réponse finale est dépassée.',
        'late_closed' => 'Dossiers répondus dans la période après leur échéance de réponse finale.',
        'at_risk' => 'Dossiers ouverts, non en retard, dont la pré-alerte est atteinte ou dont l\'accusé de réception, non envoyé, arrive à échéance au plus tard à la date de calcul.',
    ];

    public function __construct(private readonly DeadlineCalculator $deadlines) {}

    public function base(ComplaintFilters $f, ?User $user): Builder
    {
        $q = Complaint::query()
            ->whereNull('complaints.duplicate_of_id')
            ->where('complaints.status', '!=', ComplaintStatus::Brouillon->value);
        if ($user !== null) {
            $q->visibleTo($user);
        }

        return $f->applyDimensions($q);
    }

    private function countDistinct(Builder $q): int
    {
        return (int) $q->distinct()->count('complaints.reference');
    }

    public function received(ComplaintFilters $f, ?User $user): int
    {
        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.received_at', '>=', $f->fromUtc())
            ->where('complaints.received_at', '<=', $f->toUtc()));
    }

    public function responded(ComplaintFilters $f, ?User $user): int
    {
        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.final_response_at', '>=', $f->fromUtc())
            ->where('complaints.final_response_at', '<=', $f->toUtc()));
    }

    public function cohortTreated(ComplaintFilters $f, ?User $user): int
    {
        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.received_at', '>=', $f->fromUtc())
            ->where('complaints.received_at', '<=', $f->toUtc())
            ->whereNotNull('complaints.final_response_at')
            ->where('complaints.final_response_at', '<=', $f->asOfUtc()));
    }

    /** Stock à la fin de la journée locale $date. */
    public function stockAt(CarbonImmutable $date, ComplaintFilters $f, ?User $user): int
    {
        $at = Dt::db(Dt::endOfLocalDay($date));

        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.received_at', '<=', $at)
            ->where(fn (Builder $q) => $q->whereNull('complaints.final_response_at')->orWhere('complaints.final_response_at', '>', $at)));
    }

    public function lateOpen(ComplaintFilters $f, ?User $user): int
    {
        $at = $f->asOfUtc();

        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.received_at', '<=', $at)
            ->whereDeadlineFlag('en_retard', $at));
    }

    public function lateClosed(ComplaintFilters $f, ?User $user): int
    {
        $due = Complaint::deadlineSql('reponse_finale');

        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.final_response_at', '>=', $f->fromUtc())
            ->where('complaints.final_response_at', '<=', $f->toUtc())
            ->whereRaw("{$due} is not null and complaints.final_response_at > {$due}"));
    }

    public function atRisk(ComplaintFilters $f, ?User $user): int
    {
        $at = $f->asOfUtc();

        return $this->countDistinct($this->base($f, $user)
            ->where('complaints.received_at', '<=', $at)
            ->whereDeadlineFlag('a_risque', $at));
    }

    /** @return array{numerator: int, denominator: int, value: float|null} */
    public static function rate(int $numerator, int $denominator): array
    {
        return [
            'numerator' => $numerator,
            'denominator' => $denominator,
            'value' => $denominator === 0 ? null : round($numerator * 100 / $denominator, 1),
        ];
    }

    /** @return array<string, mixed> */
    public function kpis(ComplaintFilters $f, ?User $user): array
    {
        $f = $f->withDefaultPeriod();
        $received = $this->received($f, $user);
        $cohort = $this->cohortTreated($f, $user);

        return [
            'received' => $received,
            'responded' => $this->responded($f, $user),
            'stock' => $this->stockAt($f->asOf, $f, $user),
            'at_risk' => $this->atRisk($f, $user),
            'cohort_treated' => $cohort,
            'late_open' => $this->lateOpen($f, $user),
            'late_closed' => $this->lateClosed($f, $user),
            'treatment_rate' => self::rate($cohort, $received),
        ];
    }

    /** Décalage SQL vers l'heure locale (Africa/Brazzaville n'a pas d'heure d'été). */
    private function localExpr(string $column): string
    {
        $minutes = CarbonImmutable::now(Dt::tz())->utcOffset();

        return "date_add({$column}, interval {$minutes} minute)";
    }

    /** @return list<array{month: string, label: string, received: int, responded: int}> */
    public function monthly(ComplaintFilters $f, ?User $user): array
    {
        $f = $f->withDefaultPeriod();
        $labels = [1 => 'Janv', 2 => 'Févr', 3 => 'Mars', 4 => 'Avr', 5 => 'Mai', 6 => 'Juin', 7 => 'Juil', 8 => 'Août', 9 => 'Sept', 10 => 'Oct', 11 => 'Nov', 12 => 'Déc'];

        $recv = $this->base($f, $user)
            ->where('complaints.received_at', '>=', $f->fromUtc())->where('complaints.received_at', '<=', $f->toUtc())
            ->selectRaw("date_format({$this->localExpr('complaints.received_at')}, '%Y-%m') as ym, count(distinct complaints.reference) as c")
            ->groupBy('ym')->pluck('c', 'ym');
        $resp = $this->base($f, $user)
            ->where('complaints.final_response_at', '>=', $f->fromUtc())->where('complaints.final_response_at', '<=', $f->toUtc())
            ->selectRaw("date_format({$this->localExpr('complaints.final_response_at')}, '%Y-%m') as ym, count(distinct complaints.reference) as c")
            ->groupBy('ym')->pluck('c', 'ym');

        $out = [];
        $cursor = $f->from->startOfMonth();
        while ($cursor->lessThanOrEqualTo($f->to)) {
            $ym = $cursor->format('Y-m');
            $out[] = [
                'month' => $ym,
                'label' => $labels[(int) $cursor->format('n')],
                'received' => (int) ($recv[$ym] ?? 0),
                'responded' => (int) ($resp[$ym] ?? 0),
            ];
            $cursor = $cursor->addMonthNoOverflow();
        }

        return $out;
    }

    /**
     * Répartition des reçues de la période par dimension.
     *
     * @return list<array{id: int|null, label: string, count: int}>
     */
    public function receivedBy(string $dimension, ComplaintFilters $f, ?User $user): array
    {
        [$table, $fk, $labelCol] = self::dimension($dimension);
        $f = $f->withDefaultPeriod();

        return $this->base($f, $user)
            ->where('complaints.received_at', '>=', $f->fromUtc())->where('complaints.received_at', '<=', $f->toUtc())
            ->leftJoin($table, "{$table}.id", '=', "complaints.{$fk}")
            ->selectRaw("{$table}.id as dim_id, {$table}.{$labelCol} as dim_label, count(distinct complaints.reference) as c")
            ->groupBy("{$table}.id", "{$table}.{$labelCol}")
            ->orderByDesc('c')
            ->get()
            ->map(fn ($r) => ['id' => $r->dim_id !== null ? (int) $r->dim_id : null, 'label' => $r->dim_label ?? 'Non renseigné', 'count' => (int) $r->c])
            ->all();
    }

    /** @return array{0: string, 1: string, 2: string} */
    public static function dimension(string $dimension): array
    {
        return match ($dimension) {
            'category' => ['categories', 'category_id', 'label'],
            'channel' => ['channels', 'channel_id', 'label'],
            'agency' => ['agencies', 'receiving_agency_id', 'name'],
            'entity' => ['processing_entities', 'processing_entity_id', 'name'],
            'product' => ['products', 'product_id', 'label'],
            default => throw new \InvalidArgumentException('Dimension inconnue'),
        };
    }

    /** @return array<string, mixed> */
    public function meta(ComplaintFilters $f): array
    {
        $f = $f->withDefaultPeriod();

        return [
            'from' => $f->from->format('Y-m-d'),
            'to' => $f->to->format('Y-m-d'),
            'as_of' => $f->asOf->format('Y-m-d'),
            'timezone' => Dt::tz(),
            'filters' => (object) $f->dimensionFilters(),
            'definitions' => self::DEFINITIONS,
            'rule_is_demo' => $this->deadlines->usesDemoRule(),
            'rule_version' => $this->deadlines->finalRuleVersionLabel(),
            'computed_at' => Dt::iso(Dt::now()),
        ];
    }
}
