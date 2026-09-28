<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Solution;
use App\Models\User;

final class SolutionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('solutions.propose')
            || $user->hasPermission('solutions.approve_n1')
            || $user->hasPermission('solutions.approve_n2');
    }

    public function submit(User $user, Solution $solution): bool
    {
        return $user->hasPermission('solutions.propose') && $solution->complaint->isVisibleTo($user);
    }

    public function approve(User $user, Solution $solution): bool
    {
        return ($user->hasPermission('solutions.approve_n1') || $user->hasPermission('solutions.approve_n2'))
            && $solution->complaint->isVisibleTo($user);
    }
}
