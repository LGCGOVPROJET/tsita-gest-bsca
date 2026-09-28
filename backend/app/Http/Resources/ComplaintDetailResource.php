<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Enums\ComplaintStatus;
use App\Enums\DeliveryStatus;
use App\Enums\SolutionStatus;
use App\Models\Attachment;
use App\Models\AuditLog;
use App\Models\Complaint;
use App\Models\ComplaintDeadline;
use App\Models\ComplaintEvent;
use App\Models\Customer;
use App\Models\Message;
use App\Models\QualityControl;
use App\Services\ComplaintWorkflow;
use App\Support\Dt;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** @mixin Complaint */
class ComplaintDetailResource extends ComplaintListItemResource
{
    public const WITH_DETAIL = [
        'customer', 'channel', 'receivingAgency', 'processingEntity', 'category', 'product', 'owner', 'deputy',
        'deadlines.rule', 'parent', 'children', 'duplicateOf', 'events.actor', 'attachments.uploader',
        'messages.author', 'messages.channel', 'tasks.assignee', 'solutions.proposer', 'solutions.approvals.approver',
        'controls.controller',
    ];

    public function toArray(Request $request): array
    {
        /** @var Complaint $c */
        $c = $this->resource;
        $user = $request->user();
        $sensitive = $user !== null && Gate::forUser($user)->allows('viewSensitive', $c);
        $workflow = app(ComplaintWorkflow::class);
        $can = fn (string $ability): bool => $user !== null && Gate::forUser($user)->allows($ability, $c);

        return parent::toArray($request) + [
            'description' => $c->description,
            'customer' => $c->customer ? [
                'id' => $c->customer->id,
                'full_name' => $sensitive ? $c->customer->full_name : Customer::mask($c->customer->full_name),
                'email' => $sensitive ? $c->customer->email : null,
                'phone' => $sensitive ? $c->customer->phone : null,
            ] : null,
            'product' => $c->product ? ['id' => $c->product->id, 'label' => $c->product->label] : null,
            'amount' => Money::format($c->amount),
            'currency' => $c->currency,
            'amount_flagged' => (bool) $c->amount_flagged,
            'risk_level' => $c->risk_level->value,
            'operation_date' => $c->operation_date?->format('Y-m-d'),
            'acknowledged_at' => Dt::iso($c->acknowledged_at),
            'acknowledgment_status' => $c->acknowledgment_status->value,
            'final_response_at' => Dt::iso($c->final_response_at),
            'closed_at' => Dt::iso($c->closed_at),
            'mediation_requested_at' => Dt::iso($c->mediation_requested_at),
            'deputy' => $c->deputy ? ['id' => $c->deputy->id, 'name' => $c->deputy->name] : null,
            'parent' => $c->parent ? ['id' => $c->parent->id, 'reference' => $c->parent->reference] : null,
            'children' => $c->children->map(fn (Complaint $ch) => [
                'id' => $ch->id, 'reference' => $ch->reference, 'status' => $ch->status->value, 'status_label' => $ch->status->label(),
            ])->values()->all(),
            'duplicate_of' => $c->duplicateOf ? ['id' => $c->duplicateOf->id, 'reference' => $c->duplicateOf->reference] : null,
            'source' => $c->source_system ? ['system' => $c->source_system, 'id' => $c->source_id, 'status_label' => $c->source_status_label] : null,
            'next_action' => $this->nextAction($c),
            'deadlines' => $c->deadlines->sortBy('due_at')->map(fn (ComplaintDeadline $d) => [
                'id' => $d->id,
                'kind' => $d->kind->value,
                'kind_label' => $d->kind->label(),
                'unit' => $d->unit->value,
                'due_at' => Dt::iso($d->due_at),
                'initial_due_at' => Dt::iso($d->initial_due_at),
                'announced_at' => Dt::iso($d->announced_at),
                'met_at' => Dt::iso($d->met_at),
                'status' => $d->status->value,
                'status_label' => $d->status->label(),
                'rule' => $d->rule ? [
                    'id' => $d->rule->id, 'code' => $d->rule->code, 'label' => $d->rule->label, 'version' => $d->rule_version,
                    'is_demo' => $d->rule->isDemo(), 'source_type' => $d->rule->source_type->value,
                ] : null,
            ])->values()->all(),
            'timeline' => $c->events->sortByDesc(fn (ComplaintEvent $e) => [$e->created_at, $e->id])->map(fn (ComplaintEvent $e) => [
                'id' => $e->id,
                'date' => Dt::iso($e->created_at),
                'type' => $e->type->value,
                'type_label' => $e->type->label(),
                'title' => $e->title,
                'description' => $e->description,
                'visibility' => $e->visibility->value,
                'actor' => $e->actor ? ['id' => $e->actor->id, 'name' => $e->actor->name] : null,
                'reason' => $e->reason,
                'from_status' => $e->from_status?->value,
                'to_status' => $e->to_status?->value,
            ])->values()->all(),
            'attachments' => ! $sensitive ? [] : $c->attachments->map(fn (Attachment $a) => [
                'id' => $a->id,
                'name' => $a->original_name,
                'mime' => $a->mime,
                'size' => $a->size,
                'sha256' => $a->sha256,
                'classification' => $a->classification->value,
                'classification_label' => $a->classification->label(),
                'visibility' => $a->visibility->value,
                'scan_status' => $a->scan_status->value,
                'uploaded_by_client' => (bool) $a->uploaded_by_client,
                'uploaded_by' => $a->uploader ? ['id' => $a->uploader->id, 'name' => $a->uploader->name] : null,
                'date' => Dt::iso($a->created_at),
                'can_download' => $user !== null && Gate::forUser($user)->allows('download', $a),
                'download_url' => '/api/v1/attachments/'.$a->id.'/download',
            ])->values()->all(),
            'messages' => ! $sensitive ? [] : $c->messages->sortBy(fn (Message $m) => [$m->created_at, $m->id])->map(fn (Message $m) => [
                'id' => $m->id,
                'kind' => $m->kind->value,
                'kind_label' => $m->kind->label(),
                'direction' => $m->direction?->value,
                'channel' => $m->channel ? ['code' => $m->channel->code, 'label' => $m->channel->label] : null,
                'author' => $m->author ? ['id' => $m->author->id, 'name' => $m->author->name] : null,
                'author_is_client' => (bool) $m->author_is_client,
                'subject' => $m->subject,
                'body' => $m->body,
                'delivery_status' => $m->delivery_status?->value,
                'delivery_status_label' => $m->delivery_status?->label(),
                'sent_at' => Dt::iso($m->sent_at),
                'date' => Dt::iso($m->created_at),
            ])->values()->all(),
            'tasks' => TaskResource::collection($c->tasks)->toArray($request),
            'solutions' => SolutionResource::collection($c->solutions->sortByDesc('version')->values())->toArray($request),
            'controls' => $c->controls->map(fn (QualityControl $q) => [
                'id' => $q->id,
                'result' => $q->result->value,
                'result_label' => $q->result->label(),
                'findings' => $q->findings,
                'controller' => $q->controller ? ['id' => $q->controller->id, 'name' => $q->controller->name] : null,
                'controlled_at' => Dt::iso($q->controlled_at),
            ])->values()->all(),
            'audit' => ! $sensitive ? [] : AuditLog::query()
                ->with('user')
                ->where('auditable_type', 'Complaint')->where('auditable_id', $c->id)
                ->orderByDesc('id')->limit(50)->get()
                ->map(fn (AuditLog $l) => [
                    'id' => $l->id,
                    'date' => Dt::iso($l->created_at),
                    'action' => $l->action,
                    'user' => $l->user ? ['id' => $l->user->id, 'name' => $l->user->name] : null,
                    'reason' => $l->reason,
                    'before' => $l->before,
                    'after' => $l->after,
                ])->all(),
            'allowed_transitions' => $can('transition') ? $workflow->allowedTransitions($c) : [],
            'can' => [
                'qualify' => $can('qualify'),
                'assign' => $can('assign'),
                'transition' => $can('transition'),
                'respond' => $can('respond'),
                'acknowledge' => $can('acknowledge'),
                'note' => $can('addNote'),
                'attach' => $can('attach'),
                'reopen' => $can('reopen') && $workflow->canReopen($c),
                'propose' => $can('propose'),
                'approve' => $can('approve'),
                'mark_duplicate' => $can('markDuplicate') && $c->duplicate_of_id === null,
                'control' => $can('control'),
                'manage_tasks' => $can('manageTasks'),
            ],
        ];
    }

    private function nextAction(Complaint $c): string
    {
        $latest = $c->solutions->sortByDesc('version')->first();

        return match ($c->status) {
            ComplaintStatus::Brouillon => 'Compléter et enregistrer le dossier',
            ComplaintStatus::Recu => $c->acknowledgment_status === DeliveryStatus::Envoye
                ? 'Qualifier le dossier'
                : ($c->acknowledgment_status === DeliveryStatus::Echec ? 'Renvoyer l\'accusé de réception (échec d\'envoi)' : 'Envoyer l\'accusé de réception'),
            ComplaintStatus::AQualifier => 'Qualifier et affecter le dossier à un gestionnaire',
            ComplaintStatus::Affecte => 'Démarrer l\'investigation',
            ComplaintStatus::EnInvestigation => 'Établir les faits et proposer une solution',
            ComplaintStatus::AttenteInformation => 'Relancer le client — l\'échéance n\'est pas suspendue',
            ComplaintStatus::SolutionProposee => 'Soumettre la solution à validation',
            ComplaintStatus::AValider => match ($latest?->status) {
                SolutionStatus::Approuvee => 'Envoyer la réponse finale au client',
                SolutionStatus::ApprouveeN1 => 'Approbation de niveau 2 (conformité) attendue',
                SolutionStatus::Soumise => 'Approbation de niveau 1 (responsable) attendue',
                default => 'Préparer une nouvelle proposition de solution',
            },
            ComplaintStatus::ReponseEnvoyee => 'Clôturer le dossier ou traiter une contestation',
            ComplaintStatus::Cloture => 'Aucune action — dossier clôturé',
            ComplaintStatus::Reouvert => 'Reprendre l\'investigation du dossier réouvert',
        };
    }
}
