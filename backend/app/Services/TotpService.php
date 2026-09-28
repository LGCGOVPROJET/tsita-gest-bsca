<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use PragmaRX\Google2FA\Google2FA;

/**
 * TOTP RFC 6238 (30 s, 6 chiffres, SHA-1) via pragmarx/google2fa.
 */
final class TotpService
{
    private Google2FA $engine;

    public function __construct()
    {
        $this->engine = new Google2FA;
        $this->engine->setWindow(1);
    }

    public function generateSecret(): string
    {
        return $this->engine->generateSecretKey(32);
    }

    public function otpauthUrl(string $email, string $secret): string
    {
        return $this->engine->getQRCodeUrl('TSITA GEST BSCA', $email, $secret);
    }

    /**
     * Vérifie un code TOTP. Avec $replayKey (ex. identifiant utilisateur), un code déjà accepté
     * — ou un code plus ancien — est refusé (anti-rejeu, ASVS 2.8.4).
     */
    public function verify(#[\SensitiveParameter] string $secret, #[\SensitiveParameter] string $code, ?string $replayKey = null): bool
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (preg_match('/^\d{6}$/', $code) !== 1) {
            return false;
        }
        if ($replayKey === null) {
            return (bool) $this->engine->verifyKey($secret, $code);
        }

        $cacheKey = 'totp_last_timestep:'.$replayKey;
        $timestep = $this->engine->verifyKeyNewer($secret, $code, (int) Cache::get($cacheKey, 0));
        if ($timestep === false || $timestep === true) {
            return false;
        }
        Cache::put($cacheKey, (int) $timestep, 600);

        return true;
    }

    public function currentCode(string $secret): string
    {
        return $this->engine->getCurrentOtp($secret);
    }
}
