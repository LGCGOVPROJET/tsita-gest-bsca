<?php

declare(strict_types=1);

namespace App\Enums;

enum RuleStatus: string
{
    use HasLabels;

    case Brouillon = 'brouillon';
    case AValider = 'a_valider';
    case Valide = 'valide';
    case Retire = 'retire';

    public function label(): string
    {
        return match ($this) {
            self::Brouillon => 'Brouillon',
            self::AValider => 'À valider',
            self::Valide => 'Validée',
            self::Retire => 'Retirée',
        };
    }
}
