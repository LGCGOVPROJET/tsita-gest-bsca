<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AttachmentClassification;
use App\Enums\ScanStatus;
use App\Enums\Visibility;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attachment extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'complaint_id', 'uploaded_by', 'uploaded_by_client', 'original_name', 'stored_path', 'mime', 'size',
        'sha256', 'classification', 'visibility', 'scan_status',
    ];

    /** @var list<string> */
    protected $hidden = ['stored_path'];

    protected function casts(): array
    {
        return [
            'uploaded_by_client' => 'boolean',
            'size' => 'integer',
            'classification' => AttachmentClassification::class,
            'visibility' => Visibility::class,
            'scan_status' => ScanStatus::class,
        ];
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
