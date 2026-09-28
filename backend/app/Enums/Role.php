<?php

declare(strict_types=1);

namespace App\Enums;

enum Role: string
{
    use HasLabels;

    case Client = 'client';
    case AgentAccueil = 'agent_accueil';
    case Gestionnaire = 'gestionnaire';
    case Responsable = 'responsable';
    case Qualite = 'qualite';
    case Conformite = 'conformite';
    case Direction = 'direction';
    case Admin = 'admin';

    public function label(): string
    {
        return match ($this) {
            self::Client => 'Client ou mandataire',
            self::AgentAccueil => 'Agent d\'accueil',
            self::Gestionnaire => 'Gestionnaire',
            self::Responsable => 'Responsable de traitement',
            self::Qualite => 'Qualité et service client',
            self::Conformite => 'Conformité et contrôle interne',
            self::Direction => 'Direction',
            self::Admin => 'Administrateur',
        };
    }

    /**
     * Permissions accordées au rôle (§4 du contrat). Appliquées côté serveur.
     *
     * @return list<string>
     */
    public function permissions(): array
    {
        return match ($this) {
            self::Client => [],
            self::AgentAccueil => [
                'complaints.view', 'complaints.create', 'complaints.reopen',
                'dashboard.view', 'deadlines.view',
            ],
            self::Gestionnaire => [
                'complaints.view', 'complaints.create', 'complaints.qualify', 'complaints.transition',
                'complaints.respond', 'complaints.reopen', 'complaints.export',
                'solutions.propose', 'dashboard.view', 'deadlines.view',
            ],
            self::Responsable => [
                'complaints.view', 'complaints.create', 'complaints.qualify', 'complaints.assign',
                'complaints.transition', 'complaints.respond', 'complaints.reopen', 'complaints.export',
                'solutions.propose', 'solutions.approve_n1', 'reports.view', 'dashboard.view', 'deadlines.view',
            ],
            self::Qualite => [
                'complaints.view', 'complaints.export', 'quality.manage', 'quality.control',
                'reports.view', 'dashboard.view', 'deadlines.view',
            ],
            self::Conformite => [
                'complaints.view', 'complaints.export', 'solutions.approve_n2', 'reports.view',
                'reports.validate', 'dashboard.view', 'deadlines.view', 'admin.rules.validate', 'admin.audit',
            ],
            self::Direction => [
                'complaints.view', 'dashboard.view', 'reports.view', 'deadlines.view',
            ],
            self::Admin => [
                'admin.users', 'admin.referentials', 'admin.rules', 'admin.audit', 'admin.imports',
            ],
        };
    }

    /**
     * Rôles sensibles (défaut de MFA_ENFORCED_ROLES). La politique effective est portée par
     * App\Support\MfaEnforcement (config/security.php).
     */
    public function requiresMfa(): bool
    {
        return in_array($this, [self::Conformite, self::Admin, self::Responsable, self::Direction], true);
    }

    /** Rôles internes (collaborateurs BSCA). */
    public function isStaff(): bool
    {
        return $this !== self::Client;
    }

    /** @return list<string> */
    public static function allPermissions(): array
    {
        return [
            'complaints.view', 'complaints.create', 'complaints.qualify', 'complaints.assign',
            'complaints.transition', 'complaints.respond', 'complaints.reopen', 'complaints.export',
            'solutions.propose', 'solutions.approve_n1', 'solutions.approve_n2', 'quality.manage',
            'quality.control', 'reports.view', 'reports.validate', 'dashboard.view', 'deadlines.view',
            'admin.users', 'admin.referentials', 'admin.rules', 'admin.rules.validate', 'admin.audit',
            'admin.imports',
        ];
    }
}
