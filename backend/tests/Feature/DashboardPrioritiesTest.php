<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\ProcessingEntity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class DashboardPrioritiesTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function les_priorites_excluent_les_dossiers_historiques_clotures_sans_date_de_reponse(): void
    {
        $this->seedBase();
        $cartes = ProcessingEntity::query()->where('code', 'CARTES')->value('id');
        $open = $this->makeComplaint(['processing_entity_id' => $cartes, 'status' => 'en_investigation']);
        $legacyClosed = $this->makeComplaint(['processing_entity_id' => $cartes, 'status' => 'cloture', 'source_system' => 'REGISTRE_PAPIER', 'source_id' => 'R-1']);
        $legacyAnswered = $this->makeComplaint(['processing_entity_id' => $cartes, 'status' => 'reponse_envoyee', 'source_system' => 'REGISTRE_PAPIER', 'source_id' => 'R-2']);

        $this->actingAs($this->user('responsable'));
        $ids = array_column($this->getJson('/api/v1/dashboard')->assertOk()->json('data.priorities'), 'id');

        $this->assertContains($open->id, $ids);
        $this->assertNotContains($legacyClosed->id, $ids);
        $this->assertNotContains($legacyAnswered->id, $ids);
    }
}
