<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\ExportFormat;
use App\Http\Controllers\Controller;
use App\Http\Requests\ComplaintFilterRequest;
use App\Http\Requests\ReportValidationRequest;
use App\Models\ReportValidation;
use App\Services\AuditLogger;
use App\Services\DeadlineCalculator;
use App\Services\ExportService;
use App\Services\ReportService;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ReportController extends Controller
{
    public function activity(ComplaintFilterRequest $request, ReportService $reports, ExportService $exports): Response
    {
        $filters = ComplaintFilters::fromArray($request->validated())->withDefaultPeriod();
        $report = $reports->activity($filters, $request->user());
        $validation = $this->findValidation($filters);
        $report['validated_by'] = $validation?->validator ? ['id' => $validation->validator->id, 'name' => $validation->validator->name] : null;
        $report['validated_at'] = Dt::iso($validation?->validated_at);
        $report['validation'] = $validation ? [
            'id' => $validation->id,
            'comment' => $validation->comment,
            'rule_version' => $validation->rule_version,
            'as_of' => $validation->as_of?->format('Y-m-d'),
            'snapshot' => $validation->snapshot,
        ] : null;

        $format = $request->validated('format');
        if ($format === null) {
            return response()->json(['data' => $report]);
        }

        // Sans complaints.export (ex. direction) : export agrégé anonymisé (aucun nom, même de validateur).
        $anonymized = ! $request->user()->hasPermission('complaints.export');
        $validatedBy = $report['validated_by'] === null ? 'non validé'
            : ($anonymized ? 'Conformité (validation n° '.$report['validation']['id'].')' : $report['validated_by']['name']);

        $flows = static fn (array $rows): array => array_map(static fn ($r) => [$r['label'], $r['inflow'], $r['outflow'], $r['closing_stock']], $rows);
        $sections = [
            ['title' => 'Par mois', 'columns' => ['Mois', 'Stock début', 'Entrées', 'Réponses finales', 'Ajustements', 'Stock fin', 'Équilibré'],
                'rows' => array_map(static fn ($m) => [$m['month'], $m['opening_stock'], $m['inflow'], $m['outflow'], $m['adjustments'], $m['closing_stock'], $m['balanced'] ? 'oui' : 'non'], $report['by_month'])],
            ['title' => 'Par agence de réception', 'columns' => ['Agence', 'Entrées', 'Réponses', 'Stock fin'], 'rows' => $flows($report['by_agency'])],
            ['title' => 'Par entité de traitement', 'columns' => ['Entité', 'Entrées', 'Réponses', 'Stock fin'], 'rows' => $flows($report['by_entity'])],
            ['title' => 'Par canal', 'columns' => ['Canal', 'Entrées', 'Réponses', 'Stock fin'], 'rows' => $flows($report['by_channel'])],
            ['title' => 'Par catégorie', 'columns' => ['Catégorie', 'Entrées', 'Réponses', 'Stock fin'], 'rows' => $flows($report['by_category'])],
            ['title' => 'Par décision (réponses de la période)', 'columns' => ['Décision', 'Nombre'],
                'rows' => array_map(static fn ($d) => [$d['label'], $d['count']], $report['by_decision'])],
        ];

        return $exports->download('rapport-activite', 'Rapport d\'activité et rapprochement du stock', ExportFormat::from($format), $filters, $request->user(),
            ['Indicateur', 'Valeur'],
            [
                ['Formule', ReportService::FORMULA],
                ['Stock de début (veille de la période)', $report['opening_stock']],
                ['Entrées (reçues)', $report['inflow']],
                ['Réponses finales', $report['outflow']],
                ['Ajustements justifiés', $report['adjustments']],
                ['Stock de fin', $report['closing_stock']],
                ['Rapprochement équilibré', $report['balanced'] ? 'oui' : 'non'],
                ['Retards ouverts', $report['late_open']],
                ['Retards clos', $report['late_closed']],
                ['Validé par', $validatedBy],
                ['Validé le', $report['validated_at'] ?? ''],
            ],
            $sections,
            $anonymized,
        );
    }

    private function findValidation(ComplaintFilters $filters): ?ReportValidation
    {
        return ReportValidation::query()->with('validator')
            ->where('type', 'activity')
            ->whereDate('period_from', $filters->from?->format('Y-m-d'))
            ->whereDate('period_to', $filters->to?->format('Y-m-d'))
            ->where('filters_hash', ReportValidation::hashFilters($filters->dimensionFilters()))
            ->orderByDesc('validated_at')->orderByDesc('id')
            ->first();
    }

    /** Validation d'un rapport d'activité par la conformité (permission reports.validate). */
    public function validateActivity(ReportValidationRequest $request, ReportService $reports, DeadlineCalculator $deadlines, AuditLogger $audit): JsonResponse
    {
        $data = $request->validated();
        $filters = ComplaintFilters::fromArray(array_merge($data['filters'] ?? [], [
            'from' => $data['from'], 'to' => $data['to'], 'as_of' => $data['as_of'] ?? null,
        ]))->withDefaultPeriod();
        $snapshot = $reports->reconciliation($filters, $request->user());

        $validation = ReportValidation::query()->create([
            'type' => 'activity',
            'period_from' => $filters->from->format('Y-m-d'),
            'period_to' => $filters->to->format('Y-m-d'),
            'filters' => $filters->dimensionFilters(),
            'filters_hash' => ReportValidation::hashFilters($filters->dimensionFilters()),
            'as_of' => $filters->asOf->format('Y-m-d'),
            'rule_version' => $deadlines->finalRuleVersionLabel(),
            'snapshot' => $snapshot,
            'comment' => $data['comment'] ?? null,
            'validated_by' => $request->user()->id,
            'validated_at' => Dt::now(),
        ]);
        $audit->log('report.validate', $validation, null, $validation->only(['type', 'period_from', 'period_to', 'filters', 'rule_version', 'snapshot']), $data['comment'] ?? null);

        return response()->json(['data' => [
            'id' => $validation->id,
            'type' => 'activity',
            'from' => $validation->period_from->format('Y-m-d'),
            'to' => $validation->period_to->format('Y-m-d'),
            'as_of' => $validation->as_of->format('Y-m-d'),
            'filters' => $validation->filters,
            'rule_version' => $validation->rule_version,
            'snapshot' => $snapshot,
            'comment' => $validation->comment,
            'validated_by' => ['id' => $request->user()->id, 'name' => $request->user()->name],
            'validated_at' => Dt::iso($validation->validated_at),
        ]], 201);
    }
}
