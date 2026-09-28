<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ImportStatus;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ImportBatch extends Model
{
    use SerializesLocalDates;

    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = [
        'filename', 'file_sha256', 'source_system', 'status', 'rows_total', 'rows_created', 'rows_skipped',
        'rows_anomalies', 'report', 'imported_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => ImportStatus::class,
            'report' => 'array',
            'rows_total' => 'integer',
            'rows_created' => 'integer',
            'rows_skipped' => 'integer',
            'rows_anomalies' => 'integer',
        ];
    }

    public function anomalies(): HasMany
    {
        return $this->hasMany(ImportAnomaly::class);
    }

    public function importer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }
}
