<?php

declare(strict_types=1);

namespace App\Http\Requests;

class DuplicateRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'duplicate_of_id' => ['required', 'integer', 'exists:complaints,id'],
            'reason' => ['required', 'string', 'min:3', 'max:2000'],
        ];
    }
}
