<?php

declare(strict_types=1);

namespace App\Enums;

enum SolutionType: string
{
    use HasLabels;

    case Remboursement = 'remboursement';
    case CorrectionOperation = 'correction_operation';
    case ExplicationMotivee = 'explication_motivee';
    case AutreMesure = 'autre_mesure';
    case NonFondement = 'non_fondement';

    public function label(): string
    {
        return match ($this) {
            self::Remboursement => 'Remboursement',
            self::CorrectionOperation => 'Correction d\'opération',
            self::ExplicationMotivee => 'Explication motivée',
            self::AutreMesure => 'Autre mesure',
            self::NonFondement => 'Décision de non-fondement',
        };
    }
}
