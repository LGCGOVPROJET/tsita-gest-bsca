<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Complaint;
use App\Models\ImportAnomaly;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class ImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    private function csv(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('registre.csv', (string) file_get_contents(storage_path('app/demo/registre-historique-exemple.csv')));
    }

    #[Test]
    public function l_import_est_idempotent(): void
    {
        $this->actingAs($this->user('admin'));
        $first = $this->post('/api/v1/admin/imports', ['file' => $this->csv(), 'source_system' => 'REGISTRE_TEST'], ['Accept' => 'application/json'])
            ->assertCreated()->json();
        $created = $first['data']['rows_created'];
        $this->assertGreaterThan(0, $created);
        $this->assertFalse($first['meta']['already_imported']);
        $count = Complaint::query()->count();

        $second = $this->post('/api/v1/admin/imports', ['file' => $this->csv(), 'source_system' => 'REGISTRE_TEST'], ['Accept' => 'application/json'])
            ->assertOk()->json();
        $this->assertTrue($second['meta']['already_imported']);
        $this->assertSame($count, Complaint::query()->count(), 'Le 2e import du même fichier ne crée aucun dossier');
    }

    #[Test]
    public function les_lignes_deja_importees_sont_ignorees_meme_dans_un_autre_fichier(): void
    {
        $this->actingAs($this->user('admin'));
        $this->post('/api/v1/admin/imports', ['file' => $this->csv(), 'source_system' => 'REGISTRE_TEST'], ['Accept' => 'application/json'])->assertCreated();
        $count = Complaint::query()->count();
        $content = (string) file_get_contents(storage_path('app/demo/registre-historique-exemple.csv'))."\n";
        $other = UploadedFile::fake()->createWithContent('registre-bis.csv', $content);
        $res = $this->post('/api/v1/admin/imports', ['file' => $other, 'source_system' => 'REGISTRE_TEST'], ['Accept' => 'application/json'])
            ->assertCreated()->json('data');
        $this->assertSame(0, $res['rows_created']);
        $this->assertSame($count, Complaint::query()->count());
    }

    #[Test]
    public function aucune_date_de_reponse_n_est_inventee_et_les_anomalies_sont_tracees(): void
    {
        $this->actingAs($this->user('admin'));
        $res = $this->post('/api/v1/admin/imports', ['file' => $this->csv(), 'source_system' => 'REGISTRE_TEST'], ['Accept' => 'application/json'])
            ->assertCreated()->json('data');

        // HIST-2025-104 : « Clôturé » sans date de réponse → créé, final_response_at NULL, libellé source conservé.
        $c = Complaint::query()->where('source_id', 'HIST-2025-104')->firstOrFail();
        $this->assertNull($c->final_response_at);
        $this->assertSame('Clôturé', $c->source_status_label);
        $this->assertSame('REGISTRE_TEST', $c->source_system);

        // HIST-2025-106 : montant sans devise → montant inconnu (NULL), jamais 0.
        $this->assertNull(Complaint::query()->where('source_id', 'HIST-2025-106')->value('amount'));

        // HIST-2025-108 : statut « Archivé » inconnu → non créé, anomalie à traiter.
        $this->assertFalse(Complaint::query()->where('source_id', 'HIST-2025-108')->exists());
        $this->assertTrue(ImportAnomaly::query()->where('source_id', 'HIST-2025-108')->where('resolution_status', 'a_traiter')->exists());

        $this->assertGreaterThanOrEqual(4, $res['rows_anomalies']);
        $this->assertNotEmpty($res['anomalies']);
        $this->assertSame(8, $res['rows_total']);
    }

    #[Test]
    public function seul_l_administrateur_importe(): void
    {
        $this->actingAs($this->user('gestionnaire'));
        $this->post('/api/v1/admin/imports', ['file' => $this->csv(), 'source_system' => 'X'], ['Accept' => 'application/json'])->assertForbidden();
    }
}
