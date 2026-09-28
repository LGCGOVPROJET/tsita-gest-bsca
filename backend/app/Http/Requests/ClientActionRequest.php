<?php

declare(strict_types=1);

namespace App\Http\Requests;

/**
 * Actions du client connecté sur ses propres dossiers (mêmes règles que /public/track/*).
 */
class ClientActionRequest extends ApiRequest
{
    public function rules(): array
    {
        return match (true) {
            $this->is('api/v1/client/complaints/*/messages') => ['body' => ['required', 'string', 'min:1', 'max:5000']],
            $this->is('api/v1/client/complaints/*/attachments') => ['file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png']],
            $this->is('api/v1/client/complaints/*/reopen') => ['reason' => ['required', 'string', 'min:10', 'max:2000']],
            default => [],
        };
    }
}
