<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\Decision;
use App\Enums\SolutionType;
use Illuminate\Validation\Rule;

class SolutionRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(SolutionType::values())],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'root_cause' => ['nullable', 'string', 'max:2000'],
            'amount' => ['nullable', 'numeric', 'min:0', 'max:'.self::MAX_AMOUNT, 'decimal:0,2'],
            'currency' => ['nullable', 'required_with:amount', Rule::in(self::CURRENCIES)],
            'decision' => ['required', Rule::in(Decision::values())],
        ];
    }
}
