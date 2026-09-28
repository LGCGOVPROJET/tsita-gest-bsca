<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Jeu de démonstration TSITA GEST × BSCA Bank — données 100 % fictives.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            ReferentialSeeder::class,
            UserSeeder::class,
            HolidaySeeder::class,
            DeadlineRuleSeeder::class,
            TemplateSeeder::class,
            ComplaintSeeder::class,
            QualityActionSeeder::class,
            ImportSeeder::class,
        ]);
    }
}
