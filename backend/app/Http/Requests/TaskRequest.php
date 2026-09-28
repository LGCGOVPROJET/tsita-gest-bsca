<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\TaskStatus;
use Illuminate\Validation\Rule;

class TaskRequest extends ApiRequest
{
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'min:3', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            // Assigné : collaborateur actif métier (ni client, ni administrateur — séparation des responsabilités).
            'assignee_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('is_active', true)->whereNotIn('role', ['client', 'admin'])],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(TaskStatus::values())],
        ];
    }
}
