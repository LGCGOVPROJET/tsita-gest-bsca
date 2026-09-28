<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Enums\AttachmentClassification;
use App\Enums\ComplaintStatus;
use App\Enums\Visibility;
use App\Models\Agency;
use App\Models\Attachment;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\ProcessingEntity;
use App\Models\Solution;
use App\Models\Task;
use App\Models\User;
use App\Services\AttachmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * OWASP API1 (BOLA) / API5 (BFLA) : rôle + périmètre (§4) vérifiés route par route.
 * Dossier A : agence BZV-CTR, entité CARTES, client de démonstration (client@bsca.demo).
 * Dossier B : agence PNR-CTR, entité CREDITS, autre client.
 */
final class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Complaint $a;

    private Complaint $b;

    private Attachment $attB;

    private Attachment $confidentialA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        Storage::fake('attachments');

        $clientCustomer = $this->user('client')->customer_id;
        $other = Customer::query()->create(['full_name' => 'Paul Tchicaya', 'email' => 'paul@exemple.invalid', 'preferred_channel' => 'courriel']);
        $this->a = $this->makeComplaint([
            'receiving_agency_id' => Agency::query()->where('code', 'BZV-CTR')->value('id'),
            'processing_entity_id' => ProcessingEntity::query()->where('code', 'CARTES')->value('id'),
            'customer_id' => $clientCustomer,
            'status' => ComplaintStatus::EnInvestigation,
            'owner_id' => $this->user('gestionnaire')->id,
        ]);
        $this->b = $this->makeComplaint([
            'receiving_agency_id' => Agency::query()->where('code', 'PNR-CTR')->value('id'),
            'processing_entity_id' => ProcessingEntity::query()->where('code', 'CREDITS')->value('id'),
            'customer_id' => $other->id,
            'status' => ComplaintStatus::EnInvestigation,
        ]);
        $pdf = fn (string $n) => UploadedFile::fake()->createWithContent($n, "%PDF-1.4\n%%EOF\n");
        $svc = app(AttachmentService::class);
        $this->attB = $svc->store($this->b, $pdf('b.pdf'), AttachmentClassification::Client, Visibility::Client, $this->user('g.credits1'));
        $this->confidentialA = $svc->store($this->a, $pdf('secret.pdf'), AttachmentClassification::Confidentiel, Visibility::Internal, $this->user('responsable'));
    }

    /** @return array<string, array{0: string, 1: string, 2: array<string, mixed>}> */
    private function actionsOn(Complaint $c): array
    {
        return [
            'view' => ['GET', "/api/v1/complaints/{$c->id}", []],
            'qualify' => ['PATCH', "/api/v1/complaints/{$c->id}", ['priority' => 'haute', 'reason' => 'test']],
            'transition' => ['POST', "/api/v1/complaints/{$c->id}/transition", ['to_status' => 'attente_information', 'reason' => 'test']],
            'assign' => ['POST', "/api/v1/complaints/{$c->id}/assign", ['owner_id' => $this->user('g.cartes2')->id, 'reason' => 'test']],
            'message' => ['POST', "/api/v1/complaints/{$c->id}/messages", ['kind' => 'internal_note', 'body' => 'x']],
            'client_message' => ['POST', "/api/v1/complaints/{$c->id}/messages", ['kind' => 'client_message', 'body' => 'x']],
            'task' => ['POST', "/api/v1/complaints/{$c->id}/tasks", ['title' => 'Tâche test']],
            'solution' => ['POST', "/api/v1/complaints/{$c->id}/solutions", ['type' => 'explication_motivee', 'description' => 'Description suffisante', 'decision' => 'non_fondee']],
            'send_response' => ['POST', "/api/v1/complaints/{$c->id}/send-response", ['body' => 'Réponse définitive test', 'channel' => 'courriel']],
            'reopen' => ['POST', "/api/v1/complaints/{$c->id}/reopen", ['reason' => 'test réouverture']],
            'control' => ['POST', "/api/v1/complaints/{$c->id}/controls", ['result' => 'conforme', 'findings' => 'ok']],
            'duplicate' => ['POST', "/api/v1/complaints/{$c->id}/mark-duplicate", ['duplicate_of_id' => $this->a->id, 'reason' => 'test']],
        ];
    }

    private function assertAllForbidden(string $who, Complaint $c): void
    {
        $this->actingAs($this->user($who));
        foreach ($this->actionsOn($c) as $name => [$method, $uri, $body]) {
            $status = $this->json($method, $uri, $body)->status();
            $this->assertSame(403, $status, "{$who} → {$name} sur {$c->reference} devrait être refusé (403), reçu {$status}.");
        }
        $this->assertSame(403, $this->getJson("/api/v1/attachments/{$this->attB->id}/download")->status());
    }

    #[Test]
    public function un_agent_d_une_autre_agence_est_refuse_sur_toutes_les_actions(): void
    {
        $this->assertAllForbidden('a.oyo', $this->b);
        $this->assertNotContains($this->b->id, array_column($this->getJson('/api/v1/complaints?per_page=100')->json('data'), 'id'));
    }

    #[Test]
    public function un_gestionnaire_d_une_autre_entite_est_refuse_sur_toutes_les_actions(): void
    {
        $this->assertAllForbidden('gestionnaire', $this->b);
        $this->assertNotContains($this->b->id, array_column($this->getJson('/api/v1/complaints?per_page=100')->json('data'), 'id'));
        // Même via l'export ou la recherche.
        $csv = $this->get('/api/v1/complaints/export?format=csv')->assertOk()->getContent();
        $this->assertStringNotContainsString($this->b->reference, (string) $csv);
        $this->assertStringContainsString($this->a->reference, (string) $csv);
    }

    #[Test]
    public function l_administrateur_ne_traite_aucun_dossier(): void
    {
        $this->assertAllForbidden('admin', $this->a);
        $this->actingAs($this->user('admin'));
        foreach (['/api/v1/complaints', '/api/v1/solutions', '/api/v1/dashboard', '/api/v1/deadlines', '/api/v1/reports/activity', '/api/v1/complaints/export', '/api/v1/customers?search=Paul'] as $uri) {
            $this->assertSame(403, $this->getJson($uri)->status(), $uri);
        }
        $this->getJson("/api/v1/attachments/{$this->confidentialA->id}/download")->assertForbidden();
    }

    #[Test]
    public function la_direction_ne_voit_ni_pieces_ni_noms_ni_actions(): void
    {
        $this->actingAs($this->user('direction'));
        $detail = $this->getJson("/api/v1/complaints/{$this->b->id}")->assertOk()->json('data');
        $this->assertSame('P. T***', $detail['customer']['full_name']);
        $this->assertNull($detail['customer']['phone']);
        $this->assertSame([], $detail['attachments']);
        $this->assertSame([], $detail['messages']);
        $this->assertSame([], $detail['audit']);
        $this->getJson("/api/v1/attachments/{$this->attB->id}/download")->assertForbidden();
        $this->getJson('/api/v1/complaints/export?format=csv')->assertForbidden();
        $this->getJson('/api/v1/customers?search=Paul')->assertForbidden();
        foreach ($this->actionsOn($this->b) as $name => [$method, $uri, $body]) {
            if ($name === 'view') {
                continue;
            }
            $this->assertSame(403, $this->json($method, $uri, $body)->status(), "direction → {$name}");
        }
        $this->assertCount(0, $this->getJson('/api/v1/complaints?search=Tchicaya')->json('data'));
    }

    #[Test]
    public function le_client_n_accede_qu_a_ses_dossiers_par_reference(): void
    {
        $this->actingAs($this->user('client'));
        $this->getJson("/api/v1/client/complaints/{$this->a->reference}")->assertOk();
        $this->getJson("/api/v1/client/complaints/{$this->b->reference}")->assertNotFound();
        $this->postJson("/api/v1/client/complaints/{$this->b->reference}/messages", ['body' => 'intrusion'])->assertNotFound();
        $this->postJson("/api/v1/client/complaints/{$this->b->reference}/reopen", ['reason' => 'intrusion tentée'])->assertNotFound();
        $this->post("/api/v1/client/complaints/{$this->b->reference}/attachments", [
            'file' => UploadedFile::fake()->createWithContent('x.pdf', "%PDF-1.4\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertNotFound();
        $refs = array_column($this->getJson('/api/v1/client/complaints')->json('data'), 'reference');
        $this->assertSame([$this->a->reference], $refs);
        // Aucune route interne, aucun téléchargement direct.
        $this->getJson("/api/v1/complaints/{$this->a->id}")->assertForbidden();
        $this->getJson("/api/v1/attachments/{$this->attB->id}/download")->assertForbidden();
    }

    #[Test]
    public function idor_sur_taches_solutions_et_pieces_d_un_autre_perimetre(): void
    {
        $task = Task::query()->create(['complaint_id' => $this->b->id, 'title' => 'Tâche B', 'status' => 'a_faire', 'assignee_id' => $this->user('g.credits1')->id]);
        $solution = Solution::query()->create([
            'complaint_id' => $this->b->id, 'version' => 1, 'type' => 'explication_motivee', 'description' => 'Solution B fictive',
            'decision' => 'non_fondee', 'status' => 'soumise', 'requires_n2' => false, 'proposed_by' => $this->user('g.credits1')->id,
        ]);

        $this->actingAs($this->user('gestionnaire'));
        $this->patchJson("/api/v1/tasks/{$task->id}", ['status' => 'terminee'])->assertForbidden();
        $this->postJson("/api/v1/solutions/{$solution->id}/submit")->assertForbidden();
        $this->assertNotContains($solution->id, array_column($this->getJson('/api/v1/solutions')->json('data'), 'id'));

        $this->actingAs($this->user('responsable'));
        $this->postJson("/api/v1/solutions/{$solution->id}/approve", ['decision' => 'approuve'])->assertForbidden();
        $this->getJson("/api/v1/attachments/{$this->attB->id}/download")->assertForbidden();
        $this->assertSame('a_faire', $task->refresh()->status->value);
        $this->assertSame('soumise', $solution->refresh()->status->value);
    }

    #[Test]
    public function une_piece_confidentielle_est_reservee_au_proprietaire_responsable_et_conformite(): void
    {
        $url = "/api/v1/attachments/{$this->confidentialA->id}/download";
        $this->actingAs($this->user('g.cartes2'));
        $this->getJson($url)->assertForbidden();
        $this->actingAs($this->user('qualite'));
        $this->getJson($url)->assertForbidden();
        $this->actingAs($this->user('accueil'));
        $this->getJson($url)->assertForbidden();
        foreach (['gestionnaire', 'responsable', 'conformite'] as $who) {
            $this->actingAs($this->user($who));
            $this->get($url)->assertOk();
        }
    }

    #[Test]
    public function un_role_sans_permission_ne_peut_pas_agir_meme_dans_son_perimetre(): void
    {
        // Agent d'accueil : pas de transition, qualification, solution ni réponse sur un dossier de son agence.
        $this->actingAs($this->user('accueil'));
        foreach (['qualify', 'transition', 'assign', 'solution', 'send_response', 'control'] as $name) {
            [$method, $uri, $body] = $this->actionsOn($this->a)[$name];
            $this->assertSame(403, $this->json($method, $uri, $body)->status(), "accueil → {$name}");
        }
        // Qualité : lecture et contrôle, jamais de traitement.
        $this->actingAs($this->user('qualite'));
        foreach (['transition', 'assign', 'solution', 'send_response'] as $name) {
            [$method, $uri, $body] = $this->actionsOn($this->a)[$name];
            $this->assertSame(403, $this->json($method, $uri, $body)->status(), "qualite → {$name}");
        }
        // Gestionnaire : pas d'affectation, pas d'administration, pas d'audit.
        $this->actingAs($this->user('gestionnaire'));
        [$method, $uri, $body] = $this->actionsOn($this->a)['assign'];
        $this->json($method, $uri, $body)->assertForbidden();
        foreach (['/api/v1/admin/users', '/api/v1/admin/audit-logs', '/api/v1/admin/imports', '/api/v1/admin/deadline-rules', '/api/v1/admin/agencies'] as $uri) {
            $this->assertSame(403, $this->getJson($uri)->status(), $uri);
        }
    }

    #[Test]
    public function l_affectation_de_tache_refuse_un_client_ou_un_administrateur(): void
    {
        $this->actingAs($this->user('gestionnaire'));
        foreach (['client', 'admin'] as $who) {
            $this->postJson("/api/v1/complaints/{$this->a->id}/tasks", ['title' => 'Tâche', 'assignee_id' => $this->user($who)->id])
                ->assertStatus(422)->assertJsonValidationErrors(['assignee_id']);
        }
        $this->postJson("/api/v1/complaints/{$this->a->id}/tasks", ['title' => 'Tâche', 'assignee_id' => $this->user('g.cartes2')->id])->assertCreated();
    }

    #[Test]
    public function l_affectation_de_masse_est_ignoree(): void
    {
        $this->actingAs($this->user('gestionnaire'));
        $ref = $this->a->reference;
        $hash = $this->a->tracking_code_hash;
        $this->patchJson("/api/v1/complaints/{$this->a->id}", [
            'priority' => 'haute', 'reason' => 'requalification',
            'reference' => 'TG-BSCA-2026-000001', 'tracking_code_hash' => 'x', 'status' => 'cloture',
            'owner_id' => $this->user('g.cartes2')->id, 'customer_id' => $this->b->customer_id, 'final_response_at' => now()->toIso8601String(),
        ])->assertOk();
        $a = $this->a->refresh();
        $this->assertSame($ref, $a->reference);
        $this->assertSame($hash, $a->tracking_code_hash);
        $this->assertSame(ComplaintStatus::EnInvestigation, $a->status);
        $this->assertSame($this->user('gestionnaire')->id, $a->owner_id);
        $this->assertNull($a->final_response_at);
        $this->assertSame('haute', $a->priority->value);

        $task = Task::query()->create(['complaint_id' => $this->a->id, 'title' => 'Tâche A', 'status' => 'a_faire']);
        $this->patchJson("/api/v1/tasks/{$task->id}", ['complaint_id' => $this->b->id, 'title' => 'Tâche A modifiée'])->assertOk();
        $this->assertSame($this->a->id, $task->refresh()->complaint_id);

        // Création d'utilisateur : champs de sécurité jamais assignables.
        $this->actingAs($this->user('admin'));
        $id = $this->postJson('/api/v1/admin/users', [
            'name' => 'Compte fictif', 'email' => 'fictif@bsca.demo', 'password' => 'Motdepasse#2026', 'role' => 'gestionnaire',
            'mfa_enabled' => true, 'mfa_secret' => 'ABC', 'failed_logins' => 99, 'locked_until' => '2030-01-01', 'remember_token' => 'x',
        ])->assertCreated()->json('data.id');
        $u = User::query()->findOrFail($id);
        $this->assertFalse((bool) $u->mfa_enabled);
        $this->assertNull($u->mfa_secret);
        $this->assertSame(0, (int) $u->failed_logins);
        $this->assertNull($u->locked_until);
    }

    #[Test]
    public function les_enumerations_et_montants_sont_valides_strictement(): void
    {
        $this->actingAs($this->user('gestionnaire'));
        $this->patchJson("/api/v1/complaints/{$this->a->id}", ['priority' => 'urgente!!', 'reason' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['priority']);
        $this->patchJson("/api/v1/complaints/{$this->a->id}", ['amount' => '-5', 'currency' => 'XAF', 'reason' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->patchJson("/api/v1/complaints/{$this->a->id}", ['amount' => '10.123', 'currency' => 'XAF', 'reason' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->patchJson("/api/v1/complaints/{$this->a->id}", ['amount' => '1e99', 'currency' => 'XAF', 'reason' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->patchJson("/api/v1/complaints/{$this->a->id}", ['amount' => '100', 'currency' => 'BTC', 'reason' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['currency']);
        $this->postJson("/api/v1/complaints/{$this->a->id}/transition", ['to_status' => 'inexistant', 'reason' => 'x'])->assertStatus(422);
    }
}
