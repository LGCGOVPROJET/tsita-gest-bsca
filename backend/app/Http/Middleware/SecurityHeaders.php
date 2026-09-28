<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 */
final class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);
        $h = $response->headers;

        $h->set('X-Content-Type-Options', 'nosniff');
        $h->set('X-Frame-Options', 'DENY');
        $h->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $h->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        $h->set('Cross-Origin-Opener-Policy', 'same-origin');
        $h->set('Cross-Origin-Resource-Policy', 'same-origin');
        // L'API ne sert que du JSON ou des fichiers : aucune ressource active autorisée.
        $h->set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        if ($request->is('api/*')) {
            $h->set('Cache-Control', 'no-store, private');
            $h->set('Pragma', 'no-cache');
        }
        if (app()->environment('production') || $request->isSecure()) {
            $h->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        $h->remove('X-Powered-By');
        // En-tête natif ajouté par PHP (expose_php) : à désactiver aussi dans php.ini en production.
        if (! headers_sent()) {
            header_remove('X-Powered-By');
        }

        return $response;
    }
}
