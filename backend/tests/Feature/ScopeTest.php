<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Complaint;
use App\Models\ProcessingEntity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class ScopeTest extends TestCase
{
    use RefreshDatabase;

    private int $mine;

    private int $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        $bzv = Agency::query()->where('code', 'BZV-CTR')->value('id');
        $pnr = Agency::query()->where('code', 'PNR-CTR')->value('id');
        $cartes = ProcessingEntity::query()->where('code', 'CARTES')->value('id');
        $credits = ProcessingEntity::query()->where('code', 'CREDITS')->value('id');
        $this->mine = $this->makeComplaint(['receiving_agency_id' => $bzv, 'processing_entity_id' => $cartes])->id;
        $this->other = $this->makeComplaint(['receiving_agency_id' => $pnr, 'processing_entity_id' => $credits])->id;
    }

    /** @return list<int> */
    private function visibleIds(string $who): array
    {
        $this->actingAs($this->user($who));

        return array_column($this->getJson('/api/v1/complaints?per_page=100')->assertOk()->json('data'), 'id');
    }

    #[Test]
    public function l_agent_ne_voit_que_les_dossiers_de_son_agence(): void
    {
        $this->assertSame([$this->mine], $this->visibleIds('accueil'));
        $this->getJson('/api/v1/complaints/'.$this->other)->assertForbidden();
        $this->getJson('/api/v1/complaints/'.$this->mine)->assertOk();
    }

    #[Test]
    public function le_gestionnaire_ne_voit_que_son_entite_ou_ses_dossiers(): void
    {
        $this->assertSame([$this->mine], $this->visibleIds('gestionnaire'));
        $this->getJson('/api/v1/complaints/'.$this->other)->assertForbidden();

        // Propriétaire d'un dossier hors entité : visible.
        Complaint::query()->whereKey($this->other)->update(['owner_id' => $this->user('gestionnaire')->id]);
        $ids = $this->visibleIds('gestionnaire');
        sort($ids);
        $this->assertSame([$this->mine, $this->other], $ids);
    }

    #[Test]
    public function un_dossier_sans_entite_est_visible_des_gestionnaires_et_responsables_jusqu_a_son_orientation(): void
    {
        $credits = ProcessingEntity::query()->where('code', 'CREDITS')->value('id');
        $unrouted = $this->makeComplaint(['processing_entity_id' => null])->id;

        foreach (['gestionnaire', 'responsable'] as $who) {
            $this->assertContains($unrouted, $this->visibleIds($who));
            $this->getJson('/api/v1/complaints/'.$unrouted)->assertOk();
        }

        // Orienté vers une autre entité : il quitte la file « à orienter ».
        Complaint::query()->whereKey($unrouted)->update(['processing_entity_id' => $credits]);
        $this->assertNotContains($unrouted, $this->visibleIds('gestionnaire'));
        $this->getJson('/api/v1/complaints/'.$unrouted)->assertForbidden();
    }

    #[Test]
    public function la_direction_voit_des_agregats_sans_noms_ni_pieces(): void
    {
        $this->actingAs($this->user('direction'));
        $list = $this->getJson('/api/v1/complaints')->assertOk()->json('data');
        $this->assertCount(2, $list);
        foreach ($list as $row) {
            $this->assertSame('J. M***', $row['customer_name']);
        }
        $detail = $this->getJson('/api/v1/complaints/'.$this->mine)->assertOk()->json('data');
        $this->assertSame('J. M***', $detail['customer']['full_name']);
        $this->assertNull($detail['customer']['email']);
        $this->assertSame([], $detail['attachments']);
        $this->assertSame([], $detail['messages']);
        $this->getJson('/api/v1/dashboard')->assertOk();
        $this->getJson('/api/v1/complaints/export')->assertForbidden();
        // Recherche par nom de client interdite à la direction.
        $this->assertCount(0, $this->getJson('/api/v1/complaints?search=Moukala')->json('data'));
    }

    #[Test]
    public function l_administrateur_ne_traite_pas_de_dossier(): void
    {
        $this->actingAs($this->user('admin'));
        $this->getJson('/api/v1/complaints')->assertForbidden();
        $this->getJson('/api/v1/complaints/'.$this->mine)->assertForbidden();
        $this->getJson('/api/v1/admin/users')->assertOk();
    }

    #[Test]
    public function le_client_n_accede_pas_aux_routes_internes(): void
    {
        $this->actingAs($this->user('client'));
        $this->getJson('/api/v1/complaints')->assertForbidden();
        $this->getJson('/api/v1/client/complaints')->assertOk()->assertJsonCount(0, 'data');
    }

    #[Test]
    public function un_anonyme_recoit_401(): void
    {
        $this->getJson('/api/v1/complaints')->assertUnauthorized()->assertJson(['message' => 'Non authentifié.']);
    }

    #[Test]
    public function me_expose_les_permissions_du_role(): void
    {
        $this->actingAs($this->user('gestionnaire'));
        $me = $this->getJson('/api/v1/auth/me')->assertOk()->json('data');
        $this->assertSame('gestionnaire', $me['role']);
        $this->assertSame('Cartes et paiements', $me['entity']['name']);
        $this->assertContains('complaints.view', $me['permissions']);
        $this->assertNotContains('solutions.approve_n1', $me['permissions']);
        $this->assertArrayNotHasKey('mfa_secret', $me);
    }
}
