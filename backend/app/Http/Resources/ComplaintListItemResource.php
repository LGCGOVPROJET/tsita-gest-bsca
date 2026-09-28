<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Enums\DeadlineKind;
use App\Enums\Role;
use App\Models\Complaint;
use App\Models\Customer;
use App\Services\DeadlineCalculator;
use App\Support\Dt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Complaint */
class ComplaintListItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Complaint $c */
        $c = $this->resource;
        $flag = app(DeadlineCalculator::class)->flag($c);
        $masked = $request->user()?->role === Role::Direction;

        return [
            'id' => $c->id,
            'reference' => $c->reference,
            'subject' => $c->subject,
            'customer_name' => $masked ? Customer::mask($c->customer?->full_name) : $c->customer?->full_name,
            'channel' => $c->channel ? ['code' => $c->channel->code, 'label' => $c->channel->label] : null,
            'receiving_agency' => $c->receivingAgency ? ['id' => $c->receivingAgency->id, 'name' => $c->receivingAgency->name] : null,
            'processing_entity' => $c->processingEntity ? ['id' => $c->processingEntity->id, 'name' => $c->processingEntity->name] : null,
            'category' => $c->category ? ['id' => $c->category->id, 'label' => $c->category->label] : null,
            'status' => $c->status->value,
            'status_label' => $c->status->label(),
            'decision' => $c->decision?->value,
            'decision_label' => $c->decision?->label(),
            'priority' => $c->priority->value,
            'received_at' => Dt::iso($c->received_at),
            'due_at' => Dt::iso($c->deadlineOf(DeadlineKind::ReponseFinale)?->due_at),
            'deadline_flag' => $flag->value,
            'deadline_flag_label' => $flag->label(),
            'owner' => $c->owner ? ['id' => $c->owner->id, 'name' => $c->owner->name] : null,
        ];
    }

    /** Relations à précharger pour éviter le N+1. */
    public const WITH = ['customer', 'channel', 'receivingAgency', 'processingEntity', 'category', 'owner', 'deadlines'];
}
