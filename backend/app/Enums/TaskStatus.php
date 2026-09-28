<?php

declare(strict_types=1);

namespace App\Enums;

enum TaskStatus: string
{
    use HasLabels;

    case AFaire = 'a_faire';
    case EnCours = 'en_cours';
    case Terminee = 'terminee';

    public function label(): string
    {
        return match ($this) {
            self::AFaire => 'À faire',
            self::EnCours => 'En cours',
            self::Terminee => 'Terminée',
        };
    }
}
