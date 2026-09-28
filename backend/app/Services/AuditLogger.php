<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Journal d'audit append-only : action, objet, avant/après, motif, IP, user agent.
 */
final class AuditLogger
{
    /** Champs jamais écrits dans le journal. */
    private const REDACTED = [
        'password', 'password_confirmation', 'current_password', 'remember_token', 'mfa_secret', 'mfa_code', 'secret',
        'token', 'tracking_code', 'tracking_code_hash', 'customer_number', 'stored_path', 'otpauth_url',
    ];

    public function __construct(private readonly ?Request $request = null) {}

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    public function log(
        string $action,
        ?Model $auditable = null,
        ?array $before = null,
        ?array $after = null,
        ?string $reason = null,
        ?User $user = null,
    ): AuditLog {
        $request = $this->request ?? (app()->bound('request') ? app('request') : null);
        $user ??= $request?->user();

        return AuditLog::query()->create([
            'user_id' => $user?->id,
            'action' => $action,
            'auditable_type' => $auditable ? class_basename($auditable) : null,
            'auditable_id' => $auditable?->getKey(),
            'before' => $before !== null ? $this->redact($before) : null,
            'after' => $after !== null ? $this->redact($after) : null,
            'reason' => $reason,
            'ip' => $request?->ip(),
            'user_agent' => $request ? mb_substr((string) $request->userAgent(), 0, 500) : null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function redact(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_string($key) && in_array(strtolower($key), self::REDACTED, true)) {
                $data[$key] = '[masqué]';
            } elseif (is_array($value)) {
                $data[$key] = $this->redact($value);
            } elseif ($value instanceof \BackedEnum) {
                $data[$key] = $value->value;
            } elseif ($value instanceof \DateTimeInterface) {
                $data[$key] = $value->format(DATE_ATOM);
            }
        }

        return $data;
    }
}
