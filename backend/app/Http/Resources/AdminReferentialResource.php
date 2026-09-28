<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;

/**
 * Référentiels d'administration : liste blanche de champs par type (jamais le modèle brut).
 * Une colonne ajoutée plus tard n'est donc jamais exposée sans décision explicite.
 *
 * @property Model $resource
 */
class AdminReferentialResource extends JsonResource
{
    /** @var array<string, list<string>> */
    public const FIELDS = [
        'agencies' => ['id', 'code', 'name', 'city', 'is_active', 'created_at', 'updated_at'],
        'entities' => ['id', 'code', 'name', 'is_active', 'created_at', 'updated_at'],
        'categories' => ['id', 'code', 'label', 'description', 'is_active', 'version', 'created_at', 'updated_at'],
        'products' => ['id', 'code', 'label', 'is_active', 'created_at', 'updated_at'],
        'templates' => ['id', 'code', 'kind', 'label', 'subject', 'body', 'version', 'is_active', 'created_at', 'updated_at'],
        'holidays' => ['id', 'date', 'label', 'calendar_version', 'country', 'created_at', 'updated_at'],
    ];

    public function __construct(Model $resource, private readonly string $type)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        // toArray() du modèle applique les casts et le format de date local (+01:00).
        return Arr::only($this->resource->toArray(), self::FIELDS[$this->type] ?? ['id']);
    }
}
