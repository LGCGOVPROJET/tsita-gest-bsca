<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\DeadlineKind;
use App\Enums\DeadlineUnit;
use App\Enums\RuleSourceType;
use App\Enums\RuleStatus;
use Illuminate\Validation\Rule;

class DeadlineRuleRequest extends ApiRequest
{
    public function rules(): array
    {
        $r = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'code' => [$r, 'string', 'max:40', 'regex:/^[A-Z0-9_-]+$/'],
            'label' => [$r, 'string', 'max:190'],
            'kind' => [$r, Rule::in(DeadlineKind::values())],
            'unit' => [$r, Rule::in(DeadlineUnit::values())],
            'duration' => [$r, 'integer', 'min:0', 'max:365'],
            'source_type' => [$r, Rule::in(RuleSourceType::values())],
            'source_reference' => [$r, 'string', 'max:255'],
            'effective_from' => [$r, 'date_format:Y-m-d'],
            'effective_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:effective_from'],
            // La validation (status=valide) passe exclusivement par POST /validate (conformité).
            'status' => ['sometimes', Rule::in([RuleStatus::Brouillon->value, RuleStatus::AValider->value, RuleStatus::Retire->value])],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}
