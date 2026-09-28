<?php

declare(strict_types=1);

namespace App\Enums;

enum AnomalyResolution: string
{
    use HasLabels;

    case ATraiter = 'a_traiter';
    case Resolu = 'resolu';
    case Ignore = 'ignore';

    public function label(): string
    {
        return match ($this) {
            self::ATraiter => 'À traiter',
            self::Resolu => 'Résolu',
            self::Ignore => 'Ignoré',
        };
    }
}
