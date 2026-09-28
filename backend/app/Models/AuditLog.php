<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Journal d'audit append-only.
 */
class AuditLog extends Model
{
    use SerializesLocalDates;

    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = [
        'user_id', 'action', 'auditable_type', 'auditable_id', 'before', 'after', 'reason', 'ip', 'user_agent', 'created_at',
    ];

    protected function casts(): array
    {
        return ['before' => 'array', 'after' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(static fn () => throw new LogicException('Le journal d\'audit est en ajout seul.'));
        static::deleting(static fn () => throw new LogicException('Le journal d\'audit est en ajout seul.'));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
