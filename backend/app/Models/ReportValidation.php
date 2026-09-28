<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportValidation extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'type', 'period_from', 'period_to', 'filters', 'filters_hash', 'as_of', 'rule_version', 'snapshot',
        'comment', 'validated_by', 'validated_at',
    ];

    protected function casts(): array
    {
        return [
            'period_from' => 'date:Y-m-d',
            'period_to' => 'date:Y-m-d',
            'as_of' => 'date:Y-m-d',
            'filters' => 'array',
            'snapshot' => 'array',
            'validated_at' => 'datetime',
        ];
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    /** @param array<string, mixed> $filters */
    public static function hashFilters(array $filters): string
    {
        ksort($filters);

        return hash('sha256', (string) json_encode(array_map(static fn ($v) => (string) $v, $filters)));
    }
}
