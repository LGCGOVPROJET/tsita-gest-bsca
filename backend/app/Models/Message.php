<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DeliveryStatus;
use App\Enums\MessageDirection;
use App\Enums\MessageKind;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'complaint_id', 'kind', 'direction', 'channel_id', 'author_id', 'author_is_client', 'subject', 'body',
        'delivery_status', 'sent_at', 'template_id',
    ];

    protected function casts(): array
    {
        return [
            'kind' => MessageKind::class,
            'direction' => MessageDirection::class,
            'delivery_status' => DeliveryStatus::class,
            'author_is_client' => 'boolean',
            'sent_at' => 'datetime',
        ];
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function channel(): BelongsTo
    {
        return $this->belongsTo(Channel::class);
    }
}
