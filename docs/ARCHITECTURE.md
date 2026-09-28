# TSITA GEST × BSCA Bank — Contrat d'architecture (source de vérité)

> Ce document est le contrat partagé entre le back-end (Laravel), le front-end (React) et la base de données (MySQL).
> Toute divergence doit être corrigée **dans ce fichier** avant d'être codée.
> Références : `docs/cahier-des-charges-v4.txt` (CDC V4), `docs/maquette-reference.html` (maquette BSCA V1).

## 1. Arborescence

```
PROJET GESTION DE RECLAMATION/
├── frontend/           React 19 + TypeScript + Vite (SPA interne + portail client)
├── backend/            Laravel (dernière version stable) — API JSON /api/v1
├── base-de-donnees/    schema.sql, donnees-demo.sql, dictionnaire, MCD (Mermaid), scripts
├── guide-interactif/   Guide utilisateur interactif autonome (HTML/CSS/JS, hors ligne)
├── assets/logos/       bsca-wide.png (445×114, logo + signature), bsca-mark.png (200×200, pictogramme B)
└── docs/               ARCHITECTURE.md, SECURITE.md, CDC, maquette de référence
```

## 2. Environnement local

| Élément | Valeur |
|---|---|
| MySQL | `127.0.0.1:3306`, utilisateur `root`, **sans mot de passe** (local), base `tsita_gest`, base de test `tsita_gest_test` |
| Back-end | `php artisan serve --host=127.0.0.1 --port=8010` (le port 8000 est occupé par un autre projet sur ce poste) |
| Front-end | `npm run dev` → `http://localhost:5180` (port 5173 occupé par un autre projet) ; Vite proxy `/api` et `/sanctum` → `http://127.0.0.1:8010` |
| Fuseau | `Africa/Brazzaville` (UTC+1, sans heure d'été). Stockage en base : UTC. API : ISO 8601 avec offset. |
| Devise par défaut | `XAF` (FCFA). Tout montant porte une devise. Montant absent = `null`, jamais `0`. |

## 3. Authentification (Laravel Sanctum, mode SPA par cookie)

- Le front appelle `GET /sanctum/csrf-cookie` puis `POST /api/v1/auth/login` (cookies httpOnly `SameSite=Lax`, en-tête `X-XSRF-TOKEN` géré par axios `withCredentials: true, withXSRFToken: true`).
- Comme Vite proxifie, front et API sont **même origine** en dev (`localhost:5180`). `SANCTUM_STATEFUL_DOMAINS=localhost:5180,127.0.0.1:5180`, `SESSION_DOMAIN=null`.
- Login : `{ email, password, mfa_code? }`. Si le rôle exige la MFA et qu'elle est activée → réponse `200 { mfa_required: true }` tant que `mfa_code` manque. TOTP (RFC 6238, 30 s, 6 chiffres).
- Limitation : 5 tentatives / minute / (email+IP) **et** 20 / minute / IP toutes adresses confondues (`LOGIN_MAX_PER_IP_PER_MINUTE`) → `429` ; verrouillage 15 min après 10 échecs consécutifs (`users.locked_until`) → `422 {message, errors:{email:["Compte temporairement verrouillé. Réessayez plus tard."]}}`. Identifiants invalides → `422` avec message neutre identique que le compte existe ou non. Un code MFA invalide → `422 errors.mfa_code`.
- Toute personne dont `mfa_enabled=true` doit fournir `mfa_code`. Un code TOTP déjà utilisé est refusé (anti-rejeu). Une adresse inconnue « se verrouille » après 10 échecs avec la même réponse qu'un compte réel (pas d'énumération).
- **MFA imposée (SEC-01, 28/09/2026)** : `config/security.php` → `MFA_ENFORCED_ROLES` (défaut `conformite,admin,responsable,direction`). Un compte de ces rôles **sans MFA configurée** se connecte normalement (`200 {data: user}`) mais avec `data.mfa_enrollment_required: true` ; tant que la MFA n'est pas confirmée, **seules** `GET /auth/me`, `POST /auth/mfa/setup`, `POST /auth/mfa/confirm` et `POST /auth/logout` répondent ; toute autre route authentifiée renvoie `403 {"message": "La double authentification est obligatoire pour votre profil : configurez-la pour continuer.", "mfa_enrollment_required": true}`. En démonstration uniquement (`APP_DEMO_MODE=true`), `MFA_ENFORCE_IN_DEMO=false` désactive l'imposition (réglage actuel du `.env` de démo) ; hors démo, ce drapeau est ignoré. La réinitialisation MFA par l'administrateur (`reset_mfa`) ramène le compte à l'état d'enrôlement.
- Révocation des sessions serveur : réinitialisation du mot de passe, changement de mot de passe/rôle/e-mail, désactivation ou réinitialisation MFA par l'administrateur.
- Session : expiration 30 min d'inactivité ; régénération à la connexion.
- Mot de passe : 12 caractères min., majuscule, minuscule, chiffre, symbole.

## 4. Rôles et périmètres

| Code rôle | Libellé | Périmètre par défaut |
|---|---|---|
| `client` | Client ou mandataire | Ses propres dossiers uniquement (portail) |
| `agent_accueil` | Agent d'accueil / agence / centre de contact | Dossiers de son agence (`receiving_agency_id = user.agency_id`) + ceux qu'il a créés |
| `gestionnaire` | Gestionnaire | Dossiers dont il est propriétaire ou suppléant + dossiers de son entité (`processing_entity_id = user.entity_id`) + file « à orienter » (dossiers sans entité, `processing_entity_id IS NULL`) |
| `responsable` | Responsable de traitement | Tous les dossiers de son entité + file « à orienter » (dossiers sans entité) ; affecter, réattribuer, escalader, approuver N1 |
| `qualite` | Qualité et service client | Tous les dossiers (lecture), contrôles qualité, plans d'action |
| `conformite` | Conformité et contrôle interne | Tous les dossiers (lecture), audit, validation des règles de délai, approbation N2, validation des rapports |
| `direction` | Direction | Agrégats seulement (tableau de bord, rapports) ; **pas** d'accès aux pièces ni aux données nominatives (noms masqués) |
| `admin` | Administrateur fonctionnel et technique | Référentiels, comptes, calendriers, modèles, imports, journaux ; **pas** de traitement de dossier (séparation des responsabilités) |

Toutes les règles d'accès sont appliquées **côté serveur** (Policies Laravel + scopes Eloquent `visibleTo($user)`). Le front masque seulement les boutons selon `user.permissions`.

`GET /auth/me` renvoie :
```json
{ "data": { "id": 1, "name": "…", "email": "…", "role": "gestionnaire", "role_label": "Gestionnaire",
  "agency": {"id":1,"name":"Brazzaville Centre"} | null, "entity": {"id":2,"name":"Cartes et paiements"} | null,
  "mfa_enabled": false, "mfa_required": false, "mfa_enrollment_required": false,
  "permissions": ["complaints.view","complaints.create", "..."] } }
```
Permissions (chaînes) : `complaints.view`, `complaints.create`, `complaints.qualify`, `complaints.assign`, `complaints.transition`, `complaints.respond`, `complaints.reopen`, `complaints.export`, `solutions.propose`, `solutions.approve_n1`, `solutions.approve_n2`, `quality.manage`, `quality.control`, `reports.view`, `reports.validate`, `dashboard.view`, `deadlines.view`, `admin.users`, `admin.referentials`, `admin.rules`, `admin.rules.validate`, `admin.audit`, `admin.imports`.

## 5. Modèle de données (MySQL 8+, InnoDB, utf8mb4)

Toutes les tables ont `id BIGINT UNSIGNED` et `created_at/updated_at` sauf mention contraire.

| Table | Colonnes principales |
|---|---|
| `users` | name, email (unique), password, role (enum §4), agency_id?, entity_id?, phone?, is_active, mfa_secret (chiffré)?, mfa_enabled, failed_logins, locked_until?, last_login_at?, customer_id? (pour rôle client) |
| `agencies` | code (unique), name, city, is_active |
| `processing_entities` | code (unique), name, is_active — « fonction/entité de traitement », distincte de l'agence |
| `categories` | code (unique), label, description?, is_active, version — « nature » de la réclamation |
| `products` | code (unique), label, is_active |
| `channels` | code (unique: `portail`,`agence`,`telephone`,`courriel`,`courrier`), label, is_active |
| `customers` | full_name, email?, phone?, customer_number? (chiffré), address?, preferred_channel |
| `complaints` | reference (unique, `TG-BSCA-AAAA-NNNNNN`), tracking_code_hash, customer_id, channel_id, receiving_agency_id?, processing_entity_id?, category_id?, product_id?, subject, description (TEXT), operation_date?, status (enum §6), decision (enum §6)?, priority (`basse`,`normale`,`haute`,`critique`), risk_level (`faible`,`moyen`,`eleve`), amount DECIMAL(15,2)?, currency CHAR(3)?, amount_flagged (bool, hors norme), received_at, acknowledged_at?, acknowledgment_status (`en_attente`,`envoye`,`echec`), final_response_at?, closed_at?, owner_id?, deputy_id?, parent_complaint_id? (réouverture/contestation), duplicate_of_id?, mediation_requested_at?, source_system?, source_id?, source_status_label?, consent_at?, created_by? |
| `complaint_events` | complaint_id, type (`created`,`acknowledged`,`qualified`,`assigned`,`status_changed`,`message`,`attachment`,`solution`,`approval`,`response_sent`,`reopened`,`duplicate`,`escalated`,`deadline`), from_status?, to_status?, title, description?, visibility (`internal`,`client`), actor_id?, reason?, created_at — **jamais modifié ni supprimé** |
| `deadline_rules` | code, label, kind (`accuse`,`reponse_finale`,`prealerte`,`controle`), unit (`calendar`,`business`), duration (int), start_point (`received_at`), source_type (`juridique`,`interne`,`demonstration`), source_reference, effective_from, effective_to?, version, status (`brouillon`,`a_valider`,`valide`,`retire`), validated_by?, validated_at?, notes? |
| `holidays` | date, label, calendar_version, country (`CG`) |
| `complaint_deadlines` | complaint_id, deadline_rule_id, rule_version, kind, unit, due_at, initial_due_at (jamais modifié), announced_at? (nouvelle date annoncée au client, distincte), met_at?, status (`en_cours`,`respectee`,`depassee`,`respectee_en_retard`) |
| `attachments` | complaint_id, uploaded_by?, uploaded_by_client (bool), original_name, stored_path, mime, size, sha256, classification (`client`,`interne`,`confidentiel`), visibility (`internal`,`client`), scan_status (`en_attente`,`sain`,`rejete`) |
| `messages` | complaint_id, kind (`client_message`,`internal_note`), direction (`entrant`,`sortant`)?, channel_id?, author_id?, author_is_client (bool), subject?, body, delivery_status (`en_attente`,`envoye`,`echec`)?, sent_at?, template_id? |
| `tasks` | complaint_id, title, description?, assignee_id?, due_at?, status (`a_faire`,`en_cours`,`terminee`), completed_at? |
| `solutions` | complaint_id, version (int), type (`remboursement`,`correction_operation`,`explication_motivee`,`autre_mesure`,`non_fondement`), description, root_cause?, amount?, currency?, decision (enum décision), status (`brouillon`,`soumise`,`approuvee_n1`,`approuvee`,`rejetee`), requires_n2 (bool), proposed_by, submitted_at? — les versions ne sont jamais écrasées |
| `approvals` | solution_id, level (1\|2), approver_id, decision (`approuve`,`rejete`), comment?, decided_at |
| `quality_controls` | complaint_id, controller_id, result (`conforme`,`non_conforme`,`a_revoir`), findings?, controlled_at |
| `quality_actions` | title, root_cause, category_id?, owner_id?, owner_entity_id?, due_at?, status (`planifiee`,`en_cours`,`realisee`,`verifiee`), effectiveness_measure?, evidence?, completed_at? |
| `complaint_quality_action` | pivot complaint_id, quality_action_id |
| `response_templates` | code, kind (`accuse`,`attente`,`reponse`,`cloture`), label, subject, body (placeholders `{{reference}}`, `{{client}}`, `{{date_limite}}`), version, is_active |
| `audit_logs` | user_id?, action, auditable_type?, auditable_id?, before JSON?, after JSON?, reason?, ip?, user_agent?, created_at — **append-only** |
| `exports` | user_id, type, format (`csv`,`xlsx`,`pdf`), filters JSON, period_from?, period_to?, as_of, rule_version?, row_count, created_at |
| `import_batches` | filename, file_sha256 (unique → idempotence), source_system, status, rows_total, rows_created, rows_skipped, rows_anomalies, report JSON, imported_by, created_at |
| `import_anomalies` | import_batch_id, row_number, source_id?, issue, raw JSON, resolution_status (`a_traiter`,`resolu`,`ignore`), resolved_by?, resolved_at? |
| `settings` | key (unique), value JSON |
| `reference_sequences` | year (PK), last_number — séquence annuelle des références, verrou `SELECT … FOR UPDATE` |
| `report_validations` | type, period_from, period_to, filters JSON, filters_hash, as_of, rule_version?, snapshot JSON?, comment?, validated_by, validated_at |

Contraintes : FK avec `restrict` sur suppression ; index sur `complaints(status)`, `(received_at)`, `(final_response_at)`, `(receiving_agency_id)`, `(processing_entity_id)`, `(owner_id)`, `(source_system, source_id)` unique.

## 6. Énumérations et libellés (FR)

**Statut de traitement** (`complaints.status`) : `brouillon` Brouillon · `recu` Reçu · `a_qualifier` À qualifier · `affecte` Affecté · `en_investigation` En investigation · `attente_information` Attente d'information · `solution_proposee` Solution proposée · `a_valider` À valider · `reponse_envoyee` Réponse envoyée · `cloture` Clôturé · `reouvert` Réouvert.

**Décision de fond** (`decision`, dimension indépendante) : `fondee` Fondée · `partiellement_fondee` Partiellement fondée · `non_fondee` Non fondée · `irrecevable_motivee` Irrecevable motivée.

**Transitions autorisées** (serveur) :
```
brouillon→recu ; recu→a_qualifier ; a_qualifier→affecte ; affecte→en_investigation ;
en_investigation→attente_information|solution_proposee ; attente_information→en_investigation ;
solution_proposee→a_valider|en_investigation ; a_valider→solution_proposee|reponse_envoyee (via send-response) ;
reponse_envoyee→cloture|reouvert ; cloture→reouvert ; reouvert→en_investigation
```
Chaque transition exige `reason` (texte) sauf les transitions automatiques ; elle crée un `complaint_events` et un `audit_logs`.

**Statut client** (portail, jamais le statut interne brut) : brouillon/recu/a_qualifier → « Reçue » ; affecte/en_investigation/solution_proposee/a_valider → « En cours d'analyse » ; attente_information → « Information demandée » ; reponse_envoyee → « Réponse envoyée » ; cloture → « Clôturée » ; reouvert → « Réouverte ».

**Signal d'échéance** (calculé, champ `deadline_flag` dans l'API) : `ok` Dans les délais · `a_risque` À risque (dossier ouvert non en retard dont la pré-alerte est atteinte **ou** dont l'accusé de réception, non envoyé, arrive à échéance au plus tard le jour de calcul) · `en_retard` En retard (ouvert après échéance) · `clos_en_retard` Clos en retard · `sans_regle` Règle à valider.

## 7. Moteur de délais (service `DeadlineCalculator`)

- Calcul en `Africa/Brazzaville`. `unit=calendar` : +N jours calendaires. `unit=business` : +N jours ouvrés (lundi–vendredi hors `holidays` de la version de calendrier active). Le jour de réception n'est pas compté (J+1 = premier jour). Échéance = fin de journée (23:59:59 locale) du jour cible.
- Réception un samedi/dimanche/férié (règle `business`) → dossier réputé reçu le prochain jour ouvré (J0), décompte à partir du lendemain. Ex. : sam. 23/05/2026 (lun. 25/05 Pentecôte) → J0 mar. 26/05 → AR +10 j ouvrés = mar. 09/06/2026.
- Règle `calendar` : aucun report si l'échéance tombe un jour chômé (ex. 23/12/2026 + 45 j = sam. 06/02/2027) — **à valider par la conformité**.
- Pré-alerte (`kind=prealerte`) : calculée à rebours depuis l'échéance finale — début de la journée locale située N jours ouvrés avant.
- L'échéance **n'est pas suspendue** pendant `attente_information`. `announced_at` (nouvelle date annoncée) est stocké à part ; `initial_due_at` n'est jamais modifié.
- Seules les règles `status=valide`, ou `status=a_valider` avec `source_type=demonstration` **si** `APP_DEMO_MODE=true`, sont appliquées. Le front affiche un bandeau « Règle de démonstration — non validée par la conformité BSCA » quand c'est le cas.
- Règles de démonstration seedées : AR 10 jours ouvrés, réponse finale 45 jours calendaires, pré-alerte interne 5 jours ouvrés avant échéance finale.
- Jours fériés CG seedés (2025–2027) : 1er janv., lundi de Pâques, 1er mai, Ascension, lundi de Pentecôte, 10 juin (Réconciliation), 15 août (Indépendance), 1er nov., 28 nov. (République), 25 déc.
- Tests unitaires obligatoires : fin de mois, jour férié, week-end, réponse le jour même, fin d'année, réouverture.

## 8. Indicateurs (service `KpiService`) — tous acceptent les mêmes filtres

Filtres communs (query string) : `from`, `to` (dates locales AAAA-MM-JJ, période incluse), `as_of` (date de calcul, défaut aujourd'hui), `agency_id`, `entity_id`, `category_id`, `product_id`, `channel` (code), `status`.

| Clé | Définition |
|---|---|
| `received` | Références uniques avec `received_at` ∈ période |
| `responded` | Références uniques avec `final_response_at` ∈ période |
| `cohort_treated` | Reçues dans la période ET `final_response_at ≤ as_of` (+ `as_of` affiché) |
| `stock` | `received_at ≤ as_of` ET (`final_response_at` null OU `> as_of`) ; une réouverture crée un dossier enfant compté comme nouvelle entrée |
| `treatment_rate` | `{ numerator: cohort_treated, denominator: received, value: % à 1 décimale ou null si den=0 }` |
| `late_open` | Ouverts à `as_of` avec échéance finale < `as_of` |
| `late_closed` | Répondus dans la période avec `final_response_at > due_at` |
| `at_risk` | Ouverts, non en retard, pré-alerte atteinte **ou** accusé de réception non envoyé arrivant à échéance au plus tard à `as_of` |

Base commune à tous les indicateurs : dossiers hors `brouillon`, **hors doublons** (`duplicate_of_id` non nul — « références uniques »), dans le périmètre de l'utilisateur (§4). Période par défaut si `from`/`to` absents : 6 mois glissants (1er jour du mois M-5 → `as_of`). `as_of` = fin de journée locale (23:59:59 Africa/Brazzaville). `adjustments` vaut 0 tant qu'aucun mécanisme d'ajustement manuel n'est validé ; `balanced` est un contrôle réel (requêtes indépendantes).

Réconciliation (rapport d'activité) : `stock_debut (veille de from) + entrees − reponses_finales ± ajustements = stock_fin`, avec champ `balanced: bool`.

## 9. API REST `/api/v1` (JSON)

Conventions : ressources enveloppées `{ "data": … }` ; listes paginées `{ "data": [...], "meta": { "current_page", "last_page", "per_page", "total" } }` ; erreurs `422 { message, errors: { champ: [..] } }`, `401`, `403 { message }`, `404`, `429`. Dates ISO 8601 avec offset `+01:00`. Montants : `{ "amount": "150000.00" | null, "currency": "XAF" | null }`.

### 9.1 Auth
| Méthode | Route | Corps / réponse |
|---|---|---|
| POST | `/auth/login` | `{email,password,mfa_code?}` → `{data: user}` (avec `mfa_enrollment_required`) ou `{mfa_required:true}` |
| POST | `/auth/logout` | 204 |
| GET | `/auth/me` | `{data: user}` (§4) |
| POST | `/auth/forgot-password` | `{email}` → 200 message neutre (toujours identique) |
| POST | `/auth/reset-password` | `{token,email,password,password_confirmation}` |
| POST | `/auth/mfa/setup` | → `{secret, otpauth_url}` |
| POST | `/auth/mfa/confirm` | `{code}` → active la MFA |

### 9.2 Public (portail client sans compte, throttle 10/min/IP)
| Méthode | Route | Détail |
|---|---|---|
| GET | `/public/referentials` | **non enveloppé** : `{categories:[{id,label}], products:[{id,label}], channels_reply:["courriel","courrier","telephone"], agencies:[{id,name,city}]}` (codes canal réels ; `preferred_channel` accepte ces codes, alias `email` → `courriel`) |
| POST | `/public/complaints` | multipart : `full_name, email, phone?, customer_number?, product_id, category_id?, agency_id?, subject, description, operation_date?, amount?, currency?, preferred_channel, consent (true requis), attachments[]` (≤5 fichiers, ≤10 Mo, pdf/jpg/png) → `201 {data:{reference, tracking_code, received_at, acknowledgment_due_at, final_response_due_at, rule_is_demo}}`. Le `tracking_code` (8 caractères) n'est montré qu'une fois ; seul son hash est stocké. |
| POST | `/public/track` | `{reference, tracking_code}` → `{data: ClientComplaintView}` |
| POST | `/public/track/messages` | `{reference, tracking_code, body}` |
| POST | `/public/track/attachments` | multipart `{reference, tracking_code, file}` |
| POST | `/public/track/reopen` | `{reference, tracking_code, reason}` → crée un dossier enfant `reouvert`, lié par `parent_complaint_id` → `201 {data:{reference, tracking_code, received_at, acknowledgment_due_at, final_response_due_at, rule_is_demo, parent_reference}}` (nouveau code de suivi pour l'enfant). Le dossier d'origine **garde son statut** et sa réponse. |

Messages et pièces (`/public/track/messages`, `/public/track/attachments`) → `201 {data: ClientComplaintView}`. Mauvaise référence ou mauvais code → `404 {message:"Dossier introuvable ou code de suivi invalide."}` (identique dans les deux cas).
Anti-force brute (toutes les routes `/public/track*`) : 5 échecs sur une même référence (existante ou non) → référence verrouillée 15 min, durée doublée à chaque récidive (≤ 24 h), même avec le bon code ; 30 échecs/heure depuis une IP → IP bloquée 1 h. Réponse : `429 {message:"Trop de tentatives pour ce dossier. Réessayez plus tard."}` + en-tête `Retry-After` (secondes). Événements journalisés (`public.track_locked`, `public.track_ip_blocked`).

`ClientComplaintView` = `{ reference, subject, category_label, product_label, client_status, client_status_label, received_at, last_update_at, next_step, final_response: {sent_at, body} | null, timeline: [{date,title,description}] (visibility=client seulement), messages: [{date, from:"client"|"bsca", body}] (kind=client_message seulement), documents: [{name, date, from}] (visibility=client), can_reopen: bool }`. **Jamais** : notes internes, noms d'agents, avis de contrôle, pièces internes, statut interne.

### 9.3 Client connecté (rôle `client`)
`GET /client/complaints` → `{data:[résumé]}` (résumé = `ClientComplaintView` sans `final_response`, `timeline`, `messages`, `documents`) ; `GET /client/complaints/{reference}` → `{data: ClientComplaintView}`.
Actions (mêmes règles que `/public/track/*`, limitées aux dossiers du client, sinon `404 {message:"Dossier introuvable."}`) :
`POST /client/complaints/{reference}/messages` `{body}` → `201 {data: ClientComplaintView}` ; `POST /client/complaints/{reference}/attachments` (multipart `file`) → `201 {data: ClientComplaintView}` ; `POST /client/complaints/{reference}/reopen` `{reason}` → `201` (même forme que `/public/track/reopen`).

### 9.4 Interne (auth + permissions)
| Méthode | Route | Détail |
|---|---|---|
| GET | `/referentials` | non enveloppé : `{agencies, entities, categories, products, channels, statuses:[{value,label}], decisions, priorities, solution_types, templates:[{id,code,kind,label,subject,body,version}], users:[{id,name,role,entity_id}]}` |
| GET | `/customers` | `search` (≥2 car.) → `{data:[{id, full_name, email, phone, customer_number_masked, preferred_channel, complaints_count}]}` (20 max, permission `complaints.create`, accès journalisé) |
| GET | `/complaints` | filtres §8 + `search` (référence, objet, nom client), `deadline_flag`, `owner_id`, `mine=1`, `sort` (∈ `received_at`,`reference`,`status`,`due_at`,`priority`; préfixe `-` desc), `page`, `per_page` (≤100) → paginé de `ComplaintListItem` |
| POST | `/complaints` | saisie agent : champs public (`email` facultatif ; `full_name` requis sauf si `customer_id`) + `channel` (code), `received_at` (date effective, ≤ maintenant), `receiving_agency_id?`, `customer_id?` (rattachement) → `201 {data: ComplaintDetail, meta:{tracking_code}}` (code de suivi à remettre au client, affiché une seule fois) |
| GET | `/complaints/{id}` | `ComplaintDetail` (consultation journalisée) |
| PATCH | `/complaints/{id}` | qualification : `category_id, product_id, processing_entity_id, priority, risk_level, amount, currency, subject` + `reason` obligatoire → audit avant/après |
| POST | `/complaints/{id}/transition` | `{to_status, reason}` → `ComplaintDetail`. Refusé (422) vers `reponse_envoyee` (passer par `send-response`) et vers `reouvert` (passer par `reopen`) ; `allowed_transitions` exclut donc ces deux cibles. Vers `affecte` : propriétaire requis. |
| POST | `/complaints/{id}/assign` | `{owner_id, deputy_id?, processing_entity_id?, reason}` → `ComplaintDetail` ; avance automatiquement `recu`/`a_qualifier` → `affecte`. Propriétaire/suppléant : gestionnaire ou responsable actif. |
| POST | `/complaints/{id}/acknowledge` | `{template_id?, channel, delivery_status:"envoye"\|"echec"\|"en_attente"}` → enregistre l'accusé (message sortant + preuve) ; `acknowledged_at` n'est renseigné qu'en cas d'envoi réussi ; un échec reste visible (`acknowledgment_status=echec`) |
| POST | `/complaints/{id}/messages` | `{kind:"client_message"\|"internal_note", body, channel?}` |
| POST | `/complaints/{id}/attachments` | multipart `{file, classification, visibility}` |
| GET | `/attachments/{id}/download` | flux binaire, contrôle d'accès + audit |
| POST | `/complaints/{id}/tasks` · PATCH `/tasks/{id}` | `{title, assignee_id?, due_at?, status?}` — `assignee_id` : collaborateur actif, ni client ni administrateur (sinon 422) |
| POST | `/complaints/{id}/solutions` | `{type, description, root_cause?, amount?, currency?, decision}` → nouvelle version |
| POST | `/solutions/{id}/submit` · `/solutions/{id}/approve` | approve : `{decision:"approuve"\|"rejete", comment?}` (N1 responsable, N2 conformité si `requires_n2` = montant ≥ seuil `settings.n2_threshold` 500 000 XAF) |
| POST | `/complaints/{id}/send-response` | `{body, template_id?, channel}` — exige solution approuvée → `final_response_at`, statut `reponse_envoyee`, décision copiée |
| POST | `/complaints/{id}/reopen` | `{reason}` → `201 {data: ComplaintDetail de l'enfant, meta:{tracking_code, parent_reference}}` ; le parent garde son statut et sa réponse ; refusé si le parent n'est pas répondu/clôturé ou si un enfant est encore ouvert |
| POST | `/complaints/{id}/mark-duplicate` | `{duplicate_of_id, reason}` (aucune suppression) |
| POST | `/complaints/{id}/controls` | `{result, findings}` (rôle qualité) |
| GET | `/complaints/export` | mêmes filtres + `format=csv\|xlsx\|pdf` → fichier ; en-tête du fichier : période, filtres, date de calcul, version de règle, utilisateur ; journalisé dans `exports` |
| GET | `/dashboard` | filtres §8 → `{data:{kpis:{received, responded, stock, at_risk, cohort_treated, late_open, late_closed, treatment_rate:{numerator,denominator,value}}, monthly:[{month:"2026-04", label:"Avr", received, responded}], by_category:[{label,count}], by_channel:[{label,count}], priorities:[ComplaintListItem] (5), recent_events:[{date, reference, complaint_id, title, actor}], meta:{from,to,as_of,timezone,filters,definitions:{clé:texte}, rule_is_demo, rule_version, computed_at}}}` |
| GET | `/deadlines` | `queue=a_echeance\|en_retard\|clos_en_retard` (défaut `a_echeance` = ouverts non en retard, par échéance croissante) + filtres → `{data:[ComplaintListItem + {prealert_at, acknowledgment_due_at, initial_due_at, announced_at, days_remaining, final_response_at}], meta, summary:{a_risque,en_retard,clos_en_retard}, rules:[DeadlineRule], rule_is_demo}` (`summary`, `rules`, `rule_is_demo` à la **racine**, hors doublons) |
| GET | `/solutions` | `status` (une valeur ou liste séparée par des virgules, ex. `soumise,approuvee_n1`) → paginé `{id, version, complaint:{id,reference,subject}, type, type_label, description, root_cause, decision, decision_label, status, status_label, amount, currency, proposed_by:{id,name}, submitted_at, requires_n2, created_at, approvals:[{id, level, approver:{id,name}, decision, decision_label, comment, decided_at}]}` (périmètre de l'utilisateur) |
| GET/POST | `/quality/actions` · PATCH `/quality/actions/{id}` | plan d'actions |
| GET | `/quality/recurring` | regroupements `{category, product, count, late_count, reopened_count}` sur période |
| GET | `/reports/activity` | filtres §8 → `{data:{opening_stock, inflow, outflow, adjustments, closing_stock, balanced, by_month:[{month,from,to,opening_stock,inflow,outflow,adjustments,closing_stock,balanced}], by_agency\|by_entity\|by_channel\|by_category:[{id,label,inflow,outflow,closing_stock}], by_decision:[{decision,label,count}], late_open, late_closed, validated_by:{id,name}\|null, validated_at, validation:{id,comment,rule_version,as_of,snapshot}\|null, meta:{…§dashboard, formula}}}` ; `?format=csv\|xlsx\|pdf` pour export |
| POST | `/reports/activity/validate` | `{from, to, as_of?, filters?:{agency_id,entity_id,category_id,product_id,channel,status}, comment?}` (permission `reports.validate`) → `201 {data:{id, type, from, to, as_of, filters, rule_version, snapshot, comment, validated_by:{id,name}, validated_at}}` ; enregistré dans `report_validations` et restitué par GET `/reports/activity` pour le même périmètre (période + filtres) |
| — | `/admin/users` | GET (paginé, `role`, `search`), POST, GET/PATCH `/admin/users/{id}` (`unlock`, `reset_mfa`, `is_active`) — pas de suppression ; `/admin/agencies`, `/admin/entities`, `/admin/categories`, `/admin/products`, `/admin/templates`, `/admin/holidays` : GET `{data:[…]}`, POST, PATCH `/{id}`, DELETE `/{id}` (= **désactivation** `is_active=false`, sauf jours fériés supprimés) ; modifier le texte d'un modèle crée une nouvelle version ; `/admin/deadline-rules` CRUD + POST `/admin/deadline-rules/{id}/validate` (conformité) ; GET `/admin/audit-logs` (filtres user, action, date) ; `/admin/imports` GET liste + POST upload CSV (idempotent par sha256) + GET `/admin/imports/{id}` anomalies |

Précisions sécurité (28/09/2026) : `GET /admin/deadline-rules` et `GET /admin/imports` sont **paginés** `{data, meta}` (`page`, `per_page` ≤ 100 ; défauts 50 et 25). Les routes des règles de délai portent un middleware `can:` (lecture `admin.rules` ou `admin.rules.validate`, écriture `admin.rules`, validation `admin.rules.validate`). `/admin/{type}` renvoie une liste blanche de champs par type (`AdminReferentialResource`). `GET /complaints/export` exige `complaints.export` dès le routage. `GET /reports/activity?format=…` sans `complaints.export` (direction) produit un **export agrégé anonymisé** (validateur remplacé par « Conformité (validation n° X) », mention en en-tête) journalisé avec `anonymized: true`.

`ComplaintListItem` = `{ id, reference, subject, customer_name (masqué « J. M*** » pour direction), channel:{code,label}, receiving_agency:{id,name}|null, processing_entity:{id,name}|null, category:{id,label}|null, status, status_label, decision, decision_label, priority, received_at, due_at, deadline_flag, deadline_flag_label, owner:{id,name}|null }`

`ComplaintDetail` = `ComplaintListItem` + `{ description, customer:{id,full_name,email,phone}, product:{id,label}|null, amount, currency, amount_flagged, risk_level, operation_date, acknowledged_at, acknowledgment_status, final_response_at, closed_at, mediation_requested_at, deputy:{id,name}|null, parent:{id,reference}|null, children:[{id,reference,status,status_label}], duplicate_of:{id,reference}|null, source:{system,id,status_label}|null, next_action (texte calculé), deadlines:[…], timeline:[…], attachments:[…], messages:[…] (inclut internal_note), tasks:[…], solutions:[Solution] (versions décroissantes, avec approvals), controls:[…], audit:[derniers 50], allowed_transitions:[{value,label}], can:{…} }` avec :
- `deadlines[]` = `{id, kind, kind_label, unit, due_at, initial_due_at, announced_at, met_at, status, status_label, rule:{id, code, label, version, is_demo, source_type}|null}` ;
- `timeline[]` (du plus récent au plus ancien) = `{id, date, type, type_label, title, description, visibility, actor:{id,name}|null, reason, from_status, to_status}` ;
- `attachments[]` = `{id, name, mime, size, sha256, classification, classification_label, visibility, scan_status, uploaded_by_client, uploaded_by:{id,name}|null, date, can_download, download_url}` ;
- `messages[]` = `{id, kind, kind_label, direction, channel:{code,label}|null, author:{id,name}|null, author_is_client, subject, body, delivery_status, delivery_status_label, sent_at, date}` ;
- `tasks[]` = `{id, complaint_id, title, description, assignee:{id,name}|null, due_at, status, status_label, completed_at, created_at}` ; `controls[]` = `{id, result, result_label, findings, controller:{id,name}, controlled_at}` ; `audit[]` = `{id, date, action, user:{id,name}|null, reason, before, after}` ;
- `can` = `{qualify, assign, transition, respond, acknowledge, note, attach, reopen, propose, approve, mark_duplicate, control, manage_tasks}`.
Pour la **direction** : `customer.full_name` masqué, `email`/`phone` = null, `attachments`, `messages` et `audit` = `[]`.

### 9.5 Précisions d'implémentation (back-end, 28/09/2026)
- **Matrice rôle → permissions** (source : `backend/app/Enums/Role.php`) — client : aucune (portail/espace client uniquement) ; agent_accueil : complaints.view, complaints.create, complaints.reopen, dashboard.view, deadlines.view ; gestionnaire : + complaints.qualify, complaints.transition, complaints.respond, complaints.export, solutions.propose ; responsable : gestionnaire + complaints.assign, solutions.approve_n1, reports.view ; qualite : complaints.view, complaints.export, quality.manage, quality.control, reports.view, dashboard.view, deadlines.view ; conformite : complaints.view, complaints.export, solutions.approve_n2, reports.view, reports.validate, dashboard.view, deadlines.view, admin.rules.validate, admin.audit ; direction : complaints.view (noms masqués), dashboard.view, reports.view, deadlines.view ; admin : admin.users, admin.referentials, admin.rules, admin.audit, admin.imports (aucun accès aux dossiers).
- **Colonnes/tables ajoutées** au §5 : `complaints.operation_date` (date de l'opération saisie au dépôt) ; `reference_sequences(year, last_number)` (séquence annuelle verrouillée pour les références) ; `report_validations` (validation des rapports) ; `customers.preferred_channel` ∈ `courriel|courrier|telephone` (défaut `courriel`).
- **Pièce « confidentielle »** : téléchargeable seulement par le propriétaire, le suppléant, un responsable ou la conformité ; une pièce `interne`/`confidentiel` ne peut pas être `visibility=client`.
- **Dossiers repris (import)** : pas de code de suivi communiqué (empreinte inutilisable) ; libellé source conservé ; aucune date de réponse inventée.
- Dates de toutes les ressources, y compris les objets bruts des référentiels d'administration, en ISO 8601 `+01:00`.
- Exceptions à la règle « id + created_at/updated_at » : `reference_sequences` (PK `year`), `complaint_quality_action` (PK composite). Uniques supplémentaires : `complaint_deadlines(complaint_id, kind)`, `solutions(complaint_id, version)`, `deadline_rules(code, version)`, `response_templates(code, version)`, `holidays(date, calendar_version, country)`. `import_batches.report` est nullable. Dossiers repris : `tracking_code_hash = '!import-sans-code'` (valeur sentinelle, jamais un hash valide). Dictionnaire complet : `base-de-donnees/dictionnaire-donnees.md`.

## 10. Design (fidélité à la maquette BSCA V1)

Jetons CSS (repris de la maquette et du CDC §2) :
```
--red:#D9132C  --red-deep:#A60E22  --blue:#0B509A  --navy:#12395E  --side:#102F50
--ink:#172637  --muted:#5A6B7B  --bg:#F5F7FA  --line:#DDE4EC  --white:#FFFFFF
--warn:#AF6500 / fond #FFF3DE   --danger:#B42332 / fond #FCEAED   --success:#11734D / fond #E9F6EF
--info-bg:#EDF4FB  --focus:#F4B841
```
Typo : Manrope (titres) + DM Sans (texte), Arial en secours. Titres 28–36 px, texte 15–16 px (14 px min dans tableaux), 13 px min. Pas de 8 px. Cartes rayon 15 px, contrôles 9–10 px.
Structure : barre latérale bleu nuit `#102F50` (252 px ; repliée à 74 px < 1080 px ; barre horizontale < 700 px), bandeau blanc 74 px avec logo `bsca-wide.png`, boutons rouges, héros dégradé `#12395E→#0B509A` avec filet rouge, cartes KPI, filtres dans une carte, tableaux → cartes sur mobile.
États : badges texte + icône + couleur (jamais la couleur seule). « En retard » rouge danger, « À risque » ambre, « Réponse envoyée » vert, informationnels bleus.
Accessibilité WCAG 2.2 AA : focus visible `#F4B841` 3 px, navigation clavier, `aria-live` pour les toasts, résumé textuel de chaque graphique, lisible à 200 %.
Chaque indicateur affiche période, date de calcul et définition (infobulle accessible).

## 11. Comptes de démonstration (seeders — données fictives uniquement)

Mot de passe commun de démonstration : `Bsca@Demo2026!` (à changer hors démo).
| Email | Rôle |
|---|---|
| `admin@bsca.demo` | admin |
| `accueil@bsca.demo` | agent_accueil (agence Brazzaville Centre) |
| `gestionnaire@bsca.demo` | gestionnaire (entité Cartes et paiements) |
| `responsable@bsca.demo` | responsable (entité Cartes et paiements) |
| `qualite@bsca.demo` | qualite |
| `conformite@bsca.demo` | conformite |
| `direction@bsca.demo` | direction |
| `client@bsca.demo` | client |

Jeu fictif : ~6 agences (Brazzaville Centre, Brazzaville Poto-Poto, Pointe-Noire Centre, Pointe-Noire Lumumba, Dolisie, Oyo), 5 entités (Cartes et paiements, Comptes, Virements et transferts, Banque digitale, Crédits), ~8 catégories, ~6 produits, **~240 réclamations** étalées sur 12 mois avec statuts, décisions, retards, réouvertures et doublons réalistes. Aucune donnée réelle.

### 9.6 Tableaux de bord par profil (ajout)

| Méthode | Route | Détail |
|---|---|---|
| GET | `/me/workload` | « Mon travail » : files propres au rôle connecté, calculées dans son périmètre (`visibleTo`). Réponse `{data:{role, items:[{key,label,count,to,tone,hint}]}}`. Accueil : `ack`, `qualify`, `mine_month` · Gestionnaire : `mine`, `mine_late`, `tasks`, `tasks_late` · Responsable : `unrouted`, `unassigned`, `n1`, `late` · Qualité : `to_control`, `actions`, `actions_late` · Conformité : `n2`, `rules`, `late` · Direction : `stock`, `late`, `at_risk` · Admin : aucune file. 403 pour le rôle client. |
| GET | `/admin/overview` | Vue d'ensemble de l'administration, accessible avec au moins une permission `admin.*`. Blocs renvoyés selon les permissions : `users` (admin.users), `rules` (admin.rules / admin.rules.validate), `referentials` (admin.referentials), `imports` (admin.imports), `audit` (admin.audit : 14 jours d'activité, actions fréquentes, derniers événements). Aucune donnée de réclamation ni donnée client. |

Page d'arrivée : l'administrateur arrive sur `/app/administration` ; les priorités du tableau de bord excluent les dossiers au statut `reponse_envoyee` ou `cloture` (dossiers historiques sans date de réponse).

### 10.1 Organisation de la navigation (mise à jour)

La barre latérale regroupe les modules par catégorie ; chaque profil ne voit que les modules autorisés (§4) et une catégorie vide est masquée. Chaque catégorie est repliable (préférence mémorisée dans le navigateur, non sensible) ; celle de la page ouverte reste toujours dépliée. En mode compact (icônes) et sur téléphone, tous les modules restent visibles.

| Catégorie | Modules | Permissions |
|---|---|---|
| Pilotage | Tableau de bord · Administration (vue d'ensemble) · Rapports | `dashboard.view` · une permission `admin.*` · `reports.view` |
| Traitement des réclamations | Réclamations · Nouvelle réclamation · Délais et alertes (compteur) · Solutions et validations | `complaints.view` · `complaints.create` · `deadlines.view` · `solutions.*` |
| Qualité et conformité | Qualité et actions | `quality.manage` / `quality.control` |
| Comptes et sécurité | Utilisateurs · Journal d'audit | `admin.users` · `admin.audit` |
| Référentiels | Agences · Entités de traitement · Catégories · Produits · Modèles de réponse | `admin.referentials` |
| Règles et calendrier | Règles de délai · Jours fériés | `admin.rules` / `admin.rules.validate` · `admin.referentials` / `admin.rules` |
| Données | Imports historiques | `admin.imports` |
| Mon compte | Sécurité du compte (MFA) | tout collaborateur |
| Espace client | Déposer · Suivre une demande | profils métier (masqué pour l'administrateur) |

Les rubriques d'administration ouvrent `/app/parametres?onglet=<clé>` (clés : `utilisateurs`, `audit`, `agences`, `entites`, `categories`, `produits`, `modeles`, `regles`, `feries`, `imports`) ; la page Paramètres occupe toute la largeur et, sur téléphone, propose une liste déroulante « Rubrique ». Source unique : `frontend/src/features/admin/adminSections.ts`. Une page non autorisée redirige vers l'espace de l'utilisateur (plus de page 403 en impasse).
