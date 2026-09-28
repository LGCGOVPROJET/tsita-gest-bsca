<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\AttachmentClassification;
use App\Enums\ComplaintStatus;
use App\Enums\DeadlineKind;
use App\Enums\DeliveryStatus;
use App\Enums\EventType;
use App\Enums\Priority;
use App\Enums\RiskLevel;
use App\Enums\Visibility;
use App\Models\Channel;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\User;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * Enregistrement des réclamations : dépôt portail (sans compte) et saisie omnicanale par un agent.
 */
final class ComplaintIntakeService
{
    public function __construct(
        private readonly ReferenceGenerator $references,
        private readonly TrackingCodeService $tracking,
        private readonly DeadlineCalculator $deadlines,
        private readonly ComplaintWorkflow $workflow,
        private readonly AttachmentService $attachments,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @param  list<UploadedFile>  $files
     * @return array{complaint: Complaint, tracking_code: string}
     */
    public function createFromPortal(array $data, array $files): array
    {
        $channel = Channel::query()->where('code', 'portail')->firstOrFail();

        return $this->create($data, $files, $channel, Dt::now(), null, true);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<UploadedFile>  $files
     * @return array{complaint: Complaint, tracking_code: string}
     */
    public function createByAgent(array $data, array $files, User $agent): array
    {
        $channel = Channel::query()->where('code', $data['channel'])->firstOrFail();
        $receivedAt = ! empty($data['received_at'])
            ? CarbonImmutable::parse((string) $data['received_at'], Dt::tz())->setTimezone('UTC')
            : Dt::now();
        if ($receivedAt->greaterThan(Dt::now())) {
            $receivedAt = Dt::now();
        }

        return $this->create($data, $files, $channel, $receivedAt, $agent, false);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<UploadedFile>  $files
     * @return array{complaint: Complaint, tracking_code: string}
     */
    private function create(array $data, array $files, Channel $channel, CarbonImmutable $receivedAt, ?User $agent, bool $portal): array
    {
        return DB::transaction(function () use ($data, $files, $channel, $receivedAt, $agent, $portal): array {
            $customer = ! empty($data['customer_id'])
                ? Customer::query()->findOrFail((int) $data['customer_id'])
                : Customer::query()->create([
                    'full_name' => $data['full_name'],
                    'email' => $data['email'] ?? null,
                    'phone' => $data['phone'] ?? null,
                    'customer_number' => $data['customer_number'] ?? null,
                    'preferred_channel' => $data['preferred_channel'] ?? 'courriel',
                ]);

            $code = $this->tracking->generate();
            $amount = isset($data['amount']) && $data['amount'] !== '' ? $data['amount'] : null;
            $complaint = Complaint::query()->create([
                'reference' => $this->references->next($receivedAt),
                'tracking_code_hash' => $this->tracking->hash($code),
                'customer_id' => $customer->id,
                'channel_id' => $channel->id,
                'receiving_agency_id' => $portal ? ($data['agency_id'] ?? null) : ($data['receiving_agency_id'] ?? $agent?->agency_id ?? ($data['agency_id'] ?? null)),
                'category_id' => $data['category_id'] ?? null,
                'product_id' => $data['product_id'] ?? null,
                'subject' => $data['subject'],
                'description' => $data['description'],
                'operation_date' => $data['operation_date'] ?? null,
                'status' => ComplaintStatus::Recu,
                'priority' => Priority::Normale,
                'risk_level' => RiskLevel::Faible,
                'amount' => $amount,
                'currency' => $amount !== null ? strtoupper((string) ($data['currency'] ?? 'XAF')) : null,
                'amount_flagged' => ComplaintWorkflow::isAmountOutOfNorm($amount),
                'received_at' => $receivedAt,
                'acknowledgment_status' => DeliveryStatus::EnAttente,
                'consent_at' => ! empty($data['consent']) ? Dt::now() : null,
                'created_by' => $agent?->id,
            ]);
            $this->deadlines->scheduleFor($complaint);

            $this->workflow->event($complaint, EventType::Created, 'Demande enregistrée',
                $portal ? 'Dépôt via le portail client' : 'Canal : '.$channel->label, Visibility::Client, $agent);
            $this->audit->log('complaint.create', $complaint, null, [
                'reference' => $complaint->reference, 'channel' => $channel->code, 'portal' => $portal,
            ], null, $agent);

            foreach ($files as $file) {
                $this->attachments->store(
                    $complaint,
                    $file,
                    AttachmentClassification::Client,
                    Visibility::Client,
                    $agent,
                    $portal,
                );
            }

            return ['complaint' => $complaint->refresh(), 'tracking_code' => $code];
        });
    }

    /** @return array<string, mixed> Données de confirmation (le code de suivi n'est montré qu'une fois). */
    public function confirmation(Complaint $complaint, string $trackingCode): array
    {
        $complaint->load('deadlines');

        return [
            'reference' => $complaint->reference,
            'tracking_code' => $trackingCode,
            'received_at' => Dt::iso($complaint->received_at),
            'acknowledgment_due_at' => Dt::iso($complaint->deadlineOf(DeadlineKind::Accuse)?->due_at),
            'final_response_due_at' => Dt::iso($complaint->deadlineOf(DeadlineKind::ReponseFinale)?->due_at),
            'rule_is_demo' => $this->deadlines->usesDemoRule($complaint->received_at),
        ];
    }
}
