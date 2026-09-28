<?php

declare(strict_types=1);

namespace App\Enums;

enum TemplateKind: string
{
    use HasLabels;

    case Accuse = 'accuse';
    case Attente = 'attente';
    case Reponse = 'reponse';
    case Cloture = 'cloture';

    public function label(): string
    {
        return match ($this) {
            self::Accuse => 'Accusé de réception',
            self::Attente => 'Réponse d\'attente',
            self::Reponse => 'Réponse',
            self::Cloture => 'Clôture',
        };
    }
}
