<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Holiday;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * Jours fériés de la République du Congo 2025–2027 (version de calendrier CG-2025-2027).
 * Pâques calculée par l'algorithme grégorien anonyme (Meeus/Jones/Butcher).
 */
class HolidaySeeder extends Seeder
{
    public const VERSION = 'CG-2025-2027';

    public static function easter(int $year): CarbonImmutable
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return CarbonImmutable::create($year, $month, $day)->startOfDay();
    }

    /** @return list<array{0: string, 1: string}> */
    public static function forYear(int $year): array
    {
        $easter = self::easter($year);

        return [
            [sprintf('%d-01-01', $year), 'Jour de l\'An'],
            [$easter->addDay()->format('Y-m-d'), 'Lundi de Pâques'],
            [sprintf('%d-05-01', $year), 'Fête du Travail'],
            [$easter->addDays(39)->format('Y-m-d'), 'Ascension'],
            [$easter->addDays(50)->format('Y-m-d'), 'Lundi de Pentecôte'],
            [sprintf('%d-06-10', $year), 'Fête de la Réconciliation'],
            [sprintf('%d-08-15', $year), 'Fête de l\'Indépendance'],
            [sprintf('%d-11-01', $year), 'Toussaint'],
            [sprintf('%d-11-28', $year), 'Proclamation de la République'],
            [sprintf('%d-12-25', $year), 'Noël'],
        ];
    }

    public function run(): void
    {
        foreach ([2025, 2026, 2027] as $year) {
            foreach (self::forYear($year) as [$date, $label]) {
                Holiday::query()->create(['date' => $date, 'label' => $label, 'calendar_version' => self::VERSION, 'country' => 'CG']);
            }
        }
    }
}
