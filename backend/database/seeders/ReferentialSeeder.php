<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Category;
use App\Models\Channel;
use App\Models\ProcessingEntity;
use App\Models\Product;
use App\Models\Setting;
use Illuminate\Database\Seeder;

/**
 * Référentiels fictifs de démonstration (§11).
 */
class ReferentialSeeder extends Seeder
{
    public const AGENCIES = [
        ['BZV-CTR', 'Brazzaville Centre', 'Brazzaville'],
        ['BZV-PTP', 'Brazzaville Poto-Poto', 'Brazzaville'],
        ['PNR-CTR', 'Pointe-Noire Centre', 'Pointe-Noire'],
        ['PNR-LUM', 'Pointe-Noire Lumumba', 'Pointe-Noire'],
        ['DOL', 'Dolisie', 'Dolisie'],
        ['OYO', 'Oyo', 'Oyo'],
    ];

    public const ENTITIES = [
        ['CARTES', 'Cartes et paiements'],
        ['COMPTES', 'Comptes'],
        ['VIREMENTS', 'Virements et transferts'],
        ['DIGITAL', 'Banque digitale'],
        ['CREDITS', 'Crédits'],
    ];

    public const CATEGORIES = [
        ['CARTES', 'Cartes et paiements par carte', 'Paiements, débits et blocages de carte'],
        ['GAB', 'Retraits aux distributeurs (GAB)', 'Retraits non servis, cartes capturées'],
        ['VIREMENTS', 'Virements et transferts', 'Virements nationaux et transferts internationaux'],
        ['FRAIS', 'Frais et commissions', 'Contestations de frais, commissions et agios'],
        ['COMPTE', 'Tenue de compte', 'Relevés, clôtures, mises à jour de dossier'],
        ['DIGITAL', 'Banque en ligne et mobile', 'Accès, opérations et codes de validation'],
        ['CREDIT', 'Crédits et prêts', 'Échéances, remboursements anticipés, taux'],
        ['ACCUEIL', 'Accueil et qualité de service', 'Attente, information et relation en agence'],
    ];

    public const PRODUCTS = [
        ['CARTE_VISA', 'Carte bancaire Visa'],
        ['COMPTE_COURANT', 'Compte courant'],
        ['COMPTE_EPARGNE', 'Compte épargne'],
        ['MOBILE', 'Application de banque mobile'],
        ['PRET_PERSO', 'Prêt personnel'],
        ['TRANSFERT', 'Transfert international'],
    ];

    public const CHANNELS = [
        ['portail', 'Portail client'],
        ['agence', 'Agence'],
        ['telephone', 'Téléphone / centre de contact'],
        ['courriel', 'Courriel'],
        ['courrier', 'Courrier'],
    ];

    public function run(): void
    {
        foreach (self::AGENCIES as [$code, $name, $city]) {
            Agency::query()->create(['code' => $code, 'name' => $name, 'city' => $city, 'is_active' => true]);
        }
        foreach (self::ENTITIES as [$code, $name]) {
            ProcessingEntity::query()->create(['code' => $code, 'name' => $name, 'is_active' => true]);
        }
        foreach (self::CATEGORIES as [$code, $label, $description]) {
            Category::query()->create(['code' => $code, 'label' => $label, 'description' => $description, 'is_active' => true, 'version' => 1]);
        }
        foreach (self::PRODUCTS as [$code, $label]) {
            Product::query()->create(['code' => $code, 'label' => $label, 'is_active' => true]);
        }
        foreach (self::CHANNELS as [$code, $label]) {
            Channel::query()->create(['code' => $code, 'label' => $label, 'is_active' => true]);
        }

        Setting::put('n2_threshold', 500000);
        Setting::put('n2_threshold_currency', 'XAF');
        Setting::put('amount_flag_threshold', 50000000);
        Setting::put('holiday_calendar_version', 'CG-2025-2027');
        Setting::put('mfa_required_roles', ['conformite', 'admin', 'responsable', 'direction']);
        Setting::put('demo_notice', 'Données 100 % fictives — aucune donnée BSCA réelle.');
    }
}
