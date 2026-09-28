<?php

declare(strict_types=1);

namespace App\Enums;

enum DeadlineKind: string
{
    use HasLabels;

    case Accuse = 'accuse';
    case ReponseFinale = 'reponse_finale';
    case Prealerte = 'prealerte';
    case Controle = 'controle';

    public function label(): string
    {
        return match ($this) {
            self::Accuse => 'Accusé de réception',
            self::ReponseFinale => 'Réponse finale',
            self::Prealerte => 'Pré-alerte interne',
            self::Controle => 'Contrôle',
        };
    }
}
