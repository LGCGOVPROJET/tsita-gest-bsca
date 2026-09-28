<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Invalide les sessions serveur d'un utilisateur (réinitialisation ou changement de mot de passe,
 * désactivation du compte, réinitialisation MFA). Pilote « database » uniquement ; les autres pilotes
 * sont couverts par AuthenticateSession (Sanctum) qui compare l'empreinte du mot de passe.
 */
final class SessionPurger
{
    public static function forUser(User $user, ?string $exceptSessionId = null): int
    {
        if (config('session.driver') !== 'database') {
            return 0;
        }

        return DB::table((string) config('session.table', 'sessions'))
            ->where('user_id', $user->id)
            ->when($exceptSessionId, fn ($q, $id) => $q->where('id', '!=', $id))
            ->delete();
    }
}
