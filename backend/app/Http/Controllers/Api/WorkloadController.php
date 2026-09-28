<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\ComplaintStatus;
use App\Enums\QualityActionStatus;
use App\Enums\Role;
use App\Enums\RuleStatus;
use App\Enums\SolutionStatus;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\DeadlineRule;
use App\Models\QualityAction;
use App\Models\Solution;
use App\Models\Task;
use App\Models\User;
use App\Support\Dt;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * « Mon travail » : files de travail propres au profil connecté (compteurs + lien vers la liste filtrée).
 * Toujours calculé dans le périmètre de l'utilisateur (scope visibleTo), jamais au-delà.
 */
final class WorkloadController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_if($user->role === Role::Client, 403);
        $now = Dt::db(Dt::now());

        $items = match ($user->role) {
            Role::AgentAccueil => [
                $this->item('ack', 'Accusés à envoyer', $this->open($user)->where('complaints.acknowledgment_status', 'en_attente')->count(), '/app/reclamations?status=recu', 'warn', 'Dossiers reçus sans accusé de réception envoyé'),
                $this->item('qualify', 'À qualifier', $this->open($user)->whereIn('complaints.status', [ComplaintStatus::Recu->value, ComplaintStatus::AQualifier->value])->count(), '/app/reclamations?status=a_qualifier', 'blue', 'Dossiers de votre agence en attente de qualification'),
                $this->item('mine_month', 'Saisis ce mois-ci', Complaint::query()->where('created_by', $user->id)->where('received_at', '>=', Dt::db(Dt::today()->startOfMonth()->setTimezone('UTC')))->count(), '/app/reclamations?mine=1', 'green', 'Réclamations enregistrées par vous depuis le 1er du mois'),
            ],
            Role::Gestionnaire => [
                $this->item('mine', 'Mes dossiers ouverts', $this->open($user)->where('complaints.owner_id', $user->id)->count(), '/app/reclamations?mine=1', 'blue', 'Dossiers dont vous êtes propriétaire'),
                $this->item('mine_late', 'Mes dossiers en retard', $this->open($user)->where('complaints.owner_id', $user->id)->whereDeadlineFlag('en_retard', $now)->count(), '/app/reclamations?mine=1&deadline_flag=en_retard', 'danger', 'Échéance de réponse dépassée'),
                $this->item('tasks', 'Tâches à faire', $this->tasks($user)->count(), '/app/reclamations?mine=1', 'warn', 'Tâches qui vous sont assignées et non terminées'),
                $this->item('tasks_late', 'Tâches en retard', $this->tasks($user)->where('due_at', '<', $now)->count(), '/app/reclamations?mine=1', 'danger', 'Tâches dont l’échéance est passée'),
            ],
            Role::Responsable => [
                $this->item('unrouted', 'À orienter', $this->open($user)->whereNull('complaints.processing_entity_id')->count(), '/app/reclamations?status=a_qualifier', 'warn', 'Dossiers sans entité de traitement'),
                $this->item('unassigned', 'À affecter', $this->open($user)->whereNull('complaints.owner_id')->whereNotIn('complaints.status', [ComplaintStatus::ReponseEnvoyee->value, ComplaintStatus::Cloture->value])->count(), '/app/reclamations?status=a_qualifier', 'blue', 'Dossiers de votre entité sans propriétaire'),
                $this->item('n1', 'Solutions à valider (N1)', $this->solutions($user, SolutionStatus::Soumise)->count(), '/app/solutions?statut=soumise', 'warn', 'Propositions soumises en attente de votre approbation'),
                $this->item('late', 'Dossiers en retard', $this->open($user)->whereDeadlineFlag('en_retard', $now)->count(), '/app/delais?queue=en_retard', 'danger', 'Échéance de réponse dépassée dans votre périmètre'),
            ],
            Role::Qualite => [
                $this->item('to_control', 'Réponses à contrôler', Complaint::query()->visibleTo($user)->where('complaints.status', ComplaintStatus::ReponseEnvoyee->value)->where('complaints.final_response_at', '>=', Dt::db(Dt::now()->subDays(30)))->whereDoesntHave('controls')->count(), '/app/reclamations?status=reponse_envoyee', 'warn', 'Réponses des 30 derniers jours sans contrôle qualité'),
                $this->item('actions', 'Actions en cours', QualityAction::query()->whereIn('status', [QualityActionStatus::Planifiee->value, QualityActionStatus::EnCours->value])->count(), '/app/qualite', 'blue', 'Actions correctives planifiées ou en cours'),
                $this->item('actions_late', 'Actions en retard', QualityAction::query()->whereIn('status', [QualityActionStatus::Planifiee->value, QualityActionStatus::EnCours->value])->where('due_at', '<', $now)->count(), '/app/qualite', 'danger', 'Actions dont l’échéance est dépassée'),
            ],
            Role::Conformite => [
                $this->item('n2', 'Validations N2', $this->solutions($user, SolutionStatus::ApprouveeN1)->where('requires_n2', true)->count(), '/app/solutions?statut=approuvee_n1', 'warn', 'Solutions approuvées N1 nécessitant votre validation'),
                $this->item('rules', 'Règles de délai à valider', DeadlineRule::query()->where('status', RuleStatus::AValider->value)->count(), '/app/parametres?onglet=regles', 'warn', 'Règles en attente de validation conformité'),
                $this->item('late', 'Dossiers en retard', $this->open($user)->whereDeadlineFlag('en_retard', $now)->count(), '/app/delais?queue=en_retard', 'danger', 'Échéance de réponse dépassée (toute la banque)'),
            ],
            Role::Direction => [
                $this->item('stock', 'Dossiers ouverts', $this->open($user)->count(), '/app/rapports', 'blue', 'Stock à date, toutes entités'),
                $this->item('late', 'Dossiers en retard', $this->open($user)->whereDeadlineFlag('en_retard', $now)->count(), '/app/delais?queue=en_retard', 'danger', 'Échéance de réponse dépassée'),
                $this->item('at_risk', 'À risque', $this->open($user)->whereDeadlineFlag('a_risque', $now)->count(), '/app/delais', 'warn', 'Pré-alerte atteinte'),
            ],
            Role::Admin => [],
            Role::Client => [],
        };

        return response()->json(['data' => ['role' => $user->role->value, 'items' => $items]]);
    }

    /** Dossiers ouverts (sans réponse finale) du périmètre, hors statuts historiques clôturés. */
    private function open(User $user): Builder
    {
        return Complaint::query()->visibleTo($user)
            ->whereNull('complaints.final_response_at')
            ->whereNotIn('complaints.status', [ComplaintStatus::ReponseEnvoyee->value, ComplaintStatus::Cloture->value, ComplaintStatus::Brouillon->value]);
    }

    private function tasks(User $user): Builder
    {
        return Task::query()->where('assignee_id', $user->id)->where('status', '!=', TaskStatus::Terminee->value);
    }

    private function solutions(User $user, SolutionStatus $status): Builder
    {
        return Solution::query()->where('status', $status->value)
            ->whereHas('complaint', fn (Builder $q) => $q->visibleTo($user));
    }

    /** @return array{key: string, label: string, count: int, to: string, tone: string, hint: string} */
    private function item(string $key, string $label, int $count, string $to, string $tone, string $hint): array
    {
        return compact('key', 'label', 'count', 'to', 'tone', 'hint');
    }
}
