<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ComplaintStatus;
use Illuminate\Validation\Rule;

class ReportValidationRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'as_of' => ['nullable', 'date_format:Y-m-d'],
            'filters' => ['nullable', 'array'],
            'filters.agency_id' => ['nullable', 'integer', 'min:1'],
            'filters.entity_id' => ['nullable', 'integer', 'min:1'],
            'filters.category_id' => ['nullable', 'integer', 'min:1'],
            'filters.product_id' => ['nullable', 'integer', 'min:1'],
            'filters.channel' => ['nullable', 'string', 'exists:channels,code'],
            'filters.status' => ['nullable', Rule::in(ComplaintStatus::values())],
            'comment' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
