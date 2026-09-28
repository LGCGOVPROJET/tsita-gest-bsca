<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class AssignRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'owner_id' => ['required', 'integer', 'exists:users,id'],
            'deputy_id' => ['nullable', 'integer', 'exists:users,id', 'different:owner_id'],
            'processing_entity_id' => ['nullable', 'integer', Rule::exists('processing_entities', 'id')->where('is_active', true)],
            'reason' => ['required', 'string', 'min:3', 'max:2000'],
        ];
    }
}
