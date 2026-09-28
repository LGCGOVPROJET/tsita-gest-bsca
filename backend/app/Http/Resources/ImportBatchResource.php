<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ImportAnomaly;
use App\Models\ImportBatch;
use App\Support\Dt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ImportBatch */
class ImportBatchResource extends JsonResource
{
    public bool $withAnomalies = false;

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'filename' => $this->filename,
            'file_sha256' => $this->file_sha256,
            'source_system' => $this->source_system,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'rows_total' => $this->rows_total,
            'rows_created' => $this->rows_created,
            'rows_skipped' => $this->rows_skipped,
            'rows_anomalies' => $this->rows_anomalies,
            'report' => $this->report,
            'imported_by' => $this->importer ? ['id' => $this->importer->id, 'name' => $this->importer->name] : null,
            'created_at' => Dt::iso($this->created_at),
        ];
        if ($this->withAnomalies) {
            $data['anomalies'] = $this->anomalies()->orderBy('row_number')->get()->map(fn (ImportAnomaly $a) => [
                'id' => $a->id,
                'row_number' => $a->row_number,
                'source_id' => $a->source_id,
                'issue' => $a->issue,
                'raw' => $a->raw,
                'resolution_status' => $a->resolution_status->value,
                'resolution_status_label' => $a->resolution_status->label(),
                'resolved_at' => Dt::iso($a->resolved_at),
            ])->all();
        }

        return $data;
    }
}
