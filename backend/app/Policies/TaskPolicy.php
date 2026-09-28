<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Task;
use App\Models\User;

final class TaskPolicy
{
    public function update(User $user, Task $task): bool
    {
        $complaint = $task->complaint;

        return $complaint !== null
            && $complaint->isVisibleTo($user)
            && ($user->hasPermission('complaints.transition') || $user->hasPermission('complaints.assign') || $task->assignee_id === $user->id);
    }
}
