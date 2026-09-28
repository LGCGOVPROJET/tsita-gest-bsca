<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\ResponseTemplate;
use Illuminate\Database\Seeder;

class TemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            ['ACCUSE', 'accuse', 'Accusé de réception', 'Accusé de réception — réclamation {{reference}}',
                "Madame, Monsieur {{client}},\n\nNous accusons réception de votre réclamation enregistrée sous la référence {{reference}}. Elle est en cours d'examen par nos services.\nUne réponse vous sera apportée au plus tard le {{date_limite}}.\n\nBSCA Bank — Service réclamations"],
            ['ATTENTE', 'attente', 'Réponse d\'attente', 'Suivi de votre réclamation {{reference}}',
                "Madame, Monsieur {{client}},\n\nL'instruction de votre réclamation {{reference}} nécessite des vérifications complémentaires. Nous revenons vers vous dans les meilleurs délais.\n\nBSCA Bank — Service réclamations"],
            ['REPONSE', 'reponse', 'Réponse finale', 'Réponse à votre réclamation {{reference}}',
                "Madame, Monsieur {{client}},\n\nÀ l'issue de l'examen de votre réclamation {{reference}}, nous vous informons de la décision suivante : [décision motivée].\n\nSi cette réponse ne vous satisfait pas, vous pouvez demander une réouverture depuis votre espace de suivi.\n\nBSCA Bank — Service réclamations"],
            ['CLOTURE', 'cloture', 'Clôture du dossier', 'Clôture de votre réclamation {{reference}}',
                "Madame, Monsieur {{client}},\n\nVotre réclamation {{reference}} est désormais clôturée. Nous vous remercions de votre confiance.\n\nBSCA Bank — Service réclamations"],
        ];
        foreach ($templates as [$code, $kind, $label, $subject, $body]) {
            ResponseTemplate::query()->create(compact('code', 'kind', 'label', 'subject', 'body') + ['version' => 1, 'is_active' => true]);
        }
    }
}
