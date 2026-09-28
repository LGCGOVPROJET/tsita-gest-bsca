<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

/**
 * Politique d'imposition de la double authentification (config/security.php).
 * Un compte d'un rôle concerné sans MFA configurée est en état « enrôlement MFA obligatoire » :
 * seules /auth/me, /auth/mfa/setup, /auth/mfa/confirm et /auth/logout lui sont ouvertes.
 */
final class MfaEnforcement
{
    public static function active(): bool
    {
        return ! (config('app.demo_mode') && ! config('security.mfa.enforce_in_demo'));
    }

    /** @return list<string> */
    public static function roles(): array
    {
        return array_values((array) config('security.mfa.enforced_roles', []));
    }

    public static function requiredFor(User $user): bool
    {
        return self::active() && in_array($user->role->value, self::roles(), true);
    }

    public static function enrollmentRequired(User $user): bool
    {
        return self::requiredFor($user) && ! ($user->mfa_enabled && $user->mfa_secret);
    }
}
