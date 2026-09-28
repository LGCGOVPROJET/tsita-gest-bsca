<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Fournit des utilitaires communs aux énumérations libellées (FR).
 */
trait HasLabels
{
    abstract public function label(): string;

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(static fn (self $c): array => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }

    public static function labelFor(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return self::tryFrom($value)?->label();
    }
}
