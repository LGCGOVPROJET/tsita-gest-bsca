<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Http\Resources\AdminReferentialResource;
use App\Models\AuditLog;
use App\Models\DeadlineRule;
use App\Services\AuditLogger;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * SEC-02 à SEC-05 (faiblesses signalées) + audit, en-têtes, CORS, erreurs génériques.
 */
final class AdminAndConfigHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    // ---------------------------------------------------------------- SEC-02 export direction

    #[Test]
    public function l_export_du_rapport_par_la_direction_est_agrege_anonymise_et_journalise(): void
    {
        $period = ['from' => '2026-01-01', 'to' => '2026-06-30'];
        $this->actingAs($this->user('conformite'));
        $this->postJson('/api/v1/reports/activity/validate', $period + ['comment' => 'OK'])->assertCreated();
        $validator = $this->user('conformite')->name;

        // Conformité (complaints.export) : export complet, nom du validateur présent.
        $full = (string) $this->get('/api/v1/reports/activity?format=csv&'.http_build_query($period))->assertOk()->getContent();
        $this->assertStringContainsString($validator, $full);

        // Direction (reports.view sans complaints.export) : export agrégé anonymisé.
        $this->actingAs($this->user('direction'));
        $anon = (string) $this->get('/api/v1/reports/activity?format=csv&'.http_build_query($period))->assertOk()->getContent();
        $this->assertStringNotContainsString($validator, $anon);
        $this->assertStringContainsString('Export agrégé anonymisé', $anon);
        $this->assertStringContainsString('Conformité (validation n°', $anon);
        $log = AuditLog::query()->where('action', 'export.rapport-activite')->where('user_id', $this->user('direction')->id)->latest('id')->firstOrFail();
        $this->assertTrue($log->after['anonymized']);
        $this->assertDatabaseHas('exports', ['user_id' => $this->user('direction')->id, 'type' => 'rapport-activite']);

        // Export nominatif (liste des dossiers) : refusé dès le routage.
        $this->getJson('/api/v1/complaints/export?format=csv')->assertForbidden();
        $this->assertContains('can:complaints.export', Route::getRoutes()->match(request()->create('/api/v1/complaints/export'))->gatherMiddleware());
    }

    // ---------------------------------------------------------------- SEC-03 règles de délai

    #[Test]
    public function les_routes_des_regles_de_delai_portent_un_middleware_can(): void
    {
        $expect = [
            ['GET', '/api/v1/admin/deadline-rules', 'can:viewAny,App\Models\DeadlineRule'],
            ['POST', '/api/v1/admin/deadline-rules', 'can:admin.rules'],
            ['PATCH', '/api/v1/admin/deadline-rules/1', 'can:admin.rules'],
            ['DELETE', '/api/v1/admin/deadline-rules/1', 'can:admin.rules'],
            ['POST', '/api/v1/admin/deadline-rules/1/validate', 'can:admin.rules.validate'],
        ];
        foreach ($expect as [$method, $uri, $mw]) {
            $route = Route::getRoutes()->match(request()->create($uri, $method));
            $this->assertContains($mw, $route->gatherMiddleware(), "{$method} {$uri}");
        }

        $rule = DeadlineRule::query()->firstOrFail();
        $this->actingAs($this->user('gestionnaire'));
        $this->getJson('/api/v1/admin/deadline-rules')->assertForbidden();
        $this->actingAs($this->user('conformite'));
        $this->getJson('/api/v1/admin/deadline-rules')->assertOk();
        $this->postJson('/api/v1/admin/deadline-rules', [])->assertForbidden();
        $this->patchJson("/api/v1/admin/deadline-rules/{$rule->id}", ['label' => 'x'])->assertForbidden();
        $this->actingAs($this->user('admin'));
        $this->postJson("/api/v1/admin/deadline-rules/{$rule->id}/validate")->assertForbidden();
    }

    // ---------------------------------------------------------------- SEC-04 ressources admin

    #[Test]
    public function les_referentiels_d_administration_n_exposent_que_la_liste_blanche(): void
    {
        $this->actingAs($this->user('admin'));
        foreach (AdminReferentialResource::FIELDS as $type => $fields) {
            $rows = $this->getJson("/api/v1/admin/{$type}")->assertOk()->json('data');
            $this->assertNotEmpty($rows, $type);
            foreach ($rows as $row) {
                $this->assertSame([], array_diff(array_keys($row), $fields), "{$type} : champ hors liste blanche");
            }
        }
        $created = $this->postJson('/api/v1/admin/products', ['code' => 'TEST_SEC', 'label' => 'Produit test'])->assertCreated()->json('data');
        $this->assertSame([], array_diff(array_keys($created), AdminReferentialResource::FIELDS['products']));

        // Utilisateurs : jamais password, mfa_secret, remember_token, failed_logins.
        $users = $this->getJson('/api/v1/admin/users?per_page=100')->assertOk()->json('data');
        $json = (string) json_encode($users);
        foreach (['password', 'mfa_secret', 'remember_token', 'failed_logins', '$2y$'] as $secret) {
            $this->assertStringNotContainsString($secret, $json);
        }
    }

    // ---------------------------------------------------------------- SEC-05 pagination

    #[Test]
    public function imports_et_regles_de_delai_sont_pagines(): void
    {
        $this->actingAs($this->user('admin'));
        $rules = $this->getJson('/api/v1/admin/deadline-rules?per_page=2')->assertOk();
        $rules->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'per_page', 'total']]);
        $this->assertLessThanOrEqual(2, count($rules->json('data')));
        $this->assertSame(2, $rules->json('meta.per_page'));
        $this->getJson('/api/v1/admin/deadline-rules?per_page=1000')->assertStatus(422);

        $this->getJson('/api/v1/admin/imports')->assertOk()->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'per_page', 'total']])
            ->assertJsonPath('meta.per_page', 25);
        $this->getJson('/api/v1/admin/imports?per_page=1000')->assertStatus(422);
        $this->getJson('/api/v1/admin/audit-logs?per_page=1000')->assertStatus(422);
        $this->getJson('/api/v1/admin/users?per_page=1000')->assertStatus(422);
    }

    // ---------------------------------------------------------------- Audit

    #[Test]
    public function le_journal_masque_les_champs_sensibles_meme_imbriques_et_reste_immuable(): void
    {
        $log = app(AuditLogger::class)->log('test.redaction', null, ['password' => 'x'], [
            'user' => ['password' => 'Secret#2026', 'mfa_code' => '123456', 'Token' => 'abc', 'name' => 'ok'],
            'mfa_secret' => 'JBSWY3DP', 'customer_number' => 'DEMO-1',
        ]);
        $raw = (string) DB::table('audit_logs')->where('id', $log->id)->value('after');
        foreach (['Secret#2026', '123456', 'abc', 'JBSWY3DP', 'DEMO-1'] as $secret) {
            $this->assertStringNotContainsString($secret, $raw);
        }
        $this->assertStringContainsString('ok', $raw);

        // Changement de mot de passe par l'admin : jamais d'empreinte dans avant/après.
        $this->actingAs($this->user('admin'));
        $this->patchJson('/api/v1/admin/users/'.$this->user('gestionnaire')->id, ['password' => 'Nouveau#Motdepasse26'])->assertOk();
        $this->assertStringNotContainsString('$2y$', (string) json_encode(AuditLog::query()->where('action', 'admin.users.update')->get(['before', 'after'])));

        // Immuabilité : modèle + déclencheurs MySQL.
        $this->expectException(\LogicException::class);
        $log->update(['action' => 'falsifie']);
    }

    #[Test]
    public function les_declencheurs_mysql_interdisent_modification_et_suppression_du_journal(): void
    {
        $log = app(AuditLogger::class)->log('test.immuable');
        foreach ([
            fn () => DB::table('audit_logs')->where('id', $log->id)->update(['action' => 'x']),
            fn () => DB::table('audit_logs')->where('id', $log->id)->delete(),
        ] as $attempt) {
            try {
                $attempt();
                $this->fail('Le journal d\'audit a été modifié.');
            } catch (QueryException $e) {
                $this->assertStringContainsString('ajout seul', $e->getMessage());
            }
        }
    }

    #[Test]
    public function consultations_telechargements_et_exports_sont_journalises(): void
    {
        $c = $this->makeComplaint([], 'K7M4P9QX');
        $this->postJson('/api/v1/public/track', ['reference' => $c->reference, 'tracking_code' => 'K7M4P9QX'])->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'public.track', 'auditable_id' => $c->id]);

        $this->actingAs($this->user('qualite'));
        $this->getJson("/api/v1/complaints/{$c->id}")->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'complaint.view', 'auditable_id' => $c->id, 'user_id' => $this->user('qualite')->id]);
        $this->get('/api/v1/complaints/export?format=csv')->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'export.reclamations', 'user_id' => $this->user('qualite')->id]);
    }

    // ---------------------------------------------------------------- En-têtes, CORS, erreurs

    #[Test]
    public function les_en_tetes_de_securite_couvrent_hsts_cache_et_permissions(): void
    {
        $res = $this->getJson('https://localhost/api/v1/public/referentials')->assertOk();
        $this->assertStringContainsString('max-age=31536000', (string) $res->headers->get('Strict-Transport-Security'));
        $this->assertStringContainsString('no-store', (string) $res->headers->get('Cache-Control'));
        $this->assertStringContainsString("frame-ancestors 'none'", (string) $res->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('camera=()', (string) $res->headers->get('Permissions-Policy'));
        $this->assertFalse($res->headers->has('X-Powered-By'));
        $this->assertNull($this->getJson('http://localhost/api/v1/public/referentials')->headers->get('Strict-Transport-Security'));
    }

    #[Test]
    public function cors_n_autorise_que_l_origine_du_front(): void
    {
        $ok = $this->call('OPTIONS', '/api/v1/auth/login', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost:5180', 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ]);
        $this->assertSame('http://localhost:5180', $ok->headers->get('Access-Control-Allow-Origin'));
        $this->assertSame('true', $ok->headers->get('Access-Control-Allow-Credentials'));

        $evil = $this->call('OPTIONS', '/api/v1/auth/login', [], [], [], [
            'HTTP_ORIGIN' => 'https://evil.invalid', 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ]);
        $this->assertNotSame('https://evil.invalid', $evil->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $evil->headers->get('Access-Control-Allow-Origin'));
    }

    #[Test]
    public function les_erreurs_serveur_sont_generiques_sans_trace_hors_debug(): void
    {
        config()->set('app.debug', false);
        Route::middleware('api')->get('/api/v1/__test-erreur', static fn () => throw new \RuntimeException('SQLSTATE secret interne /var/www'));
        $res = $this->getJson('/api/v1/__test-erreur')->assertStatus(500);
        $body = (string) $res->getContent();
        $this->assertStringNotContainsString('secret interne', $body);
        $this->assertStringNotContainsString('trace', $body);
        $this->assertStringNotContainsString('/var/www', $body);
    }
}
