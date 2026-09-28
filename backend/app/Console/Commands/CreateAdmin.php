<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\Role;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Crée (ou promeut) un compte Administrateur fonctionnel et technique.
 * Le mot de passe n'est jamais passé en argument (historique du shell) :
 * saisie masquée, ou lecture sur l'entrée standard avec --password-stdin.
 */
final class CreateAdmin extends Command
{
    protected $signature = 'tsita:create-admin
        {email : Adresse e-mail du compte}
        {--name= : Nom affiché (défaut : partie locale de l\'e-mail)}
        {--password-stdin : Lire le mot de passe sur l\'entrée standard}';

    protected $description = 'Crée un compte Administrateur (politique de mot de passe appliquée, action journalisée)';

    public function handle(AuditLogger $audit): int
    {
        $email = mb_strtolower(trim((string) $this->argument('email')));
        $name = (string) ($this->option('name') ?: ucfirst(strtok($email, '@') ?: 'Administrateur'));

        $password = $this->option('password-stdin')
            ? rtrim((string) stream_get_contents(STDIN), "\r\n")
            : (string) $this->secret('Mot de passe (12 caractères min., majuscule, minuscule, chiffre, symbole)');

        if (! $this->option('password-stdin')) {
            $confirm = (string) $this->secret('Confirmez le mot de passe');
            if (! hash_equals($password, $confirm)) {
                $this->error('Les deux mots de passe ne correspondent pas.');

                return self::FAILURE;
            }
        }

        $validator = Validator::make(
            ['email' => $email, 'name' => $name, 'password' => $password],
            ['email' => ['required', 'email', 'max:190'], 'name' => ['required', 'string', 'max:150'], 'password' => ['required', Password::defaults()]],
            [],
            ['email' => 'adresse e-mail', 'name' => 'nom', 'password' => 'mot de passe'],
        );
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $existing = User::query()->where('email', $email)->first();
        $before = $existing ? ['role' => $existing->role->value, 'is_active' => $existing->is_active] : null;

        $user = $existing ?? new User(['email' => $email]);
        $user->fill(['name' => $existing ? $user->name : $name, 'password' => $password, 'role' => Role::Admin->value, 'is_active' => true]);
        $user->save();

        $audit->log(
            $existing ? 'user.promoted_admin_cli' : 'user.created_admin_cli',
            $user,
            $before,
            ['role' => Role::Admin->value, 'is_active' => true],
            'Création en ligne de commande (tsita:create-admin)',
        );

        $this->info(($existing ? 'Compte existant promu Administrateur : ' : 'Compte Administrateur créé : ').$email);
        if (Role::Admin->requiresMfa()) {
            $this->line('Rappel : la double authentification est exigée pour ce rôle hors démonstration.');
        }

        return self::SUCCESS;
    }
}
