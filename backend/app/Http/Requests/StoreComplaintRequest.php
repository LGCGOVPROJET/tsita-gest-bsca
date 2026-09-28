<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Support\Dt;
use Illuminate\Validation\Rule;

/**
 * Saisie omnicanale par un agent.
 */
class StoreComplaintRequest extends ApiRequest
{
    protected function prepareForValidation(): void
    {
        // Alias rétrocompatible : « email » → code canal « courriel ».
        if ($this->input('preferred_channel') === 'email') {
            $this->merge(['preferred_channel' => 'courriel']);
        }
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'full_name' => ['required_without:customer_id', 'nullable', 'string', 'min:2', 'max:150'],
            'email' => ['nullable', 'string', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40', 'regex:/^[0-9+().\s-]{6,40}$/'],
            'customer_number' => ['nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9-]+$/'],
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')->where('is_active', true)],
            'agency_id' => ['nullable', 'integer', Rule::exists('agencies', 'id')->where('is_active', true)],
            'receiving_agency_id' => ['nullable', 'integer', Rule::exists('agencies', 'id')->where('is_active', true)],
            'channel' => ['required', 'string', Rule::exists('channels', 'code')->where('is_active', true)],
            'received_at' => ['nullable', 'date', 'before_or_equal:now'],
            'subject' => ['required', 'string', 'min:3', 'max:190'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            // « Aujourd'hui » au fuseau métier (Africa/Brazzaville), pas en UTC.
            'operation_date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:'.Dt::today()->toDateString()],
            'amount' => ['nullable', 'numeric', 'min:0', 'max:'.self::MAX_AMOUNT, 'decimal:0,2'],
            'currency' => ['nullable', 'required_with:amount', Rule::in(self::CURRENCIES)],
            'preferred_channel' => ['nullable', Rule::in(self::REPLY_CHANNELS)],
            'consent' => ['nullable', 'boolean'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:10240', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png'],
        ];
    }
}
