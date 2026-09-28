<?php

declare(strict_types=1);

namespace App\Http\Requests;

class ImportRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:20480', 'mimes:csv,txt', 'mimetypes:text/csv,text/plain,application/csv,application/vnd.ms-excel'],
            'source_system' => ['required', 'string', 'max:50', 'regex:/^[A-Za-z0-9_-]+$/'],
        ];
    }
}
