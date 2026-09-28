<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'name' => 'Utilisateur fictif '.Str::random(5),
            'email' => Str::lower(Str::random(10)).'@exemple.invalid',
            'password' => static::$password ??= Hash::make('Bsca@Demo2026!'),
            'role' => Role::Gestionnaire,
            'is_active' => true,
        ];
    }

    public function role(Role $role): static
    {
        return $this->state(fn () => ['role' => $role]);
    }
}
