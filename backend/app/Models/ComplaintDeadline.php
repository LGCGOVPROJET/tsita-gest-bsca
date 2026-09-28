<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DeadlineKind;
use App\Enums\DeadlineStatus;
use App\Enums\DeadlineUnit;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplaintDeadline extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'complaint_id', 'deadline_rule_id', 'rule_version', 'kind', 'unit', 'due_at', 'initial_due_at',
        'announced_at', 'met_at', 'status',
    ];

    protected function casts(): array
    {
        return [
            'kind' => DeadlineKind::class,
            'unit' => DeadlineUnit::class,
            'status' => DeadlineStatus::class,
            'due_at' => 'datetime',
            'initial_due_at' => 'datetime',
            'announced_at' => 'datetime',
            'met_at' => 'datetime',
            'rule_version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        // L'échéance initiale n'est jamais modifiée.
        static::updating(static function (self $d): void {
            if ($d->isDirty('initial_due_at')) {
                $d->initial_due_at = $d->getOriginal('initial_due_at');
            }
        });
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(DeadlineRule::class, 'deadline_rule_id');
    }
}
