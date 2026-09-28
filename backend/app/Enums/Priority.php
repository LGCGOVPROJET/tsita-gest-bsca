<?php

declare(strict_types=1);

namespace App\Enums;

enum Priority: string
{
    use HasLabels;

    case Basse = 'basse';
    case Normale = 'normale';
    case Haute = 'haute';
    case Critique = 'critique';

    public function label(): string
    {
        return match ($this) {
            self::Basse => 'Basse',
            self::Normale => 'Normale',
            self::Haute => 'Haute',
            self::Critique => 'Critique',
        };
    }
}
