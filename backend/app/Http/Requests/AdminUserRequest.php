<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\Role;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class AdminUserRequest extends ApiRequest
{
    public function rules(): array
    {
        $creating = $this->isMethod('post');
        $id = $this->route('user')?->id;

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'min:2', 'max:150'],
            'email' => [$creating ? 'required' : 'sometimes', 'string', 'email', 'max:190', Rule::unique('users', 'email')->ignore($id)],
            'password' => [$creating ? 'required' : 'sometimes', 'string', 'max:255', Password::defaults()],
            'role' => [$creating ? 'required' : 'sometimes', Rule::in(Role::values())],
            'agency_id' => ['sometimes', 'nullable', 'integer', 'exists:agencies,id'],
            'entity_id' => ['sometimes', 'nullable', 'integer', 'exists:processing_entities,id'],
            'customer_id' => ['sometimes', 'nullable', 'integer', 'exists:customers,id'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'is_active' => ['sometimes', 'boolean'],
            'unlock' => ['sometimes', 'boolean'],
            'reset_mfa' => ['sometimes', 'boolean'],
        ];
    }
}
