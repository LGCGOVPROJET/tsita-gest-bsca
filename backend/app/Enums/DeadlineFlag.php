<?php

declare(strict_types=1);

namespace App\Enums;

enum DeadlineFlag: string
{
    use HasLabels;

    case Ok = 'ok';
    case ARisque = 'a_risque';
    case EnRetard = 'en_retard';
    case ClosEnRetard = 'clos_en_retard';
    case SansRegle = 'sans_regle';

    public function label(): string
    {
        return match ($this) {
            self::Ok => 'Dans les délais',
            self::ARisque => 'À risque',
            self::EnRetard => 'En retard',
            self::ClosEnRetard => 'Clos en retard',
            self::SansRegle => 'Règle à valider',
        };
    }
}
