<?php

declare(strict_types=1);

/*
| Paramètres de sécurité TSITA GEST (voir docs/SECURITE.md).
*/
return [

    /*
    | Double authentification imposée par rôle.
    | MFA_ENFORCED_ROLES : liste séparée par des virgules (défaut : rôles sensibles §4).
    | MFA_ENFORCE_IN_DEMO : en mode démonstration (APP_DEMO_MODE=true) uniquement, « false » désactive
    | l'imposition pour faciliter les démonstrations. Hors démo, l'imposition est toujours active.
    */
    'mfa' => [
        'enforced_roles' => array_values(array_filter(array_map('trim', explode(',', (string) env(
            'MFA_ENFORCED_ROLES',
            'conformite,admin,responsable,direction',
        ))))),
        'enforce_in_demo' => (bool) env('MFA_ENFORCE_IN_DEMO', true),
    ],

    /*
    | Connexion : 5 essais/min par (email + IP) et un plafond global par IP (pulvérisation de mots de passe).
    */
    'login' => [
        'per_ip_per_minute' => (int) env('LOGIN_MAX_PER_IP_PER_MINUTE', 20),
    ],

    /*
    | Portail public : protection du code de suivi contre la force brute.
    | Par référence : N échecs dans la fenêtre → verrouillage progressif (durée doublée à chaque récidive).
    | Par IP : M échecs dans l'heure → blocage de l'IP pendant une heure.
    */
    'tracking' => [
        'max_failures_per_reference' => (int) env('TRACKING_MAX_FAILURES_PER_REFERENCE', 5),
        'failure_window_seconds' => 900,
        'base_lock_seconds' => 900,
        'max_lock_seconds' => 86400,
        'max_failures_per_ip' => (int) env('TRACKING_MAX_FAILURES_PER_IP', 30),
        'ip_lock_seconds' => 3600,
    ],
];
