<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\MessageKind;
use Illuminate\Validation\Rule;

class MessageRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(MessageKind::values())],
            'body' => ['required', 'string', 'min:1', 'max:5000'],
            'channel' => ['nullable', 'string', Rule::exists('channels', 'code')->where('is_active', true)],
        ];
    }
}
