<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\MfaEnforcement;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloque toute route métier tant qu'un compte soumis à la MFA obligatoire ne l'a pas configurée.
 */
final class EnsureMfaEnrolled
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user !== null && MfaEnforcement::enrollmentRequired($user)) {
            return response()->json([
                'message' => 'La double authentification est obligatoire pour votre profil : configurez-la pour continuer.',
                'mfa_enrollment_required' => true,
            ], 403);
        }

        return $next($request);
    }
}
