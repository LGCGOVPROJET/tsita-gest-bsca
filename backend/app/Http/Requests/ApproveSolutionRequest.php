<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ApprovalDecision;
use Illuminate\Validation\Rule;

class ApproveSolutionRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'decision' => ['required', Rule::in(ApprovalDecision::values())],
            'comment' => ['nullable', 'required_if:decision,rejete', 'string', 'max:2000'],
        ];
    }
}
