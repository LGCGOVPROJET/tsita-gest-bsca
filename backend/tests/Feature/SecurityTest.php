<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\AttachmentClassification;
use App\Enums\Visibility;
use App\Models\ProcessingEntity;
use App\Services\AttachmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class SecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        Storage::fake('attachments');
    }

    #[Test]
    public function les_en_tetes_de_securite_sont_presents(): void
    {
        $res = $this->getJson('/api/v1/public/referentials')->assertOk();
        $res->assertHeader('X-Content-Type-Options', 'nosniff');
        $res->assertHeader('X-Frame-Options', 'DENY');
        $res->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertStringContainsString("default-src 'none'", (string) $res->headers->get('Content-Security-Policy'));
    }

    #[Test]
    public function le_telechargement_est_controle_et_journalise(): void
    {
        $c = $this->makeComplaint(['processing_entity_id' => ProcessingEntity::query()->where('code', 'CARTES')->value('id')]);
        $pdf = "%PDF-1.4\n%%EOF\n";
        $att = app(AttachmentService::class)->store($c, UploadedFile::fake()->createWithContent('preuve.pdf', $pdf), AttachmentClassification::Client, Visibility::Client, $this->user('gestionnaire'));

        $this->actingAs($this->user('gestionnaire'));
        $res = $this->get("/api/v1/attachments/{$att->id}/download")->assertOk();
        $this->assertSame($pdf, $res->getContent());
        $this->assertDatabaseHas('audit_logs', ['action' => 'attachment.download', 'auditable_id' => $att->id]);

        $this->actingAs($this->user('direction'));
        $this->getJson("/api/v1/attachments/{$att->id}/download")->assertForbidden();
        $this->actingAs($this->user('a.oyo'));
        $this->getJson("/api/v1/attachments/{$att->id}/download")->assertForbidden();
    }

    #[Test]
    public function un_fichier_deguise_est_refuse(): void
    {
        $c = $this->makeComplaint(['processing_entity_id' => ProcessingEntity::query()->where('code', 'CARTES')->value('id')]);
        $this->actingAs($this->user('gestionnaire'));
        $fake = UploadedFile::fake()->createWithContent('facture.pdf', '<?php echo "x";');
        $this->post("/api/v1/complaints/{$c->id}/attachments", ['file' => $fake, 'classification' => 'client', 'visibility' => 'client'], ['Accept' => 'application/json'])
            ->assertStatus(422);
        $this->post("/api/v1/complaints/{$c->id}/attachments", [
            'file' => UploadedFile::fake()->createWithContent('note.pdf', "%PDF-1.4\n%%EOF\n"), 'classification' => 'confidentiel', 'visibility' => 'client',
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['visibility']);
    }

    #[Test]
    public function un_montant_absent_reste_null_et_differe_de_zero(): void
    {
        $this->actingAs($this->user('qualite'));
        $null = $this->makeComplaint(['amount' => null, 'currency' => null]);
        $zero = $this->makeComplaint(['amount' => '0.00', 'currency' => 'XAF']);
        $this->getJson("/api/v1/complaints/{$null->id}")->assertOk()->assertJsonPath('data.amount', null)->assertJsonPath('data.currency', null);
        $this->getJson("/api/v1/complaints/{$zero->id}")->assertOk()->assertJsonPath('data.amount', '0.00')->assertJsonPath('data.currency', 'XAF');
        $this->assertNull($null->refresh()->amount);
    }

    #[Test]
    public function l_export_est_journalise_avec_son_en_tete(): void
    {
        $this->makeComplaint();
        $this->actingAs($this->user('qualite'));
        $res = $this->get('/api/v1/complaints/export?format=csv&from=2020-01-01&to=2030-12-31')->assertOk();
        $body = $res->getContent();
        $this->assertStringContainsString('Période : 01/01/2020 → 31/12/2030', $body);
        $this->assertStringContainsString('Date de calcul', $body);
        $this->assertStringContainsString('Version de règle : DEMO-RF v1', $body);
        $this->assertStringContainsString('Utilisateur : ', $body);
        $this->assertDatabaseHas('exports', ['type' => 'reclamations', 'format' => 'csv', 'row_count' => 1]);
        $this->get('/api/v1/complaints/export?format=xlsx')->assertOk()->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->get('/api/v1/complaints/export?format=pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->get('/api/v1/reports/activity?format=csv')->assertOk();
    }
}
