<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\AttachmentClassification;
use App\Enums\EventType;
use App\Enums\ScanStatus;
use App\Enums\Visibility;
use App\Exceptions\BusinessRuleException;
use App\Models\Attachment;
use App\Models\Complaint;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Pièces jointes : disque privé, contenu chiffré, nom aléatoire, MIME réel, empreinte SHA-256.
 */
final class AttachmentService
{
    public const MAX_BYTES = 10 * 1024 * 1024;

    public function __construct(
        private readonly FileScanner $scanner,
        private readonly AuditLogger $audit,
        private readonly ComplaintWorkflow $workflow,
    ) {}

    public function store(
        Complaint $complaint,
        UploadedFile $file,
        AttachmentClassification $classification,
        Visibility $visibility,
        ?User $uploader,
        bool $byClient = false,
    ): Attachment {
        $content = (string) file_get_contents($file->getRealPath());
        if ($content === '' || strlen($content) > self::MAX_BYTES) {
            throw BusinessRuleException::field('file', 'Le fichier est vide ou dépasse 10 Mo.');
        }
        $mime = $this->scanner->detectMime($content);
        $extension = strtolower($file->getClientOriginalExtension());
        if (! isset(FileScanner::ALLOWED[$mime]) || ! in_array($extension, FileScanner::ALLOWED[$mime], true)) {
            throw BusinessRuleException::field('file', 'Type de fichier non autorisé (PDF, JPG ou PNG uniquement).');
        }
        $scan = $this->scanner->scan($content, $mime);
        if ($scan === ScanStatus::Rejete) {
            throw BusinessRuleException::field('file', 'Le fichier a été refusé par le contrôle de sécurité.');
        }

        $path = now()->format('Y/m').'/'.Str::random(40).'.enc';
        Storage::disk('attachments')->put($path, Crypt::encryptString($content));

        $attachment = Attachment::query()->create([
            'complaint_id' => $complaint->id,
            'uploaded_by' => $uploader?->id,
            'uploaded_by_client' => $byClient,
            'original_name' => $this->sanitizeName($file->getClientOriginalName(), $extension),
            'stored_path' => $path,
            'mime' => $mime,
            'size' => strlen($content),
            'sha256' => hash('sha256', $content),
            'classification' => $classification,
            'visibility' => $visibility,
            'scan_status' => $scan,
        ]);

        $this->workflow->event(
            $complaint,
            EventType::Attachment,
            $byClient ? 'Document transmis par le client' : 'Pièce jointe ajoutée',
            $visibility === Visibility::Client ? $attachment->original_name : 'Pièce '.$classification->label().' : '.$attachment->original_name,
            $visibility,
            $uploader,
        );
        $this->audit->log('attachment.upload', $attachment, null, [
            'complaint' => $complaint->reference, 'name' => $attachment->original_name, 'sha256' => $attachment->sha256,
            'classification' => $classification->value, 'visibility' => $visibility->value,
        ], null, $uploader);

        return $attachment;
    }

    public function read(Attachment $attachment): string
    {
        return Crypt::decryptString(Storage::disk('attachments')->get($attachment->stored_path) ?? '');
    }

    /** Nom d'origine assaini (affichage uniquement ; jamais utilisé comme chemin). */
    private function sanitizeName(string $name, string $extension): string
    {
        $base = pathinfo($name, PATHINFO_FILENAME);
        $base = preg_replace('/[^\p{L}\p{N}\s._-]+/u', '_', $base) ?? 'document';
        $base = trim(mb_substr($base, 0, 150)) ?: 'document';

        return $base.'.'.$extension;
    }
}
