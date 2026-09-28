<?php

declare(strict_types=1);

namespace App\Enums;

enum SolutionStatus: string
{
    use HasLabels;

    case Brouillon = 'brouillon';
    case Soumise = 'soumise';
    case ApprouveeN1 = 'approuvee_n1';
    case Approuvee = 'approuvee';
    case Rejetee = 'rejetee';

    public function label(): string
    {
        return match ($this) {
            self::Brouillon => 'Brouillon',
            self::Soumise => 'Soumise',
            self::ApprouveeN1 => 'Approuvée N1',
            self::Approuvee => 'Approuvée',
            self::Rejetee => 'Rejetée',
        };
    }
}
