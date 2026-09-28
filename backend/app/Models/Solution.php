<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Decision;
use App\Enums\SolutionStatus;
use App\Enums\SolutionType;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Solution versionnée : une nouvelle proposition crée une nouvelle version, jamais d'écrasement.
 */
class Solution extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'complaint_id', 'version', 'type', 'description', 'root_cause', 'amount', 'currency', 'decision',
        'status', 'requires_n2', 'proposed_by', 'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'type' => SolutionType::class,
            'decision' => Decision::class,
            'status' => SolutionStatus::class,
            'amount' => 'decimal:2',
            'requires_n2' => 'boolean',
            'version' => 'integer',
            'submitted_at' => 'datetime',
        ];
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function proposer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'proposed_by');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(Approval::class)->orderBy('level');
    }
}
