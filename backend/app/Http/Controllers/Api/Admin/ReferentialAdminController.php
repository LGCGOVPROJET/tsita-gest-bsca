<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdminReferentialRequest;
use App\Http\Resources\AdminReferentialResource;
use App\Models\Agency;
use App\Models\Category;
use App\Models\Holiday;
use App\Models\ProcessingEntity;
use App\Models\Product;
use App\Models\ResponseTemplate;
use App\Services\AuditLogger;
use App\Services\DeadlineCalculator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * CRUD des référentiels (admin). Pas de suppression physique des éléments référencés :
 * désactivation (is_active=false). Les modèles et catégories sont versionnés.
 */
final class ReferentialAdminController extends Controller
{
    /** @var array<string, class-string<Model>> */
    private const MODELS = [
        'agencies' => Agency::class,
        'entities' => ProcessingEntity::class,
        'categories' => Category::class,
        'products' => Product::class,
        'templates' => ResponseTemplate::class,
        'holidays' => Holiday::class,
    ];

    public function __construct(private readonly AuditLogger $audit) {}

    /** @return class-string<Model> */
    private function model(string $type): string
    {
        abort_unless(isset(self::MODELS[$type]), 404);

        return self::MODELS[$type];
    }

    public function index(string $type): JsonResponse
    {
        $class = $this->model($type);
        $q = $class::query();
        $q = match ($type) {
            'holidays' => $q->orderBy('date'),
            'templates' => $q->orderBy('kind')->orderBy('code')->orderByDesc('version'),
            'agencies', 'entities' => $q->orderBy('name'),
            default => $q->orderBy('label'),
        };

        return response()->json(['data' => $q->get()->map(fn (Model $m) => $this->present($m, $type))->values()]);
    }

    public function store(AdminReferentialRequest $request, string $type): JsonResponse
    {
        $class = $this->model($type);
        $data = $request->validated();
        if ($type === 'templates') {
            $data['version'] = (int) ResponseTemplate::query()->where('code', $data['code'])->max('version') + 1;
        }
        if ($type === 'holidays') {
            $data['country'] = 'CG';
        }
        $model = $class::query()->create($data);
        $this->flushCalendar($type);
        $this->audit->log('admin.'.$type.'.create', $model, null, $model->toArray());

        return response()->json(['data' => $this->present($model, $type)], 201);
    }

    public function update(AdminReferentialRequest $request, string $type, int $id): JsonResponse
    {
        $class = $this->model($type);
        /** @var Model $model */
        $model = $class::query()->findOrFail($id);
        $before = $model->toArray();
        $data = $request->validated();

        if ($type === 'templates' && array_intersect(array_keys($data), ['subject', 'body', 'kind'])) {
            // Nouvelle version d'un modèle : l'ancienne est conservée (désactivée) pour la traçabilité.
            $model->update(['is_active' => false]);
            $new = ResponseTemplate::query()->create(array_merge($model->only(['code', 'kind', 'label', 'subject', 'body']), $data, [
                'version' => (int) ResponseTemplate::query()->where('code', $model->code)->max('version') + 1,
                'is_active' => $data['is_active'] ?? true,
            ]));
            $this->audit->log('admin.templates.version', $new, $before, $new->toArray());

            return response()->json(['data' => $this->present($new, $type)]);
        }

        $model->fill($data);
        if ($type === 'categories' && $model->isDirty(['label', 'description'])) {
            $model->version = (int) $model->version + 1;
        }
        $model->save();
        $this->flushCalendar($type);
        $this->audit->log('admin.'.$type.'.update', $model, $before, $model->toArray());

        return response()->json(['data' => $this->present($model, $type)]);
    }

    public function destroy(string $type, int $id): Response|JsonResponse
    {
        $class = $this->model($type);
        $model = $class::query()->findOrFail($id);
        $before = $model->toArray();
        if ($type === 'holidays') {
            $model->delete();
            $this->flushCalendar($type);
            $this->audit->log('admin.holidays.delete', $model, $before, null);

            return response()->noContent();
        }
        $model->update(['is_active' => false]);
        $this->audit->log('admin.'.$type.'.deactivate', $model, $before, $model->toArray());

        return response()->json(['data' => $this->present($model, $type)]);
    }

    /** @return array<string, mixed> */
    private function present(Model $model, string $type): array
    {
        return (new AdminReferentialResource($model, $type))->toArray(request());
    }

    private function flushCalendar(string $type): void
    {
        if ($type === 'holidays') {
            app(DeadlineCalculator::class)->flushCache();
        }
    }
}
