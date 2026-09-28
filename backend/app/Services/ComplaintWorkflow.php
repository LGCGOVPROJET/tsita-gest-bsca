<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\ComplaintStatus;
use App\Enums\ControlResult;
use App\Enums\DeadlineKind;
use App\Enums\DeliveryStatus;
use App\Enums\EventType;
use App\Enums\MessageDirection;
use App\Enums\MessageKind;
use App\Enums\Role;
use App\Enums\SolutionStatus;
use App\Enums\TemplateKind;
use App\Enums\Visibility;
use App\Exceptions\BusinessRuleException;
use App\Models\Channel;
use App\Models\Complaint;
use App\Models\ComplaintEvent;
use App\Models\Message;
use App\Models\ProcessingEntity;
use App\Models\QualityControl;
use App\Models\ResponseTemplate;
use App\Models\Setting;
use App\Models\User;
use App\Support\Dt;
use Illuminate\Support\Facades\DB;

/**
 * Cycle de vie du dossier (§6) : transitions motivées, affectation, qualification, accusé,
 * échanges, réponse finale, réouverture (dossier enfant) et doublons (sans suppression).
 * Chaque action crée un événement de chronologie et une entrée d'audit.
 */
final class ComplaintWorkflow
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly DeadlineCalculator $deadlines,
        private readonly ReferenceGenerator $references,
        private readonly TrackingCodeService $tracking,
    ) {}

    // ------------------------------------------------------------------ Événements

    public function event(
        Complaint $complaint,
        EventType $type,
        string $title,
        ?string $description = null,
        Visibility $visibility = Visibility::Internal,
        ?User $actor = null,
        ?string $reason = null,
        ?ComplaintStatus $from = null,
        ?ComplaintStatus $to = null,
    ): ComplaintEvent {
        return ComplaintEvent::query()->create([
            'complaint_id' => $complaint->id,
            'type' => $type,
            'from_status' => $from,
            'to_status' => $to,
            'title' => mb_substr($title, 0, 190),
            'description' => $description,
            'visibility' => $visibility,
            'actor_id' => $actor?->id,
            'reason' => $reason,
            'created_at' => Dt::now(),
        ]);
    }

    // ------------------------------------------------------------------ Transitions

    /** @return list<array{value: string, label: string}> */
    public function allowedTransitions(Complaint $complaint): array
    {
        return array_map(
            static fn (ComplaintStatus $s): array => ['value' => $s->value, 'label' => $s->label()],
            $complaint->status->manualTargets(),
        );
    }

    public function transition(
        Complaint $complaint,
        ComplaintStatus $to,
        ?string $reason,
        ?User $actor,
        bool $automatic = false,
    ): ComplaintEvent {
        $from = $complaint->status;
        if (! $from->canTransitionTo($to)) {
            throw BusinessRuleException::field('to_status', "Transition interdite : « {$from->label()} » vers « {$to->label()} ».");
        }
        if (! $automatic && in_array($to, [ComplaintStatus::ReponseEnvoyee, ComplaintStatus::Reouvert], true)) {
            throw BusinessRuleException::field('to_status', $to === ComplaintStatus::ReponseEnvoyee
                ? 'La réponse finale doit être envoyée via l\'action « Envoyer la réponse ».'
                : 'La réouverture crée un dossier enfant : utilisez l\'action « Réouvrir ».');
        }
        if (! $automatic && trim((string) $reason) === '') {
            throw BusinessRuleException::field('reason', 'Le motif de la transition est obligatoire.');
        }
        if ($to === ComplaintStatus::Affecte && $complaint->owner_id === null) {
            throw BusinessRuleException::field('to_status', 'Un propriétaire doit être désigné avant l\'affectation.');
        }

        return DB::transaction(function () use ($complaint, $from, $to, $reason, $actor): ComplaintEvent {
            $complaint->status = $to;
            if ($to === ComplaintStatus::Cloture) {
                $complaint->closed_at = Dt::now();
            }
            $complaint->save();

            $clientVisible = $from->clientStatus() !== $to->clientStatus();
            $event = $this->event(
                $complaint,
                EventType::StatusChanged,
                'Statut : '.$from->label().' → '.$to->label(),
                null,
                $clientVisible ? Visibility::Client : Visibility::Internal,
                $actor,
                $reason,
                $from,
                $to,
            );
            $this->audit->log('complaint.transition', $complaint, ['status' => $from->value], ['status' => $to->value], $reason, $actor);

            return $event;
        });
    }

    /** Transition automatique si elle est permise depuis le statut courant. */
    private function autoAdvance(Complaint $complaint, ComplaintStatus $to, ?User $actor, string $reason): void
    {
        if ($complaint->status->canTransitionTo($to)) {
            $this->transition($complaint, $to, $reason, $actor, true);
        }
    }

    // ------------------------------------------------------------------ Qualification / affectation

    /** @param array<string, mixed> $changes */
    public function qualify(Complaint $complaint, array $changes, string $reason, User $actor): Complaint
    {
        $allowed = ['category_id', 'product_id', 'processing_entity_id', 'priority', 'risk_level', 'amount', 'currency', 'subject'];
        $changes = array_intersect_key($changes, array_flip($allowed));

        return DB::transaction(function () use ($complaint, $changes, $reason, $actor): Complaint {
            $before = [];
            $after = [];
            foreach ($changes as $key => $value) {
                $old = $complaint->getAttribute($key);
                $oldRaw = $old instanceof \BackedEnum ? $old->value : $old;
                $complaint->setAttribute($key, $value);
                $newRaw = $complaint->getAttribute($key);
                $newRaw = $newRaw instanceof \BackedEnum ? $newRaw->value : $newRaw;
                if ((string) $oldRaw !== (string) $newRaw) {
                    $before[$key] = $oldRaw;
                    $after[$key] = $newRaw;
                }
            }
            if (array_key_exists('amount', $changes)) {
                if ($complaint->amount === null) {
                    $complaint->currency = $changes['currency'] ?? null;
                }
                $complaint->amount_flagged = self::isAmountOutOfNorm($complaint->amount);
            }
            $complaint->save();

            $this->event($complaint, EventType::Qualified, 'Qualification mise à jour',
                $after === [] ? 'Aucune modification de valeur.' : 'Champs modifiés : '.implode(', ', array_keys($after)),
                Visibility::Internal, $actor, $reason);
            $this->audit->log('complaint.qualify', $complaint, $before, $after, $reason, $actor);
            $this->autoAdvance($complaint, ComplaintStatus::AQualifier, $actor, 'Qualification du dossier');

            return $complaint->refresh();
        });
    }

    public static function isAmountOutOfNorm(mixed $amount): bool
    {
        if ($amount === null || $amount === '') {
            return false;
        }
        $threshold = (float) Setting::get('amount_flag_threshold', 50_000_000);

        return (float) $amount < 0 || (float) $amount >= $threshold;
    }

    public function assign(Complaint $complaint, User $owner, ?User $deputy, ?int $entityId, string $reason, User $actor): Complaint
    {
        foreach (array_filter(['owner_id' => $owner, 'deputy_id' => $deputy]) as $field => $user) {
            if (! $user->is_active || ! in_array($user->role, [Role::Gestionnaire, Role::Responsable], true)) {
                throw BusinessRuleException::field($field, 'Le collaborateur désigné doit être un gestionnaire ou un responsable actif.');
            }
        }
        if ($deputy !== null && $deputy->id === $owner->id) {
            throw BusinessRuleException::field('deputy_id', 'Le suppléant doit être différent du propriétaire.');
        }
        if ($entityId !== null && ! ProcessingEntity::query()->whereKey($entityId)->where('is_active', true)->exists()) {
            throw BusinessRuleException::field('processing_entity_id', 'Entité de traitement inconnue ou inactive.');
        }

        return DB::transaction(function () use ($complaint, $owner, $deputy, $entityId, $reason, $actor): Complaint {
            $before = $complaint->only(['owner_id', 'deputy_id', 'processing_entity_id']);
            $complaint->owner_id = $owner->id;
            $complaint->deputy_id = $deputy?->id;
            if ($entityId !== null) {
                $complaint->processing_entity_id = $entityId;
            }
            $complaint->save();
            $after = $complaint->only(['owner_id', 'deputy_id', 'processing_entity_id']);

            $this->event($complaint, EventType::Assigned, 'Affectation : '.$owner->name,
                $deputy ? 'Suppléant : '.$deputy->name : null, Visibility::Internal, $actor, $reason);
            $this->audit->log('complaint.assign', $complaint, $before, $after, $reason, $actor);

            $this->autoAdvance($complaint, ComplaintStatus::AQualifier, $actor, 'Affectation du dossier');
            $this->autoAdvance($complaint, ComplaintStatus::Affecte, $actor, 'Affectation du dossier');

            return $complaint->refresh();
        });
    }

    // ------------------------------------------------------------------ Communications

    public function acknowledge(Complaint $complaint, ?ResponseTemplate $template, string $channelCode, DeliveryStatus $delivery, User $actor): Message
    {
        $channel = Channel::query()->where('code', $channelCode)->firstOrFail();
        $template ??= ResponseTemplate::query()->where('kind', TemplateKind::Accuse->value)->where('is_active', true)->orderByDesc('version')->first();

        return DB::transaction(function () use ($complaint, $template, $channel, $delivery, $actor): Message {
            $vars = $this->templateVars($complaint);
            $message = Message::query()->create([
                'complaint_id' => $complaint->id,
                'kind' => MessageKind::ClientMessage,
                'direction' => MessageDirection::Sortant,
                'channel_id' => $channel->id,
                'author_id' => $actor->id,
                'author_is_client' => false,
                'subject' => $template ? $template->render($template->subject, $vars) : 'Accusé de réception '.$complaint->reference,
                'body' => $template ? $template->render($template->body, $vars) : 'Nous accusons réception de votre réclamation '.$complaint->reference.'.',
                'delivery_status' => $delivery,
                'sent_at' => $delivery === DeliveryStatus::Envoye ? Dt::now() : null,
                'template_id' => $template?->id,
            ]);

            $before = ['acknowledgment_status' => $complaint->acknowledgment_status->value, 'acknowledged_at' => $complaint->acknowledged_at];
            if ($delivery === DeliveryStatus::Envoye) {
                $complaint->acknowledged_at ??= Dt::now();
                $complaint->acknowledgment_status = DeliveryStatus::Envoye;
                $complaint->save();
                $this->deadlines->markMet($complaint, DeadlineKind::Accuse, $complaint->acknowledged_at);
                $this->event($complaint, EventType::Acknowledged, 'Accusé de réception envoyé',
                    'Canal : '.$channel->label, Visibility::Client, $actor);
            } else {
                if ($complaint->acknowledgment_status !== DeliveryStatus::Envoye) {
                    $complaint->acknowledgment_status = $delivery;
                    $complaint->save();
                }
                $this->event($complaint, EventType::Acknowledged,
                    $delivery === DeliveryStatus::Echec ? 'Échec d\'envoi de l\'accusé de réception' : 'Accusé de réception préparé',
                    'Canal : '.$channel->label, Visibility::Internal, $actor);
            }
            $this->audit->log('complaint.acknowledge', $complaint, $before,
                ['acknowledgment_status' => $complaint->acknowledgment_status->value, 'acknowledged_at' => $complaint->acknowledged_at, 'channel' => $channel->code],
                null, $actor);
            if ($delivery === DeliveryStatus::Envoye) {
                $this->autoAdvance($complaint, ComplaintStatus::AQualifier, $actor, 'Accusé de réception envoyé');
            }

            return $message;
        });
    }

    public function addMessage(Complaint $complaint, MessageKind $kind, string $body, ?string $channelCode, ?User $actor, bool $fromClient = false): Message
    {
        $channel = $channelCode ? Channel::query()->where('code', $channelCode)->first() : null;
        if ($fromClient) {
            $channel ??= Channel::query()->where('code', 'portail')->first();
        }

        return DB::transaction(function () use ($complaint, $kind, $body, $channel, $actor, $fromClient): Message {
            $isNote = $kind === MessageKind::InternalNote;
            $message = Message::query()->create([
                'complaint_id' => $complaint->id,
                'kind' => $kind,
                'direction' => $isNote ? null : ($fromClient ? MessageDirection::Entrant : MessageDirection::Sortant),
                'channel_id' => $isNote ? null : $channel?->id,
                'author_id' => $actor?->id,
                'author_is_client' => $fromClient,
                'body' => $body,
                'delivery_status' => $isNote ? null : DeliveryStatus::Envoye,
                'sent_at' => $isNote ? null : Dt::now(),
            ]);
            $this->event(
                $complaint,
                EventType::Message,
                $isNote ? 'Note interne ajoutée' : ($fromClient ? 'Message du client' : 'Message de BSCA au client'),
                null,
                $isNote ? Visibility::Internal : Visibility::Client,
                $fromClient ? null : $actor,
            );
            $this->audit->log($isNote ? 'complaint.note' : 'complaint.message', $complaint, null,
                ['message_id' => $message->id, 'kind' => $kind->value, 'from_client' => $fromClient], null, $actor);

            return $message;
        });
    }

    /** @return array<string, string> */
    public function templateVars(Complaint $complaint): array
    {
        $final = $complaint->deadlines()->where('kind', DeadlineKind::ReponseFinale->value)->first();

        return [
            'reference' => $complaint->reference,
            'client' => (string) $complaint->customer?->full_name,
            'date_limite' => $final ? Dt::parseLocal($final->due_at)->format('d/m/Y') : 'à confirmer',
        ];
    }

    // ------------------------------------------------------------------ Réponse finale

    public function sendResponse(Complaint $complaint, string $body, ?ResponseTemplate $template, string $channelCode, User $actor): Complaint
    {
        if ($complaint->status !== ComplaintStatus::AValider) {
            throw BusinessRuleException::field('status', 'La réponse ne peut être envoyée que pour un dossier « À valider ».');
        }
        $solution = $complaint->solutions()->orderByDesc('version')->first();
        if ($solution === null || $solution->status !== SolutionStatus::Approuvee) {
            throw BusinessRuleException::field('solution', 'Une solution approuvée (dernière version) est requise avant l\'envoi de la réponse.');
        }
        $channel = Channel::query()->where('code', $channelCode)->firstOrFail();

        return DB::transaction(function () use ($complaint, $body, $template, $channel, $actor, $solution): Complaint {
            $now = Dt::now();
            $before = $complaint->only(['status', 'decision', 'final_response_at']);
            Message::query()->create([
                'complaint_id' => $complaint->id,
                'kind' => MessageKind::ClientMessage,
                'direction' => MessageDirection::Sortant,
                'channel_id' => $channel->id,
                'author_id' => $actor->id,
                'author_is_client' => false,
                'subject' => 'Réponse à votre réclamation '.$complaint->reference,
                'body' => $body,
                'delivery_status' => DeliveryStatus::Envoye,
                'sent_at' => $now,
                'template_id' => $template?->id,
            ]);
            $complaint->final_response_at = $now;
            $complaint->decision = $solution->decision;
            $complaint->save();
            $this->transition($complaint, ComplaintStatus::ReponseEnvoyee, 'Envoi de la réponse finale', $actor, true);
            $this->deadlines->markMet($complaint, DeadlineKind::ReponseFinale, $now);
            $this->event($complaint, EventType::ResponseSent, 'Réponse définitive envoyée', 'Canal : '.$channel->label, Visibility::Client, $actor);
            $this->audit->log('complaint.send_response', $complaint, $before, $complaint->only(['status', 'decision', 'final_response_at']), null, $actor);

            return $complaint->refresh();
        });
    }

    // ------------------------------------------------------------------ Réouverture / doublon

    public function canReopen(Complaint $complaint): bool
    {
        return $complaint->status->isAnswered()
            && $complaint->duplicate_of_id === null
            && ! $complaint->children()->whereNull('final_response_at')->exists();
    }

    /**
     * Réouverture : crée un dossier enfant « reouvert » lié par parent_complaint_id.
     * Le dossier d'origine et sa réponse initiale restent inchangés et consultables.
     *
     * @return array{complaint: Complaint, tracking_code: string}
     */
    public function reopen(Complaint $parent, string $reason, ?User $actor, bool $byClient = false): array
    {
        if (! $this->canReopen($parent)) {
            throw BusinessRuleException::field('reason', 'Ce dossier ne peut pas être réouvert (réponse non envoyée ou réouverture déjà en cours).');
        }

        return DB::transaction(function () use ($parent, $reason, $actor, $byClient): array {
            $now = Dt::now();
            $code = $this->tracking->generate();
            $channelId = $byClient
                ? (Channel::query()->where('code', 'portail')->value('id') ?? $parent->channel_id)
                : $parent->channel_id;
            $child = Complaint::query()->create([
                'reference' => $this->references->next($now),
                'tracking_code_hash' => $this->tracking->hash($code),
                'customer_id' => $parent->customer_id,
                'channel_id' => $channelId,
                'receiving_agency_id' => $parent->receiving_agency_id,
                'processing_entity_id' => $parent->processing_entity_id,
                'category_id' => $parent->category_id,
                'product_id' => $parent->product_id,
                'subject' => mb_substr('Réouverture : '.$parent->subject, 0, 190),
                'description' => $reason,
                'status' => ComplaintStatus::Reouvert,
                'priority' => $parent->priority,
                'risk_level' => $parent->risk_level,
                'amount' => $parent->amount,
                'currency' => $parent->currency,
                'amount_flagged' => $parent->amount_flagged,
                'received_at' => $now,
                'acknowledgment_status' => DeliveryStatus::EnAttente,
                'owner_id' => $parent->owner_id,
                'deputy_id' => $parent->deputy_id,
                'parent_complaint_id' => $parent->id,
                'consent_at' => $parent->consent_at,
                'created_by' => $actor?->id,
            ]);
            $this->deadlines->scheduleFor($child);

            $this->event($child, EventType::Reopened, 'Dossier ouvert suite à la réouverture de '.$parent->reference,
                null, Visibility::Client, $actor, $reason, null, ComplaintStatus::Reouvert);
            $this->event($parent, EventType::Reopened, 'Réouverture demandée : nouveau dossier '.$child->reference,
                null, Visibility::Client, $actor, $reason);
            $this->audit->log('complaint.reopen', $parent, null, ['child_reference' => $child->reference, 'by_client' => $byClient], $reason, $actor);

            return ['complaint' => $child, 'tracking_code' => $code];
        });
    }

    public function markDuplicate(Complaint $complaint, Complaint $original, string $reason, User $actor): Complaint
    {
        if ($complaint->id === $original->id) {
            throw BusinessRuleException::field('duplicate_of_id', 'Un dossier ne peut pas être son propre doublon.');
        }
        if ($complaint->duplicate_of_id !== null) {
            throw BusinessRuleException::field('duplicate_of_id', 'Ce dossier est déjà marqué comme doublon.');
        }
        if ($original->duplicate_of_id !== null) {
            throw BusinessRuleException::field('duplicate_of_id', 'Le dossier de référence est lui-même un doublon ; choisissez le dossier principal.');
        }

        return DB::transaction(function () use ($complaint, $original, $reason, $actor): Complaint {
            $complaint->duplicate_of_id = $original->id;
            $complaint->save();
            $this->event($complaint, EventType::Duplicate, 'Marqué comme doublon de '.$original->reference, null, Visibility::Internal, $actor, $reason);
            $this->event($original, EventType::Duplicate, 'Doublon rattaché : '.$complaint->reference, null, Visibility::Internal, $actor, $reason);
            $this->audit->log('complaint.mark_duplicate', $complaint, ['duplicate_of_id' => null], ['duplicate_of_id' => $original->id], $reason, $actor);

            return $complaint->refresh();
        });
    }

    // ------------------------------------------------------------------ Contrôle qualité

    public function addControl(Complaint $complaint, ControlResult $result, ?string $findings, User $actor): QualityControl
    {
        return DB::transaction(function () use ($complaint, $result, $findings, $actor): QualityControl {
            $control = QualityControl::query()->create([
                'complaint_id' => $complaint->id,
                'controller_id' => $actor->id,
                'result' => $result,
                'findings' => $findings,
                'controlled_at' => Dt::now(),
            ]);
            // Pas de type d'événement « contrôle » au contrat : la trace est portée par quality_controls + audit_logs.
            $this->audit->log('complaint.quality_control', $complaint, null, ['result' => $result->value, 'findings' => $findings], null, $actor);

            return $control;
        });
    }
}
