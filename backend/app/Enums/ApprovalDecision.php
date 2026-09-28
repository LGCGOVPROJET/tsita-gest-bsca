<?php

declare(strict_types=1);

namespace App\Enums;

enum ApprovalDecision: string
{
    use HasLabels;

    case Approuve = 'approuve';
    case Rejete = 'rejete';

    public function label(): string
    {
        return match ($this) {
            self::Approuve => 'Approuvé',
            self::Rejete => 'Rejeté',
        };
    }
}
