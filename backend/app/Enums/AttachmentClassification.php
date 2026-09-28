<?php

declare(strict_types=1);

namespace App\Enums;

enum AttachmentClassification: string
{
    use HasLabels;

    case Client = 'client';
    case Interne = 'interne';
    case Confidentiel = 'confidentiel';

    public function label(): string
    {
        return match ($this) {
            self::Client => 'Client',
            self::Interne => 'Interne',
            self::Confidentiel => 'Confidentiel',
        };
    }
}
