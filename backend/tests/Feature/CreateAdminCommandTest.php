<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class CreateAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    private const PROMPT = 'Mot de passe (12 caractères min., majuscule, minuscule, chiffre, symbole)';

    #[Test]
    public function un_mot_de_passe_trop_court_est_refuse(): void
    {
        $this->artisan('tsita:create-admin', ['email' => 'admin.test@exemple.invalid'])
            ->expectsQuestion(self::PROMPT, 'Court2023@')
            ->expectsQuestion('Confirmez le mot de passe', 'Court2023@')
            ->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'admin.test@exemple.invalid']);
    }

    #[Test]
    public function un_mot_de_passe_conforme_cree_un_administrateur_journalise(): void
    {
        $this->artisan('tsita:create-admin', ['email' => 'Admin.Test@Exemple.invalid'])
            ->expectsQuestion(self::PROMPT, 'Fictif-Test-2026!')
            ->expectsQuestion('Confirmez le mot de passe', 'Fictif-Test-2026!')
            ->assertSuccessful();

        $user = User::query()->where('email', 'admin.test@exemple.invalid')->firstOrFail();
        $this->assertSame(Role::Admin, $user->role);
        $this->assertTrue($user->is_active);
        $this->assertTrue(Hash::check('Fictif-Test-2026!', $user->password));
        $log = AuditLog::query()->where('action', 'user.created_admin_cli')->firstOrFail();
        $this->assertStringNotContainsString('Fictif-Test-2026!', json_encode($log->toArray(), JSON_THROW_ON_ERROR));
    }

    #[Test]
    public function la_confirmation_differente_est_refusee(): void
    {
        $this->artisan('tsita:create-admin', ['email' => 'admin.test@exemple.invalid'])
            ->expectsQuestion(self::PROMPT, 'Fictif-Test-2026!')
            ->expectsQuestion('Confirmez le mot de passe', 'Autre-Test-2026!')
            ->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'admin.test@exemple.invalid']);
    }
}
