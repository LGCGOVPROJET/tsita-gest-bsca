<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Task;
use App\Support\Dt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Task */
class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'complaint_id' => $this->complaint_id,
            'title' => $this->title,
            'description' => $this->description,
            'assignee' => $this->assignee ? ['id' => $this->assignee->id, 'name' => $this->assignee->name] : null,
            'due_at' => Dt::iso($this->due_at),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'completed_at' => Dt::iso($this->completed_at),
            'created_at' => Dt::iso($this->created_at),
        ];
    }
}
