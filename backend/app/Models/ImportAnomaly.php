<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AnomalyResolution;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ImportAnomaly extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['import_batch_id', 'row_number', 'source_id', 'issue', 'raw', 'resolution_status', 'resolved_by', 'resolved_at'];

    protected function casts(): array
    {
        return ['raw' => 'array', 'resolution_status' => AnomalyResolution::class, 'resolved_at' => 'datetime', 'row_number' => 'integer'];
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ImportBatch::class, 'import_batch_id');
    }
}
