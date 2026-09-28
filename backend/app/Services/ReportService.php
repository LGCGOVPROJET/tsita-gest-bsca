<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\Decision;
use App\Models\User;
use App\Support\ComplaintFilters;

/**
 * Rapport d'activité et réconciliation de stock :
 * stock_debut (veille de from) + entrées − réponses finales ± ajustements = stock_fin.
 */
final class ReportService
{
    public const FORMULA = 'stock_debut (veille de from) + entrées − réponses finales ± ajustements = stock_fin (au to)';

    public function __construct(private readonly KpiService $kpi) {}

    /** @return array<string, int|bool> */
    public function reconciliation(ComplaintFilters $f, ?User $user): array
    {
        $f = $f->withDefaultPeriod();
        $opening = $this->kpi->stockAt($f->from->subDay(), $f, $user);
        $inflow = $this->kpi->received($f, $user);
        $outflow = $this->kpi->responded($f, $user);
        $closing = $this->kpi->stockAt($f->to, $f, $user);
        // Ajustements justifiés : aucun mécanisme d'ajustement manuel n'est encore validé par BSCA.
        $adjustments = 0;

        return [
            'opening_stock' => $opening,
            'inflow' => $inflow,
            'outflow' => $outflow,
            'adjustments' => $adjustments,
            'closing_stock' => $closing,
            'balanced' => $opening + $inflow - $outflow + $adjustments === $closing,
        ];
    }

    /** @return array<string, mixed> */
    public function activity(ComplaintFilters $f, ?User $user): array
    {
        $f = $f->withDefaultPeriod();
        $rec = $this->reconciliation($f, $user);

        $byMonth = [];
        $cursor = $f->from;
        while ($cursor->lessThanOrEqualTo($f->to)) {
            $monthEnd = $cursor->endOfMonth()->startOfDay();
            if ($monthEnd->greaterThan($f->to)) {
                $monthEnd = $f->to;
            }
            $mf = $f->withPeriod($cursor, $monthEnd);
            $r = $this->reconciliation($mf, $user);
            $byMonth[] = ['month' => $cursor->format('Y-m'), 'from' => $cursor->format('Y-m-d'), 'to' => $monthEnd->format('Y-m-d')] + $r;
            $cursor = $cursor->startOfMonth()->addMonthNoOverflow();
        }

        return $rec + [
            'by_month' => $byMonth,
            'by_agency' => $this->flowsBy('agency', $f, $user),
            'by_entity' => $this->flowsBy('entity', $f, $user),
            'by_channel' => $this->flowsBy('channel', $f, $user),
            'by_category' => $this->flowsBy('category', $f, $user),
            'by_decision' => $this->byDecision($f, $user),
            'late_open' => $this->kpi->lateOpen($f, $user),
            'late_closed' => $this->kpi->lateClosed($f, $user),
            'meta' => $this->kpi->meta($f) + ['formula' => self::FORMULA],
        ];
    }

    /** @return list<array{id: int|null, label: string, inflow: int, outflow: int, closing_stock: int}> */
    public function flowsBy(string $dimension, ComplaintFilters $f, ?User $user): array
    {
        [$table, $fk, $labelCol] = KpiService::dimension($dimension);
        $fromUtc = $f->fromUtc();
        $toUtc = $f->toUtc();

        $rows = $this->kpi->base($f, $user)
            ->leftJoin($table, "{$table}.id", '=', "complaints.{$fk}")
            ->selectRaw("{$table}.id as dim_id, {$table}.{$labelCol} as dim_label,
                count(distinct case when complaints.received_at between ? and ? then complaints.reference end) as inflow,
                count(distinct case when complaints.final_response_at between ? and ? then complaints.reference end) as outflow,
                count(distinct case when complaints.received_at <= ? and (complaints.final_response_at is null or complaints.final_response_at > ?) then complaints.reference end) as closing_stock",
                [$fromUtc, $toUtc, $fromUtc, $toUtc, $toUtc, $toUtc])
            ->groupBy("{$table}.id", "{$table}.{$labelCol}")
            ->get();

        return $rows->map(fn ($r) => [
            'id' => $r->dim_id !== null ? (int) $r->dim_id : null,
            'label' => $r->dim_label ?? 'Non renseigné',
            'inflow' => (int) $r->inflow,
            'outflow' => (int) $r->outflow,
            'closing_stock' => (int) $r->closing_stock,
        ])->filter(fn ($r) => $r['inflow'] + $r['outflow'] + $r['closing_stock'] > 0)
            ->sortByDesc('inflow')->values()->all();
    }

    /** @return list<array{decision: string|null, label: string, count: int}> */
    public function byDecision(ComplaintFilters $f, ?User $user): array
    {
        return $this->kpi->base($f, $user)
            ->where('complaints.final_response_at', '>=', $f->fromUtc())
            ->where('complaints.final_response_at', '<=', $f->toUtc())
            ->selectRaw('complaints.decision as d, count(distinct complaints.reference) as c')
            ->groupBy('complaints.decision')
            ->get()
            ->map(fn ($r) => [
                'decision' => $r->d,
                'label' => Decision::labelFor($r->d) ?? 'Non renseignée',
                'count' => (int) $r->c,
            ])->sortByDesc('count')->values()->all();
    }
}
