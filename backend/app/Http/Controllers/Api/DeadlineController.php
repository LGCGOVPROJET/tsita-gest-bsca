<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\DeadlineKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\ComplaintFilterRequest;
use App\Http\Resources\ComplaintListItemResource;
use App\Http\Resources\DeadlineRuleResource;
use App\Models\Complaint;
use App\Services\ComplaintSearch;
use App\Services\DeadlineCalculator;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;

/**
 * Files d'échéance : « à échéance » (ouverts non en retard), « en retard », « clos en retard ».
 */
final class DeadlineController extends Controller
{
    public function __invoke(ComplaintFilterRequest $request, ComplaintSearch $search, DeadlineCalculator $calculator): JsonResponse
    {
        $user = $request->user();
        $filters = ComplaintFilters::fromArray($request->validated());
        $now = Dt::db(Dt::now());
        $queue = $request->validated('queue') ?? 'a_echeance';
        $options = $request->validated();
        unset($options['deadline_flag']);

        $base = fn () => $search->query($filters, $user, $options)->whereNull('complaints.duplicate_of_id');
        $q = $base();
        $due = Complaint::deadlineSql('reponse_finale');
        match ($queue) {
            'en_retard' => $q->whereDeadlineFlag('en_retard', $now)->orderByRaw("{$due} asc"),
            'clos_en_retard' => $q->whereDeadlineFlag('clos_en_retard', $now)->orderByDesc('complaints.final_response_at'),
            default => $q->whereNull('complaints.final_response_at')->whereRaw("{$due} is not null and {$due} >= ?", [$now])->orderByRaw("{$due} asc"),
        };
        if (! empty($request->validated('deadline_flag'))) {
            $q->whereDeadlineFlag((string) $request->validated('deadline_flag'), $now);
        }
        $q->with(ComplaintListItemResource::WITH)->orderBy('complaints.id');

        $transform = function (Complaint $c) use ($request): array {
            $final = $c->deadlineOf(DeadlineKind::ReponseFinale);

            return (new ComplaintListItemResource($c))->toArray($request) + [
                'prealert_at' => Dt::iso($c->deadlineOf(DeadlineKind::Prealerte)?->due_at),
                'acknowledgment_due_at' => Dt::iso($c->deadlineOf(DeadlineKind::Accuse)?->due_at),
                'initial_due_at' => Dt::iso($final?->initial_due_at),
                'announced_at' => Dt::iso($final?->announced_at),
                'days_remaining' => $final && $c->final_response_at === null
                    ? (int) Dt::today()->diffInDays(Dt::parseLocal($final->due_at)->startOfDay(), false)
                    : null,
                'final_response_at' => Dt::iso($c->final_response_at),
            ];
        };

        return Paginated::response(
            $q->paginate(min((int) ($request->validated('per_page') ?? 25), 100)),
            $transform,
            $request,
            [
                'summary' => [
                    'a_risque' => $base()->whereDeadlineFlag('a_risque', $now)->count(),
                    'en_retard' => $base()->whereDeadlineFlag('en_retard', $now)->count(),
                    'clos_en_retard' => $base()->whereDeadlineFlag('clos_en_retard', $now)->count(),
                ],
                'rules' => DeadlineRuleResource::collection($calculator->activeRules())->toArray($request),
                'rule_is_demo' => $calculator->usesDemoRule(),
            ],
        );
    }
}
