<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use App\Services\LegacyImportService;
use Illuminate\Database\Seeder;

/**
 * Lot d'import historique d'exemple (fichier fictif) avec anomalies.
 * Le fichier storage/app/demo/registre-historique-exemple.csv est laissé NON importé pour tester l'import.
 */
class ImportSeeder extends Seeder
{
    public function run(LegacyImportService $service): void
    {
        $admin = User::query()->where('email', 'admin@bsca.demo')->firstOrFail();
        $path = storage_path('app/demo/registre-historique-lot-2025.csv');
        if (! is_file($path)) {
            $this->command?->warn('Fichier de lot historique absent : import d\'exemple ignoré.');

            return;
        }
        $result = $service->import($path, 'registre-historique-lot-2025.csv', 'REGISTRE_PAPIER', $admin);
        $b = $result['batch'];
        $this->command?->info("Lot d'import d'exemple : {$b->rows_created} créés, {$b->rows_skipped} ignorés, {$b->rows_anomalies} anomalies.");
    }
}
