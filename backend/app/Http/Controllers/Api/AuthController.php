<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\MfaConfirmRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\TotpService;
use App\Support\Dt;
use App\Support\MfaEnforcement;
use App\Support\SessionPurger;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

final class AuthController extends Controller
{
    public const MAX_FAILURES = 10;

    public const LOCK_MINUTES = 15;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly TotpService $totp,
    ) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $email = mb_strtolower(trim((string) $request->input('email')));
        $user = User::query()->where('email', $email)->first();
        $invalid = fn () => response()->json([
            'message' => 'Identifiants invalides.',
            'errors' => ['email' => ['Identifiants invalides.']],
        ], 422);

        $locked = fn () => response()->json([
            'message' => 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans '.self::LOCK_MINUTES.' minutes.',
            'errors' => ['email' => ['Compte temporairement verrouillé. Réessayez plus tard.']],
        ], 422);

        if ($user !== null && $user->isLocked()) {
            $this->audit->log('auth.login_locked', $user, null, null, null, $user);

            return $locked();
        }
        // Parité anti-énumération : une adresse inconnue « se verrouille » comme un compte réel.
        $ghostKey = 'login_ghost_failures:'.hash('sha256', $email);
        if ($user === null && (int) Cache::get($ghostKey, 0) >= self::MAX_FAILURES) {
            return $locked();
        }

        // Vérification systématique d'un hachage (temps de réponse homogène si le compte n'existe pas).
        $passwordOk = Hash::check((string) $request->input('password'), $user?->password ?? '$2y$12$'.str_repeat('a', 53));
        if ($user === null || ! $passwordOk || ! $user->is_active) {
            if ($user !== null) {
                $this->registerFailure($user, 'auth.login_failed');
            } else {
                Cache::add($ghostKey, 0, now()->addMinutes(self::LOCK_MINUTES));
                Cache::increment($ghostKey);
            }

            return $invalid();
        }

        if ($user->mfa_enabled && $user->mfa_secret) {
            $code = (string) $request->input('mfa_code', '');
            if ($code === '') {
                return response()->json(['mfa_required' => true]);
            }
            if (! $this->totp->verify((string) $user->mfa_secret, $code, 'user:'.$user->id)) {
                $this->registerFailure($user, 'auth.mfa_failed');

                return response()->json([
                    'message' => 'Code de vérification invalide.',
                    'errors' => ['mfa_code' => ['Code de vérification invalide.']],
                ], 422);
            }
        }

        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }
        $user->forceFill(['failed_logins' => 0, 'locked_until' => null, 'last_login_at' => Dt::now()])->save();
        $this->audit->log('auth.login', $user, null, null, null, $user);
        if (MfaEnforcement::enrollmentRequired($user)) {
            // Session ouverte mais restreinte à /auth/me, /auth/mfa/setup, /auth/mfa/confirm, /auth/logout.
            $this->audit->log('auth.mfa_enrollment_required', $user, null, null, null, $user);
        }

        return (new UserResource($user->load(['agency', 'entity'])))->response();
    }

    private function registerFailure(User $user, string $action): void
    {
        $failures = $user->failed_logins + 1;
        $data = ['failed_logins' => $failures];
        if ($failures >= self::MAX_FAILURES) {
            $data = ['failed_logins' => 0, 'locked_until' => Dt::now()->addMinutes(self::LOCK_MINUTES)];
        }
        $user->forceFill($data)->save();
        $this->audit->log($failures >= self::MAX_FAILURES ? 'auth.account_locked' : $action, $user, null, ['failed_logins' => $failures], null, null);
    }

    public function logout(Request $request): Response
    {
        $user = $request->user();
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
        if ($user !== null) {
            $this->audit->log('auth.logout', $user, null, null, null, $user);
        }

        return response()->noContent();
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user()->load(['agency', 'entity']));
    }

    /** Réponse neutre et identique, que le compte existe ou non. */
    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $user = User::query()->where('email', mb_strtolower((string) $request->input('email')))->where('is_active', true)->first();
        if ($user !== null) {
            $this->audit->log('auth.password_reset_requested', $user, null, null, null, null);
            // Envoi différé après la réponse : temps de réponse identique que le compte existe ou non.
            \Illuminate\Support\defer(static fn () => Password::broker()->sendResetLink(['email' => $user->email]));
        }

        return response()->json(['message' => 'Si un compte correspond à cette adresse, un lien de réinitialisation vient d\'être envoyé.']);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::broker()->reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                    'failed_logins' => 0,
                    'locked_until' => null,
                ])->save();
                event(new PasswordReset($user));
                SessionPurger::forUser($user);
                $this->audit->log('auth.password_reset', $user, null, null, null, $user);
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'Ce lien de réinitialisation est invalide ou expiré.',
                'errors' => ['token' => ['Ce lien de réinitialisation est invalide ou expiré.']],
            ], 422);
        }

        return response()->json(['message' => 'Votre mot de passe a été réinitialisé.']);
    }

    public function mfaSetup(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if ($user->mfa_enabled) {
            return response()->json(['message' => 'La double authentification est déjà activée.'], 422);
        }
        $secret = $this->totp->generateSecret();
        $user->forceFill(['mfa_secret' => $secret, 'mfa_enabled' => false])->save();
        $this->audit->log('auth.mfa_setup', $user, null, null, null, $user);

        return response()->json(['secret' => $secret, 'otpauth_url' => $this->totp->otpauthUrl($user->email, $secret)]);
    }

    public function mfaConfirm(MfaConfirmRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if (! $user->mfa_secret || ! $this->totp->verify((string) $user->mfa_secret, (string) $request->input('code'))) {
            return response()->json([
                'message' => 'Code de vérification invalide.',
                'errors' => ['code' => ['Code de vérification invalide.']],
            ], 422);
        }
        $user->forceFill(['mfa_enabled' => true])->save();
        $this->audit->log('auth.mfa_enabled', $user, null, null, null, $user);

        return (new UserResource($user->load(['agency', 'entity'])))->response();
    }
}
