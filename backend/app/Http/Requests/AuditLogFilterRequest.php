<?php

declare(strict_types=1);

namespace App\Http\Requests;

class AuditLogFilterRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'user_id' => ['nullable', 'integer', 'min:1'],
            'action' => ['nullable', 'string', 'max:100'],
            'auditable_type' => ['nullable', 'string', 'max:150'],
            'auditable_id' => ['nullable', 'integer', 'min:1'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }
}
