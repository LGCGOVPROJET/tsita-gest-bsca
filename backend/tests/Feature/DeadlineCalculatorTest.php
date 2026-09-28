<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\ComplaintStatus;
use App\Enums\DeadlineFlag;
use App\Enums\DeadlineKind;
use App\Enums\DeadlineStatus;
use App\Models\Complaint;
use App\Models\DeadlineRule;
use App\Services\ComplaintWorkflow;
use App\Services\DeadlineCalculator;
use App\Support\Dt;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class DeadlineCalculatorTest extends TestCase
{
    use RefreshDatabase;

    private DeadlineCalculator $calc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        $this->calc = app(DeadlineCalculator::class);
    }

    private function rule(string $code): DeadlineRule
    {
        return DeadlineRule::query()->where('code', $code)->firstOrFail();
    }

    private function localDate(CarbonInterface $utc): string
    {
        return Dt::parseLocal($utc)->format('Y-m-d');
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> réception locale, accusé attendu, réponse attendue */
    public static function casDeControle(): array
    {
        return [
            'vendredi ordinaire (7 août 2026)' => ['2026-08-07 10:00', '2026-08-21', '2026-09-21'],
            'férié 15 août 2025 sauté' => ['2025-08-08 10:00', '2025-08-25', '2025-09-22'],
            'fin d\'année (Noël + jour de l\'An)' => ['2026-12-23 10:00', '2027-01-08', '2027-02-06'],
            'fin de mois (31 janvier)' => ['2026-01-30 16:00', '2026-02-13', '2026-03-16'],
        ];
    }

    #[Test]
    #[DataProvider('casDeControle')]
    public function les_echeances_des_cas_de_controle_sont_exactes(string $received, string $ack, string $final): void
    {
        $at = $this->local($received);
        $this->assertSame($ack, $this->localDate($this->calc->computeDue($this->rule('DEMO-AR'), $at)));
        $this->assertSame($final, $this->localDate($this->calc->computeDue($this->rule('DEMO-RF'), $at)));
    }

    #[Test]
    public function une_reception_le_week_end_part_du_prochain_jour_ouvre(): void
    {
        // Samedi 23 mai 2026 ; lundi 25 mai = Pentecôte → J0 mardi 26 mai → +10 j ouvrés = mardi 9 juin.
        $due = $this->calc->computeDue($this->rule('DEMO-AR'), $this->local('2026-05-23 11:00'));
        $this->assertSame('2026-06-09', $this->localDate($due));
        // Dimanche → même résultat que le lundi ouvré suivant (J0).
        $sunday = $this->calc->addBusinessDays($this->local('2026-09-13 09:00'), 10);
        $monday = $this->calc->addBusinessDays($this->local('2026-09-14 09:00'), 10);
        $this->assertSame($this->localDate($monday), $this->localDate($sunday));
    }

    #[Test]
    public function un_jour_ferie_n_est_pas_compte(): void
    {
        // Mardi 9 juin 2026 + 1 jour ouvré : le 10 juin (Réconciliation) est sauté → 11 juin.
        $this->assertSame('2026-06-11', $this->localDate($this->calc->addBusinessDays($this->local('2026-06-09 10:00'), 1)));
    }

    #[Test]
    public function la_regle_calendaire_ne_reporte_pas_un_jour_chome(): void
    {
        // 23/12/2026 + 45 jours calendaires = samedi 06/02/2027 (pas de report).
        $due = $this->calc->addCalendarDays($this->local('2026-12-23 10:00'), 45);
        $this->assertSame('2027-02-06', $this->localDate($due));
        $this->assertTrue(Dt::parseLocal($due)->isSaturday());
    }

    #[Test]
    public function l_echeance_est_la_fin_de_journee_locale(): void
    {
        $due = $this->calc->addCalendarDays($this->local('2026-03-02 08:00'), 1);
        $this->assertSame('2026-03-03T23:59:59+01:00', Dt::iso($due));
        $this->assertSame('2026-03-03 22:59:59', $due->format('Y-m-d H:i:s')); // stockage UTC
    }

    #[Test]
    public function une_reponse_le_jour_meme_respecte_l_echeance(): void
    {
        $gest = $this->user('gestionnaire');
        $c = $this->makeComplaint(['received_at' => $this->local('2026-04-15 09:00')]);
        $this->calc->markMet($c, DeadlineKind::ReponseFinale, $this->local('2026-04-15 17:30'));
        $final = $c->deadlines()->where('kind', 'reponse_finale')->first();
        $this->assertSame(DeadlineStatus::Respectee, $final->status);
        $c->forceFill(['final_response_at' => $this->local('2026-04-15 17:30')])->save();
        $this->assertSame(DeadlineFlag::Ok, $this->calc->flag($c->refresh()->load('deadlines')));
        $this->assertNotNull($gest);
    }

    #[Test]
    public function l_attente_d_information_ne_suspend_pas_l_echeance(): void
    {
        $gest = $this->user('gestionnaire');
        $c = $this->makeComplaint(['status' => ComplaintStatus::EnInvestigation, 'owner_id' => $gest->id, 'received_at' => Dt::now()->subDays(10)]);
        $before = $c->deadlines()->where('kind', 'reponse_finale')->first();
        $wf = app(ComplaintWorkflow::class);
        $wf->transition($c, ComplaintStatus::AttenteInformation, 'Pièce demandée', $gest);
        $this->travel(5)->days();
        $wf->transition($c->refresh(), ComplaintStatus::EnInvestigation, 'Pièce reçue', $gest);
        $after = $c->deadlines()->where('kind', 'reponse_finale')->first();
        $this->assertEquals($before->due_at, $after->due_at);
        $this->assertEquals($before->initial_due_at, $after->initial_due_at);
    }

    #[Test]
    public function la_date_annoncee_reste_distincte_de_l_echeance_initiale(): void
    {
        $c = $this->makeComplaint();
        $d = $c->deadlines()->where('kind', 'reponse_finale')->first();
        $initial = $d->initial_due_at;
        $d->announced_at = $initial->copy()->addDays(10);
        $d->initial_due_at = $initial->copy()->addDays(10); // tentative de modification ignorée
        $d->save();
        $d->refresh();
        $this->assertEquals($initial, $d->initial_due_at);
        $this->assertNotEquals($d->initial_due_at, $d->announced_at);
    }

    #[Test]
    public function la_reouverture_cree_des_echeances_propres_au_dossier_enfant(): void
    {
        $gest = $this->user('gestionnaire');
        $parent = $this->makeComplaint([
            'received_at' => Dt::now()->subDays(60), 'status' => ComplaintStatus::ReponseEnvoyee,
            'final_response_at' => Dt::now()->subDays(20), 'owner_id' => $gest->id,
        ]);
        $parentDue = $parent->deadlines()->where('kind', 'reponse_finale')->toBase()->value('due_at');
        $child = app(ComplaintWorkflow::class)->reopen($parent, 'Le client conteste la réponse reçue.', $gest)['complaint'];
        $childDue = $child->deadlines()->where('kind', 'reponse_finale')->first();
        $this->assertSame(
            $this->localDate($this->calc->addCalendarDays($child->received_at, 45)),
            $this->localDate($childDue->due_at),
        );
        $this->assertSame($parentDue, $parent->deadlines()->where('kind', 'reponse_finale')->toBase()->value('due_at'));
    }

    #[Test]
    public function la_pre_alerte_est_cinq_jours_ouvres_avant_l_echeance_finale(): void
    {
        $c = $this->makeComplaint(['received_at' => $this->local('2026-08-07 10:00')]);
        // Échéance finale lundi 21/09/2026 → 5 jours ouvrés avant = lundi 14/09/2026 (début de journée).
        $pre = $c->deadlines()->where('kind', 'prealerte')->first();
        $this->assertSame('2026-09-14T00:00:00+01:00', Dt::iso($pre->due_at));
    }

    #[Test]
    public function les_signaux_d_echeance_sont_calcules(): void
    {
        $late = $this->makeComplaint(['received_at' => Dt::now()->subDays(50), 'acknowledged_at' => Dt::now()->subDays(49), 'acknowledgment_status' => 'envoye']);
        $this->assertSame(DeadlineFlag::EnRetard, $this->calc->flag($late->load('deadlines')));

        $risk = $this->makeComplaint(['received_at' => Dt::now()->subDays(43), 'acknowledged_at' => Dt::now()->subDays(42), 'acknowledgment_status' => 'envoye']);
        $this->assertSame(DeadlineFlag::ARisque, $this->calc->flag($risk->load('deadlines')));

        $ok = $this->makeComplaint(['received_at' => Dt::now()->subDays(3), 'acknowledged_at' => Dt::now()->subDays(2), 'acknowledgment_status' => 'envoye']);
        $this->assertSame(DeadlineFlag::Ok, $this->calc->flag($ok->load('deadlines')));

        $closedLate = $this->makeComplaint(['received_at' => Dt::now()->subDays(80), 'final_response_at' => Dt::now()->subDays(20), 'status' => ComplaintStatus::ReponseEnvoyee]);
        $this->assertSame(DeadlineFlag::ClosEnRetard, $this->calc->flag($closedLate->load('deadlines')));

        // Accusé non envoyé et échu → à risque (même si la réponse finale n'est pas en retard).
        $ackLate = $this->makeComplaint(['received_at' => Dt::now()->subDays(20)]);
        $this->assertSame(DeadlineFlag::ARisque, $this->calc->flag($ackLate->load('deadlines')));

        // Cohérence SQL ↔ PHP.
        $now = Dt::db(Dt::now());
        foreach (['en_retard' => $late, 'a_risque' => $risk, 'ok' => $ok, 'clos_en_retard' => $closedLate] as $flag => $c) {
            $this->assertTrue(Complaint::query()->whereKey($c->id)->whereDeadlineFlag($flag, $now)->exists(), "Filtre SQL {$flag}");
        }
    }

    #[Test]
    public function sans_mode_demo_aucune_regle_non_validee_n_est_appliquee(): void
    {
        config(['app.demo_mode' => false]);
        $c = $this->makeComplaint();
        $this->assertSame(0, $c->deadlines()->count());
        $this->assertSame(DeadlineFlag::SansRegle, $this->calc->flag($c->load('deadlines')));
    }
}
