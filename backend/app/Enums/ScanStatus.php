<?php

declare(strict_types=1);

namespace App\Enums;

enum ScanStatus: string
{
    use HasLabels;

    case EnAttente = 'en_attente';
    case Sain = 'sain';
    case Rejete = 'rejete';

    public function label(): string
    {
        return match ($this) {
            self::EnAttente => 'En attente',
            self::Sain => 'Sain',
            self::Rejete => 'Rejeté',
        };
    }
}
