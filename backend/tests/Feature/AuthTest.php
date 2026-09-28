<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Services\TotpService;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    #[Test]
    public function la_connexion_renvoie_l_utilisateur(): void
    {
        $res = $this->spa()->postJson('/api/v1/auth/login', ['email' => 'gestionnaire@bsca.demo', 'password' => UserSeeder::PASSWORD])
            ->assertOk()->json('data');
        $this->assertSame('gestionnaire', $res['role']);
        $this->assertContains('solutions.propose', $res['permissions']);
        $this->assertAuthenticatedAs($this->user('gestionnaire'), 'web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login', 'user_id' => $res['id']]);
    }

    #[Test]
    public function un_mauvais_mot_de_passe_renvoie_un_message_neutre(): void
    {
        $bad = $this->spa()->postJson('/api/v1/auth/login', ['email' => 'gestionnaire@bsca.demo', 'password' => 'mauvais'])->assertStatus(422);
        $unknown = $this->spa()->postJson('/api/v1/auth/login', ['email' => 'inconnu@bsca.demo', 'password' => 'mauvais'])->assertStatus(422);
        $this->assertSame($bad->json('message'), $unknown->json('message'));
        $this->assertGuest('web');
    }

    #[Test]
    public function la_connexion_est_limitee_a_cinq_tentatives_par_minute(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'qualite@bsca.demo', 'password' => 'mauvais'])->assertStatus(422);
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'qualite@bsca.demo', 'password' => UserSeeder::PASSWORD])->assertStatus(429);
    }

    #[Test]
    public function le_compte_est_verrouille_quinze_minutes_apres_dix_echecs(): void
    {
        for ($i = 0; $i < 10; $i++) {
            RateLimiter::clear('qualite@bsca.demo|127.0.0.1');
            $this->withServerVariables(['REMOTE_ADDR' => '10.1.0.'.($i + 1)])
                ->postJson('/api/v1/auth/login', ['email' => 'qualite@bsca.demo', 'password' => 'mauvais'])->assertStatus(422);
        }
        $user = $this->user('qualite');
        $this->assertTrue($user->isLocked());
        $this->withServerVariables(['REMOTE_ADDR' => '10.2.0.1'])
            ->postJson('/api/v1/auth/login', ['email' => 'qualite@bsca.demo', 'password' => UserSeeder::PASSWORD])
            ->assertStatus(422)->assertJsonFragment(['email' => ['Compte temporairement verrouillé. Réessayez plus tard.']]);

        $this->travel(16)->minutes();
        $this->withServerVariables(['REMOTE_ADDR' => '10.3.0.1'])
            ->postJson('/api/v1/auth/login', ['email' => 'qualite@bsca.demo', 'password' => UserSeeder::PASSWORD])->assertOk();
    }

    #[Test]
    public function la_mfa_totp_est_exigee_une_fois_activee(): void
    {
        $totp = app(TotpService::class);
        $user = $this->user('conformite');
        $this->actingAs($user);
        $setup = $this->postJson('/api/v1/auth/mfa/setup')->assertOk()->json();
        $this->assertStringStartsWith('otpauth://totp/', $setup['otpauth_url']);
        $this->postJson('/api/v1/auth/mfa/confirm', ['code' => '000000'])->assertStatus(422);
        $this->postJson('/api/v1/auth/mfa/confirm', ['code' => $totp->currentCode($setup['secret'])])->assertOk()->assertJsonPath('data.mfa_enabled', true);
        $this->assertNotSame($setup['secret'], User::query()->whereKey($user->id)->toBase()->value('mfa_secret'), 'Secret chiffré en base');
        auth('web')->logout();

        $this->spa()->postJson('/api/v1/auth/login', ['email' => 'conformite@bsca.demo', 'password' => UserSeeder::PASSWORD])
            ->assertOk()->assertExactJson(['mfa_required' => true]);
        $this->assertGuest('web');
        $this->spa()->postJson('/api/v1/auth/login', ['email' => 'conformite@bsca.demo', 'password' => UserSeeder::PASSWORD, 'mfa_code' => $totp->currentCode($setup['secret'])])
            ->assertOk()->assertJsonPath('data.role', 'conformite');
    }

    #[Test]
    public function le_mot_de_passe_oublie_renvoie_toujours_le_meme_message(): void
    {
        Notification::fake();
        $a = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'gestionnaire@bsca.demo'])->assertOk()->json();
        $b = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'personne@bsca.demo'])->assertOk()->json();
        $this->assertSame($a, $b);
    }

    #[Test]
    public function la_politique_de_mot_de_passe_est_appliquee(): void
    {
        $this->actingAs($this->user('admin'));
        $this->postJson('/api/v1/admin/users', ['name' => 'Test fictif', 'email' => 'test@bsca.demo', 'password' => 'court', 'role' => 'gestionnaire'])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->postJson('/api/v1/admin/users', ['name' => 'Test fictif', 'email' => 'test@bsca.demo', 'password' => 'Motdepasse#2026', 'role' => 'gestionnaire'])
            ->assertCreated();
    }

    #[Test]
    public function la_deconnexion_renvoie_204(): void
    {
        $this->actingAs($this->user('gestionnaire'));
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
    }
}
