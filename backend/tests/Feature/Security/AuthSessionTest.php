<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Models\User;
use Database\Seeders\UserSeeder;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Authentification et session (ASVS V2/V3) : throttle, verrouillage, énumération, réinitialisation, sessions.
 */
final class AuthSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBase();
    }

    #[Test]
    public function la_pulverisation_de_mots_de_passe_depuis_une_ip_est_plafonnee(): void
    {
        // 5 essais/min par (email + IP) ne suffisent pas : plafond global de 20/min par IP.
        for ($i = 0; $i < 20; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => "cible{$i}@bsca.demo", 'password' => 'mauvais'])->assertStatus(422);
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'autre@bsca.demo', 'password' => 'mauvais'])->assertStatus(429);
        // Une autre IP n'est pas pénalisée.
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.9.9'])
            ->postJson('/api/v1/auth/login', ['email' => 'gestionnaire@bsca.demo', 'password' => UserSeeder::PASSWORD])->assertOk();
    }

    #[Test]
    public function le_verrouillage_ne_revele_pas_l_existence_d_un_compte(): void
    {
        $responses = [];
        foreach (['qualite@bsca.demo', 'fantome@bsca.demo'] as $n => $email) {
            for ($i = 0; $i < 10; $i++) {
                $this->withServerVariables(['REMOTE_ADDR' => "10.{$n}.1.".($i + 1)])
                    ->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'mauvais'])->assertStatus(422);
            }
            $responses[] = $this->withServerVariables(['REMOTE_ADDR' => "10.{$n}.2.1"])
                ->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'mauvais'])->assertStatus(422)->json();
        }
        $this->assertSame($responses[0], $responses[1]);
        $this->assertSame(['Compte temporairement verrouillé. Réessayez plus tard.'], $responses[1]['errors']['email']);
    }

    #[Test]
    public function mot_de_passe_oublie_reponse_identique_et_lien_envoye_seulement_au_compte_existant(): void
    {
        Notification::fake();
        $known = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'Gestionnaire@BSCA.demo'])->assertOk();
        $unknown = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'personne@bsca.demo'])->assertOk();
        $this->assertSame($known->json(), $unknown->json());
        Notification::assertSentTo($this->user('gestionnaire'), ResetPassword::class);
        Notification::assertCount(1);
    }

    #[Test]
    public function le_jeton_de_reinitialisation_est_a_usage_unique_et_expire(): void
    {
        $user = $this->user('gestionnaire');
        $token = Password::broker()->createToken($user);
        $payload = ['email' => $user->email, 'token' => $token, 'password' => 'Nouveau#Motdepasse26', 'password_confirmation' => 'Nouveau#Motdepasse26'];

        $this->postJson('/api/v1/auth/reset-password', $payload)->assertOk();
        $this->assertTrue(Hash::check('Nouveau#Motdepasse26', $user->refresh()->password));
        $this->postJson('/api/v1/auth/reset-password', ['password' => 'Encore#Autre2026x', 'password_confirmation' => 'Encore#Autre2026x'] + $payload)
            ->assertStatus(422)->assertJsonValidationErrors(['token']);

        $token2 = Password::broker()->createToken($user);
        $this->travel(61)->minutes();
        $this->postJson('/api/v1/auth/reset-password', ['token' => $token2] + $payload)->assertStatus(422)->assertJsonValidationErrors(['token']);

        // Mot de passe faible refusé même avec un jeton valide.
        $token3 = Password::broker()->createToken($user);
        $this->postJson('/api/v1/auth/reset-password', ['token' => $token3, 'password' => 'faible', 'password_confirmation' => 'faible'] + $payload)
            ->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    #[Test]
    public function la_reinitialisation_et_le_changement_de_mot_de_passe_revoquent_les_sessions(): void
    {
        config()->set('session.driver', 'database');
        $user = $this->user('gestionnaire');
        $insert = fn (string $id) => DB::table('sessions')->insert(['id' => $id, 'user_id' => $user->id, 'ip_address' => '10.0.0.1', 'user_agent' => 'test', 'payload' => '', 'last_activity' => time()]);

        $insert('session-volee-1');
        $token = Password::broker()->createToken($user);
        $this->postJson('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'Nouveau#Motdepasse26', 'password_confirmation' => 'Nouveau#Motdepasse26'])->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'session-volee-1']);

        $insert('session-volee-2');
        $this->actingAs($this->user('admin'));
        $this->patchJson("/api/v1/admin/users/{$user->id}", ['password' => 'Admin#Change2026x'])->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'session-volee-2']);

        $insert('session-volee-3');
        $this->patchJson("/api/v1/admin/users/{$user->id}", ['is_active' => false])->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'session-volee-3']);
    }

    #[Test]
    public function la_deconnexion_invalide_la_session(): void
    {
        $this->spa()->postJson('/api/v1/auth/login', ['email' => 'gestionnaire@bsca.demo', 'password' => UserSeeder::PASSWORD])->assertOk();
        $this->getJson('/api/v1/auth/me')->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertGuest('web');
        // Comme en production (une requête = une application neuve) : aucun garde mis en cache.
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->getJson('/api/v1/complaints')->assertUnauthorized();
    }

    #[Test]
    public function un_compte_desactive_ou_verrouille_perd_l_acces_immediatement(): void
    {
        $user = $this->user('gestionnaire');
        $this->actingAs($user);
        $this->getJson('/api/v1/complaints')->assertOk();
        $user->forceFill(['is_active' => false])->save();
        $this->getJson('/api/v1/complaints')->assertUnauthorized();

        $user->forceFill(['is_active' => true, 'locked_until' => now()->addMinutes(10)])->save();
        $this->actingAs($user->refresh());
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    #[Test]
    public function les_parametres_de_session_et_de_cookie_sont_durcis(): void
    {
        $this->assertSame(30, (int) config('session.lifetime'), 'Expiration 30 min d\'inactivité');
        $this->assertTrue((bool) config('session.http_only'));
        $this->assertSame('lax', config('session.same_site'));
        $this->assertTrue((bool) config('session.encrypt'));
        $this->assertFalse((bool) config('session.expire_on_close'));
        $this->assertContains('web', (array) config('sanctum.guard'));
        $this->assertSame(60, (int) config('auth.passwords.users.expire'));
        // Le mot de passe et le secret MFA ne sont jamais sérialisés.
        $json = json_encode(User::query()->first()->toArray());
        $this->assertStringNotContainsString('password', (string) $json);
        $this->assertStringNotContainsString('mfa_secret', (string) $json);
        $this->assertStringNotContainsString('remember_token', (string) $json);
    }

    #[Test]
    public function la_session_est_regeneree_a_la_connexion(): void
    {
        $this->startSession();
        $before = session()->getId();
        $this->spa()->postJson('/api/v1/auth/login', ['email' => 'gestionnaire@bsca.demo', 'password' => UserSeeder::PASSWORD])->assertOk();
        $this->assertNotSame($before, session()->getId(), 'Protection contre la fixation de session');
    }
}
