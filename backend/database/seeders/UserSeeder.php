<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\ProcessingEntity;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Comptes de démonstration (§11). Mot de passe commun : Bsca@Demo2026! (à changer hors démo).
 * Noms 100 % fictifs.
 */
class UserSeeder extends Seeder
{
    public const PASSWORD = 'Bsca@Demo2026!';

    public function run(): void
    {
        $hash = Hash::make(self::PASSWORD);
        $agency = fn (string $code) => Agency::query()->where('code', $code)->value('id');
        $entity = fn (string $code) => ProcessingEntity::query()->where('code', $code)->value('id');

        $clientCustomer = Customer::query()->create([
            'full_name' => 'Grâce Mabiala-Démo',
            'email' => 'client@bsca.demo',
            'phone' => '+242 06 000 00 01',
            'customer_number' => 'DEMO-000001',
            'preferred_channel' => 'courriel',
        ]);

        $accounts = [
            ['admin@bsca.demo', 'Alain Démo (Administrateur)', Role::Admin, null, null, null],
            ['accueil@bsca.demo', 'Aurore Démo (Accueil)', Role::AgentAccueil, 'BZV-CTR', null, null],
            ['gestionnaire@bsca.demo', 'Gaël Démo (Gestionnaire)', Role::Gestionnaire, null, 'CARTES', null],
            ['responsable@bsca.demo', 'Rachel Démo (Responsable)', Role::Responsable, null, 'CARTES', null],
            ['qualite@bsca.demo', 'Quentin Démo (Qualité)', Role::Qualite, null, null, null],
            ['conformite@bsca.demo', 'Constance Démo (Conformité)', Role::Conformite, null, null, null],
            ['direction@bsca.demo', 'Denis Démo (Direction)', Role::Direction, null, null, null],
            ['client@bsca.demo', 'Grâce Mabiala-Démo', Role::Client, null, null, $clientCustomer->id],
        ];

        // Collaborateurs supplémentaires fictifs (gestionnaires, responsables, agents).
        $extra = [
            ['g.cartes2@bsca.demo', 'Brice Nkounkou (fictif)', Role::Gestionnaire, null, 'CARTES'],
            ['g.comptes1@bsca.demo', 'Estelle Moukala (fictif)', Role::Gestionnaire, null, 'COMPTES'],
            ['g.comptes2@bsca.demo', 'Hervé Samba (fictif)', Role::Gestionnaire, null, 'COMPTES'],
            ['g.virements1@bsca.demo', 'Laetitia Bouanga (fictif)', Role::Gestionnaire, null, 'VIREMENTS'],
            ['g.virements2@bsca.demo', 'Olivier Mavoungou (fictif)', Role::Gestionnaire, null, 'VIREMENTS'],
            ['g.digital1@bsca.demo', 'Prisca Kimbembe (fictif)', Role::Gestionnaire, null, 'DIGITAL'],
            ['g.credits1@bsca.demo', 'Rodrigue Okemba (fictif)', Role::Gestionnaire, null, 'CREDITS'],
            ['r.comptes@bsca.demo', 'Sandrine Ondongo (fictif)', Role::Responsable, null, 'COMPTES'],
            ['r.virements@bsca.demo', 'Trésor Mboungou (fictif)', Role::Responsable, null, 'VIREMENTS'],
            ['r.digital@bsca.demo', 'Vanessa Ibara (fictif)', Role::Responsable, null, 'DIGITAL'],
            ['r.credits@bsca.demo', 'Wilfried Loubaki (fictif)', Role::Responsable, null, 'CREDITS'],
            ['a.potopoto@bsca.demo', 'Yannick Ngoma (fictif)', Role::AgentAccueil, 'BZV-PTP', null],
            ['a.pnrcentre@bsca.demo', 'Zita Massengo (fictif)', Role::AgentAccueil, 'PNR-CTR', null],
            ['a.lumumba@bsca.demo', 'Fabrice Bakala (fictif)', Role::AgentAccueil, 'PNR-LUM', null],
            ['a.dolisie@bsca.demo', 'Inès Makosso (fictif)', Role::AgentAccueil, 'DOL', null],
            ['a.oyo@bsca.demo', 'Kevin Obambi (fictif)', Role::AgentAccueil, 'OYO', null],
        ];
        foreach ($extra as [$email, $name, $role, $ag, $en]) {
            $accounts[] = [$email, $name, $role, $ag, $en, null];
        }

        foreach ($accounts as [$email, $name, $role, $ag, $en, $customerId]) {
            $user = new User([
                'name' => $name,
                'email' => $email,
                'role' => $role,
                'agency_id' => $ag ? $agency($ag) : null,
                'entity_id' => $en ? $entity($en) : null,
                'customer_id' => $customerId,
                'is_active' => true,
            ]);
            $user->forceFill(['password' => $hash, 'email_verified_at' => now()]);
            $user->save();
        }
    }
}
