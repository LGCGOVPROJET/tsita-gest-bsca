<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\QualityAction;
use App\Models\User;

final class QualityActionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('quality.manage') || $user->hasPermission('quality.control')
            || $user->hasPermission('reports.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('quality.manage');
    }

    public function update(User $user, QualityAction $action): bool
    {
        return $user->hasPermission('quality.manage') || $action->owner_id === $user->id;
    }
}
