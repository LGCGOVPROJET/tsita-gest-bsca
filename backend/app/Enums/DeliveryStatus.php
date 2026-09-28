<?php

declare(strict_types=1);

namespace App\Enums;

enum DeliveryStatus: string
{
    use HasLabels;

    case EnAttente = 'en_attente';
    case Envoye = 'envoye';
    case Echec = 'echec';

    public function label(): string
    {
        return match ($this) {
            self::EnAttente => 'En attente',
            self::Envoye => 'Envoyé',
            self::Echec => 'Échec d\'envoi',
        };
    }
}
