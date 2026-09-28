<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\ProcessingEntity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class WorkloadAndAdminOverviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    /** @return array<string, int> */
    private function workload(string $who): array
    {
        $this->actingAs($this->user($who));
        $items = $this->getJson('/api/v1/me/workload')->assertOk()->json('data.items');

        return array_column($items, 'count', 'key');
    }

    #[Test]
    public function chaque_profil_recoit_ses_propres_files_de_travail(): void
    {
        $this->assertSame(['ack', 'qualify', 'mine_month'], array_keys($this->workload('accueil')));
        $this->assertSame(['mine', 'mine_late', 'tasks', 'tasks_late'], array_keys($this->workload('gestionnaire')));
        $this->assertSame(['unrouted', 'unassigned', 'n1', 'late'], array_keys($this->workload('responsable')));
        $this->assertSame(['to_control', 'actions', 'actions_late'], array_keys($this->workload('qualite')));
        $this->assertSame(['n2', 'rules', 'late'], array_keys($this->workload('conformite')));
        $this->assertSame(['stock', 'late', 'at_risk'], array_keys($this->workload('direction')));
        $this->assertSame([], $this->workload('admin'));

        $this->actingAs($this->user('client'));
        $this->getJson('/api/v1/me/workload')->assertForbidden();
    }

    #[Test]
    public function les_compteurs_restent_dans_le_perimetre_de_l_utilisateur(): void
    {
        $cartes = ProcessingEntity::query()->where('code', 'CARTES')->value('id');
        $credits = ProcessingEntity::query()->where('code', 'CREDITS')->value('id');
        $gest = $this->user('gestionnaire');
        $this->makeComplaint(['processing_entity_id' => $cartes, 'owner_id' => $gest->id, 'status' => 'en_investigation']);
        // Dossier d'une autre entité, attribué à un autre utilisateur : ne doit pas être compté.
        $this->makeComplaint(['processing_entity_id' => $credits, 'owner_id' => $this->user('responsable')->id, 'status' => 'en_investigation']);

        $this->assertSame(1, $this->workload('gestionnaire')['mine']);
    }

    #[Test]
    public function la_vue_administration_est_reservee_et_filtree_par_permission(): void
    {
        $this->actingAs($this->user('admin'));
        $data = $this->getJson('/api/v1/admin/overview')->assertOk()->json('data');
        foreach (['users', 'rules', 'referentials', 'imports', 'audit'] as $block) {
            $this->assertArrayHasKey($block, $data);
        }
        $this->assertCount(14, $data['audit']['daily']);
        $this->assertSame(['demo_mode', 'mfa', 'rules', 'demo_accounts', 'debug', 'anomalies', 'locked'], array_column($data['health'], 'key'));
        $this->assertArrayHasKey('recent_logins', $data['users']);
        $this->assertGreaterThan(0, $data['users']['total']);
        // Aucune donnée client dans la vue d'ensemble.
        $json = json_encode($data, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('@exemple.invalid', $json);

        // Conformité : seulement les blocs règles et audit.
        $this->actingAs($this->user('conformite'));
        $data = $this->getJson('/api/v1/admin/overview')->assertOk()->json('data');
        $this->assertArrayHasKey('rules', $data);
        $this->assertArrayHasKey('audit', $data);
        $this->assertArrayNotHasKey('users', $data);
        $this->assertArrayNotHasKey('health', $data);
        $this->assertArrayNotHasKey('imports', $data);

        foreach (['gestionnaire', 'direction', 'client'] as $who) {
            $this->actingAs($this->user($who));
            $this->getJson('/api/v1/admin/overview')->assertForbidden();
        }
    }
}
