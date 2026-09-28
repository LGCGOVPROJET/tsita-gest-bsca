<?php

declare(strict_types=1);

namespace App\Enums;

enum DeadlineStatus: string
{
    use HasLabels;

    case EnCours = 'en_cours';
    case Respectee = 'respectee';
    case Depassee = 'depassee';
    case RespecteeEnRetard = 'respectee_en_retard';

    public function label(): string
    {
        return match ($this) {
            self::EnCours => 'En cours',
            self::Respectee => 'Respectée',
            self::Depassee => 'Dépassée',
            self::RespecteeEnRetard => 'Respectée en retard',
        };
    }
}
