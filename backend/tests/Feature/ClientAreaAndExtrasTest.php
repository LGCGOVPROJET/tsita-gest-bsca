<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\ComplaintStatus;
use App\Models\Complaint;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class ClientAreaAndExtrasTest extends TestCase
{
    use RefreshDatabase;

    private Complaint $own;

    private Complaint $foreign;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        Storage::fake('attachments');
        $customerId = $this->user('client')->customer_id;
        $this->own = $this->makeComplaint(['customer_id' => $customerId, 'status' => ComplaintStatus::ReponseEnvoyee, 'final_response_at' => now()->subDay()]);
        $this->foreign = $this->makeComplaint();
    }

    #[Test]
    public function le_client_connecte_agit_sur_ses_seuls_dossiers(): void
    {
        $this->actingAs($this->user('client'));
        $ref = $this->own->reference;
        $this->getJson('/api/v1/client/complaints')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.reference', $ref);
        $this->getJson("/api/v1/client/complaints/{$this->foreign->reference}")->assertNotFound();

        $this->postJson("/api/v1/client/complaints/{$ref}/messages", ['body' => 'Question complémentaire.'])->assertCreated()
            ->assertJsonPath('data.messages.0.from', 'client');
        $this->post("/api/v1/client/complaints/{$ref}/attachments", ['file' => UploadedFile::fake()->createWithContent('piece.pdf', "%PDF-1.4\n%%EOF\n")], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.documents.0.name', 'piece.pdf');
        $this->postJson("/api/v1/client/complaints/{$this->foreign->reference}/messages", ['body' => 'Intrusion'])->assertNotFound();

        $child = $this->postJson("/api/v1/client/complaints/{$ref}/reopen", ['reason' => 'Je conteste la réponse apportée.'])->assertCreated()->json('data');
        $this->assertSame($ref, $child['parent_reference']);
        $this->assertSame(ComplaintStatus::ReponseEnvoyee, $this->own->refresh()->status);
    }

    #[Test]
    public function la_recherche_client_est_limitee_masquee_et_journalisee(): void
    {
        Customer::query()->create(['full_name' => 'Nadège Loubaki', 'email' => 'nadege@exemple.invalid', 'phone' => '+242 06 123 45 67', 'customer_number' => 'FICT-123456', 'preferred_channel' => 'courriel']);
        $this->actingAs($this->user('accueil'));
        $res = $this->getJson('/api/v1/customers?search=Loubaki')->assertOk()->json('data');
        $this->assertSame('Nadège Loubaki', $res[0]['full_name']);
        $this->assertSame('•••••••3456', $res[0]['customer_number_masked']);
        $this->assertArrayNotHasKey('customer_number', $res[0]);
        $this->assertCount(1, $this->getJson('/api/v1/customers?search=1234567')->json('data'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'customer.search']);

        $this->actingAs($this->user('direction'));
        $this->getJson('/api/v1/customers?search=Loubaki')->assertForbidden();
    }

    #[Test]
    public function la_conformite_valide_un_rapport(): void
    {
        $this->actingAs($this->user('qualite'));
        $this->postJson('/api/v1/reports/activity/validate', ['from' => '2026-01-01', 'to' => '2026-06-30'])->assertForbidden();

        $this->actingAs($this->user('conformite'));
        $this->getJson('/api/v1/reports/activity?from=2026-01-01&to=2026-06-30')->assertOk()->assertJsonPath('data.validated_by', null);
        $val = $this->postJson('/api/v1/reports/activity/validate', ['from' => '2026-01-01', 'to' => '2026-06-30', 'comment' => 'Rapprochement vérifié'])
            ->assertCreated()->json('data');
        $this->assertStringContainsString('DEMO-RF', $val['rule_version']);
        $report = $this->getJson('/api/v1/reports/activity?from=2026-01-01&to=2026-06-30')->assertOk()->json('data');
        $this->assertSame($this->user('conformite')->id, $report['validated_by']['id']);
        $this->assertNotNull($report['validated_at']);
        // Autre périmètre → pas de validation.
        $this->getJson('/api/v1/reports/activity?from=2026-01-01&to=2026-06-30&channel=portail')->assertJsonPath('data.validated_by', null);
    }

    #[Test]
    public function les_solutions_se_filtrent_par_liste_de_statuts(): void
    {
        $this->actingAs($this->user('responsable'));
        $this->getJson('/api/v1/solutions?status=soumise,approuvee_n1')->assertOk();
        $this->getJson('/api/v1/solutions?status=soumise,inconnu')->assertStatus(422);
    }

    #[Test]
    public function les_canaux_de_reponse_utilisent_les_codes_reels(): void
    {
        $this->getJson('/api/v1/public/referentials')->assertOk()->assertJsonPath('channels_reply', ['courriel', 'courrier', 'telephone']);
    }
}
