<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class SendResponseRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:10', 'max:10000'],
            'template_id' => ['nullable', 'integer', Rule::exists('response_templates', 'id')->where('is_active', true)],
            'channel' => ['required', 'string', Rule::exists('channels', 'code')->where('is_active', true)],
        ];
    }
}
