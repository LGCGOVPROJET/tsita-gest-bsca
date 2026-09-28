<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use App\Support\MfaEnforcement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'agency' => $this->agency ? ['id' => $this->agency->id, 'name' => $this->agency->name] : null,
            'entity' => $this->entity ? ['id' => $this->entity->id, 'name' => $this->entity->name] : null,
            'mfa_enabled' => (bool) $this->mfa_enabled,
            // Politique MFA (config/security.php) : si true, seules /auth/me, /auth/mfa/*, /auth/logout répondent.
            'mfa_required' => MfaEnforcement::requiredFor($this->resource),
            'mfa_enrollment_required' => MfaEnforcement::enrollmentRequired($this->resource),
            'permissions' => $this->permissions(),
        ];
    }
}
