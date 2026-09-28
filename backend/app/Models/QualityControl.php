<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ControlResult;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QualityControl extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['complaint_id', 'controller_id', 'result', 'findings', 'controlled_at'];

    protected function casts(): array
    {
        return ['result' => ControlResult::class, 'controlled_at' => 'datetime'];
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function controller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'controller_id');
    }
}
