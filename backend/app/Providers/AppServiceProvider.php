<?php

declare(strict_types=1);

namespace App\Providers;

use App\Enums\Role;
use App\Models\User;
use App\Services\DeadlineCalculator;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Cache des jours fériés partagé pendant la requête.
        $this->app->scoped(DeadlineCalculator::class);
    }

    public function boot(): void
    {
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        if ($this->app->isProduction()) {
            // Garde-fous de mise en production (docs/SECURITE.md §checklist).
            if (config('app.debug')) {
                Log::critical('APP_DEBUG=true en production : traces d\'erreur exposées. Corriger immédiatement.');
            }
            if (config('app.demo_mode')) {
                Log::critical('APP_DEMO_MODE=true en production : règles de délai non validées et MFA désactivable.');
            }
            URL::forceScheme('https');
        }

        // Politique de mot de passe : 12 caractères min., majuscule, minuscule, chiffre, symbole.
        Password::defaults(static fn () => Password::min(12)->mixedCase()->numbers()->symbols());

        // Une Gate par permission (§4) : utilisable via le middleware can:<permission>.
        foreach (Role::allPermissions() as $permission) {
            Gate::define($permission, static fn (User $user): bool => $user->hasPermission($permission));
        }

        RateLimiter::for('login', static function (Request $request): array {
            $key = mb_strtolower((string) $request->input('email')).'|'.$request->ip();
            $tooMany = static fn (Request $request, array $headers) => response()->json([
                'message' => 'Trop de tentatives de connexion. Réessayez dans une minute.',
            ], 429, $headers);

            return [
                Limit::perMinute(5)->by($key)->response($tooMany),
                // Plafond par IP, toutes adresses confondues (pulvérisation de mots de passe).
                Limit::perMinute((int) config('security.login.per_ip_per_minute', 20))->by('ip:'.$request->ip())->response($tooMany),
            ];
        });

        RateLimiter::for('public', static fn (Request $request): Limit => Limit::perMinute(10)->by($request->ip())
            ->response(static fn (Request $request, array $headers) => response()->json(['message' => 'Trop de requêtes. Réessayez dans une minute.'], 429, $headers)));

        RateLimiter::for('api', static fn (Request $request): Limit => Limit::perMinute(180)->by($request->user()?->id ?: $request->ip()));

        ResetPassword::createUrlUsing(static function (User $user, string $token): string {
            return rtrim((string) config('app.frontend_url'), '/').'/reinitialiser-mot-de-passe?token='.$token.'&email='.urlencode($user->email);
        });
    }
}
