<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TemplateKind;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;

class ResponseTemplate extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['code', 'kind', 'label', 'subject', 'body', 'version', 'is_active'];

    protected function casts(): array
    {
        return ['kind' => TemplateKind::class, 'is_active' => 'boolean', 'version' => 'integer'];
    }

    /**
     * Remplace les variables {{reference}}, {{client}}, {{date_limite}} (texte brut, pas de HTML).
     *
     * @param  array<string, string>  $vars
     */
    public function render(string $text, array $vars): string
    {
        return (string) preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/', static fn (array $m): string => $vars[$m[1]] ?? $m[0], $text);
    }
}
