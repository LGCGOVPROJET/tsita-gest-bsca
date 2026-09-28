<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Complaint;
use App\Models\ProcessingEntity;
use App\Models\QualityAction;
use App\Models\User;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * Plan d'actions qualité fictif (6+ actions) relié à des réclamations de même nature.
 */
class QualityActionSeeder extends Seeder
{
    public function run(): void
    {
        $anchor = CarbonImmutable::parse('2026-09-28 10:00:00', Dt::tz())->setTimezone('UTC');
        $now = Dt::now()->lessThan($anchor) ? Dt::now() : $anchor;
        $cat = Category::query()->pluck('id', 'code');
        $ent = ProcessingEntity::query()->pluck('id', 'code');
        $qualite = User::query()->where('email', 'qualite@bsca.demo')->value('id');
        $resp = User::query()->where('email', 'responsable@bsca.demo')->value('id');
        $rComptes = User::query()->where('email', 'r.comptes@bsca.demo')->value('id');
        $rDigital = User::query()->where('email', 'r.digital@bsca.demo')->value('id');
        $rVir = User::query()->where('email', 'r.virements@bsca.demo')->value('id');

        $actions = [
            ['Clarifier le formulaire et la liste des pièces à fournir', 'Documents incomplets à la réception', 'COMPTE', $qualite, 'COMPTES', 20, 'planifiee', null, null],
            ['Revoir les étapes d\'investigation des transactions contestées', 'Transactions carte contestées récurrentes', 'CARTES', $resp, 'CARTES', 10, 'en_cours', 'Délai moyen d\'investigation des contestations carte', null],
            ['Contrôle quotidien des retraits GAB non servis', 'Incidents distributeurs non régularisés automatiquement', 'GAB', $resp, 'CARTES', -15, 'realisee', 'Nombre de réclamations GAB par mois', 'Procédure de rapprochement quotidienne diffusée aux agences'],
            ['Informer les clients avant tout prélèvement de commission', 'Commissions prélevées sans information préalable', 'FRAIS', $rComptes, 'COMPTES', 35, 'en_cours', 'Part des réclamations « frais » fondées', null],
            ['Fiabiliser l\'envoi des codes de validation mobile', 'Codes de validation non reçus', 'DIGITAL', $rDigital, 'DIGITAL', -40, 'verifiee', 'Taux de réclamations « code non reçu » avant / après', 'Changement de prestataire SMS ; baisse constatée sur 2 mois'],
            ['Suivi des virements en attente chez les correspondants', 'Retards d\'exécution des transferts internationaux', 'VIREMENTS', $rVir, 'VIREMENTS', 25, 'planifiee', 'Délai moyen de traitement des virements contestés', null],
            ['Sensibiliser les guichets à l\'information client', 'Informations erronées données en agence', 'ACCUEIL', $qualite, 'COMPTES', 45, 'planifiee', null, null],
        ];
        foreach ($actions as [$title, $cause, $catCode, $owner, $entCode, $dueDays, $status, $measure, $evidence]) {
            $action = QualityAction::query()->create([
                'title' => $title,
                'root_cause' => $cause,
                'category_id' => $cat[$catCode],
                'owner_id' => $owner,
                'owner_entity_id' => $ent[$entCode],
                'due_at' => $now->addDays($dueDays),
                'status' => $status,
                'effectiveness_measure' => $measure,
                'evidence' => $evidence,
            ]);
            if (in_array($status, ['realisee', 'verifiee'], true)) {
                $action->forceFill(['completed_at' => $now->addDays($dueDays - 5)])->save();
            }
            $ids = Complaint::query()->where('category_id', $cat[$catCode])->orderByDesc('received_at')->limit(6)->pluck('id');
            $action->complaints()->sync($ids);
        }
    }
}
