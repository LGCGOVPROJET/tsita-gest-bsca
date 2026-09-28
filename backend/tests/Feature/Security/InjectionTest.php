<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Enums\AttachmentClassification;
use App\Enums\Visibility;
use App\Models\Customer;
use App\Models\ProcessingEntity;
use App\Models\ResponseTemplate;
use App\Services\AttachmentService;
use App\Services\ExportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Injections (OWASP API8 / ASVS V5) : SQL (tri, filtres, LIKE), formules CSV/Excel, HTML dans les PDF et modèles.
 */
final class InjectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    #[Test]
    public function le_tri_et_les_filtres_refusent_toute_expression_sql(): void
    {
        $this->makeComplaint();
        $this->actingAs($this->user('qualite'));
        foreach ([
            'sort=received_at;DROP TABLE complaints',
            'sort=(select 1)',
            'sort=id',
            'status=recu%27%20OR%201%3D1',
            'deadline_flag=ok%27--',
            'channel=agence%27%20or%20%271%27%3D%271',
            'agency_id=1%20OR%201%3D1',
            'from=2026-01-01%27',
            'per_page=100000',
        ] as $qs) {
            $this->assertSame(422, $this->getJson('/api/v1/complaints?'.$qs)->status(), $qs);
        }
    }

    #[Test]
    public function la_recherche_like_neutralise_les_jokers_et_quotes(): void
    {
        $this->makeComplaint(['subject' => 'Carte bloquée']);
        $this->makeComplaint(['subject' => 'Frais 100% contestés']);
        $this->actingAs($this->user('qualite'));
        $this->assertCount(0, $this->getJson('/api/v1/complaints?search='.urlencode("' OR '1'='1"))->assertOk()->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/complaints?search='.urlencode('_'))->assertOk()->json('data'));
        $this->assertCount(1, $this->getJson('/api/v1/complaints?search='.urlencode('%'))->assertOk()->json('data'));
        $this->assertCount(2, $this->getJson('/api/v1/complaints')->json('data'));
        // Journal d'audit (admin) : même neutralisation du joker.
        $this->actingAs($this->user('admin'));
        $this->getJson('/api/v1/admin/audit-logs?action='.urlencode("%' OR 1=1 -- "))->assertOk()->assertJsonCount(0, 'data');
    }

    #[Test]
    public function les_formules_sont_neutralisees_dans_les_exports(): void
    {
        $customer = Customer::query()->create(['full_name' => '=HYPERLINK("http://evil.invalid","clic")', 'email' => 'x@exemple.invalid', 'preferred_channel' => 'courriel']);
        $this->makeComplaint([
            'customer_id' => $customer->id,
            'subject' => '+cmd|\' /C calc\'!A0',
            'processing_entity_id' => ProcessingEntity::query()->where('code', 'CARTES')->value('id'),
        ]);
        $this->actingAs($this->user('gestionnaire'));
        $csv = (string) $this->get('/api/v1/complaints/export?format=csv')->assertOk()->getContent();
        $this->assertStringContainsString('\'=HYPERLINK', $csv);
        $this->assertStringContainsString('\'+cmd', $csv);
        $this->assertDoesNotMatchRegularExpression('/(^|;)"?[=+@]/m', $csv);

        foreach (['=1+1', '+1+cmd', '-A1', '@SUM(A1)', "\tcmd", "\rcmd"] as $danger) {
            $this->assertStringStartsWith("'", (string) ExportService::safeCell($danger), json_encode($danger));
        }
        $this->assertSame('-150000.00', ExportService::safeCell('-150000.00'), 'Un nombre négatif reste un nombre');
        $this->assertSame(42, ExportService::safeCell(42));

        $this->get('/api/v1/complaints/export?format=xlsx')->assertOk()->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    #[Test]
    public function le_html_injecte_ne_casse_pas_l_export_pdf(): void
    {
        $this->makeComplaint([
            'subject' => '<img src="http://evil.invalid/x.png" onerror="alert(1)"><script>alert(2)</script>',
            'processing_entity_id' => ProcessingEntity::query()->where('code', 'CARTES')->value('id'),
        ]);
        $this->actingAs($this->user('gestionnaire'));
        $res = $this->get('/api/v1/complaints/export?format=pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', (string) $res->getContent());
        $this->assertStringContainsString('attachment;', (string) $res->headers->get('Content-Disposition'));
    }

    #[Test]
    public function les_placeholders_des_modeles_ne_sont_pas_reinterpretes(): void
    {
        $tpl = new ResponseTemplate(['body' => 'Bonjour {{client}}, dossier {{reference}} {{inconnu}}']);
        $out = $tpl->render($tpl->body, ['client' => '{{reference}}<script>', 'reference' => 'TG-BSCA-2026-000001']);
        $this->assertSame('Bonjour {{reference}}<script>, dossier TG-BSCA-2026-000001 {{inconnu}}', $out);
    }

    #[Test]
    public function les_en_tetes_de_telechargement_ne_sont_pas_injectables(): void
    {
        $c = $this->makeComplaint(['processing_entity_id' => ProcessingEntity::query()->where('code', 'CARTES')->value('id')]);
        Storage::fake('attachments');
        $att = app(AttachmentService::class)->store(
            $c,
            UploadedFile::fake()->createWithContent("evil\r\nSet-Cookie: x=1\".pdf", "%PDF-1.4\n%%EOF\n"),
            AttachmentClassification::Client,
            Visibility::Client,
            $this->user('gestionnaire'),
        );
        $this->actingAs($this->user('gestionnaire'));
        $res = $this->get("/api/v1/attachments/{$att->id}/download")->assertOk();
        $this->assertStringNotContainsString('x=1', implode(';', $res->headers->all('set-cookie')));
        $dispo = (string) $res->headers->get('Content-Disposition');
        $this->assertStringNotContainsString("\r", $dispo);
        $this->assertStringNotContainsString("\n", $dispo);
        $this->assertSame('nosniff', $res->headers->get('X-Content-Type-Options'));
    }
}
