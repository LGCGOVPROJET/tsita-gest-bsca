<?php

declare(strict_types=1);

namespace App\Http\Requests;

/**
 * Accès au suivi public : référence + code de suivi.
 */
class TrackRequest extends ApiRequest
{
    public function rules(): array
    {
        $rules = [
            'reference' => ['required', 'string', 'max:25', 'regex:/^TG-BSCA-\d{4}-\d{6}$/i'],
            'tracking_code' => ['required', 'string', 'min:8', 'max:12'],
        ];

        return match (true) {
            $this->is('api/v1/public/track/messages') => $rules + ['body' => ['required', 'string', 'min:1', 'max:5000']],
            $this->is('api/v1/public/track/attachments') => $rules + ['file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png']],
            $this->is('api/v1/public/track/reopen') => $rules + ['reason' => ['required', 'string', 'min:10', 'max:2000']],
            default => $rules,
        };
    }
}
