<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\ComplaintStatus;
use App\Enums\Decision;
use App\Enums\Priority;
use App\Enums\Role;
use App\Enums\SolutionType;
use App\Http\Controllers\Controller;
use App\Models\Agency;
use App\Models\Category;
use App\Models\Channel;
use App\Models\ProcessingEntity;
use App\Models\Product;
use App\Models\ResponseTemplate;
use App\Models\User;
use Illuminate\Http\JsonResponse;

final class ReferentialController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'agencies' => Agency::query()->orderBy('name')->get(['id', 'code', 'name', 'city', 'is_active']),
            'entities' => ProcessingEntity::query()->orderBy('name')->get(['id', 'code', 'name', 'is_active']),
            'categories' => Category::query()->orderBy('label')->get(['id', 'code', 'label', 'is_active', 'version']),
            'products' => Product::query()->orderBy('label')->get(['id', 'code', 'label', 'is_active']),
            'channels' => Channel::query()->orderBy('id')->get(['id', 'code', 'label', 'is_active']),
            'statuses' => ComplaintStatus::options(),
            'decisions' => Decision::options(),
            'priorities' => Priority::options(),
            'solution_types' => SolutionType::options(),
            'templates' => ResponseTemplate::query()->where('is_active', true)->orderBy('kind')->get(['id', 'code', 'kind', 'label', 'subject', 'body', 'version']),
            'users' => User::query()
                ->where('is_active', true)
                ->whereIn('role', [Role::Gestionnaire->value, Role::Responsable->value, Role::AgentAccueil->value, Role::Qualite->value, Role::Conformite->value])
                ->orderBy('name')
                ->get(['id', 'name', 'role', 'entity_id'])
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'role' => $u->role->value, 'entity_id' => $u->entity_id]),
        ]);
    }
}
