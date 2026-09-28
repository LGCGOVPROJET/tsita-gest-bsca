<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['date', 'label', 'calendar_version', 'country'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
