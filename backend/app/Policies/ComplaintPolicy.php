<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\Role;
use App\Models\Complaint;
use App\Models\User;

/**
 * Accès aux dossiers : permission du rôle (§4) ET périmètre (agence/entité/propriété).
 * Aucune méthode de suppression : la suppression n'est jamais offerte aux profils métier.
 */
final class ComplaintPolicy
{
    private function sees(User $user, Complaint $complaint): bool
    {
        return $user->is_active && $user->role !== Role::Client && $complaint->isVisibleTo($user);
    }

    public function viewAny(User $user): bool
    {
        return $user->hasPermission('complaints.view');
    }

    public function view(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.view') && $this->sees($user, $complaint);
    }

    /** Données nominatives, pièces et échanges : interdits à la direction. */
    public function viewSensitive(User $user, Complaint $complaint): bool
    {
        return $this->view($user, $complaint) && $user->role !== Role::Direction;
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('complaints.create');
    }

    public function qualify(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.qualify') && $this->sees($user, $complaint);
    }

    public function assign(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.assign') && $this->sees($user, $complaint);
    }

    public function transition(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.transition') && $this->sees($user, $complaint);
    }

    public function respond(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.respond') && $this->sees($user, $complaint);
    }

    /** Accusé de réception : agent d'accueil ou gestionnaire. */
    public function acknowledge(User $user, Complaint $complaint): bool
    {
        return ($user->hasPermission('complaints.create') || $user->hasPermission('complaints.respond'))
            && $this->sees($user, $complaint);
    }

    public function addNote(User $user, Complaint $complaint): bool
    {
        return ($user->hasPermission('complaints.create') || $user->hasPermission('complaints.respond')
            || $user->hasPermission('quality.control')) && $this->sees($user, $complaint);
    }

    public function attach(User $user, Complaint $complaint): bool
    {
        return ($user->hasPermission('complaints.create') || $user->hasPermission('complaints.respond'))
            && $this->sees($user, $complaint);
    }

    public function reopen(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.reopen') && $this->sees($user, $complaint);
    }

    public function propose(User $user, Complaint $complaint): bool
    {
        // Plus de nouvelle solution une fois la réponse définitive envoyée (réouvrir crée un dossier enfant).
        return $user->hasPermission('solutions.propose') && $complaint->isOpen() && $this->sees($user, $complaint);
    }

    public function approve(User $user, Complaint $complaint): bool
    {
        return ($user->hasPermission('solutions.approve_n1') || $user->hasPermission('solutions.approve_n2'))
            && $this->sees($user, $complaint);
    }

    public function markDuplicate(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('complaints.qualify') && $this->sees($user, $complaint);
    }

    public function control(User $user, Complaint $complaint): bool
    {
        return $user->hasPermission('quality.control') && $this->sees($user, $complaint);
    }

    public function manageTasks(User $user, Complaint $complaint): bool
    {
        return ($user->hasPermission('complaints.transition') || $user->hasPermission('complaints.assign'))
            && $this->sees($user, $complaint);
    }

    public function export(User $user): bool
    {
        return $user->hasPermission('complaints.export');
    }
}
