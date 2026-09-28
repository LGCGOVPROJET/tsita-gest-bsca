<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\AttachmentClassification;
use App\Enums\Visibility;
use Illuminate\Validation\Rule;

class AttachmentRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png'],
            'classification' => ['required', Rule::in(AttachmentClassification::values())],
            // Seule une pièce classée « client » peut être rendue visible au client.
            'visibility' => ['required', Rule::in(Visibility::values()), Rule::when(
                fn () => $this->input('classification') !== AttachmentClassification::Client->value,
                [Rule::in([Visibility::Internal->value])],
            )],
        ];
    }

    public function messages(): array
    {
        return ['visibility.in' => 'Une pièce interne ou confidentielle ne peut pas être visible du client.'];
    }
}
