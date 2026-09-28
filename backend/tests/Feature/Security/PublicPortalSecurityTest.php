<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Enums\AttachmentClassification;
use App\Enums\ComplaintStatus;
use App\Enums\ControlResult;
use App\Enums\MessageKind;
use App\Enums\Visibility;
use App\Models\Attachment;
use App\Models\Complaint;
use App\Models\Product;
use App\Services\AttachmentService;
use App\Services\ComplaintWorkflow;
use App\Services\FileScanner;
use App\Services\TrackingCodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Portail public (OWASP API2/API4) : force brute du code de suivi, énumération, fuite d'informations, upload.
 */
final class PublicPortalSecurityTest extends TestCase
{
    use RefreshDatabase;

    private Complaint $c;

    private const CODE = 'K7M4P9QX';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        Storage::fake('attachments');
        $this->c = $this->makeComplaint([], self::CODE);
    }

    private function track(string $code, ?string $ref = null, string $ip = '127.0.0.1'): TestResponse
    {
        // Le throttle de route (10/min/IP) est neutralisé ici pour tester le verrouillage applicatif.
        RateLimiter::clear(md5('public'.$ip));

        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/v1/public/track', ['reference' => $ref ?? $this->c->reference, 'tracking_code' => $code]);
    }

    #[Test]
    public function la_force_brute_du_code_verrouille_la_reference_de_facon_progressive(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->track('ZZZZ999'.$i, null, '10.0.0.'.($i + 1))->assertNotFound();
        }
        // Même avec le bon code et une autre IP : la référence est verrouillée (15 min).
        $locked = $this->track(self::CODE, null, '10.0.1.1')->assertStatus(429);
        $this->assertGreaterThan(0, (int) $locked->headers->get('Retry-After'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'public.track_locked']);

        $this->travel(16)->minutes();
        $this->track(self::CODE, null, '10.0.1.2')->assertOk();

        // Récidive : verrouillage doublé (30 min).
        for ($i = 0; $i < 5; $i++) {
            $this->track('YYYY888'.$i, null, '10.0.2.'.($i + 1))->assertNotFound();
        }
        $this->travel(16)->minutes();
        $this->track(self::CODE, null, '10.0.3.1')->assertStatus(429);
        $this->travel(15)->minutes();
        $this->track(self::CODE, null, '10.0.3.2')->assertOk();
    }

    #[Test]
    public function le_verrouillage_s_applique_aussi_aux_actions_message_piece_reouverture(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->track('ZZZZ999'.$i)->assertNotFound();
        }
        RateLimiter::clear(md5('public127.0.0.1'));
        $this->postJson('/api/v1/public/track/messages', ['reference' => $this->c->reference, 'tracking_code' => self::CODE, 'body' => 'x'])->assertStatus(429);
        $this->postJson('/api/v1/public/track/reopen', ['reference' => $this->c->reference, 'tracking_code' => self::CODE, 'reason' => 'contestation de la réponse'])->assertStatus(429);
    }

    #[Test]
    public function une_ip_qui_multiplie_les_echecs_sur_plusieurs_references_est_bloquee(): void
    {
        config()->set('security.tracking.max_failures_per_ip', 6);
        for ($i = 0; $i < 6; $i++) {
            $this->track('ZZZZ9999', sprintf('TG-BSCA-2026-%06d', 900000 + $i), '10.5.5.5')->assertNotFound();
        }
        $this->track(self::CODE, null, '10.5.5.5')->assertStatus(429);
        $this->assertDatabaseHas('audit_logs', ['action' => 'public.track_ip_blocked']);
        $this->track(self::CODE, null, '10.5.5.6')->assertOk();
    }

    #[Test]
    public function reference_inconnue_et_code_faux_sont_indistinguables(): void
    {
        $a = $this->track('ZZZZ9999')->assertNotFound()->json();
        $b = $this->track(self::CODE, 'TG-BSCA-2026-999999')->assertNotFound()->json();
        $this->assertSame($a, $b);

        // Verrouillage identique pour une référence inexistante (pas d'oracle d'existence).
        for ($i = 0; $i < 5; $i++) {
            $this->track('ZZZZ999'.$i, null, '10.7.0.'.($i + 1));
            $this->track('ZZZZ999'.$i, 'TG-BSCA-2026-888888', '10.8.0.'.($i + 1));
        }
        $lockReal = $this->track('ZZZZ9999', null, '10.7.1.1')->assertStatus(429)->json();
        $lockGhost = $this->track('ZZZZ9999', 'TG-BSCA-2026-888888', '10.8.1.1')->assertStatus(429)->json();
        $this->assertSame($lockReal, $lockGhost);
    }

    #[Test]
    public function le_temps_de_reponse_est_uniformise_par_un_hachage_factice(): void
    {
        $service = app(TrackingCodeService::class);
        $service->resolve('TG-BSCA-2026-999998', 'ZZZZ9999'); // amorce l'empreinte factice en cache
        Hash::spy();
        $service->resolve('TG-BSCA-2026-999999', 'ZZZZ9999');
        Hash::shouldHaveReceived('check')->once();
    }

    #[Test]
    public function un_dossier_repris_sans_code_n_est_jamais_accessible(): void
    {
        $this->c->forceFill(['tracking_code_hash' => '!import-sans-code'])->save();
        $this->track('!import-sans-code')->assertStatus(422);
        $this->track(self::CODE)->assertNotFound();
    }

    #[Test]
    public function la_vue_client_n_expose_aucune_donnee_interne(): void
    {
        $gest = $this->user('gestionnaire');
        $wf = app(ComplaintWorkflow::class);
        $this->c->forceFill(['owner_id' => $gest->id, 'status' => ComplaintStatus::EnInvestigation])->save();
        $wf->addMessage($this->c, MessageKind::InternalNote, 'NOTE-INTERNE-42', null, $gest);
        $wf->addMessage($this->c, MessageKind::ClientMessage, 'Pouvez-vous préciser la date ?', 'courriel', $gest);
        $wf->addControl($this->c->refresh(), ControlResult::NonConforme, 'AVIS-CONTROLE-99', $this->user('qualite'));
        app(AttachmentService::class)->store($this->c, UploadedFile::fake()->createWithContent('rapport-fraude.pdf', "%PDF-1.4\n%%EOF\n"), AttachmentClassification::Interne, Visibility::Internal, $gest);
        app(AttachmentService::class)->store($this->c, UploadedFile::fake()->createWithContent('courrier-bsca.pdf', "%PDF-1.4\n%%EOF\n"), AttachmentClassification::Client, Visibility::Client, $gest);

        $view = $this->track(self::CODE)->assertOk()->json('data');
        $json = (string) json_encode($view, JSON_UNESCAPED_UNICODE);
        foreach (['NOTE-INTERNE-42', 'AVIS-CONTROLE-99', 'rapport-fraude', $gest->name, $gest->email, 'en_investigation', 'Jean Moukala', 'jean@exemple.invalid', 'sha256', 'stored_path'] as $secret) {
            $this->assertStringNotContainsString($secret, $json, "Fuite : {$secret}");
        }
        // Aucun identifiant interne, auteur, acteur ou propriétaire, à aucun niveau.
        $keys = [];
        $walk = function (array $a) use (&$walk, &$keys): void {
            foreach ($a as $k => $v) {
                $keys[] = $k;
                if (is_array($v)) {
                    $walk($v);
                }
            }
        };
        $walk($view);
        foreach (['id', 'author', 'actor', 'owner', 'owner_id', 'status', 'visibility', 'reason', 'classification', 'customer'] as $forbidden) {
            $this->assertNotContains($forbidden, $keys, "Clé interne exposée : {$forbidden}");
        }
        $this->assertSame('bsca', $view['messages'][0]['from']);
        $this->assertContains('courrier-bsca.pdf', array_column($view['documents'], 'name'));
    }

    // ------------------------------------------------------------------ Upload

    private function upload(UploadedFile $file): TestResponse
    {
        RateLimiter::clear(md5('public127.0.0.1'));

        return $this->post('/api/v1/public/track/attachments', ['reference' => $this->c->reference, 'tracking_code' => self::CODE, 'file' => $file], ['Accept' => 'application/json']);
    }

    #[Test]
    public function les_fichiers_actifs_deguises_ou_polyglottes_sont_refuses(): void
    {
        $png = "\x89PNG\r\n\x1A\n".str_repeat("\0", 32);
        $jpeg = "\xFF\xD8\xFF\xE0".str_repeat("\0", 32);
        $cases = [
            'svg renommé png' => UploadedFile::fake()->createWithContent('logo.png', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
            'html renommé pdf' => UploadedFile::fake()->createWithContent('releve.pdf', '<html><script>alert(1)</script></html>'),
            'svg déclaré' => UploadedFile::fake()->createWithContent('image.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
            'php renommé jpg' => UploadedFile::fake()->createWithContent('photo.jpg', '<?php system($_GET["c"]); ?>'),
            'jpeg polyglotte html' => UploadedFile::fake()->createWithContent('photo.jpg', $jpeg.'<script>alert(document.cookie)</script>'),
            'png polyglotte php' => UploadedFile::fake()->createWithContent('scan.png', $png.'<?php echo 1; ?>'),
            'pdf javascript' => UploadedFile::fake()->createWithContent('a.pdf', "%PDF-1.4\n1 0 obj<</OpenAction<</S/JavaScript/JS(app.alert(1))>>>>endobj\n%%EOF"),
            'pdf javascript obfusqué' => UploadedFile::fake()->createWithContent('b.pdf', "%PDF-1.4\n1 0 obj<</OpenAction<</S/J#61vaScript/J#53(app.alert(1))>>>>endobj\n%%EOF"),
            'pdf launch' => UploadedFile::fake()->createWithContent('c.pdf', "%PDF-1.4\n1 0 obj<</A<</S/Launch/F(cmd.exe)>>>>endobj\n%%EOF"),
            'pdf fichier incorporé' => UploadedFile::fake()->createWithContent('d.pdf', "%PDF-1.4\n1 0 obj<</Type/EmbeddedFile>>endobj\n%%EOF"),
            'extension incohérente' => UploadedFile::fake()->createWithContent('facture.png', "%PDF-1.4\n%%EOF\n"),
            'exécutable' => UploadedFile::fake()->createWithContent('facture.pdf', "MZ\x90\x00binaire"),
        ];
        foreach ($cases as $label => $file) {
            $this->assertSame(422, $this->upload($file)->status(), "Devait être refusé : {$label}");
        }
        $this->assertSame(0, Attachment::query()->where('complaint_id', $this->c->id)->count());
        $this->assertTrue(FileScanner::hasActivePdfContent('/J#61vaScript'));
        $this->assertFalse(FileScanner::hasActivePdfContent('/Type/Page/Contents 4 0 R'));
    }

    #[Test]
    public function la_taille_le_nombre_et_le_nom_des_fichiers_sont_controles(): void
    {
        // Taille > 10 Mo.
        $this->upload(UploadedFile::fake()->create('gros.pdf', 10241, 'application/pdf'))->assertStatus(422);

        // Nom avec traversée de répertoire : conservé assaini pour l'affichage, jamais utilisé comme chemin.
        $this->upload(UploadedFile::fake()->createWithContent('../../../etc/passwd<x>.pdf', "%PDF-1.4\n%%EOF\n"))->assertCreated();
        $att = Attachment::query()->where('complaint_id', $this->c->id)->latest('id')->firstOrFail();
        $this->assertStringNotContainsString('/', $att->original_name);
        $this->assertStringNotContainsString('<', $att->original_name);
        $this->assertMatchesRegularExpression('#^\d{4}/\d{2}/[A-Za-z0-9]{40}\.enc$#', $att->stored_path);

        // 20 documents client maximum par dossier.
        for ($i = Attachment::query()->where('complaint_id', $this->c->id)->count(); $i < 20; $i++) {
            Attachment::query()->create([
                'complaint_id' => $this->c->id, 'uploaded_by_client' => true, 'original_name' => "doc{$i}.pdf", 'stored_path' => "x/{$i}.enc",
                'mime' => 'application/pdf', 'size' => 10, 'sha256' => str_repeat('a', 64), 'classification' => 'client', 'visibility' => 'client', 'scan_status' => 'sain',
            ]);
        }
        $this->upload(UploadedFile::fake()->createWithContent('21.pdf', "%PDF-1.4\n%%EOF\n"))->assertStatus(422)->assertJsonValidationErrors(['file']);

        // Dépôt : 5 pièces maximum.
        $files = array_map(fn ($i) => UploadedFile::fake()->createWithContent("p{$i}.pdf", "%PDF-1.4\n%%EOF\n"), range(1, 6));
        $this->post('/api/v1/public/complaints', [
            'full_name' => 'Test Fictif', 'email' => 't@exemple.invalid', 'product_id' => Product::query()->value('id'),
            'subject' => 'Sujet test', 'description' => 'Description de test suffisante', 'preferred_channel' => 'courriel', 'consent' => '1',
            'attachments' => $files,
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['attachments']);
    }
}
