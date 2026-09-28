<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:190'],
            'password' => ['required', 'string', 'max:255', 'confirmed', Password::defaults()],
        ];
    }
}
