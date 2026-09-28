<?php

declare(strict_types=1);

namespace App\Enums;

enum MessageKind: string
{
    use HasLabels;

    case ClientMessage = 'client_message';
    case InternalNote = 'internal_note';

    public function label(): string
    {
        return match ($this) {
            self::ClientMessage => 'Message client',
            self::InternalNote => 'Note interne',
        };
    }
}
