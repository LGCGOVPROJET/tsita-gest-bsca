<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\QualityActionStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ComplaintFilterRequest;
use App\Http\Requests\QualityActionRequest;
use App\Http\Resources\QualityActionResource;
use App\Models\Complaint;
use App\Models\QualityAction;
use App\Services\AuditLogger;
use App\Services\KpiService;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class QualityController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', QualityAction::class);
        $data = $request->validate([
            'status' => ['nullable', Rule::in(QualityActionStatus::values())],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = QualityAction::query()->with(['category', 'owner', 'ownerEntity', 'complaints:id,reference'])
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByRaw('due_at is null asc')->orderBy('due_at')->orderBy('id');

        return Paginated::response($q->paginate((int) ($data['per_page'] ?? 25)), QualityActionResource::class, $request);
    }

    public function store(QualityActionRequest $request): JsonResponse
    {
        $this->authorize('create', QualityAction::class);
        $data = $request->validated();
        $ids = $data['complaint_ids'] ?? [];
        unset($data['complaint_ids']);
        $action = QualityAction::query()->create($data);
        $action->complaints()->sync($ids);
        $this->audit->log('quality_action.create', $action, null, $action->toArray() + ['complaint_ids' => $ids]);

        return (new QualityActionResource($action->load(['category', 'owner', 'ownerEntity', 'complaints'])))->response()->setStatusCode(201);
    }

    public function update(QualityActionRequest $request, QualityAction $action): QualityActionResource
    {
        $this->authorize('update', $action);
        $data = $request->validated();
        $before = $action->toArray();
        if (array_key_exists('complaint_ids', $data)) {
            $action->complaints()->sync($data['complaint_ids']);
            unset($data['complaint_ids']);
        }
        $action->fill($data);
        if ($action->isDirty('status') && in_array($action->status, [QualityActionStatus::Realisee, QualityActionStatus::Verifiee], true)) {
            $action->completed_at ??= Dt::now();
        }
        $action->save();
        $this->audit->log('quality_action.update', $action, $before, $action->toArray());

        return new QualityActionResource($action->load(['category', 'owner', 'ownerEntity', 'complaints']));
    }

    /** Regroupements récurrents (catégorie × produit) sur la période, avec retards et réouvertures. */
    public function recurring(ComplaintFilterRequest $request, KpiService $kpi): JsonResponse
    {
        $this->authorize('viewAny', QualityAction::class);
        $filters = ComplaintFilters::fromArray($request->validated())->withDefaultPeriod();
        $due = Complaint::deadlineSql('reponse_finale');
        $now = Dt::db(Dt::now());

        $rows = $kpi->base($filters, $request->user())
            ->where('complaints.received_at', '>=', $filters->fromUtc())
            ->where('complaints.received_at', '<=', $filters->toUtc())
            ->leftJoin('categories', 'categories.id', '=', 'complaints.category_id')
            ->leftJoin('products', 'products.id', '=', 'complaints.product_id')
            ->selectRaw("categories.id as category_id, categories.label as category, products.id as product_id, products.label as product,
                count(distinct complaints.id) as cnt,
                sum(case when {$due} is not null and ((complaints.final_response_at is null and {$due} < ?) or complaints.final_response_at > {$due}) then 1 else 0 end) as late_count,
                sum(case when complaints.parent_complaint_id is not null then 1 else 0 end) as reopened_count", [$now])
            ->groupBy('categories.id', 'categories.label', 'products.id', 'products.label')
            ->orderByDesc('cnt')
            ->get()
            ->map(fn ($r) => [
                'category' => $r->category ?? 'Non qualifiée',
                'category_id' => $r->category_id,
                'product' => $r->product ?? 'Non renseigné',
                'product_id' => $r->product_id,
                'count' => (int) $r->cnt,
                'late_count' => (int) $r->late_count,
                'reopened_count' => (int) $r->reopened_count,
            ]);

        return response()->json(['data' => $rows, 'meta' => $kpi->meta($filters)]);
    }
}
