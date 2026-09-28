<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ComplaintStatus;
use Illuminate\Validation\Rule;

class TransitionRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'to_status' => ['required', Rule::in(ComplaintStatus::values())],
            'reason' => ['required', 'string', 'min:3', 'max:2000'],
        ];
    }
}
