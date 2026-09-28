<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Montants : absent = null (jamais 0), toujours accompagné d'une devise.
 */
final class Money
{
    public static function format(mixed $amount): ?string
    {
        if ($amount === null || $amount === '') {
            return null;
        }

        if (is_string($amount) && preg_match('/^-?\d+\.\d{2}$/', $amount) === 1) {
            return $amount; // Valeur DECIMAL déjà normalisée : pas de passage par un flottant.
        }

        return number_format((float) $amount, 2, '.', '');
    }
}
