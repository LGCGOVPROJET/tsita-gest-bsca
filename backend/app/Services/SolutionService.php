<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\ApprovalDecision;
use App\Enums\ComplaintStatus;
use App\Enums\Decision;
use App\Enums\EventType;
use App\Enums\SolutionStatus;
use App\Enums\SolutionType;
use App\Enums\Visibility;
use App\Exceptions\BusinessRuleException;
use App\Models\Approval;
use App\Models\Complaint;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\User;
use App\Support\Dt;
use Illuminate\Support\Facades\DB;

/**
 * Solutions versionnées et validation à deux niveaux (N1 responsable, N2 conformité au-delà du seuil).
 */
final class SolutionService
{
    public function __construct(
        private readonly ComplaintWorkflow $workflow,
        private readonly AuditLogger $audit,
    ) {}

    public function n2Threshold(): float
    {
        return (float) Setting::get('n2_threshold', 500000);
    }

    /** @param array<string, mixed> $data */
    public function propose(Complaint $complaint, array $data, User $actor): Solution
    {
        if (! in_array($complaint->status, [ComplaintStatus::EnInvestigation, ComplaintStatus::SolutionProposee], true)) {
            throw BusinessRuleException::field('status', 'Une solution ne peut être proposée qu\'en investigation ou après une première proposition.');
        }

        return DB::transaction(function () use ($complaint, $data, $actor): Solution {
            $version = (int) Solution::query()->where('complaint_id', $complaint->id)->lockForUpdate()->max('version') + 1;
            $amount = isset($data['amount']) && $data['amount'] !== '' ? $data['amount'] : null;
            $solution = Solution::query()->create([
                'complaint_id' => $complaint->id,
                'version' => $version,
                'type' => SolutionType::from($data['type']),
                'description' => $data['description'],
                'root_cause' => $data['root_cause'] ?? null,
                'amount' => $amount,
                'currency' => $amount !== null ? strtoupper((string) ($data['currency'] ?? 'XAF')) : null,
                'decision' => Decision::from($data['decision']),
                'status' => SolutionStatus::Brouillon,
                'requires_n2' => $amount !== null && (float) $amount >= $this->n2Threshold(),
                'proposed_by' => $actor->id,
            ]);
            $this->workflow->event($complaint, EventType::Solution, 'Solution v'.$version.' proposée : '.$solution->type->label(),
                null, Visibility::Internal, $actor);
            $this->audit->log('solution.propose', $solution, null, $solution->only(['version', 'type', 'amount', 'currency', 'decision', 'requires_n2']), null, $actor);
            if ($complaint->status === ComplaintStatus::EnInvestigation) {
                $this->workflow->transition($complaint, ComplaintStatus::SolutionProposee, 'Proposition de solution', $actor, true);
            }

            return $solution;
        });
    }

    public function submit(Solution $solution, User $actor): Solution
    {
        $complaint = $solution->complaint;
        $latest = (int) $complaint->solutions()->max('version');
        if ($solution->status !== SolutionStatus::Brouillon) {
            throw BusinessRuleException::field('status', 'Seule une solution en brouillon peut être soumise.');
        }
        if ($solution->version !== $latest) {
            throw BusinessRuleException::field('version', 'Seule la dernière version de la solution peut être soumise.');
        }

        return DB::transaction(function () use ($solution, $complaint, $actor): Solution {
            $solution->status = SolutionStatus::Soumise;
            $solution->submitted_at = Dt::now();
            $solution->save();
            $this->workflow->event($complaint, EventType::Solution, 'Solution v'.$solution->version.' soumise à validation', null, Visibility::Internal, $actor);
            $this->audit->log('solution.submit', $solution, ['status' => 'brouillon'], ['status' => 'soumise'], null, $actor);
            if ($complaint->status === ComplaintStatus::SolutionProposee) {
                $this->workflow->transition($complaint, ComplaintStatus::AValider, 'Solution soumise à validation', $actor, true);
            }

            return $solution->refresh();
        });
    }

    /** Niveau d'approbation attendu, ou null si la solution n'est pas en attente. */
    public function pendingLevel(Solution $solution): ?int
    {
        return match ($solution->status) {
            SolutionStatus::Soumise => 1,
            SolutionStatus::ApprouveeN1 => 2,
            default => null,
        };
    }

    public function approve(Solution $solution, ApprovalDecision $decision, ?string $comment, User $actor): Solution
    {
        $level = $this->pendingLevel($solution);
        if ($level === null) {
            throw BusinessRuleException::field('decision', 'Cette solution n\'est pas en attente d\'approbation.');
        }
        $permission = $level === 1 ? 'solutions.approve_n1' : 'solutions.approve_n2';
        if (! $actor->hasPermission($permission)) {
            throw BusinessRuleException::field('decision', $level === 1
                ? 'L\'approbation de niveau 1 relève du responsable de traitement.'
                : 'L\'approbation de niveau 2 relève de la conformité.');
        }
        if ($solution->proposed_by === $actor->id) {
            throw BusinessRuleException::field('decision', 'Le proposant ne peut pas approuver sa propre solution.');
        }
        if ($decision === ApprovalDecision::Rejete && trim((string) $comment) === '') {
            throw BusinessRuleException::field('comment', 'Un commentaire est obligatoire en cas de rejet.');
        }

        return DB::transaction(function () use ($solution, $decision, $comment, $actor, $level): Solution {
            $before = $solution->status->value;
            Approval::query()->create([
                'solution_id' => $solution->id,
                'level' => $level,
                'approver_id' => $actor->id,
                'decision' => $decision,
                'comment' => $comment,
                'decided_at' => Dt::now(),
            ]);
            if ($decision === ApprovalDecision::Rejete) {
                $solution->status = SolutionStatus::Rejetee;
            } elseif ($level === 1 && $solution->requires_n2) {
                $solution->status = SolutionStatus::ApprouveeN1;
            } else {
                $solution->status = SolutionStatus::Approuvee;
            }
            $solution->save();

            $complaint = $solution->complaint;
            $this->workflow->event($complaint, EventType::Approval,
                'Solution v'.$solution->version.' : '.$decision->label().' (niveau '.$level.')', $comment, Visibility::Internal, $actor);
            $this->audit->log('solution.approve', $solution, ['status' => $before], ['status' => $solution->status->value, 'level' => $level], $comment, $actor);

            if ($decision === ApprovalDecision::Rejete && $complaint->status === ComplaintStatus::AValider) {
                $this->workflow->transition($complaint, ComplaintStatus::SolutionProposee, 'Solution rejetée : '.$comment, $actor, true);
            }

            return $solution->refresh();
        });
    }
}
