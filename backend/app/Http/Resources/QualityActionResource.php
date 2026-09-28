<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\QualityAction;
use App\Support\Dt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin QualityAction */
class QualityActionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'root_cause' => $this->root_cause,
            'category' => $this->category ? ['id' => $this->category->id, 'label' => $this->category->label] : null,
            'owner' => $this->owner ? ['id' => $this->owner->id, 'name' => $this->owner->name] : null,
            'owner_entity' => $this->ownerEntity ? ['id' => $this->ownerEntity->id, 'name' => $this->ownerEntity->name] : null,
            'due_at' => Dt::iso($this->due_at),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'effectiveness_measure' => $this->effectiveness_measure,
            'evidence' => $this->evidence,
            'completed_at' => Dt::iso($this->completed_at),
            'complaints' => $this->complaints->map(fn ($c) => ['id' => $c->id, 'reference' => $c->reference])->values()->all(),
            'complaints_count' => $this->complaints->count(),
            'created_at' => Dt::iso($this->created_at),
        ];
    }
}
