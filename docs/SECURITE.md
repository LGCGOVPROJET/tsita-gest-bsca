# TSITA GEST × BSCA Bank — Rapport de sécurité

Audit puis corrections du 28/09/2026 · Référentiels : OWASP ASVS 4.0.3 niveau 2 et OWASP API Security Top 10 (2023) · Cahier des charges V4 §3, §9, §11 · Contrat `docs/ARCHITECTURE.md`.

> Données de démonstration fictives uniquement. Le mot de passe `Bsca@Demo2026!` est le mot de passe de démo documenté ; il n'a aucune valeur hors démonstration.

## 1. Périmètre

| Élément | Détail |
|---|---|
| API | `backend/` Laravel 13 / PHP 8.5, Sanctum en mode SPA (cookie), 66 routes `/api/v1`, MySQL 8 |
| Front | `frontend/` React 19 + TypeScript + Vite (proxy `/api` et `/sanctum`) |
| Environnements testés | tests automatisés (base `tsita_gest_test`), serveur d'essai dédié `127.0.0.1:8012` (arrêté après les essais), démo `127.0.0.1:8010` / `localhost:5180` (contrôles non destructifs uniquement) |
| Hors périmètre | hébergement, réseau, sauvegardes réelles, messagerie SMTP, annuaire, intégrations bancaires (aucune n'existe encore), tests d'intrusion externes |

## 2. Méthodologie

1. **Revue de code** de toutes les routes (`routes/api.php`), middlewares, policies, FormRequests, ressources, services (pièces jointes, exports, suivi public, audit) et de la configuration (session, CORS, Sanctum, en-têtes).
2. **Matrice rôle × périmètre × route** (§4) vérifiée par des tests d'autorisation automatisés (BOLA/BFLA) : agent d'une autre agence, gestionnaire d'une autre entité, client sur le dossier d'un autre client, direction, administrateur, IDOR sur tâches, solutions, messages et pièces.
3. **Essais dynamiques** (curl) sur un serveur dédié : en-têtes, cookies, CSRF, déconnexion, MFA imposée, force brute du code de suivi.
4. **Analyse des dépendances** : `composer audit`, `npm audit --omit=dev` (et `npm audit` complet).
5. **Recherche de secrets** dans le code (`app`, `config`, `database`, `routes`, `frontend/src`).
6. **Correction + test de non-régression** pour chaque constat corrigé (`backend/tests/Feature/Security/`).

Échelle de gravité : score CVSS 3.1 **indicatif** (contexte : application bancaire interne exposée sur Internet pour le portail client). Faible 0,1–3,9 · Moyenne 4,0–6,9 · Haute 7,0–8,9 · Critique 9,0–10.

## 3. Synthèse

| Gravité | Nombre | Corrigés | Atténués | Ouverts / acceptés |
|---|---|---|---|---|
| Critique | 0 | – | – | – |
| Haute | 2 | 1 (SEC-01) | 1 (SEC-18, action de déploiement) | – |
| Moyenne | 10 | 6 | 1 (SEC-20) | 3 (SEC-21, SEC-23, SEC-26) |
| Faible | 14 | 10 | – | 4 (SEC-19, SEC-22, SEC-24, SEC-25) |
| **Total** | **26** | **17** | **2** | **7** (dont 1 accepté) |

Tests : **122 tests / 985 assertions verts** (72 existants + 50 tests de sécurité). `composer audit` : aucune vulnérabilité. `npm audit --omit=dev` (et complet) : 0 vulnérabilité.

## 4. Tableau des constats

Chemins de tests relatifs à `backend/tests/Feature/Security/`.

| ID | Gravité (CVSS) | Constat | Preuve / reproduction | Correction | Test | Statut |
|---|---|---|---|---|---|---|
| SEC-01 | Haute (7,4) | MFA seulement si l'utilisateur l'active : jamais imposée aux rôles sensibles (conformité, admin, responsable, direction). ASVS 2.2.3, API2. | Connexion `responsable@` sans code → accès complet aux dossiers. | `config/security.php` (`MFA_ENFORCED_ROLES`), `App\Support\MfaEnforcement`, middleware `mfa.enrolled` sur toutes les routes authentifiées sauf `/auth/me`, `/auth/mfa/setup`, `/auth/mfa/confirm`, `/auth/logout`. Champ `mfa_enrollment_required` dans `/auth/me` et la réponse de connexion. Désactivable **en démo uniquement** (`MFA_ENFORCE_IN_DEMO=false`). Essai réel 8012 : `login responsable → mfa_enrollment_required=True`, `GET /complaints → 403`. | `MfaEnforcementTest` (5 tests) | Corrigé |
| SEC-02 | Moyenne (4,3) | La direction (`reports.view` sans `complaints.export`) exporte le rapport d'activité avec des données nominatives (nom du validateur) sans distinction. API5. | `GET /reports/activity?format=csv` en direction → nom de la personne ayant validé. | Export agrégé **anonymisé** si l'utilisateur n'a pas `complaints.export` (validateur remplacé par « Conformité (validation n° X) », mention en en-tête), journalisé `export.rapport-activite` avec `anonymized: true` + table `exports`. `GET /complaints/export` (nominatif) protégé par `can:complaints.export` au routage. | `AdminAndConfigHardeningTest::l_export_du_rapport_par_la_direction_…` | Corrigé |
| SEC-03 | Faible (3,1) | Routes `/admin/deadline-rules` protégées seulement par la policy (pas de middleware `can:`) : pas de défense en profondeur. | Lecture de `routes/api.php`. | `can:viewAny,App\Models\DeadlineRule` (lecture), `can:admin.rules` (création, modification, suppression), `can:admin.rules.validate` (validation), policy conservée. | `…::les_routes_des_regles_de_delai_portent_un_middleware_can` | Corrigé |
| SEC-04 | Moyenne (4,3) | `/admin/{type}` renvoie les modèles Eloquent bruts : toute colonne ajoutée serait exposée (API3 BOPLA). | `ReferentialAdminController` : `response()->json(['data' => $q->get()])`. | `AdminReferentialResource` : liste blanche de champs par type (jamais `password`, `mfa_secret`, `remember_token`…). | `…::les_referentiels_d_administration_n_exposent_que_la_liste_blanche` | Corrigé |
| SEC-05 | Faible (3,5) | `/admin/imports` (200 lignes) et `/admin/deadline-rules` (toutes) non paginés (API4). | Code des contrôleurs. | Pagination `{data, meta}` (`per_page` ≤ 100 ; défauts 25 et 50), validation de `page`/`per_page`. | `…::imports_et_regles_de_delai_sont_pagines` | Corrigé |
| SEC-06 | Moyenne (5,3) | Code de suivi protégé par un seul throttle 10/min **par IP** : force brute distribuée sur une référence possible ; aucun verrouillage. API2/API4, ASVS 2.2.1. | 20 IP × 10 essais/min sur une même référence sans blocage. | `PublicTrackingGuard` : 5 échecs par référence (existante ou non) → verrouillage 15 min, doublé à chaque récidive (≤ 24 h), même avec le bon code ; 30 échecs/h par IP → IP bloquée 1 h ; 429 neutre + `Retry-After` ; journalisation. Essai réel : `404 404 404 404 404 429 429`. | `PublicPortalSecurityTest` (4 tests) | Corrigé |
| SEC-07 | Moyenne (5,4) | Le filtre de contenus actifs PDF est contournable par l'échappement hexadécimal des noms (`/J#61vaScript`). | PDF `…/S/J#61vaScript/J#53(app.alert(1))…` accepté. | Normalisation des noms PDF avant détection ; liste étendue (`/RichMedia`, `/XFA`, `/SubmitForm`, `/ImportData`, `/GoToE`). | `PublicPortalSecurityTest::les_fichiers_actifs_deguises_ou_polyglottes_sont_refuses` | Corrigé |
| SEC-08 | Faible (3,5) | Fichiers polyglottes acceptés (JPEG/PNG valide suivi de `<script>` ou `<?php`). Impact limité (téléchargement `attachment` + `nosniff`). | JPEG `FFD8FF…<script>` accepté. | Rejet des balises actives et du code serveur dans toute pièce. | idem | Corrigé |
| SEC-09 | Moyenne (5,3) | Pulvérisation de mots de passe : limite 5/min par couple (email, IP) seulement ; une IP peut tester un mot de passe sur un nombre illimité de comptes. ASVS 2.2.1. | 20 comptes différents depuis la même IP : aucune limite. | Deuxième limite 20/min par IP (`LOGIN_MAX_PER_IP_PER_MINUTE`). | `AuthSessionTest::la_pulverisation_de_mots_de_passe_…` | Corrigé |
| SEC-10 | Faible (3,7) | Énumération de comptes : après 10 échecs, un compte réel renvoie « Compte temporairement verrouillé », une adresse inconnue « Identifiants invalides ». | Test comparatif. | Compteur d'échecs pour les adresses inconnues : même réponse de verrouillage. | `AuthSessionTest::le_verrouillage_ne_revele_pas_l_existence_d_un_compte` | Corrigé |
| SEC-11 | Faible (3,1) | Rejeu d'un code TOTP dans sa fenêtre de validité. ASVS 2.8.4. | Deux connexions avec le même code acceptées. | `TotpService::verify(…, $replayKey)` : pas temporel mémorisé par utilisateur (`verifyKeyNewer`). | `MfaEnforcementTest::un_code_totp_ne_peut_pas_etre_rejoue` | Corrigé |
| SEC-12 | Faible (3,7) | Mot de passe oublié : envoi synchrone du courriel quand le compte existe → écart de temps de réponse (oracle d'existence) avec un vrai SMTP. | Lecture du code. | Envoi différé après la réponse (`defer`), réponse identique. | `AuthSessionTest::mot_de_passe_oublie_…` | Corrigé |
| SEC-13 | Faible (3,1) | Sessions serveur non révoquées explicitement après réinitialisation / changement de mot de passe, changement de rôle ou désactivation (seule la vérification d'empreinte de Sanctum protégeait). | Lignes `sessions` conservées. | `SessionPurger` appelé par `reset-password` et `PATCH /admin/users/{id}` (mot de passe, rôle, e-mail, désactivation, `reset_mfa`). | `AuthSessionTest::la_reinitialisation_et_le_changement_…` | Corrigé |
| SEC-14 | Faible (3,5) | Une tâche ou une action qualité pouvait être assignée à un compte client ou administrateur (séparation des responsabilités). | `assignee_id` = id du client → 201. | Règle `exists` restreinte aux collaborateurs actifs hors `client`/`admin`. | `AuthorizationTest::l_affectation_de_tache_refuse_…` | Corrigé |
| SEC-15 | Faible (3,3) | Journal d'audit : masquage limité au premier niveau et à 6 clés (un `password` imbriqué ou `token`, `mfa_code` serait écrit). | Revue `AuditLogger`. | Masquage récursif, insensible à la casse, clés étendues (`password_confirmation`, `token`, `mfa_code`, `secret`, `tracking_code`, `otpauth_url`…). | `AdminAndConfigHardeningTest::le_journal_masque_…` | Corrigé |
| SEC-16 | Faible (2,7) | `X-Powered-By: PHP/8.5.10` renvoyé malgré le middleware (en-tête natif PHP). | `curl -D - :8010/api/v1/public/referentials`. | `header_remove('X-Powered-By')` dans `SecurityHeaders` ; `expose_php=Off` à mettre en production. Vérifié sur 8012 : en-tête absent. | `…::les_en_tetes_de_securite_couvrent_…` | Corrigé |
| SEC-17 | Moyenne (4,8) | Attribut `Secure` du cookie de session dépendant uniquement de `SESSION_SECURE_COOKIE` (absent = non sécurisé, même en production). | `config/session.php`. | `Secure` par défaut quand `APP_ENV=production` ; `URL::forceScheme('https')` en production. | revue + checklist | Corrigé |
| SEC-18 | Haute (7,5) si déployé tel quel | `.env` et `.env.example` : `APP_DEBUG=true`, `LOG_LEVEL=debug` : traces complètes, chemins et requêtes SQL dans les réponses d'erreur. | `POST /auth/login` sans CSRF → 419 avec pile d'appel complète. | Garde-fou : journal `critical` au démarrage si `APP_DEBUG` ou `APP_DEMO_MODE` actifs en production ; erreurs 500 génériques vérifiées hors debug ; checklist §7. | `…::les_erreurs_serveur_sont_generiques_sans_trace_hors_debug` | Atténué (action de déploiement) |
| SEC-19 | Faible (3,3) | `storage/logs/laravel.log` contient des requêtes SQL en erreur avec leurs valeurs (identifiants de session). | 2 entrées `select * from sessions where id = …`. | Recommandation : `zend.exception_ignore_args=On`, `LOG_LEVEL=warning`, accès restreint et rotation des journaux, centralisation SIEM. | – | Ouvert (exploitation) |
| SEC-20 | Moyenne (4,7) | SPA sans Content-Security-Policy (pas d'en-tête, pas de meta). | `index.html`. | CSP stricte injectée en `<meta>` au build (`vite.config.ts`, `'self'` uniquement, aucune source externe), en-têtes complets sur `vite preview` et `vite dev`. Vérifié dans le navigateur : aucune violation. Le serveur web de production doit envoyer la même CSP en en-tête HTTP avec `frame-ancestors 'none'`. | build + contrôle navigateur | Atténué |
| SEC-21 | Moyenne (4,3) | La direction voit le texte libre `description` et la chronologie d'un dossier : un client peut y avoir écrit des noms ou numéros de compte (le §4 interdit les données nominatives à la direction). | `GET /complaints/{id}` en direction. | Non corrigé : changement de contrat (`description: null` pour la direction) et impact front à arbitrer par BSCA. Recommandation : masquer `description` et les titres d'événements pour la direction. | – | Ouvert (décision BSCA) |
| SEC-22 | Faible (3,5) | L'administrateur voit les lignes brutes (`raw`) des anomalies d'import, qui contiennent des données clients, alors qu'il n'a pas accès aux dossiers. | `GET /admin/imports/{id}`. | Recommandation : masquer nom, e-mail, téléphone et numéro client dans `raw` ou réserver la résolution des anomalies à la conformité. | – | Ouvert |
| SEC-23 | Moyenne (4,4) | Seuls `customer_number`, `mfa_secret` et les pièces sont chiffrés au niveau applicatif ; nom, e-mail et téléphone des clients sont en clair (nécessaires à la recherche). | Schéma `customers`. | Recommandation : chiffrement au repos MySQL (InnoDB TDE) ou du volume, sauvegardes chiffrées, accès base nominatif et tracé. | – | Ouvert (hébergement) |
| SEC-24 | Faible (2,6) | Le jeton de réinitialisation circule en paramètre d'URL (`/reinitialiser-mot-de-passe?token=…`) : historique du navigateur, journaux de proxy. | `AppServiceProvider::ResetPassword::createUrlUsing`. | Atténuations existantes : usage unique, 60 min, `Referrer-Policy: strict-origin-when-cross-origin`. Recommandation front (hors périmètre, `src/pages`) : retirer le jeton de l'URL dès l'affichage (`history.replaceState`). | `AuthSessionTest::le_jeton_de_reinitialisation_…` | Ouvert (front) |
| SEC-25 | Faible (3,7) | Verrouillages (compte après 10 échecs, référence après 5 échecs) exploitables pour gêner un utilisateur ciblé. | Conception. | Accepté : durée limitée, déverrouillage admin (`unlock`), espace client et agence restent disponibles, événements journalisés pour la supervision. | – | Accepté |
| SEC-26 | Moyenne (5,0) | Pas d'antivirus : `FileScanner` contrôle signatures et contenus actifs visibles, mais pas les flux PDF compressés (`/ObjStm`) ni les malwares connus. | Lecture de `FileScanner`. | Recommandation : ClamAV (clamd) ou ICAP bancaire en analyse synchrone avant stockage, statut `en_attente` → `sain`/`rejete`. | – | Ouvert (infrastructure) |

## 5. Contrôles vérifiés conformes (sans constat)

- **Contrôle d'accès** : policies + scope `visibleTo` appliqués sur liste, détail, export, recherche, actions, tâches, solutions, pièces ; admin sans accès aux dossiers ; direction masquée (noms, pièces, échanges, audit) ; client limité à ses références (404 sinon). 11 tests `AuthorizationTest`, 147 assertions.
- **Affectation de masse** : `$fillable` sur tous les modèles, uniquement `validated()` transmis ; `reference`, `tracking_code_hash`, `status`, `owner_id`, `final_response_at`, `mfa_*`, `failed_logins`, `locked_until` non assignables par l'API (testé). Énumérations et montants validés strictement (`decimal:0,2`, devise ISO whitelistée, min 0).
- **Injection SQL** : tri sur liste blanche, paramètres liés, `LIKE` échappé (`%`, `_`, `\`), filtres typés et validés (testé).
- **Injection CSV/formule** : `ExportService::safeCell` préfixe `= + - @ \t \r` (nombres conservés), CSV et XLSX (testé).
- **PDF (dompdf)** : échappement `htmlspecialchars` de toutes les cellules, `isRemoteEnabled=false`, `isPhpEnabled=false`.
- **Modèles de réponse** : substitution en une seule passe, sans évaluation (testé).
- **CSRF** : actif sur toutes les requêtes d'état issues du front (`statefulApi`) ; essai réel sans jeton → `419`.
- **Session** : cookie `HttpOnly`, `SameSite=Lax`, contenu chiffré, expiration 30 min d'inactivité, régénération à la connexion (fixation testée), invalidation à la déconnexion (essai réel : ancien cookie → 401).
- **Mots de passe** : 12 caractères min., casse mixte, chiffres, symboles ; bcrypt coût 12 ; jeton de réinitialisation à usage unique, 60 min (testé) ; hachage factice pour les comptes inexistants (temps homogène).
- **Portail public** : réponses identiques pour référence inconnue / code faux, hachage factice systématique (testé), dossiers repris jamais accessibles par code, vue client en liste blanche (aucun id, auteur, acteur, statut interne, note, avis de contrôle, pièce interne — testé récursivement), code de suivi jamais en URL (le front ne transmet que la référence dans `/suivi?reference=`).
- **Pièces jointes** : disque privé, contenu chiffré (AES-256 via `APP_KEY`), nom aléatoire, MIME réel (`finfo`) cohérent avec l'extension, 10 Mo, 5 fichiers au dépôt, 20 documents client par dossier, nom d'origine assaini (jamais utilisé comme chemin), SHA-256 vérifié au téléchargement, `Content-Disposition: attachment` + `nosniff`.
- **Audit** : consultations (`complaint.view`, `client.view`, `public.track`), téléchargements, exports, modifications avant/après, connexions ; table en ajout seul (modèle + déclencheurs MySQL `audit_logs`, `complaint_events` — testé).
- **En-têtes API** : CSP `default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `Cache-Control: no-store`, HSTS en HTTPS/production. **CORS** limité aux origines déclarées, avec identifiants (testé).
- **Secrets** : aucun secret en dur hors mot de passe de démo documenté ; `.env` exclu (`backend/.gitignore`, `frontend/.gitignore`, `.gitignore` racine ajouté).
- **Front** : aucun jeton stocké (cookie httpOnly), `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `localStorage`/`sessionStorage`, `document.write` interdits par ESLint (0 alerte), gestion 401 (redirection) et 419 (renouvellement CSRF puis rejeu unique).

## 6. Mesures ajoutées (résumé technique)

| Fichier | Rôle |
|---|---|
| `backend/config/security.php` | MFA imposée, plafonds de connexion, anti-force brute du suivi |
| `app/Support/MfaEnforcement.php`, `app/Http/Middleware/EnsureMfaEnrolled.php` | Politique MFA et blocage des routes (`mfa.enrolled`) |
| `app/Services/PublicTrackingGuard.php` | Verrouillage progressif par référence et blocage par IP |
| `app/Support/SessionPurger.php` | Révocation des sessions serveur |
| `app/Http/Resources/AdminReferentialResource.php` | Liste blanche des référentiels d'administration |
| `app/Services/FileScanner.php` | Noms PDF obfusqués, contenus actifs étendus, polyglottes |
| `app/Services/TotpService.php` | Anti-rejeu TOTP |
| `app/Services/AuditLogger.php` | Masquage récursif |
| `routes/api.php` | `mfa.enrolled`, `can:` sur règles de délai et export |
| `frontend/vite.config.ts`, `frontend/src/api/client.ts`, `frontend/eslint.config.js` | CSP du build, événement `mfa-enrollment-required`, règles ESLint |

## 7. Checklist de mise en production

- [ ] **HTTPS** obligatoire (TLS 1.2+ ; 1.3 de préférence), redirection 80 → 443, HSTS (déjà émis par l'API en production) ; envisager la liste de préchargement HSTS.
- [ ] `APP_ENV=production`, **`APP_DEBUG=false`**, `LOG_LEVEL=warning`, **`APP_DEMO_MODE=false`** (active la MFA imposée sans exception et refuse les règles de délai non validées).
- [ ] `SESSION_SECURE_COOKIE=true` (défaut en production), `SESSION_DOMAIN` et `SANCTUM_STATEFUL_DOMAINS` = domaine réel uniquement, `CORS_ALLOWED_ORIGINS` = origine réelle uniquement.
- [ ] **Nouvelle `APP_KEY`** générée pour la production, stockée dans un coffre (HSM ou gestionnaire de secrets) ; rotation planifiée avec `APP_PREVIOUS_KEYS` (les pièces et `customer_number` sont chiffrés avec cette clé : **ne jamais la perdre**, la sauvegarder hors site).
- [ ] `php artisan config:cache`, `route:cache`, `event:cache` ; `composer install --no-dev --optimize-autoloader` ; `npm run build` (sans sourcemaps).
- [ ] PHP : `expose_php=Off`, `display_errors=Off`, `zend.exception_ignore_args=On`, `upload_max_filesize=10M`, `post_max_size=60M`, OPcache.
- [ ] Serveur web : en-têtes du front (CSP identique à `vite.config.ts` **en en-tête HTTP** avec `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) ; `storage/` et `.env` jamais servis ; racine web = `backend/public` et `frontend/dist`.
- [ ] **MFA imposée** : vérifier `MFA_ENFORCED_ROLES`, enrôler chaque compte sensible avant ouverture ; procédure de réinitialisation MFA (`reset_mfa`) avec vérification d'identité hors bande.
- [ ] **Comptes de démonstration supprimés ou désactivés** (`*@bsca.demo`), données fictives purgées, aucun seeder de démo en production.
- [ ] **Antivirus ClamAV** (clamd, signatures à jour) ou ICAP BSCA branché dans `FileScanner` avant stockage.
- [ ] **WAF** (OWASP CRS) devant l'API, limitation de débit réseau, protection anti-DDoS ; `TrustProxies` configuré pour que l'IP réelle soit utilisée par les limiteurs.
- [ ] Cache et limiteurs sur un stockage partagé (Redis) si plusieurs serveurs.
- [ ] **Sauvegardes chiffrées** (base + disque `attachments` + `APP_KEY` séparée), restauration testée chaque trimestre.
- [ ] **Supervision** : alertes sur `auth.account_locked`, `auth.mfa_failed`, `public.track_locked`, `public.track_ip_blocked`, `attachment.integrity_failure`, pics de 401/403/429/5xx ; journaux centralisés (SIEM), accès restreint, conservation définie avec la conformité.
- [ ] Compte MySQL applicatif à privilèges minimaux (pas de `DROP`/`TRIGGER`) ; migrations avec un compte distinct ; chiffrement au repos (TDE ou volume).
- [ ] `composer audit` et `npm audit --omit=dev` dans la chaîne CI ; mises à jour de sécurité mensuelles.

## 8. Risques résiduels

1. SEC-21 : texte libre visible par la direction (décision BSCA attendue).
2. SEC-23 / SEC-26 : chiffrement au repos des données clients et antivirus relèvent de l'hébergement BSCA.
3. SEC-22 : données clients brutes des anomalies d'import visibles de l'administrateur.
4. SEC-24 : jeton de réinitialisation dans l'URL (correction côté page front).
5. SEC-25 : déni de service ciblé par verrouillage (accepté, supervisé).
6. Agrégats de la direction : sur de très petits effectifs (une agence, un mois), un agrégat peut permettre de déduire un dossier ; seuil minimal d'affichage à envisager.
7. Pas de tests d'intrusion externes ni de revue d'infrastructure à ce stade.
8. Le verrouillage du suivi et des connexions utilise le cache applicatif : en multi-serveurs, un cache partagé est indispensable.

## 9. Recommandations pour BSCA

- **Hébergement** : centre de données agréé, en République du Congo ou dans la zone CEMAC, conforme aux exigences de la COBAC et de la loi congolaise sur la protection des données personnelles ; séparation réseau (DMZ pour le portail public, API et base en zone interne), bastion d'administration avec MFA.
- **Résidence des données** : base, pièces jointes, sauvegardes et journaux hébergés sur le territoire convenu ; aucun service tiers hors zone (SMTP, supervision, antivirus en ligne) sans analyse d'impact et accord de la conformité.
- **Tests d'intrusion externes** par un prestataire indépendant avant la mise en production puis chaque année et à chaque évolution majeure (portail public, authentification, pièces jointes), avec retest des corrections.
- **Gouvernance** : revue trimestrielle des habilitations (rôles, périmètres, comptes inactifs), revue mensuelle du journal d'audit par la conformité, plan de réponse aux incidents (notification COBAC), politique de conservation et de purge des dossiers et pièces.
- **Intégrations futures** (banque en ligne, annuaire LDAP/AD avec SSO et MFA, système central) : validation de sécurité et spécification d'API dédiées (CDC §9), authentification mutuelle (mTLS ou OAuth 2 client credentials), journalisation.

## 10. Informations pour le front (changements d'API)

- `GET /auth/me` et `POST /auth/login` (`data`) : nouveaux booléens `mfa_required` et **`mfa_enrollment_required`**. Si `mfa_enrollment_required === true` : afficher l'écran d'enrôlement (`POST /auth/mfa/setup` → `{secret, otpauth_url}` puis `POST /auth/mfa/confirm {code}` → `{data: user}` avec `mfa_enrollment_required: false`), aucune autre route n'est accessible.
- Toute autre route pendant l'enrôlement : `403 {"message": "La double authentification est obligatoire pour votre profil : configurez-la pour continuer.", "mfa_enrollment_required": true}`. `src/api/client.ts` émet alors l'événement `mfa-enrollment-required` (au lieu du toast « accès refusé ») : il reste à l'écouter dans `ApiEventsBridge` et à ajouter les champs au type `User` (`src/types/api.ts`) — fichiers hors du périmètre de l'équipe sécurité.
- `/public/track*` : nouveau `429 {"message": "Trop de tentatives pour ce dossier. Réessayez plus tard."}` avec `Retry-After` (secondes, jusqu'à 24 h) ; le message actuel du front (« Patientez une minute ») devrait utiliser `Retry-After`.
- `GET /admin/deadline-rules` et `GET /admin/imports` : désormais paginés `{data, meta}` (`per_page` ≤ 100) ; `adminApi.list` les normalise déjà, mais les écrans doivent afficher la pagination au-delà de 50 règles / 25 lots.
- `POST /complaints/{id}/tasks`, `PATCH /tasks/{id}` : `assignee_id` d'un client ou d'un administrateur → `422 errors.assignee_id`.
- Réglage de la démo actuelle : `MFA_ENFORCE_IN_DEMO=false` dans `backend/.env` (imposition désactivée tant que l'écran d'enrôlement n'existe pas côté front).
