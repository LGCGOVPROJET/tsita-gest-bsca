<?php

declare(strict_types=1);

namespace App\Http\Requests;

class ReopenRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['reason' => ['required', 'string', 'min:10', 'max:2000']];
    }
}
