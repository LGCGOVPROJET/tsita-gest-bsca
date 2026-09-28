<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\Priority;
use App\Enums\RiskLevel;
use Illuminate\Validation\Rule;

class QualifyComplaintRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('categories', 'id')->where('is_active', true)],
            'product_id' => ['sometimes', 'nullable', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'processing_entity_id' => ['sometimes', 'nullable', 'integer', Rule::exists('processing_entities', 'id')->where('is_active', true)],
            'priority' => ['sometimes', Rule::in(Priority::values())],
            'risk_level' => ['sometimes', Rule::in(RiskLevel::values())],
            'amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:'.self::MAX_AMOUNT, 'decimal:0,2'],
            'currency' => ['sometimes', 'nullable', 'required_with:amount', Rule::in(self::CURRENCIES)],
            'subject' => ['sometimes', 'string', 'min:3', 'max:190'],
            'reason' => ['required', 'string', 'min:3', 'max:2000'],
        ];
    }
}
