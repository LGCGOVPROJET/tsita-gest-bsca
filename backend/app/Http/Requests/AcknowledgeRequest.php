<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\DeliveryStatus;
use Illuminate\Validation\Rule;

class AcknowledgeRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'template_id' => ['nullable', 'integer', Rule::exists('response_templates', 'id')->where('kind', 'accuse')->where('is_active', true)],
            'channel' => ['required', 'string', Rule::exists('channels', 'code')->where('is_active', true)],
            'delivery_status' => ['required', Rule::in(DeliveryStatus::values())],
        ];
    }
}
