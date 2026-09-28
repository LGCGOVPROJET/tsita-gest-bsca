<?php

declare(strict_types=1);

namespace App\Enums;

enum ImportStatus: string
{
    use HasLabels;

    case EnCours = 'en_cours';
    case Termine = 'termine';
    case TermineAvecAnomalies = 'termine_avec_anomalies';
    case Echec = 'echec';

    public function label(): string
    {
        return match ($this) {
            self::EnCours => 'En cours',
            self::Termine => 'Terminé',
            self::TermineAvecAnomalies => 'Terminé avec anomalies',
            self::Echec => 'Échec',
        };
    }
}
