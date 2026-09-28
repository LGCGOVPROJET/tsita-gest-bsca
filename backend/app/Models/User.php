<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Role;
use App\Models\Concerns\SerializesLocalDates;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property Role $role
 */
class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'name', 'email', 'password', 'role', 'agency_id', 'entity_id', 'customer_id', 'phone', 'is_active',
    ];

    /** @var list<string> */
    protected $hidden = ['password', 'remember_token', 'mfa_secret'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'is_active' => 'boolean',
            'mfa_secret' => 'encrypted',
            'mfa_enabled' => 'boolean',
            'failed_logins' => 'integer',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function entity(): BelongsTo
    {
        return $this->belongsTo(ProcessingEntity::class, 'entity_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return list<string> */
    public function permissions(): array
    {
        return $this->role->permissions();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->is_active && in_array($permission, $this->permissions(), true);
    }

    public function hasRole(Role ...$roles): bool
    {
        return in_array($this->role, $roles, true);
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }
}
