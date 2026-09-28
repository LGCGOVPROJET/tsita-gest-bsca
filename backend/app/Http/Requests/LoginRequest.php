<?php

declare(strict_types=1);

namespace App\Http\Requests;

class LoginRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:190'],
            'password' => ['required', 'string', 'max:255'],
            'mfa_code' => ['nullable', 'string', 'regex:/^\d{6}$/'],
        ];
    }
}
