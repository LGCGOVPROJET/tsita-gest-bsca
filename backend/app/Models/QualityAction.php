<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\QualityActionStatus;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class QualityAction extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'title', 'root_cause', 'category_id', 'owner_id', 'owner_entity_id', 'due_at', 'status',
        'effectiveness_measure', 'evidence', 'completed_at',
    ];

    protected function casts(): array
    {
        return ['status' => QualityActionStatus::class, 'due_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function ownerEntity(): BelongsTo
    {
        return $this->belongsTo(ProcessingEntity::class, 'owner_entity_id');
    }

    public function complaints(): BelongsToMany
    {
        return $this->belongsToMany(Complaint::class, 'complaint_quality_action');
    }
}
