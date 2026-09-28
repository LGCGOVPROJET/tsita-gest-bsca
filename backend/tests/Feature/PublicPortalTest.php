<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\AttachmentClassification;
use App\Enums\ComplaintStatus;
use App\Enums\MessageKind;
use App\Enums\Visibility;
use App\Models\Complaint;
use App\Models\Product;
use App\Services\AttachmentService;
use App\Services\ComplaintWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class PublicPortalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        Storage::fake('attachments');
    }

    private function pdf(string $name = 'releve.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    }

    /** @return array{reference: string, tracking_code: string} */
    private function deposit(): array
    {
        $response = $this->post('/api/v1/public/complaints', [
            'full_name' => 'Aimée Samba',
            'email' => 'aimee@exemple.invalid',
            'product_id' => Product::query()->where('code', 'CARTE_VISA')->value('id'),
            'subject' => 'Paiement par carte contesté',
            'description' => 'Je ne reconnais pas un paiement de 25 000 XAF.',
            'amount' => '25000',
            'currency' => 'XAF',
            'preferred_channel' => 'email',
            'consent' => '1',
            'attachments' => [$this->pdf()],
        ], ['Accept' => 'application/json']);
        $response->assertCreated()->assertJsonStructure(['data' => ['reference', 'tracking_code', 'received_at', 'acknowledgment_due_at', 'final_response_due_at', 'rule_is_demo']]);

        return $response->json('data');
    }

    #[Test]
    public function le_depot_public_cree_un_dossier_avec_code_hache(): void
    {
        $data = $this->deposit();
        $this->assertMatchesRegularExpression('/^TG-BSCA-\d{4}-\d{6}$/', $data['reference']);
        $this->assertMatchesRegularExpression('/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/', $data['tracking_code']);
        $this->assertTrue($data['rule_is_demo']);
        $c = Complaint::query()->where('reference', $data['reference'])->firstOrFail();
        $this->assertNotSame($data['tracking_code'], $c->tracking_code_hash);
        $this->assertStringStartsWith('$2y$', $c->tracking_code_hash);
        $this->assertSame('25000.00', (string) $c->amount);
        $att = $c->attachments()->first();
        $this->assertSame('application/pdf', $att->mime);
        $this->assertSame(64, strlen($att->sha256));
        // Contenu chiffré sur disque, nom aléatoire.
        $stored = Storage::disk('attachments')->get($att->stored_path);
        $this->assertStringNotContainsString('%PDF', $stored);
        $this->assertStringNotContainsString('releve', $att->stored_path);
    }

    #[Test]
    public function le_suivi_n_expose_ni_note_interne_ni_piece_interne(): void
    {
        $data = $this->deposit();
        $c = Complaint::query()->where('reference', $data['reference'])->firstOrFail();
        $gest = $this->user('gestionnaire');
        $wf = app(ComplaintWorkflow::class);
        $wf->addMessage($c, MessageKind::InternalNote, 'NOTE-SECRETE : fraude suspectée', null, $gest);
        $wf->addMessage($c, MessageKind::ClientMessage, 'Merci de fournir votre relevé.', 'courriel', $gest);
        app(AttachmentService::class)->store($c, $this->pdf('analyse-interne.pdf'), AttachmentClassification::Confidentiel, Visibility::Internal, $gest);
        $c->forceFill(['owner_id' => $gest->id])->save();
        $wf->transition($c->refresh(), ComplaintStatus::AQualifier, 'Motif interne confidentiel XYZ', $gest);

        $view = $this->postJson('/api/v1/public/track', ['reference' => $data['reference'], 'tracking_code' => $data['tracking_code']])
            ->assertOk()->json('data');
        $json = json_encode($view, JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('NOTE-SECRETE', $json);
        $this->assertStringNotContainsString('analyse-interne', $json);
        $this->assertStringNotContainsString('Motif interne confidentiel', $json);
        $this->assertStringNotContainsString($gest->name, $json);
        $this->assertStringNotContainsString('a_qualifier', $json);
        $this->assertSame('recue', $view['client_status']);
        $this->assertSame('Reçue', $view['client_status_label']);
        $this->assertSame(['releve.pdf'], array_column($view['documents'], 'name'));
        $this->assertSame(['Merci de fournir votre relevé.'], array_column($view['messages'], 'body'));
        $this->assertSame(['reference', 'subject', 'category_label', 'product_label', 'client_status', 'client_status_label', 'received_at', 'last_update_at', 'next_step', 'can_reopen', 'final_response', 'timeline', 'messages', 'documents'], array_keys($view));
    }

    #[Test]
    public function un_mauvais_code_de_suivi_renvoie_un_404_neutre(): void
    {
        $data = $this->deposit();
        $wrong = $this->postJson('/api/v1/public/track', ['reference' => $data['reference'], 'tracking_code' => 'ZZZZ9999'])->assertNotFound();
        $unknown = $this->postJson('/api/v1/public/track', ['reference' => 'TG-BSCA-2026-999999', 'tracking_code' => $data['tracking_code']])->assertNotFound();
        $this->assertSame($wrong->json(), $unknown->json());
        $this->assertSame('Dossier introuvable ou code de suivi invalide.', $wrong->json('message'));
    }

    #[Test]
    public function le_client_peut_ecrire_et_transmettre_un_document(): void
    {
        $data = $this->deposit();
        $this->postJson('/api/v1/public/track/messages', $data + ['body' => 'Voici des précisions.'])->assertCreated();
        $this->post('/api/v1/public/track/attachments', $data + ['file' => $this->pdf('complement.pdf')], ['Accept' => 'application/json'])->assertCreated();
        $view = $this->postJson('/api/v1/public/track', $data)->json('data');
        $this->assertContains('Voici des précisions.', array_column($view['messages'], 'body'));
        $this->assertContains('complement.pdf', array_column($view['documents'], 'name'));
    }

    #[Test]
    public function le_depot_refuse_sans_consentement_et_fichier_non_autorise(): void
    {
        $this->post('/api/v1/public/complaints', [
            'full_name' => 'X', 'email' => 'pas-un-email', 'subject' => 'a', 'description' => 'court',
            'preferred_channel' => 'fax',
            'attachments' => [UploadedFile::fake()->createWithContent('script.exe', 'MZ binaire')],
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['consent', 'email', 'product_id', 'preferred_channel', 'attachments.0']);
    }

    #[Test]
    public function la_reouverture_publique_cree_un_dossier_enfant(): void
    {
        $data = $this->deposit();
        Complaint::query()->where('reference', $data['reference'])->update(['status' => 'reponse_envoyee', 'final_response_at' => now()]);
        $child = $this->postJson('/api/v1/public/track/reopen', $data + ['reason' => 'Je conteste la réponse reçue.'])->assertCreated()->json('data');
        $this->assertNotSame($data['reference'], $child['reference']);
        $this->assertSame($data['reference'], $child['parent_reference']);
        $this->assertSame('reouvert', Complaint::query()->where('reference', $child['reference'])->value('status')->value);
    }

    #[Test]
    public function la_date_d_operation_du_jour_est_acceptee_au_fuseau_de_brazzaville(): void
    {
        // 00:30 à Brazzaville = 23:30 UTC la veille : « aujourd'hui » local doit être accepté.
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-09-28 23:30:00', 'UTC'));
        $payload = [
            'full_name' => 'Aimée Samba',
            'email' => 'aimee@exemple.invalid',
            'product_id' => Product::query()->where('code', 'CARTE_VISA')->value('id'),
            'subject' => 'Paiement par carte contesté',
            'description' => 'Je ne reconnais pas un paiement de 25 000 XAF.',
            'operation_date' => '2026-09-29',
            'preferred_channel' => 'courriel',
            'consent' => '1',
        ];
        $this->postJson('/api/v1/public/complaints', $payload)->assertCreated();

        // Le lendemain local reste refusé.
        $this->postJson('/api/v1/public/complaints', ['operation_date' => '2026-09-30'] + $payload)
            ->assertStatus(422)->assertJsonValidationErrors('operation_date');
    }

    #[Test]
    public function le_portail_est_limite_a_dix_requetes_par_minute(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->getJson('/api/v1/public/referentials')->assertOk();
        }
        $response = $this->getJson('/api/v1/public/referentials')->assertStatus(429);
        $this->assertGreaterThan(0, (int) $response->headers->get('Retry-After'));
    }
}
