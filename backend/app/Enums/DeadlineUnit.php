<?php

declare(strict_types=1);

namespace App\Enums;

enum DeadlineUnit: string
{
    use HasLabels;

    case Calendar = 'calendar';
    case Business = 'business';

    public function label(): string
    {
        return match ($this) {
            self::Calendar => 'Jours calendaires',
            self::Business => 'Jours ouvrés',
        };
    }
}
