<?php

declare(strict_types=1);

namespace App\Enums;

enum RuleSourceType: string
{
    use HasLabels;

    case Juridique = 'juridique';
    case Interne = 'interne';
    case Demonstration = 'demonstration';

    public function label(): string
    {
        return match ($this) {
            self::Juridique => 'Juridique',
            self::Interne => 'Interne',
            self::Demonstration => 'Démonstration',
        };
    }
}
