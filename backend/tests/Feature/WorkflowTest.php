<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\ComplaintStatus;
use App\Models\AuditLog;
use App\Models\Complaint;
use App\Models\ComplaintEvent;
use App\Models\ProcessingEntity;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class WorkflowTest extends TestCase
{
    use RefreshDatabase;

    private int $cartes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        $this->cartes = (int) ProcessingEntity::query()->where('code', 'CARTES')->value('id');
    }

    private function complaint(array $attrs = []): Complaint
    {
        return $this->makeComplaint($attrs + ['processing_entity_id' => $this->cartes]);
    }

    #[Test]
    public function les_transitions_interdites_sont_refusees(): void
    {
        $c = $this->complaint();
        $this->actingAs($this->user('gestionnaire'));
        $this->postJson("/api/v1/complaints/{$c->id}/transition", ['to_status' => 'cloture', 'reason' => 'Essai'])
            ->assertStatus(422)->assertJsonValidationErrors(['to_status']);
        $this->postJson("/api/v1/complaints/{$c->id}/transition", ['to_status' => 'a_qualifier'])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->assertSame(ComplaintStatus::Recu, $c->refresh()->status);

        $c->forceFill(['status' => 'a_valider'])->save();
        $this->postJson("/api/v1/complaints/{$c->id}/transition", ['to_status' => 'reponse_envoyee', 'reason' => 'Contournement'])
            ->assertStatus(422);
    }

    #[Test]
    public function une_transition_autorisee_cree_evenement_et_audit(): void
    {
        $c = $this->complaint();
        $this->actingAs($this->user('gestionnaire'));
        $detail = $this->postJson("/api/v1/complaints/{$c->id}/transition", ['to_status' => 'a_qualifier', 'reason' => 'Dossier complet'])
            ->assertOk()->json('data');
        $this->assertSame('a_qualifier', $detail['status']);
        $this->assertSame([['value' => 'affecte', 'label' => 'Affecté']], $detail['allowed_transitions']);
        $this->assertDatabaseHas('complaint_events', ['complaint_id' => $c->id, 'type' => 'status_changed', 'from_status' => 'recu', 'to_status' => 'a_qualifier', 'reason' => 'Dossier complet']);
        $this->assertDatabaseHas('audit_logs', ['auditable_id' => $c->id, 'action' => 'complaint.transition', 'reason' => 'Dossier complet']);
    }

    #[Test]
    public function la_chronologie_et_l_audit_sont_en_ajout_seul(): void
    {
        $c = $this->complaint();
        $event = ComplaintEvent::query()->create(['complaint_id' => $c->id, 'type' => 'message', 'title' => 'Test', 'visibility' => 'internal']);
        $this->expectException(\LogicException::class);
        $event->update(['title' => 'Modifié']);
    }

    #[Test]
    public function les_triggers_mysql_interdisent_la_modification_du_journal(): void
    {
        $log = AuditLog::query()->create(['action' => 'test.action']);
        $this->expectException(QueryException::class);
        DB::table('audit_logs')->where('id', $log->id)->update(['action' => 'falsifie']);
    }

    #[Test]
    public function le_parcours_complet_jusqu_a_la_reponse(): void
    {
        $c = $this->complaint(['amount' => '750000.00', 'currency' => 'XAF']);
        $gest = $this->user('gestionnaire');
        $resp = $this->user('responsable');

        $this->actingAs($resp);
        $this->postJson("/api/v1/complaints/{$c->id}/assign", ['owner_id' => $gest->id, 'reason' => 'Entité cartes'])->assertOk()->assertJsonPath('data.status', 'affecte');

        $this->actingAs($gest);
        $this->postJson("/api/v1/complaints/{$c->id}/acknowledge", ['channel' => 'courriel', 'delivery_status' => 'echec'])->assertOk()->assertJsonPath('data.acknowledgment_status', 'echec');
        $this->postJson("/api/v1/complaints/{$c->id}/acknowledge", ['channel' => 'courrier', 'delivery_status' => 'envoye'])->assertOk()->assertJsonPath('data.acknowledgment_status', 'envoye');
        $this->postJson("/api/v1/complaints/{$c->id}/transition", ['to_status' => 'en_investigation', 'reason' => 'Début'])->assertOk();
        $solution = $this->postJson("/api/v1/complaints/{$c->id}/solutions", [
            'type' => 'remboursement', 'description' => 'Remboursement intégral après vérification.', 'amount' => '750000', 'currency' => 'XAF', 'decision' => 'fondee',
        ])->assertCreated()->json('data');
        $this->assertTrue($solution['requires_n2']);
        $this->postJson("/api/v1/solutions/{$solution['id']}/submit")->assertOk()->assertJsonPath('data.status', 'soumise');
        $this->assertSame(ComplaintStatus::AValider, $c->refresh()->status);

        // Le proposant ne peut pas approuver ; la réponse exige une solution approuvée.
        $this->postJson("/api/v1/solutions/{$solution['id']}/approve", ['decision' => 'approuve'])->assertForbidden();
        $this->postJson("/api/v1/complaints/{$c->id}/send-response", ['body' => 'Réponse prématurée au client.', 'channel' => 'courriel'])->assertStatus(422);

        $this->actingAs($resp);
        $this->postJson("/api/v1/solutions/{$solution['id']}/approve", ['decision' => 'approuve'])->assertOk()->assertJsonPath('data.status', 'approuvee_n1');
        $this->actingAs($this->user('conformite'));
        $this->postJson("/api/v1/solutions/{$solution['id']}/approve", ['decision' => 'approuve', 'comment' => 'Montant vérifié'])->assertOk()->assertJsonPath('data.status', 'approuvee');

        $this->actingAs($gest);
        $detail = $this->postJson("/api/v1/complaints/{$c->id}/send-response", ['body' => 'Nous procédons au remboursement de 750 000 XAF.', 'channel' => 'courriel'])
            ->assertOk()->json('data');
        $this->assertSame('reponse_envoyee', $detail['status']);
        $this->assertSame('fondee', $detail['decision']);
        $this->assertNotNull($detail['final_response_at']);
        $this->assertSame('respectee', collect($detail['deadlines'])->firstWhere('kind', 'reponse_finale')['status']);
        // Réponse définitive envoyée : plus de nouvelle solution possible sur ce dossier.
        $this->assertFalse($detail['can']['propose']);
        $this->postJson("/api/v1/complaints/{$c->id}/solutions", ['type' => 'explication_motivee', 'description' => 'Tentative tardive', 'decision' => 'fondee'])->assertForbidden();
    }

    #[Test]
    public function la_reouverture_cree_un_enfant_et_conserve_l_ancien(): void
    {
        $gest = $this->user('gestionnaire');
        $parent = $this->complaint(['status' => 'reponse_envoyee', 'final_response_at' => now()->subDays(3), 'decision' => 'non_fondee', 'owner_id' => $gest->id]);
        $this->actingAs($gest);
        $child = $this->postJson("/api/v1/complaints/{$parent->id}/reopen", ['reason' => 'Le client conteste la décision.'])
            ->assertCreated()->json('data');
        $this->assertSame('reouvert', $child['status']);
        $this->assertSame($parent->id, $child['parent']['id']);
        $this->assertNotSame($parent->reference, $child['reference']);

        $parent->refresh();
        $this->assertSame(ComplaintStatus::ReponseEnvoyee, $parent->status);
        $this->assertNotNull($parent->final_response_at);
        $this->assertSame('non_fondee', $parent->decision->value);
        $this->assertSame(2, Complaint::query()->count());
        // Pas de seconde réouverture tant que l'enfant est ouvert.
        $this->postJson("/api/v1/complaints/{$parent->id}/reopen", ['reason' => 'Nouvelle contestation.'])->assertStatus(422);
        $this->getJson("/api/v1/complaints/{$parent->id}")->assertJsonPath('data.children.0.reference', $child['reference']);
    }

    #[Test]
    public function le_doublon_est_rattache_sans_suppression(): void
    {
        $original = $this->complaint();
        $dup = $this->complaint(['customer_id' => $original->customer_id]);
        $this->actingAs($this->user('gestionnaire'));
        $this->postJson("/api/v1/complaints/{$dup->id}/mark-duplicate", ['duplicate_of_id' => $original->id, 'reason' => 'Même opération'])
            ->assertOk()->assertJsonPath('data.duplicate_of.reference', $original->reference);
        $this->assertSame(2, Complaint::query()->count());
        $this->assertDatabaseHas('complaints', ['id' => $dup->id, 'duplicate_of_id' => $original->id]);
        $this->postJson("/api/v1/complaints/{$original->id}/mark-duplicate", ['duplicate_of_id' => $dup->id, 'reason' => 'Boucle'])->assertStatus(422);
        // Aucune route de suppression.
        $this->deleteJson("/api/v1/complaints/{$dup->id}")->assertStatus(405);
    }

    #[Test]
    public function la_qualification_exige_un_motif_et_trace_avant_apres(): void
    {
        $c = $this->complaint();
        $this->actingAs($this->user('gestionnaire'));
        $this->patchJson("/api/v1/complaints/{$c->id}", ['priority' => 'haute'])->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->patchJson("/api/v1/complaints/{$c->id}", ['priority' => 'haute', 'reason' => 'Client vulnérable'])->assertOk()->assertJsonPath('data.priority', 'haute');
        $log = AuditLog::query()->where('action', 'complaint.qualify')->latest('id')->first();
        $this->assertSame(['priority' => 'normale'], $log->before);
        $this->assertSame(['priority' => 'haute'], $log->after);
    }

    #[Test]
    public function la_consultation_d_un_dossier_est_journalisee(): void
    {
        $c = $this->complaint();
        $this->actingAs($this->user('qualite'));
        $this->getJson("/api/v1/complaints/{$c->id}")->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'complaint.view', 'auditable_id' => $c->id]);
    }

    #[Test]
    public function le_tri_est_limite_a_une_liste_blanche(): void
    {
        $this->complaint();
        $this->actingAs($this->user('qualite'));
        $this->getJson('/api/v1/complaints?sort=received_at;drop table users')->assertStatus(422);
        $this->getJson('/api/v1/complaints?sort=-due_at')->assertOk();
        $this->getJson('/api/v1/complaints?sort=priority')->assertOk();
    }
}
