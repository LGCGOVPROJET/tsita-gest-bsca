<?php

declare(strict_types=1);

namespace App\Http\Requests;

class MfaConfirmRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['code' => ['required', 'string', 'regex:/^\d{6}$/']];
    }
}
