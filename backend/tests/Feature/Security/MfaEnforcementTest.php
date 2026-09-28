<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Services\TotpService;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * SEC-01 : MFA imposée aux rôles sensibles (MFA_ENFORCED_ROLES), état « enrôlement obligatoire ».
 */
final class MfaEnforcementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
        config()->set('security.mfa.enforce_in_demo', true);
        config()->set('security.mfa.enforced_roles', ['conformite', 'admin', 'responsable', 'direction']);
    }

    private function login(string $who, array $extra = []): TestResponse
    {
        return $this->spa()->postJson('/api/v1/auth/login', ['email' => $who.'@bsca.demo', 'password' => UserSeeder::PASSWORD] + $extra);
    }

    #[Test]
    public function un_role_sensible_sans_mfa_est_en_etat_d_enrolement_obligatoire(): void
    {
        $this->login('responsable')->assertOk()
            ->assertJsonPath('data.mfa_enrollment_required', true)
            ->assertJsonPath('data.mfa_required', true)
            ->assertJsonPath('data.mfa_enabled', false);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_enrollment_required']);

        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.mfa_enrollment_required', true);
        foreach (['/api/v1/complaints', '/api/v1/dashboard', '/api/v1/referentials', '/api/v1/solutions'] as $uri) {
            $this->getJson($uri)->assertForbidden()->assertJsonPath('mfa_enrollment_required', true);
        }

        $setup = $this->postJson('/api/v1/auth/mfa/setup')->assertOk()->json();
        $code = app(TotpService::class)->currentCode($setup['secret']);
        $this->postJson('/api/v1/auth/mfa/confirm', ['code' => $code])->assertOk()
            ->assertJsonPath('data.mfa_enabled', true)
            ->assertJsonPath('data.mfa_enrollment_required', false);
        $this->getJson('/api/v1/complaints')->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
    }

    #[Test]
    public function chaque_role_sensible_est_bloque_et_les_autres_non(): void
    {
        foreach (['admin' => '/api/v1/admin/users', 'conformite' => '/api/v1/complaints', 'direction' => '/api/v1/dashboard'] as $who => $uri) {
            $this->actingAs($this->user($who));
            $this->getJson($uri)->assertForbidden()->assertJsonPath('mfa_enrollment_required', true);
        }
        foreach (['gestionnaire', 'accueil', 'qualite'] as $who) {
            $this->actingAs($this->user($who));
            $this->getJson('/api/v1/auth/me')->assertJsonPath('data.mfa_enrollment_required', false);
            $this->getJson('/api/v1/complaints')->assertOk();
        }
        $this->actingAs($this->user('client'));
        $this->getJson('/api/v1/client/complaints')->assertOk();
    }

    #[Test]
    public function l_imposition_est_desactivable_en_demo_uniquement(): void
    {
        config()->set('security.mfa.enforce_in_demo', false);
        config()->set('app.demo_mode', true);
        $this->actingAs($this->user('responsable'));
        $this->getJson('/api/v1/complaints')->assertOk();
        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.mfa_enrollment_required', false);

        // Hors démo, le drapeau est ignoré : l'imposition reste active.
        config()->set('app.demo_mode', false);
        $this->getJson('/api/v1/complaints')->assertForbidden()->assertJsonPath('mfa_enrollment_required', true);
    }

    #[Test]
    public function la_reinitialisation_mfa_par_l_admin_rend_l_enrolement_de_nouveau_obligatoire(): void
    {
        $totp = app(TotpService::class);
        $resp = $this->user('responsable');
        $secret = $totp->generateSecret();
        $resp->forceFill(['mfa_secret' => $secret, 'mfa_enabled' => true])->save();
        $this->actingAs($resp);
        $this->getJson('/api/v1/complaints')->assertOk();

        $admin = $this->user('admin');
        $admin->forceFill(['mfa_secret' => $totp->generateSecret(), 'mfa_enabled' => true])->save();
        $this->actingAs($admin);
        $this->patchJson("/api/v1/admin/users/{$resp->id}", ['reset_mfa' => true])->assertOk();

        $this->actingAs($resp->refresh());
        $this->getJson('/api/v1/complaints')->assertForbidden()->assertJsonPath('mfa_enrollment_required', true);
    }

    #[Test]
    public function un_code_totp_ne_peut_pas_etre_rejoue(): void
    {
        $totp = app(TotpService::class);
        $user = $this->user('conformite');
        $secret = $totp->generateSecret();
        $user->forceFill(['mfa_secret' => $secret, 'mfa_enabled' => true])->save();
        $code = $totp->currentCode($secret);

        $this->login('conformite', ['mfa_code' => $code])->assertOk()->assertJsonPath('data.mfa_enrollment_required', false);
        auth('web')->logout();
        $this->login('conformite', ['mfa_code' => $code])->assertStatus(422)->assertJsonValidationErrors(['mfa_code']);
    }
}
