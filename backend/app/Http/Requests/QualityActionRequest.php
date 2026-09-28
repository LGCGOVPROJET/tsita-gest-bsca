<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\QualityActionStatus;
use Illuminate\Validation\Rule;

class QualityActionRequest extends ApiRequest
{
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'min:3', 'max:190'],
            'root_cause' => [$required, 'string', 'min:3', 'max:5000'],
            'category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
            'owner_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('is_active', true)->whereNotIn('role', ['client', 'admin'])],
            'owner_entity_id' => ['sometimes', 'nullable', 'integer', 'exists:processing_entities,id'],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(QualityActionStatus::values())],
            'effectiveness_measure' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'evidence' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'complaint_ids' => ['sometimes', 'array', 'max:200'],
            'complaint_ids.*' => ['integer', 'exists:complaints,id'],
        ];
    }
}
