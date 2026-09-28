<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Utilitaires de dates : stockage UTC, affichage/calcul en Africa/Brazzaville.
 */
final class Dt
{
    public static function tz(): string
    {
        return (string) config('app.business_timezone', 'Africa/Brazzaville');
    }

    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::now('UTC');
    }

    public static function today(): CarbonImmutable
    {
        return CarbonImmutable::now(self::tz())->startOfDay();
    }

    /** ISO 8601 avec décalage local (+01:00). */
    public static function iso(?CarbonInterface $date): ?string
    {
        return $date?->copy()->setTimezone(self::tz())->toIso8601String();
    }

    public static function localDate(?CarbonInterface $date): ?string
    {
        return $date?->copy()->setTimezone(self::tz())->format('Y-m-d');
    }

    /** Début de journée locale → instant UTC. */
    public static function startOfLocalDay(string|CarbonInterface $date): CarbonImmutable
    {
        return self::parseLocal($date)->startOfDay()->setTimezone('UTC');
    }

    /** Fin de journée locale (23:59:59) → instant UTC. */
    public static function endOfLocalDay(string|CarbonInterface $date): CarbonImmutable
    {
        return self::parseLocal($date)->endOfDay()->startOfSecond()->setTimezone('UTC');
    }

    public static function parseLocal(string|CarbonInterface $date): CarbonImmutable
    {
        if ($date instanceof CarbonInterface) {
            return CarbonImmutable::instance($date)->setTimezone(self::tz());
        }

        return CarbonImmutable::parse($date, self::tz());
    }

    public static function db(CarbonInterface $date): string
    {
        return $date->copy()->setTimezone('UTC')->format('Y-m-d H:i:s');
    }
}
