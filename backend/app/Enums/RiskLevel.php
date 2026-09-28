<?php

declare(strict_types=1);

namespace App\Enums;

enum RiskLevel: string
{
    use HasLabels;

    case Faible = 'faible';
    case Moyen = 'moyen';
    case Eleve = 'eleve';

    public function label(): string
    {
        return match ($this) {
            self::Faible => 'Faible',
            self::Moyen => 'Moyen',
            self::Eleve => 'Élevé',
        };
    }
}
