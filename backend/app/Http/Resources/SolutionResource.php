<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Approval;
use App\Models\Solution;
use App\Support\Dt;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Solution */
class SolutionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Solution $s */
        $s = $this->resource;

        return [
            'id' => $s->id,
            'version' => $s->version,
            'complaint' => $s->relationLoaded('complaint') && $s->complaint
                ? ['id' => $s->complaint->id, 'reference' => $s->complaint->reference, 'subject' => $s->complaint->subject]
                : null,
            'type' => $s->type->value,
            'type_label' => $s->type->label(),
            'description' => $s->description,
            'root_cause' => $s->root_cause,
            'decision' => $s->decision->value,
            'decision_label' => $s->decision->label(),
            'status' => $s->status->value,
            'status_label' => $s->status->label(),
            'amount' => Money::format($s->amount),
            'currency' => $s->currency,
            'proposed_by' => $s->proposer ? ['id' => $s->proposer->id, 'name' => $s->proposer->name] : null,
            'submitted_at' => Dt::iso($s->submitted_at),
            'requires_n2' => (bool) $s->requires_n2,
            'created_at' => Dt::iso($s->created_at),
            'approvals' => $s->approvals->map(fn (Approval $a) => [
                'id' => $a->id,
                'level' => $a->level,
                'approver' => $a->approver ? ['id' => $a->approver->id, 'name' => $a->approver->name] : null,
                'decision' => $a->decision->value,
                'decision_label' => $a->decision->label(),
                'comment' => $a->comment,
                'decided_at' => Dt::iso($a->decided_at),
            ])->values()->all(),
        ];
    }
}
