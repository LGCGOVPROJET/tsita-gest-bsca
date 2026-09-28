<?php

declare(strict_types=1);

namespace App\Enums;

enum QualityActionStatus: string
{
    use HasLabels;

    case Planifiee = 'planifiee';
    case EnCours = 'en_cours';
    case Realisee = 'realisee';
    case Verifiee = 'verifiee';

    public function label(): string
    {
        return match ($this) {
            self::Planifiee => 'Planifiée',
            self::EnCours => 'En cours',
            self::Realisee => 'Réalisée',
            self::Verifiee => 'Vérifiée',
        };
    }
}
