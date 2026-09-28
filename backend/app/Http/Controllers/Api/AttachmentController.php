<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Services\AttachmentService;
use App\Services\AuditLogger;
use Symfony\Component\HttpFoundation\Response;

final class AttachmentController extends Controller
{
    public function download(Attachment $attachment, AttachmentService $service, AuditLogger $audit): Response
    {
        $this->authorize('download', $attachment);
        $content = $service->read($attachment);
        if (! hash_equals($attachment->sha256, hash('sha256', $content))) {
            $audit->log('attachment.integrity_failure', $attachment);

            return response()->json(['message' => 'Intégrité du fichier non vérifiée : téléchargement refusé.'], 409);
        }
        $audit->log('attachment.download', $attachment, null, ['complaint_id' => $attachment->complaint_id, 'sha256' => $attachment->sha256]);

        $fallback = preg_replace('/[^A-Za-z0-9._-]/', '_', $attachment->original_name) ?: 'document';

        return response($content, 200, [
            'Content-Type' => $attachment->mime,
            'Content-Length' => (string) strlen($content),
            'Content-Disposition' => 'attachment; filename="'.$fallback.'"; filename*=UTF-8\'\''.rawurlencode($attachment->original_name),
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
