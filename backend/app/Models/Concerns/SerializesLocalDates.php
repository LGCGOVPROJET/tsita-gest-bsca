<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Support\Dt;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * Sérialisation JSON des dates en ISO 8601 avec décalage local (+01:00), conformément au contrat.
 */
trait SerializesLocalDates
{
    protected function serializeDate(DateTimeInterface $date): string
    {
        return (string) Dt::iso(CarbonImmutable::instance($date));
    }
}
