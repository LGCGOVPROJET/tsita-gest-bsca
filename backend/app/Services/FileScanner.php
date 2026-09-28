<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\ScanStatus;

/**
 * Contrôle de base des fichiers entrants (signature binaire, contenus actifs PDF).
 * N'est PAS un antivirus : l'intégration d'un moteur (ClamAV, ICAP…) reste à décider avec BSCA.
 */
final class FileScanner
{
    public const ALLOWED = [
        'application/pdf' => ['pdf'],
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
    ];

    public function detectMime(string $content): string
    {
        $finfo = new \finfo(FILEINFO_MIME_TYPE);

        return (string) $finfo->buffer($content);
    }

    public function scan(string $content, string $mime): ScanStatus
    {
        $signatureOk = match ($mime) {
            'application/pdf' => str_starts_with($content, '%PDF-'),
            'image/jpeg' => str_starts_with($content, "\xFF\xD8\xFF"),
            'image/png' => str_starts_with($content, "\x89PNG\r\n\x1A\n"),
            default => false,
        };
        if (! $signatureOk) {
            return ScanStatus::Rejete;
        }
        if ($mime === 'application/pdf' && self::hasActivePdfContent($content)) {
            return ScanStatus::Rejete;
        }
        // Polyglottes : une image ou un PDF ne contient jamais de balisage actif ni de code serveur.
        if (preg_match('#<\?php|<script[\s>/]|<html[\s>]|<svg[\s>]|<iframe[\s>]#i', $content) === 1) {
            return ScanStatus::Rejete;
        }

        return ScanStatus::Sain;
    }

    /**
     * Contenus actifs PDF, y compris les noms obfusqués par échappement hexadécimal (#4A = « J »).
     * Les flux compressés (/ObjStm) ne sont pas décompressés : l'antivirus (ClamAV) reste nécessaire.
     */
    public static function hasActivePdfContent(string $content): bool
    {
        $normalized = (string) preg_replace_callback(
            '#/[^\s/<>\[\]()]+#',
            static fn (array $m): string => (string) preg_replace_callback('/#([0-9A-Fa-f]{2})/', static fn (array $h): string => chr((int) hexdec($h[1])), $m[0]),
            $content,
        );

        return preg_match('#/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|SubmitForm|ImportData|GoToE)\b#', $normalized) === 1;
    }
}
