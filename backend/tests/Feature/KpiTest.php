<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\ComplaintStatus;
use App\Services\KpiService;
use App\Services\ReportService;
use App\Support\ComplaintFilters;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class KpiTest extends TestCase
{
    use RefreshDatabase;

    private KpiService $kpi;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        $this->kpi = app(KpiService::class);
        $this->travelTo(CarbonImmutable::parse('2026-03-10 12:00:00', 'UTC'));

        // A : reçu le 30/01, répondu le 05/02 (franchit la fin de janvier).
        $this->makeComplaint(['received_at' => $this->local('2026-01-30 10:00'), 'final_response_at' => $this->local('2026-02-05 11:00'), 'status' => ComplaintStatus::ReponseEnvoyee]);
        // B : reçu le 10/01, répondu le 20/01.
        $this->makeComplaint(['received_at' => $this->local('2026-01-10 10:00'), 'final_response_at' => $this->local('2026-01-20 11:00'), 'status' => ComplaintStatus::Cloture]);
        // C : reçu le 02/02, toujours ouvert.
        $this->makeComplaint(['received_at' => $this->local('2026-02-02 09:00'), 'status' => ComplaintStatus::EnInvestigation]);
        // D : reçu le 31/01 à 23:30 locale (= 22:30 UTC) : compté en janvier (fuseau Africa/Brazzaville).
        $this->makeComplaint(['received_at' => $this->local('2026-01-31 23:30'), 'status' => ComplaintStatus::EnInvestigation]);
    }

    private function filters(string $from, string $to, ?string $asOf = null): ComplaintFilters
    {
        return ComplaintFilters::fromArray(['from' => $from, 'to' => $to, 'as_of' => $asOf ?? $to]);
    }

    #[Test]
    public function recues_et_reponses_donnent_des_resultats_distincts_en_fin_de_periode(): void
    {
        $jan = $this->filters('2026-01-01', '2026-01-31');
        $feb = $this->filters('2026-02-01', '2026-02-28');

        $this->assertSame(3, $this->kpi->received($jan, null));   // A, B, D
        $this->assertSame(1, $this->kpi->responded($jan, null));  // B
        $this->assertSame(1, $this->kpi->received($feb, null));   // C
        $this->assertSame(1, $this->kpi->responded($feb, null));  // A
        $this->assertNotSame($this->kpi->received($jan, null), $this->kpi->responded($jan, null));
    }

    #[Test]
    public function le_stock_a_deux_dates_se_reconstitue(): void
    {
        $f = $this->filters('2026-02-01', '2026-02-28');
        $stockJan = $this->kpi->stockAt(CarbonImmutable::parse('2026-01-31'), $f, null); // A, D
        $stockFeb = $this->kpi->stockAt(CarbonImmutable::parse('2026-02-28'), $f, null); // C, D
        $this->assertSame(2, $stockJan);
        $this->assertSame(2, $stockFeb);
        $this->assertSame($stockFeb, $stockJan + $this->kpi->received($f, null) - $this->kpi->responded($f, null));
    }

    #[Test]
    public function la_reconciliation_est_equilibree(): void
    {
        $rec = app(ReportService::class)->reconciliation($this->filters('2026-02-01', '2026-02-28'), null);
        $this->assertSame(['opening_stock' => 2, 'inflow' => 1, 'outflow' => 1, 'adjustments' => 0, 'closing_stock' => 2, 'balanced' => true], $rec);

        $activity = app(ReportService::class)->activity($this->filters('2026-01-01', '2026-02-28'), null);
        $this->assertTrue($activity['balanced']);
        foreach ($activity['by_month'] as $month) {
            $this->assertTrue($month['balanced'], 'Mois '.$month['month']);
        }
        $this->assertSame($activity['by_month'][0]['closing_stock'], $activity['by_month'][1]['opening_stock']);
    }

    #[Test]
    public function le_taux_de_traitement_expose_numerateur_et_denominateur(): void
    {
        $asOfEndJan = $this->kpi->kpis($this->filters('2026-01-01', '2026-01-31', '2026-01-31'), null);
        $this->assertSame(['numerator' => 1, 'denominator' => 3, 'value' => 33.3], $asOfEndJan['treatment_rate']);

        $asOfFeb = $this->kpi->kpis($this->filters('2026-01-01', '2026-01-31', '2026-02-28'), null);
        $this->assertSame(2, $asOfFeb['cohort_treated']);
        $this->assertSame(['numerator' => 2, 'denominator' => 3, 'value' => 66.7], $asOfFeb['treatment_rate']);

        $empty = $this->kpi->kpis($this->filters('2025-01-01', '2025-01-31'), null);
        $this->assertNull($empty['treatment_rate']['value']);
        $this->assertSame(0, $empty['treatment_rate']['denominator']);
    }

    #[Test]
    public function les_doublons_ne_sont_pas_comptes_deux_fois(): void
    {
        $original = $this->makeComplaint(['received_at' => $this->local('2026-02-10 10:00')]);
        $this->makeComplaint(['received_at' => $this->local('2026-02-10 15:00'), 'duplicate_of_id' => $original->id, 'customer_id' => $original->customer_id]);
        $this->assertSame(2, $this->kpi->received($this->filters('2026-02-01', '2026-02-28'), null));
    }

    #[Test]
    public function les_filtres_sont_identiques_entre_tableau_de_bord_et_liste(): void
    {
        $this->actingAs($this->user('qualite'));
        $dash = $this->getJson('/api/v1/dashboard?from=2026-01-01&to=2026-01-31&as_of=2026-01-31')->assertOk()->json('data');
        $list = $this->getJson('/api/v1/complaints?from=2026-01-01&to=2026-01-31&per_page=100')->assertOk()->json();
        $this->assertSame($dash['kpis']['received'], $list['meta']['total']);
        $this->assertSame('2026-01-31', $dash['meta']['as_of']);
        $this->assertArrayHasKey('received', $dash['meta']['definitions']);
        $this->assertSame(['numerator', 'denominator', 'value'], array_keys($dash['kpis']['treatment_rate']));
    }
}
