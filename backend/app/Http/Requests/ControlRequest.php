<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ControlResult;
use Illuminate\Validation\Rule;

class ControlRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'result' => ['required', Rule::in(ControlResult::values())],
            'findings' => ['nullable', 'required_unless:result,conforme', 'string', 'max:5000'],
        ];
    }
}
