<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ComplaintStatus;
use App\Enums\EventType;
use App\Enums\Visibility;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Événement de chronologie : jamais modifié ni supprimé (append-only, renforcé par triggers MySQL).
 */
class ComplaintEvent extends Model
{
    use SerializesLocalDates;

    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = [
        'complaint_id', 'type', 'from_status', 'to_status', 'title', 'description', 'visibility',
        'actor_id', 'reason', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'type' => EventType::class,
            'from_status' => ComplaintStatus::class,
            'to_status' => ComplaintStatus::class,
            'visibility' => Visibility::class,
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(static fn () => throw new LogicException('Les événements de chronologie ne peuvent pas être modifiés.'));
        static::deleting(static fn () => throw new LogicException('Les événements de chronologie ne peuvent pas être supprimés.'));
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
