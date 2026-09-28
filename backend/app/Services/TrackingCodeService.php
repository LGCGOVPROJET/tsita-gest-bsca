<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Complaint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Codes de suivi client : 8 caractères alphanumériques non ambigus, stockés hachés uniquement.
 */
final class TrackingCodeService
{
    private const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function generate(): string
    {
        $code = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < 8; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }

        return $code;
    }

    public function hash(string $code): string
    {
        return Hash::make(self::normalize($code));
    }

    public static function normalize(string $code): string
    {
        return strtoupper(preg_replace('/[\s-]+/', '', $code) ?? '');
    }

    /**
     * Retrouve un dossier par référence + code. Retourne null sans distinguer
     * « référence inconnue » et « code invalide » ; un hachage factice est vérifié
     * lorsque la référence n'existe pas pour uniformiser le temps de réponse.
     */
    public function resolve(string $reference, string $code): ?Complaint
    {
        $complaint = Complaint::query()->where('reference', strtoupper(trim($reference)))->first();
        $dummy = Cache::rememberForever('tracking_code_dummy_hash', static fn (): string => Hash::make(Str::random(24)));
        $stored = $complaint?->tracking_code_hash;
        // Dossiers repris sans code (empreinte inutilisable) : jamais accessibles par code.
        $usable = is_string($stored) && str_starts_with($stored, '$2y$');
        $ok = Hash::check(self::normalize($code), $usable ? $stored : $dummy);

        return ($complaint !== null && $usable && $ok) ? $complaint : null;
    }
}
