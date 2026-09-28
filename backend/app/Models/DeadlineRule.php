<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DeadlineKind;
use App\Enums\DeadlineUnit;
use App\Enums\RuleSourceType;
use App\Enums\RuleStatus;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeadlineRule extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'code', 'label', 'kind', 'unit', 'duration', 'start_point', 'source_type', 'source_reference',
        'effective_from', 'effective_to', 'version', 'status', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'kind' => DeadlineKind::class,
            'unit' => DeadlineUnit::class,
            'source_type' => RuleSourceType::class,
            'status' => RuleStatus::class,
            'duration' => 'integer',
            'version' => 'integer',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'validated_at' => 'datetime',
        ];
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    /** Règle appliquée uniquement au titre du mode démonstration (non validée par la conformité). */
    public function isDemo(): bool
    {
        return $this->status !== RuleStatus::Valide;
    }

    public function versionLabel(): string
    {
        return $this->code.' v'.$this->version.($this->isDemo() ? ' (démonstration, non validée)' : '');
    }
}
