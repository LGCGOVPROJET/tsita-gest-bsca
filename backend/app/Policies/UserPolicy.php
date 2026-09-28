<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

final class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('admin.users');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('admin.users');
    }

    public function update(User $user, User $target): bool
    {
        return $user->hasPermission('admin.users');
    }
}
