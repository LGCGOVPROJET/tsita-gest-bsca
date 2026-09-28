<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\AttachmentClassification;
use App\Enums\Role;
use App\Enums\ScanStatus;
use App\Models\Attachment;
use App\Models\User;

final class AttachmentPolicy
{
    public function download(User $user, Attachment $attachment): bool
    {
        $complaint = $attachment->complaint;
        if ($complaint === null || $attachment->scan_status === ScanStatus::Rejete) {
            return false;
        }
        if (! $user->hasPermission('complaints.view') || $user->role === Role::Direction || ! $complaint->isVisibleTo($user)) {
            return false;
        }
        // Pièce confidentielle : propriétaire, suppléant, responsable de l'entité, conformité.
        if ($attachment->classification === AttachmentClassification::Confidentiel) {
            return in_array($user->role, [Role::Responsable, Role::Conformite], true)
                || $complaint->owner_id === $user->id
                || $complaint->deputy_id === $user->id;
        }

        return true;
    }
}
