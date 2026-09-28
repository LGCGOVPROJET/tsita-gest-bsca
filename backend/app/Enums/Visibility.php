<?php

declare(strict_types=1);

namespace App\Enums;

enum Visibility: string
{
    use HasLabels;

    case Internal = 'internal';
    case Client = 'client';

    public function label(): string
    {
        return match ($this) {
            self::Internal => 'Interne',
            self::Client => 'Client',
        };
    }
}
