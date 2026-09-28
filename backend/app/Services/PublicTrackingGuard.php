<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Protection du code de suivi contre la force brute (portail public).
 *
 * - Par référence (qu'elle existe ou non, pour ne pas permettre l'énumération) : après N échecs dans la
 *   fenêtre, la référence est verrouillée ; la durée double à chaque récidive (15 min, 30 min, 1 h… ≤ 24 h).
 *   Pendant le verrouillage, même un code correct est refusé.
 * - Par IP : après M échecs dans l'heure, l'IP est bloquée une heure.
 * Complète le throttle « public » (10 requêtes/min/IP) appliqué par route.
 */
final class PublicTrackingGuard
{
    public function __construct(private readonly AuditLogger $audit) {}

    private static function ref(string $reference): string
    {
        return hash('sha256', strtoupper(trim($reference)));
    }

    /** Secondes restantes de blocage (référence ou IP), 0 si l'accès est permis. */
    public function blockedFor(string $reference, ?string $ip): int
    {
        $now = now()->getTimestamp();
        $until = max(
            (int) Cache::get('track_lock:ref:'.self::ref($reference), 0),
            $ip ? (int) Cache::get('track_lock:ip:'.$ip, 0) : 0,
        );

        return max(0, $until - $now);
    }

    public function failure(string $reference, ?string $ip): void
    {
        $cfg = (array) config('security.tracking');
        $ref = self::ref($reference);

        $countKey = 'track_fail:ref:'.$ref;
        Cache::add($countKey, 0, (int) $cfg['failure_window_seconds']);
        $count = (int) Cache::increment($countKey);
        if ($count >= (int) $cfg['max_failures_per_reference']) {
            $levelKey = 'track_level:ref:'.$ref;
            $level = (int) Cache::get($levelKey, 0) + 1;
            Cache::put($levelKey, $level, 86400 * 2);
            $seconds = (int) min((int) $cfg['base_lock_seconds'] * (2 ** ($level - 1)), (int) $cfg['max_lock_seconds']);
            Cache::put('track_lock:ref:'.$ref, now()->getTimestamp() + $seconds, $seconds);
            Cache::forget($countKey);
            $this->audit->log('public.track_locked', null, null, [
                'reference' => mb_substr(strtoupper(trim($reference)), 0, 25),
                'level' => $level,
                'lock_seconds' => $seconds,
            ]);
        }

        if ($ip) {
            $ipKey = 'track_fail:ip:'.$ip;
            Cache::add($ipKey, 0, 3600);
            $ipCount = (int) Cache::increment($ipKey);
            if ($ipCount >= (int) $cfg['max_failures_per_ip']) {
                Cache::put('track_lock:ip:'.$ip, now()->getTimestamp() + (int) $cfg['ip_lock_seconds'], (int) $cfg['ip_lock_seconds']);
                Cache::forget($ipKey);
                $this->audit->log('public.track_ip_blocked', null, null, ['ip' => $ip]);
            }
        }
    }

    public function success(string $reference): void
    {
        Cache::forget('track_fail:ref:'.self::ref($reference));
    }
}
