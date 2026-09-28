<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\TemplateKind;
use Illuminate\Validation\Rule;

/**
 * Validation des référentiels administrables (agences, entités, catégories, produits, modèles, jours fériés).
 */
class AdminReferentialRequest extends ApiRequest
{
    public function rules(): array
    {
        $type = (string) $this->route('type');
        $id = $this->route('id');
        $r = $this->isMethod('post') ? 'required' : 'sometimes';
        $code = fn (string $table) => [$r, 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique($table, 'code')->ignore($id)];

        return match ($type) {
            'agencies' => [
                'code' => $code('agencies'), 'name' => [$r, 'string', 'max:150'], 'city' => [$r, 'string', 'max:100'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'entities' => [
                'code' => $code('processing_entities'), 'name' => [$r, 'string', 'max:150'], 'is_active' => ['sometimes', 'boolean'],
            ],
            'categories' => [
                'code' => $code('categories'), 'label' => [$r, 'string', 'max:150'],
                'description' => ['sometimes', 'nullable', 'string', 'max:2000'], 'is_active' => ['sometimes', 'boolean'],
            ],
            'products' => [
                'code' => $code('products'), 'label' => [$r, 'string', 'max:150'], 'is_active' => ['sometimes', 'boolean'],
            ],
            'templates' => [
                'code' => [$r, 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
                'kind' => [$r, Rule::in(TemplateKind::values())], 'label' => [$r, 'string', 'max:150'],
                'subject' => [$r, 'string', 'max:190'], 'body' => [$r, 'string', 'max:10000'], 'is_active' => ['sometimes', 'boolean'],
            ],
            'holidays' => [
                'date' => [$r, 'date_format:Y-m-d'], 'label' => [$r, 'string', 'max:150'],
                'calendar_version' => [$r, 'string', 'max:30', 'regex:/^[A-Za-z0-9_.-]+$/'],
            ],
            default => [],
        };
    }
}
