<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\DeadlineRule;
use Illuminate\Database\Seeder;

/**
 * Règles de délai de DÉMONSTRATION (source_type=demonstration, status=a_valider).
 * Elles ne constituent pas un engagement BSCA : la conformité doit confirmer les textes applicables.
 */
class DeadlineRuleSeeder extends Seeder
{
    public function run(): void
    {
        $common = [
            'start_point' => 'received_at',
            'source_type' => 'demonstration',
            'effective_from' => '2025-01-01',
            'version' => 1,
            'status' => 'a_valider',
        ];
        DeadlineRule::query()->create($common + [
            'code' => 'DEMO-AR', 'label' => 'Accusé de réception (démonstration)', 'kind' => 'accuse',
            'unit' => 'business', 'duration' => 10,
            'source_reference' => 'Valeur illustrative — à confirmer par la conformité BSCA',
            'notes' => 'Règle de démonstration — non validée par la conformité BSCA.',
        ]);
        DeadlineRule::query()->create($common + [
            'code' => 'DEMO-RF', 'label' => 'Réponse finale (démonstration)', 'kind' => 'reponse_finale',
            'unit' => 'calendar', 'duration' => 45,
            'source_reference' => 'Valeur illustrative — à confirmer par la conformité BSCA',
            'notes' => 'Règle de démonstration — non validée. Pas de report si l\'échéance tombe un jour chômé (à valider).',
        ]);
        DeadlineRule::query()->create($common + [
            'code' => 'DEMO-PA', 'label' => 'Pré-alerte interne avant échéance finale (démonstration)', 'kind' => 'prealerte',
            'unit' => 'business', 'duration' => 5,
            'source_reference' => 'Procédure interne à définir',
            'notes' => 'Calculée à rebours : 5 jours ouvrés avant l\'échéance de réponse finale.',
        ]);
        // Exemple de règle juridique en brouillon (non appliquée) pour illustrer le circuit de validation.
        DeadlineRule::query()->create([
            'code' => 'RF-REGL', 'label' => 'Réponse finale — régime réglementaire (à instruire)', 'kind' => 'reponse_finale',
            'unit' => 'calendar', 'duration' => 30, 'start_point' => 'received_at', 'source_type' => 'juridique',
            'source_reference' => 'Texte applicable à identifier avec la conformité (cadre COBAC)',
            'effective_from' => '2027-01-01', 'version' => 1, 'status' => 'brouillon',
            'notes' => 'Brouillon illustratif : durée non confirmée, non appliquée.',
        ]);
    }
}
