<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\Role;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuse les comptes désactivés ou verrouillés (déconnexion de la session) ;
 * avec le paramètre « staff », refuse le rôle client sur les routes internes.
 */
final class EnsureActiveStaff
{
    public function handle(Request $request, Closure $next, ?string $mode = null): Response
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }
        if (! $user->is_active || $user->isLocked()) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'Compte inactif ou verrouillé.'], 401);
        }
        if ($mode === 'staff' && $user->role === Role::Client) {
            return response()->json(['message' => 'Accès réservé aux collaborateurs.'], 403);
        }
        if ($mode === 'client' && $user->role !== Role::Client) {
            return response()->json(['message' => 'Accès réservé aux clients.'], 403);
        }

        return $next($request);
    }
}
