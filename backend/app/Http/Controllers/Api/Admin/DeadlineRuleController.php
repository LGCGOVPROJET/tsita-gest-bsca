<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Admin;

use App\Enums\RuleStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\DeadlineRuleRequest;
use App\Http\Resources\DeadlineRuleResource;
use App\Models\DeadlineRule;
use App\Services\AuditLogger;
use App\Support\Dt;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Règles de délai versionnées. Une règle validée est immuable ; sa validation relève de la conformité.
 */
final class DeadlineRuleController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** Liste paginée { data, meta } (per_page ≤ 100, défaut 50). */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', DeadlineRule::class);
        $data = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = DeadlineRule::query()->with('validator')->orderBy('kind')->orderBy('code')->orderByDesc('version')->orderBy('id');

        return Paginated::response($q->paginate((int) ($data['per_page'] ?? 50)), DeadlineRuleResource::class, $request);
    }

    public function store(DeadlineRuleRequest $request): JsonResponse
    {
        $this->authorize('create', DeadlineRule::class);
        $data = $request->validated();
        $data['version'] = (int) DeadlineRule::query()->where('code', $data['code'])->max('version') + 1;
        $data['status'] ??= RuleStatus::Brouillon->value;
        $data['start_point'] = 'received_at';
        $rule = DeadlineRule::query()->create($data);
        $this->audit->log('admin.deadline_rules.create', $rule, null, $rule->toArray());

        return (new DeadlineRuleResource($rule))->response()->setStatusCode(201);
    }

    public function update(DeadlineRuleRequest $request, DeadlineRule $rule): DeadlineRuleResource|JsonResponse
    {
        if ($rule->status === RuleStatus::Valide) {
            // Seul le retrait d'une règle validée est permis ; toute autre évolution = nouvelle version.
            $this->authorize('viewAny', DeadlineRule::class);
            abort_unless($request->user()->hasPermission('admin.rules'), 403);
            if (array_keys($request->validated()) !== ['status'] || $request->validated('status') !== RuleStatus::Retire->value) {
                return response()->json(['message' => 'Une règle validée est immuable : créez une nouvelle version.'], 422);
            }
        } else {
            $this->authorize('update', $rule);
        }
        $before = $rule->toArray();
        $rule->fill($request->validated());
        if (isset($request->validated()['code']) && $rule->isDirty('code')) {
            return response()->json(['message' => 'Le code d\'une règle ne peut pas être modifié.'], 422);
        }
        $rule->save();
        $this->audit->log('admin.deadline_rules.update', $rule, $before, $rule->toArray());

        return new DeadlineRuleResource($rule->load('validator'));
    }

    public function validateRule(DeadlineRule $rule): DeadlineRuleResource
    {
        $this->authorize('validate', $rule);
        $before = $rule->toArray();
        $rule->status = RuleStatus::Valide;
        $rule->forceFill(['validated_by' => request()->user()->id, 'validated_at' => Dt::now()]);
        $rule->save();
        $this->audit->log('admin.deadline_rules.validate', $rule, $before, $rule->toArray(), 'Validation conformité');

        return new DeadlineRuleResource($rule->load('validator'));
    }

    public function destroy(DeadlineRule $rule): Response|JsonResponse
    {
        return response()->json(['message' => 'Les règles ne sont jamais supprimées : utilisez le statut « retire ».'], 422);
    }
}
