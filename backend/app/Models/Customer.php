<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = ['full_name', 'email', 'phone', 'customer_number', 'address', 'preferred_channel'];

    /** @var list<string> */
    protected $hidden = ['customer_number'];

    protected function casts(): array
    {
        return ['customer_number' => 'encrypted'];
    }

    public function complaints(): HasMany
    {
        return $this->hasMany(Complaint::class);
    }

    /** Nom masqué pour la direction : « J. M*** ». */
    public static function mask(?string $fullName): string
    {
        $clean = preg_replace('/\([^)]*\)/u', ' ', (string) $fullName) ?? '';
        $parts = preg_split('/\s+/u', trim($clean)) ?: [];
        $parts = array_values(array_filter($parts, static fn ($p) => $p !== ''));
        if ($parts === []) {
            return '***';
        }
        $first = mb_strtoupper(mb_substr($parts[0], 0, 1)).'.';
        $last = count($parts) > 1 ? mb_strtoupper(mb_substr($parts[count($parts) - 1], 0, 1)).'***' : '***';

        return $first.' '.$last;
    }
}
