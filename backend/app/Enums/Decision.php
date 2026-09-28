<?php

declare(strict_types=1);

namespace App\Enums;

enum Decision: string
{
    use HasLabels;

    case Fondee = 'fondee';
    case PartiellementFondee = 'partiellement_fondee';
    case NonFondee = 'non_fondee';
    case IrrecevableMotivee = 'irrecevable_motivee';

    public function label(): string
    {
        return match ($this) {
            self::Fondee => 'Fondée',
            self::PartiellementFondee => 'Partiellement fondée',
            self::NonFondee => 'Non fondée',
            self::IrrecevableMotivee => 'Irrecevable motivée',
        };
    }
}
