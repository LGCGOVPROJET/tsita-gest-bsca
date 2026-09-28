<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\RuleStatus;
use App\Models\DeadlineRule;
use App\Models\User;

final class DeadlineRulePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('admin.rules') || $user->hasPermission('admin.rules.validate');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('admin.rules');
    }

    /** Une règle validée est immuable : toute évolution passe par une nouvelle version. */
    public function update(User $user, DeadlineRule $rule): bool
    {
        return $user->hasPermission('admin.rules') && $rule->status !== RuleStatus::Valide;
    }

    public function validate(User $user, DeadlineRule $rule): bool
    {
        return $user->hasPermission('admin.rules.validate') && $rule->status === RuleStatus::AValider;
    }
}
