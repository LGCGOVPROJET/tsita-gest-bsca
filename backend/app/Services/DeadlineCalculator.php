<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\DeadlineFlag;
use App\Enums\DeadlineKind;
use App\Enums\DeadlineStatus;
use App\Enums\DeadlineUnit;
use App\Enums\RuleSourceType;
use App\Enums\RuleStatus;
use App\Models\Complaint;
use App\Models\ComplaintDeadline;
use App\Models\DeadlineRule;
use App\Models\Holiday;
use App\Models\Setting;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Moteur de délais (§7).
 *
 * - Calcul en Africa/Brazzaville ; le jour de réception n'est pas compté (J+1 = premier jour).
 * - Échéance = fin de journée locale (23:59:59) du jour cible.
 * - unit=business : lundi–vendredi hors jours fériés de la version de calendrier active ;
 *   une réception un samedi, dimanche ou férié est réputée faite le prochain jour ouvré (J0),
 *   le décompte commençant le lendemain (ex. : sam. 23/05/2026, lun. 25/05 férié → J0 mar. 26/05,
 *   +10 jours ouvrés = mar. 09/06/2026).
 * - unit=calendar : +N jours calendaires, sans report si le jour cible est chômé
 *   (ex. : 23/12/2026 + 45 j = sam. 06/02/2027) — point à valider par la conformité.
 * - Aucune suspension (l'attente d'information ne modifie pas l'échéance).
 * - La pré-alerte (kind=prealerte) se calcule à rebours depuis l'échéance finale : début de la
 *   journée locale située N jours ouvrés avant le jour d'échéance finale.
 */
final class DeadlineCalculator
{
    /** @var array<string, array<string, true>> */
    private array $holidayCache = [];

    public function activeCalendarVersion(): string
    {
        return (string) Setting::get('holiday_calendar_version', 'CG-2025-2027');
    }

    /** @return array<string, true> jours fériés (Y-m-d) de la version active */
    public function holidays(?string $version = null): array
    {
        $version ??= $this->activeCalendarVersion();
        if (! isset($this->holidayCache[$version])) {
            $this->holidayCache[$version] = Holiday::query()
                ->where('calendar_version', $version)
                ->where('country', 'CG')
                ->pluck('date')
                ->mapWithKeys(static fn ($d) => [CarbonImmutable::parse($d)->format('Y-m-d') => true])
                ->all();
        }

        return $this->holidayCache[$version];
    }

    public function flushCache(): void
    {
        $this->holidayCache = [];
    }

    public function isBusinessDay(CarbonInterface $localDate): bool
    {
        if ($localDate->isWeekend()) {
            return false;
        }

        return ! isset($this->holidays()[$localDate->format('Y-m-d')]);
    }

    /** Échéance à +N jours calendaires (fin de journée locale), retournée en UTC. */
    public function addCalendarDays(CarbonInterface $receivedAt, int $days): CarbonImmutable
    {
        $local = Dt::parseLocal($receivedAt)->startOfDay()->addDays($days);

        return Dt::endOfLocalDay($local);
    }

    /** Échéance à +N jours ouvrés (fin de journée locale), retournée en UTC. */
    public function addBusinessDays(CarbonInterface $receivedAt, int $days): CarbonImmutable
    {
        $day = Dt::parseLocal($receivedAt)->startOfDay();
        // Réception un jour non ouvré : dossier réputé reçu le prochain jour ouvré (J0),
        // le décompte commence le lendemain de ce jour.
        while (! $this->isBusinessDay($day)) {
            $day = $day->addDay();
        }
        if ($days <= 0) {
            return Dt::endOfLocalDay($day);
        }
        $counted = 0;
        while ($counted < $days) {
            $day = $day->addDay();
            if ($this->isBusinessDay($day)) {
                $counted++;
            }
        }

        return Dt::endOfLocalDay($day);
    }

    /** Début de la journée locale située N jours ouvrés avant $dueAt, en UTC. */
    public function subtractBusinessDays(CarbonInterface $dueAt, int $days): CarbonImmutable
    {
        $day = Dt::parseLocal($dueAt)->startOfDay();
        $counted = 0;
        while ($counted < $days) {
            $day = $day->subDay();
            if ($this->isBusinessDay($day)) {
                $counted++;
            }
        }

        return Dt::startOfLocalDay($day);
    }

    public function computeDue(DeadlineRule $rule, CarbonInterface $receivedAt): CarbonImmutable
    {
        return $rule->unit === DeadlineUnit::Business
            ? $this->addBusinessDays($receivedAt, $rule->duration)
            : $this->addCalendarDays($receivedAt, $rule->duration);
    }

    public function computePrealert(DeadlineRule $rule, CarbonInterface $finalDue): CarbonImmutable
    {
        if ($rule->unit === DeadlineUnit::Business) {
            return $this->subtractBusinessDays($finalDue, $rule->duration);
        }

        return Dt::startOfLocalDay(Dt::parseLocal($finalDue)->startOfDay()->subDays($rule->duration));
    }

    /** Une règle est appliquée si elle est validée, ou de démonstration « à valider » en mode démo. */
    public function isRuleApplicable(DeadlineRule $rule): bool
    {
        if ($rule->status === RuleStatus::Valide) {
            return true;
        }

        return (bool) config('app.demo_mode')
            && $rule->status === RuleStatus::AValider
            && $rule->source_type === RuleSourceType::Demonstration;
    }

    public function applicableRule(DeadlineKind $kind, CarbonInterface $at): ?DeadlineRule
    {
        $date = Dt::parseLocal($at)->format('Y-m-d');

        return DeadlineRule::query()
            ->where('kind', $kind->value)
            ->whereDate('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date))
            ->whereIn('status', [RuleStatus::Valide->value, RuleStatus::AValider->value])
            ->orderByRaw("case when status = 'valide' then 0 else 1 end")
            ->orderByDesc('version')
            ->get()
            ->first(fn (DeadlineRule $r) => $this->isRuleApplicable($r));
    }

    /** @return Collection<int, DeadlineRule> règles actuellement appliquées */
    public function activeRules(?CarbonInterface $at = null): Collection
    {
        $at ??= Dt::now();

        return collect(DeadlineKind::cases())
            ->map(fn (DeadlineKind $k) => $this->applicableRule($k, $at))
            ->filter()
            ->values();
    }

    /** Vrai si au moins une règle appliquée est une règle de démonstration non validée. */
    public function usesDemoRule(?CarbonInterface $at = null): bool
    {
        return $this->activeRules($at)->contains(fn (DeadlineRule $r) => $r->isDemo());
    }

    public function finalRuleVersionLabel(?CarbonInterface $at = null): ?string
    {
        return $this->applicableRule(DeadlineKind::ReponseFinale, $at ?? Dt::now())?->versionLabel();
    }

    /**
     * Crée les échéances (accusé, réponse finale, pré-alerte) d'un dossier à partir de sa date de réception.
     * N'écrase jamais une échéance existante.
     */
    public function scheduleFor(Complaint $complaint): void
    {
        $receivedAt = $complaint->received_at;
        $existing = $complaint->deadlines()->pluck('kind')->map(fn ($k) => $k instanceof DeadlineKind ? $k->value : $k)->all();
        $final = null;

        foreach ([DeadlineKind::Accuse, DeadlineKind::ReponseFinale] as $kind) {
            $rule = $this->applicableRule($kind, $receivedAt);
            if ($rule === null) {
                continue;
            }
            $due = $this->computeDue($rule, $receivedAt);
            if ($kind === DeadlineKind::ReponseFinale) {
                $final = $due;
            }
            if (! in_array($kind->value, $existing, true)) {
                $this->createDeadline($complaint, $rule, $kind, $due);
            }
        }

        if ($final !== null && ! in_array(DeadlineKind::Prealerte->value, $existing, true)) {
            $rule = $this->applicableRule(DeadlineKind::Prealerte, $receivedAt);
            if ($rule !== null) {
                $this->createDeadline($complaint, $rule, DeadlineKind::Prealerte, $this->computePrealert($rule, $final));
            }
        }

        $complaint->unsetRelation('deadlines');
    }

    private function createDeadline(Complaint $complaint, DeadlineRule $rule, DeadlineKind $kind, CarbonImmutable $due): ComplaintDeadline
    {
        return ComplaintDeadline::query()->create([
            'complaint_id' => $complaint->id,
            'deadline_rule_id' => $rule->id,
            'rule_version' => $rule->version,
            'kind' => $kind,
            'unit' => $rule->unit,
            'due_at' => $due,
            'initial_due_at' => $due,
            'status' => DeadlineStatus::EnCours,
        ]);
    }

    /** Marque une échéance comme atteinte (respectée ou respectée en retard). */
    public function markMet(Complaint $complaint, DeadlineKind $kind, CarbonInterface $metAt): void
    {
        $deadline = $complaint->deadlines()->where('kind', $kind->value)->first();
        if ($deadline === null || $deadline->met_at !== null) {
            return;
        }
        $deadline->met_at = $metAt;
        $deadline->status = $metAt->greaterThan($deadline->due_at) ? DeadlineStatus::RespecteeEnRetard : DeadlineStatus::Respectee;
        $deadline->save();

        if ($kind === DeadlineKind::ReponseFinale) {
            $pre = $complaint->deadlines()->where('kind', DeadlineKind::Prealerte->value)->whereNull('met_at')->first();
            if ($pre !== null) {
                $pre->met_at = $metAt;
                $pre->status = $metAt->greaterThan($pre->due_at) ? DeadlineStatus::RespecteeEnRetard : DeadlineStatus::Respectee;
                $pre->save();
            }
        }
    }

    /** Met à jour le statut « depassee » des échéances non atteintes et échues. */
    public function refreshOverdue(?CarbonInterface $now = null): int
    {
        $now ??= Dt::now();

        return ComplaintDeadline::query()
            ->whereNull('met_at')
            ->where('status', DeadlineStatus::EnCours->value)
            ->where('due_at', '<', Dt::db($now))
            ->update(['status' => DeadlineStatus::Depassee->value, 'updated_at' => Dt::db($now)]);
    }

    /**
     * Signal d'échéance calculé (§6) à l'instant $asOf (défaut : maintenant).
     *
     * « À risque » : dossier ouvert, non en retard, dont la pré-alerte est atteinte ou dont
     * l'accusé de réception, non envoyé, arrive à échéance au plus tard le jour de calcul.
     */
    public function flag(Complaint $complaint, ?CarbonInterface $asOf = null): DeadlineFlag
    {
        $asOf ??= Dt::now();
        $final = $complaint->deadlineOf(DeadlineKind::ReponseFinale);
        if ($final === null) {
            return DeadlineFlag::SansRegle;
        }
        $respondedAt = $complaint->final_response_at;
        if ($respondedAt !== null && $respondedAt->lessThanOrEqualTo($asOf)) {
            return $respondedAt->greaterThan($final->due_at) ? DeadlineFlag::ClosEnRetard : DeadlineFlag::Ok;
        }
        if ($final->due_at->lessThan($asOf)) {
            return DeadlineFlag::EnRetard;
        }
        $pre = $complaint->deadlineOf(DeadlineKind::Prealerte);
        if ($pre !== null && $pre->due_at->lessThanOrEqualTo($asOf)) {
            return DeadlineFlag::ARisque;
        }
        $ack = $complaint->deadlineOf(DeadlineKind::Accuse);
        // acknowledged_at n'est renseigné que lorsque l'accusé a été envoyé avec succès.
        $ackDone = $complaint->acknowledged_at !== null && $complaint->acknowledged_at->lessThanOrEqualTo($asOf);
        if ($ack !== null && $ack->due_at->lessThanOrEqualTo(Dt::endOfLocalDay($asOf)) && ! $ackDone) {
            return DeadlineFlag::ARisque;
        }

        return DeadlineFlag::Ok;
    }
}
