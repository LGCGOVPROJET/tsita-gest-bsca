<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\DeadlineKind;
use App\Enums\DeliveryStatus;
use App\Enums\EventType;
use App\Enums\MessageDirection;
use App\Enums\MessageKind;
use App\Enums\ScanStatus;
use App\Enums\Visibility;
use App\Models\Attachment;
use App\Models\Complaint;
use App\Models\ComplaintEvent;
use App\Models\Message;
use App\Support\Dt;
use Illuminate\Support\Collection;

/**
 * Vue client filtrée (§9.2). N'expose JAMAIS : notes internes, noms d'agents, avis de contrôle,
 * pièces internes, statut interne, motifs internes des transitions.
 */
final class ClientViewPresenter
{
    public function __construct(private readonly ComplaintWorkflow $workflow) {}

    /** @return array<string, mixed> */
    public function summary(Complaint $complaint): array
    {
        $complaint->loadMissing(['category', 'product', 'deadlines']);
        $status = $complaint->status;
        $events = $this->clientEvents($complaint);
        $messages = $this->clientMessages($complaint);
        $last = collect([$complaint->received_at])
            ->merge($events->pluck('created_at'))
            ->merge($messages->pluck('sent_at'))
            ->filter()
            ->max();

        return [
            'reference' => $complaint->reference,
            'subject' => $complaint->subject,
            'category_label' => $complaint->category?->label,
            'product_label' => $complaint->product?->label,
            'client_status' => $status->clientStatus(),
            'client_status_label' => $status->clientLabel(),
            'received_at' => Dt::iso($complaint->received_at),
            'last_update_at' => Dt::iso($last),
            'next_step' => $this->nextStep($complaint),
            'can_reopen' => $this->workflow->canReopen($complaint),
        ];
    }

    /** @return array<string, mixed> */
    public function present(Complaint $complaint): array
    {
        $base = $this->summary($complaint);
        $messages = $this->clientMessages($complaint);

        $final = null;
        if ($complaint->final_response_at !== null) {
            $msg = $messages->filter(fn (Message $m) => ! $m->author_is_client
                && $m->sent_at !== null
                && abs($m->sent_at->diffInSeconds($complaint->final_response_at)) <= 5)->last();
            $final = ['sent_at' => Dt::iso($complaint->final_response_at), 'body' => $msg?->body];
        }

        $timeline = $this->clientEvents($complaint)->map(fn (ComplaintEvent $e) => [
            'date' => Dt::iso($e->created_at),
            'title' => $e->type === EventType::StatusChanged && $e->to_status !== null
                ? 'Statut : '.$e->to_status->clientLabel()
                : $e->title,
            'description' => $e->type === EventType::StatusChanged ? null : $e->description,
        ])->values()->all();

        $documents = Attachment::query()
            ->where('complaint_id', $complaint->id)
            ->where('visibility', Visibility::Client->value)
            ->where('scan_status', '!=', ScanStatus::Rejete->value)
            ->orderBy('created_at')
            ->get()
            ->map(fn (Attachment $a) => [
                'name' => $a->original_name,
                'date' => Dt::iso($a->created_at),
                'from' => $a->uploaded_by_client ? 'client' : 'bsca',
            ])->all();

        return $base + [
            'final_response' => $final,
            'timeline' => $timeline,
            'messages' => $messages->map(fn (Message $m) => [
                'date' => Dt::iso($m->sent_at ?? $m->created_at),
                'from' => $m->author_is_client ? 'client' : 'bsca',
                'body' => $m->body,
            ])->values()->all(),
            'documents' => $documents,
        ];
    }

    /** @return Collection<int, ComplaintEvent> */
    private function clientEvents(Complaint $complaint)
    {
        return ComplaintEvent::query()
            ->where('complaint_id', $complaint->id)
            ->where('visibility', Visibility::Client->value)
            ->orderBy('created_at')->orderBy('id')
            ->get();
    }

    /** @return Collection<int, Message> */
    private function clientMessages(Complaint $complaint)
    {
        return Message::query()
            ->where('complaint_id', $complaint->id)
            ->where('kind', MessageKind::ClientMessage->value)
            ->where(fn ($q) => $q->where('direction', MessageDirection::Entrant->value)
                ->orWhere('delivery_status', DeliveryStatus::Envoye->value))
            ->orderBy('created_at')->orderBy('id')
            ->get();
    }

    private function nextStep(Complaint $complaint): string
    {
        $due = $complaint->deadlineOf(DeadlineKind::ReponseFinale)?->due_at;
        $dueText = $due ? ' Réponse attendue au plus tard le '.Dt::parseLocal($due)->format('d/m/Y').'.' : '';

        return match ($complaint->status->clientStatus()) {
            'recue' => $complaint->acknowledged_at
                ? 'Votre demande va être examinée puis confiée à un gestionnaire.'.$dueText
                : 'Votre demande est enregistrée ; un accusé de réception vous sera adressé.'.$dueText,
            'en_cours' => 'Votre demande est en cours d\'analyse par nos équipes.'.$dueText,
            'information_demandee' => 'Des informations complémentaires vous ont été demandées : répondez via la messagerie sécurisée ou transmettez un document.',
            'reponse_envoyee' => 'La réponse définitive vous a été envoyée. Vous pouvez demander une réouverture si vous la contestez.',
            'cloturee' => 'Votre dossier est clôturé. Vous pouvez demander une réouverture en cas de désaccord.',
            default => 'Votre demande de réouverture est enregistrée et va être réexaminée.'.$dueText,
        };
    }
}
