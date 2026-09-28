<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\Dt;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Génère les références TG-BSCA-AAAA-NNNNNN (non signifiantes, sans information client).
 * La séquence annuelle est protégée par un verrou de ligne (SELECT … FOR UPDATE) dans une transaction.
 */
final class ReferenceGenerator
{
    public const PATTERN = '/^TG-BSCA-\d{4}-\d{6}$/';

    public function next(?CarbonInterface $receivedAt = null): string
    {
        $year = (int) Dt::parseLocal($receivedAt ?? Dt::now())->format('Y');

        return DB::transaction(function () use ($year): string {
            DB::table('reference_sequences')->insertOrIgnore([
                'year' => $year, 'last_number' => 0, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $row = DB::table('reference_sequences')->where('year', $year)->lockForUpdate()->first();
            $number = ((int) $row->last_number) + 1;
            DB::table('reference_sequences')->where('year', $year)->update(['last_number' => $number, 'updated_at' => now()]);

            return self::format($year, $number);
        }, 3);
    }

    public static function format(int $year, int $number): string
    {
        return sprintf('TG-BSCA-%04d-%06d', $year, $number);
    }

    /** Positionne la séquence au moins à $number (utilisé par les jeux de données et imports). */
    public function ensureAtLeast(int $year, int $number): void
    {
        DB::transaction(function () use ($year, $number): void {
            DB::table('reference_sequences')->insertOrIgnore([
                'year' => $year, 'last_number' => 0, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $row = DB::table('reference_sequences')->where('year', $year)->lockForUpdate()->first();
            if ((int) $row->last_number < $number) {
                DB::table('reference_sequences')->where('year', $year)->update(['last_number' => $number, 'updated_at' => now()]);
            }
        });
    }
}
