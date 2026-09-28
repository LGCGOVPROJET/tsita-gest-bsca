<?php

declare(strict_types=1);

namespace App\Enums;

enum MessageDirection: string
{
    use HasLabels;

    case Entrant = 'entrant';
    case Sortant = 'sortant';

    public function label(): string
    {
        return match ($this) {
            self::Entrant => 'Entrant',
            self::Sortant => 'Sortant',
        };
    }
}
