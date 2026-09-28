<?php

declare(strict_types=1);

namespace App\Enums;

enum ControlResult: string
{
    use HasLabels;

    case Conforme = 'conforme';
    case NonConforme = 'non_conforme';
    case ARevoir = 'a_revoir';

    public function label(): string
    {
        return match ($this) {
            self::Conforme => 'Conforme',
            self::NonConforme => 'Non conforme',
            self::ARevoir => 'À revoir',
        };
    }
}
