<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ApprovalDecision;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Approval extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['solution_id', 'level', 'approver_id', 'decision', 'comment', 'decided_at'];

    protected function casts(): array
    {
        return ['decision' => ApprovalDecision::class, 'level' => 'integer', 'decided_at' => 'datetime'];
    }

    public function solution(): BelongsTo
    {
        return $this->belongsTo(Solution::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }
}
