<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Admin;

use App\Enums\AnomalyResolution;
use App\Enums\Role;
use App\Enums\RuleSourceType;
use App\Enums\RuleStatus;
use App\Http\Controllers\Controller;
use App\Models\Agency;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\DeadlineRule;
use App\Models\Holiday;
use App\Models\ImportAnomaly;
use App\Models\ImportBatch;
use App\Models\ProcessingEntity;
use App\Models\Product;
use App\Models\ResponseTemplate;
use App\Models\User;
use App\Support\Dt;
use App\Support\MfaEnforcement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Vue d'ensemble de l'administration : chaque bloc n'est renvoyé que si l'utilisateur détient
 * la permission correspondante (admin.users, admin.rules[.validate], admin.referentials, admin.imports, admin.audit).
 * Aucune donnée de réclamation ni donnée client n'est exposée.
 */
final class AdminOverviewController extends Controller
{
    private const ADMIN_PERMISSIONS = ['admin.users', 'admin.referentials', 'admin.rules', 'admin.rules.validate', 'admin.audit', 'admin.imports'];

    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $can = fn (string ...$perms): bool => array_reduce($perms, fn (bool $c, string $p) => $c || $user->hasPermission($p), false);
        abort_unless($can(...self::ADMIN_PERMISSIONS), 403, 'Action non autorisée.');

        $data = [];
        if ($can('admin.users')) {
            $data['users'] = $this->users();
            $data['health'] = $this->health();
        }
        if ($can('admin.rules', 'admin.rules.validate')) {
            $data['rules'] = $this->rules();
        }
        if ($can('admin.referentials')) {
            $data['referentials'] = $this->referentials();
        }
        if ($can('admin.imports')) {
            $data['imports'] = $this->imports();
        }
        if ($can('admin.audit')) {
            $data['audit'] = $this->audit();
        }
        $data['meta'] = ['as_of' => Dt::iso(Dt::now()), 'timezone' => Dt::tz()];

        return response()->json(['data' => $data]);
    }

    /** @return array<string, mixed> */
    private function users(): array
    {
        $now = Dt::db(Dt::now());
        $staff = User::query()->where('role', '!=', Role::Client->value);
        $byRole = User::query()->select('role', DB::raw('count(*) as n'))->groupBy('role')->pluck('n', 'role');

        return [
            'total' => (clone $staff)->count(),
            'active' => (clone $staff)->where('is_active', true)->count(),
            'inactive' => (clone $staff)->where('is_active', false)->count(),
            'locked' => User::query()->where('locked_until', '>', $now)->count(),
            'mfa_enabled' => (clone $staff)->where('mfa_enabled', true)->count(),
            'never_logged' => (clone $staff)->whereNull('last_login_at')->count(),
            'clients' => (int) ($byRole[Role::Client->value] ?? 0),
            'recent_logins' => User::query()->whereNotNull('last_login_at')->orderByDesc('last_login_at')->limit(6)
                ->get(['id', 'name', 'role', 'last_login_at'])
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'role_label' => $u->role->label(), 'date' => Dt::iso($u->last_login_at)])->all(),
            'by_role' => array_values(array_map(
                fn (Role $r) => ['role' => $r->value, 'label' => $r->label(), 'count' => (int) ($byRole[$r->value] ?? 0)],
                array_filter(Role::cases(), fn (Role $r) => $r !== Role::Client),
            )),
        ];
    }

    /**
     * Points de vigilance avant mise en production (checklist docs/SECURITE.md).
     *
     * @return list<array{key: string, label: string, ok: bool, detail: string, to: string|null}>
     */
    private function health(): array
    {
        $demo = (bool) config('app.demo_mode');
        $mfaActive = MfaEnforcement::active();
        $validRules = DeadlineRule::query()->where('status', RuleStatus::Valide->value)->count();
        $demoAccounts = User::query()->where('email', 'like', '%@bsca.demo')->where('is_active', true)->count();
        $anomalies = ImportAnomaly::query()->where('resolution_status', AnomalyResolution::ATraiter->value)->count();
        $locked = User::query()->where('locked_until', '>', Dt::db(Dt::now()))->count();

        return [
            ['key' => 'demo_mode', 'label' => 'Mode démonstration', 'ok' => ! $demo, 'detail' => $demo ? 'Actif : les règles de délai de démonstration sont appliquées.' : 'Désactivé.', 'to' => null],
            ['key' => 'mfa', 'label' => 'Double authentification imposée', 'ok' => $mfaActive, 'detail' => $mfaActive ? 'Imposée aux rôles sensibles.' : 'Non imposée (désactivée en démonstration).', 'to' => null],
            ['key' => 'rules', 'label' => 'Règles de délai validées', 'ok' => $validRules > 0, 'detail' => $validRules > 0 ? "{$validRules} règle(s) validée(s) par la conformité." : 'Aucune règle validée par la conformité BSCA.', 'to' => '/app/parametres?onglet=regles'],
            ['key' => 'demo_accounts', 'label' => 'Comptes de démonstration', 'ok' => $demoAccounts === 0, 'detail' => $demoAccounts ? "{$demoAccounts} compte(s) @bsca.demo actif(s) à désactiver." : 'Aucun compte de démonstration actif.', 'to' => '/app/parametres?onglet=utilisateurs'],
            ['key' => 'debug', 'label' => 'Mode débogage', 'ok' => ! config('app.debug'), 'detail' => config('app.debug') ? 'APP_DEBUG=true : à désactiver en production.' : 'Désactivé.', 'to' => null],
            ['key' => 'anomalies', 'label' => 'Anomalies d’import', 'ok' => $anomalies === 0, 'detail' => $anomalies ? "{$anomalies} ligne(s) à traiter." : 'Aucune anomalie en attente.', 'to' => '/app/parametres?onglet=imports'],
            ['key' => 'locked', 'label' => 'Comptes verrouillés', 'ok' => $locked === 0, 'detail' => $locked ? "{$locked} compte(s) verrouillé(s) après échecs de connexion." : 'Aucun compte verrouillé.', 'to' => '/app/parametres?onglet=utilisateurs'],
        ];
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        $counts = DeadlineRule::query()->select('status', DB::raw('count(*) as n'))->groupBy('status')->pluck('n', 'status');

        return [
            'total' => (int) $counts->sum(),
            'valide' => (int) ($counts[RuleStatus::Valide->value] ?? 0),
            'a_valider' => (int) ($counts[RuleStatus::AValider->value] ?? 0),
            'brouillon' => (int) ($counts[RuleStatus::Brouillon->value] ?? 0),
            'retire' => (int) ($counts[RuleStatus::Retire->value] ?? 0),
            'demonstration' => DeadlineRule::query()->where('source_type', RuleSourceType::Demonstration->value)->where('status', '!=', RuleStatus::Retire->value)->count(),
            'pending' => DeadlineRule::query()->where('status', RuleStatus::AValider->value)->orderBy('kind')->limit(6)
                ->get(['id', 'label', 'kind', 'unit', 'duration', 'version', 'source_type'])
                ->map(fn (DeadlineRule $r) => [
                    'id' => $r->id,
                    'label' => $r->label,
                    'duration' => $r->duration,
                    'unit' => $r->unit->value,
                    'version' => $r->version,
                    'is_demo' => $r->source_type === RuleSourceType::Demonstration,
                ])->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function referentials(): array
    {
        $count = fn (string $model): array => ['total' => $model::query()->count(), 'active' => $model::query()->where('is_active', true)->count()];
        $today = Dt::today()->toDateString();

        return [
            'agencies' => $count(Agency::class),
            'entities' => $count(ProcessingEntity::class),
            'categories' => $count(Category::class),
            'products' => $count(Product::class),
            'templates' => $count(ResponseTemplate::class),
            'holidays_next' => Holiday::query()->where('date', '>=', $today)->orderBy('date')->limit(4)->get(['date', 'label'])
                ->map(fn (Holiday $h) => ['date' => $h->date->toDateString(), 'label' => $h->label])->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function imports(): array
    {
        $last = ImportBatch::query()->latest('id')->first();

        return [
            'batches' => ImportBatch::query()->count(),
            'anomalies_open' => ImportAnomaly::query()->where('resolution_status', AnomalyResolution::ATraiter->value)->count(),
            'last' => $last ? [
                'id' => $last->id,
                'filename' => $last->filename,
                'source_system' => $last->source_system,
                'date' => Dt::iso($last->created_at),
                'rows_total' => $last->rows_total,
                'rows_created' => $last->rows_created,
                'rows_skipped' => $last->rows_skipped,
                'rows_anomalies' => $last->rows_anomalies,
            ] : null,
        ];
    }

    /** @return array<string, mixed> */
    private function audit(): array
    {
        $tzOffset = Dt::now()->setTimezone(Dt::tz())->format('P'); // +01:00 (Brazzaville, sans heure d'été)
        $start = Dt::today()->subDays(13);
        $rows = AuditLog::query()
            ->where('created_at', '>=', Dt::db($start->setTimezone('UTC')))
            ->selectRaw("DATE(CONVERT_TZ(created_at, '+00:00', ?)) as d, count(*) as n", [$tzOffset])
            ->groupBy('d')->pluck('n', 'd');
        $series = [];
        for ($i = 0; $i < 14; $i++) {
            $day = $start->addDays($i);
            $series[] = ['date' => $day->toDateString(), 'label' => $day->locale('fr')->isoFormat('D MMM'), 'count' => (int) ($rows[$day->toDateString()] ?? 0)];
        }
        $weekStart = Dt::db(Dt::today()->subDays(6)->setTimezone('UTC'));

        return [
            'today' => (int) ($rows[Dt::today()->toDateString()] ?? 0),
            'last_7_days' => AuditLog::query()->where('created_at', '>=', $weekStart)->count(),
            'daily' => $series,
            'top_actions' => AuditLog::query()->where('created_at', '>=', $weekStart)
                ->select('action', DB::raw('count(*) as n'))->groupBy('action')->orderByDesc('n')->limit(5)
                ->get()->map(fn ($r) => ['label' => $r->action, 'count' => (int) $r->n])->all(),
            'recent' => AuditLog::query()->with('user:id,name')->latest('id')->limit(8)->get()
                ->map(fn (AuditLog $l) => [
                    'id' => $l->id,
                    'date' => Dt::iso($l->created_at),
                    'action' => $l->action,
                    'user' => $l->user?->name,
                    'target' => $l->auditable_type ? trim($l->auditable_type.' #'.$l->auditable_id) : null,
                ])->all(),
        ];
    }
}
