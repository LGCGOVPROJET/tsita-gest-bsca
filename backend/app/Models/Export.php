<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ExportFormat;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Export extends Model
{
    use SerializesLocalDates;

    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = ['user_id', 'type', 'format', 'filters', 'period_from', 'period_to', 'as_of', 'rule_version', 'row_count'];

    protected function casts(): array
    {
        return [
            'format' => ExportFormat::class,
            'filters' => 'array',
            'period_from' => 'date',
            'period_to' => 'date',
            'as_of' => 'datetime',
            'row_count' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
