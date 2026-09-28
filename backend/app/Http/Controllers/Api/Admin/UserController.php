<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Admin;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\AdminUserRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\Paginated;
use App\Support\SessionPurger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class UserController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', User::class);
        $data = $request->validate([
            'role' => ['nullable', Rule::in(Role::values())],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = User::query()->with(['agency', 'entity'])
            ->when($data['role'] ?? null, fn ($q, $r) => $q->where('role', $r))
            ->when($data['search'] ?? null, function ($q, $s) {
                $like = '%'.addcslashes($s, '%_\\').'%';
                $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like));
            })
            ->orderBy('name');

        return Paginated::response($q->paginate((int) ($data['per_page'] ?? 50)), AdminUserResource::class, $request);
    }

    public function show(User $user): AdminUserResource
    {
        $this->authorize('update', $user);

        return new AdminUserResource($user->load(['agency', 'entity']));
    }

    public function store(AdminUserRequest $request): JsonResponse
    {
        $this->authorize('create', User::class);
        $data = $request->validated();
        $data['email'] = mb_strtolower($data['email']);
        $user = User::query()->create(array_intersect_key($data, array_flip((new User)->getFillable())));
        $this->audit->log('admin.users.create', $user, null, $user->only(['name', 'email', 'role', 'agency_id', 'entity_id', 'is_active']));

        return (new AdminUserResource($user->load(['agency', 'entity'])))->response()->setStatusCode(201);
    }

    public function update(AdminUserRequest $request, User $user): AdminUserResource
    {
        $this->authorize('update', $user);
        $data = $request->validated();
        $before = $user->only(['name', 'email', 'role', 'agency_id', 'entity_id', 'is_active', 'mfa_enabled']);
        if ($request->user()->id === $user->id && (isset($data['role']) || (isset($data['is_active']) && ! $data['is_active']))) {
            return response()->json(['message' => 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.'], 422);
        }
        if (isset($data['email'])) {
            $data['email'] = mb_strtolower($data['email']);
        }
        $user->fill(array_intersect_key($data, array_flip($user->getFillable())));
        if (! empty($data['unlock'])) {
            $user->forceFill(['failed_logins' => 0, 'locked_until' => null]);
        }
        if (! empty($data['reset_mfa'])) {
            $user->forceFill(['mfa_enabled' => false, 'mfa_secret' => null]);
        }
        $revokeSessions = $user->isDirty(['password', 'role', 'is_active', 'email']) || ! empty($data['reset_mfa']);
        $user->save();
        if ($revokeSessions) {
            // Mot de passe, rôle, e-mail, désactivation ou MFA modifiés : les sessions ouvertes sont révoquées.
            SessionPurger::forUser($user, $request->user()->id === $user->id && $request->hasSession() ? $request->session()->getId() : null);
        }
        $this->audit->log('admin.users.update', $user, $before, $user->only(['name', 'email', 'role', 'agency_id', 'entity_id', 'is_active', 'mfa_enabled']));

        return new AdminUserResource($user->load(['agency', 'entity']));
    }
}
