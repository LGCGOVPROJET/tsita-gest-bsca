<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TaskStatus;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Task extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['complaint_id', 'title', 'description', 'assignee_id', 'due_at', 'status', 'completed_at'];

    protected function casts(): array
    {
        return ['status' => TaskStatus::class, 'due_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }
}
