<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\DeadlineRule;
use App\Support\Dt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin DeadlineRule */
class DeadlineRuleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'label' => $this->label,
            'kind' => $this->kind->value,
            'kind_label' => $this->kind->label(),
            'unit' => $this->unit->value,
            'unit_label' => $this->unit->label(),
            'duration' => $this->duration,
            'start_point' => $this->start_point,
            'source_type' => $this->source_type->value,
            'source_type_label' => $this->source_type->label(),
            'source_reference' => $this->source_reference,
            'effective_from' => $this->effective_from?->format('Y-m-d'),
            'effective_to' => $this->effective_to?->format('Y-m-d'),
            'version' => $this->version,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_demo' => $this->isDemo(),
            'validated_by' => $this->validator ? ['id' => $this->validator->id, 'name' => $this->validator->name] : null,
            'validated_at' => Dt::iso($this->validated_at),
            'notes' => $this->notes,
        ];
    }
}
