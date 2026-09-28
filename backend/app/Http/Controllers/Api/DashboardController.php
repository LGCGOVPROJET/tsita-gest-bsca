<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\ComplaintStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ComplaintFilterRequest;
use App\Http\Resources\ComplaintListItemResource;
use App\Models\Complaint;
use App\Models\ComplaintEvent;
use App\Services\KpiService;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use Illuminate\Http\JsonResponse;

final class DashboardController extends Controller
{
    public function __invoke(ComplaintFilterRequest $request, KpiService $kpi): JsonResponse
    {
        $user = $request->user();
        $filters = ComplaintFilters::fromArray($request->validated())->withDefaultPeriod();
        $now = Dt::db(Dt::now());

        // Priorités : dossiers ouverts du périmètre, en retard puis à risque, par échéance.
        $due = Complaint::deadlineSql('reponse_finale');
        $priorities = $kpi->base($filters, $user)
            ->whereNull('complaints.final_response_at')
            // Dossiers repris de l'historique : statut source « clôturé » conservé sans date de réponse inventée.
            ->whereNotIn('complaints.status', [ComplaintStatus::ReponseEnvoyee->value, ComplaintStatus::Cloture->value])
            ->with(ComplaintListItemResource::WITH)
            ->orderByRaw("case when {$due} is not null and {$due} < ? then 0 else 1 end", [$now])
            ->orderByRaw("{$due} is null asc")
            ->orderByRaw("{$due} asc")
            ->limit(5)
            ->get();

        $visibleIds = $kpi->base($filters, $user)->select('complaints.id');
        $events = ComplaintEvent::query()
            ->with(['complaint:id,reference', 'actor:id,name'])
            ->whereIn('complaint_id', $visibleIds)
            ->orderByDesc('created_at')->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(fn (ComplaintEvent $e) => [
                'date' => Dt::iso($e->created_at),
                'reference' => $e->complaint?->reference,
                'complaint_id' => $e->complaint_id,
                'title' => $e->title,
                'actor' => $e->actor?->name,
            ]);

        return response()->json(['data' => [
            'kpis' => $kpi->kpis($filters, $user),
            'monthly' => $kpi->monthly($filters, $user),
            'by_category' => array_map(fn ($r) => ['label' => $r['label'], 'count' => $r['count']], $kpi->receivedBy('category', $filters, $user)),
            'by_channel' => array_map(fn ($r) => ['label' => $r['label'], 'count' => $r['count']], $kpi->receivedBy('channel', $filters, $user)),
            'priorities' => ComplaintListItemResource::collection($priorities)->toArray($request),
            'recent_events' => $events,
            'meta' => $kpi->meta($filters),
        ]]);
    }
}
