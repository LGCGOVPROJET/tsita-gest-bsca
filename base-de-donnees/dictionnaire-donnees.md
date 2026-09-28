# TSITA GEST × BSCA Bank — Dictionnaire de données

> Gestion des réclamations clients BSCA Bank. **Toutes les données du projet sont fictives.**
> Base : `tsita_gest`. Dernière vérification contre le schéma MySQL réel : 28/09/2026.

## 1. Introduction et conventions

| Sujet | Règle |
|---|---|
| SGBD | MySQL 8+, moteur **InnoDB**, jeu de caractères **utf8mb4** (collation `utf8mb4_unicode_ci`). |
| Source de vérité | Les **migrations Laravel** (`backend/database/migrations/*.php`) définissent le schéma. Ce dictionnaire les décrit ; en cas d'écart, les migrations font foi. Les types indiqués sont les types MySQL effectifs (`information_schema.COLUMNS`). |
| Clés primaires | `id BIGINT UNSIGNED AUTO_INCREMENT` sauf mention contraire (`reference_sequences.year`, pivot `complaint_quality_action`, tables techniques à clé chaîne). |
| Horodatage | `created_at` / `updated_at` (`timestamp`, nullables) gérés par Laravel. Les tables en ajout seul ou à usage unique (`complaint_events`, `audit_logs`, `exports`, `import_batches`) n'ont que `created_at` (défaut `CURRENT_TIMESTAMP`). |
| Fuseau horaire | Toutes les dates-heures sont **stockées en UTC** (`APP_TIMEZONE=UTC`). L'affichage et le calcul des délais se font en **Africa/Brazzaville** (`APP_BUSINESS_TIMEZONE`, UTC+1, sans heure d'été). Les colonnes `date` (ex. `operation_date`, `effective_from`, `holidays.date`) sont des dates locales sans heure. |
| Montants | `DECIMAL(15,2)`. Un montant **inconnu vaut `NULL`, jamais `0`**. Un montant renseigné est **toujours accompagné de sa devise** (`currency CHAR(3)`, code ISO 4217, ex. `XAF`). |
| Booléens | `tinyint(1)` (0 = faux, 1 = vrai). |
| Énumérations | Colonnes MySQL `enum(...)` dont les valeurs viennent des enums PHP `app/Enums/*.php` (valeurs techniques en minuscules sans accent, libellés FR exposés par l'API). Voir §9. |
| Clés étrangères | Toutes les FK déclarées sont en **`ON DELETE RESTRICT`** (et `ON UPDATE NO ACTION`) : aucune suppression en cascade ; un référentiel utilisé se désactive (`is_active = 0`), il ne se supprime pas. |
| Colonne `Null` | « Non » = `NOT NULL`, « Oui » = nullable. Défaut « — » = pas de valeur par défaut. |

Sommaire des tables :

- **Référentiels** : `agencies`, `processing_entities`, `categories`, `products`, `channels`, `settings`
- **Acteurs** : `users`, `customers`
- **Paramétrage des délais et modèles** : `deadline_rules`, `holidays`, `response_templates`
- **Cœur métier** : `reference_sequences`, `complaints`, `complaint_events`, `complaint_deadlines`, `attachments`, `messages`, `tasks`
- **Solutions et qualité** : `solutions`, `approvals`, `quality_controls`, `quality_actions`, `complaint_quality_action`
- **Traçabilité, exports, validation, reprise** : `audit_logs`, `exports`, `report_validations`, `import_batches`, `import_anomalies`
- **Techniques (Laravel)** : `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `personal_access_tokens`, `migrations`

---

## 2. Référentiels et acteurs

### 2.1 `users` — Utilisateurs

Comptes de connexion du personnel BSCA (rôles internes) et des clients disposant d'un compte portail (rôle `client`). Le rôle détermine les permissions (voir `App\Enums\Role`) ; les rôles `conformite`, `admin`, `responsable` et `direction` exigent la MFA.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| name | varchar(150) | Non | — | Nom affiché de l'utilisateur. |
| email | varchar(190) | Non | — | Identifiant de connexion. **Unique**. Donnée personnelle. |
| email_verified_at | timestamp | Oui | NULL | Date de vérification de l'e-mail (standard Laravel). |
| password | varchar(255) | Non | — | Mot de passe **haché** (cast `hashed`, bcrypt). Jamais en clair. |
| role | enum('client','agent_accueil','gestionnaire','responsable','qualite','conformite','direction','admin') | Non | — | Rôle applicatif (§9 `Role`). Indexé. |
| agency_id | bigint unsigned | Oui | NULL | FK → `agencies.id`. Agence de rattachement (périmètre agent d'accueil). |
| entity_id | bigint unsigned | Oui | NULL | FK → `processing_entities.id`. Entité de traitement (périmètre gestionnaire / responsable). |
| customer_id | bigint unsigned | Oui | NULL | FK → `customers.id`. Fiche client liée, pour le rôle `client` uniquement. |
| phone | varchar(40) | Oui | NULL | Téléphone professionnel. Donnée personnelle. |
| is_active | tinyint(1) | Non | 1 | Compte actif. Un utilisateur n'est jamais supprimé (FK RESTRICT), il est désactivé. |
| mfa_secret | text | Oui | NULL | Secret TOTP **chiffré** (cast `encrypted`, AES-256 via `APP_KEY`). |
| mfa_enabled | tinyint(1) | Non | 0 | MFA activée. |
| failed_logins | smallint unsigned | Non | 0 | Compteur d'échecs de connexion consécutifs (verrouillage). |
| locked_until | timestamp | Oui | NULL | Fin du verrouillage temporaire du compte (UTC). |
| last_login_at | timestamp | Oui | NULL | Dernière connexion réussie (UTC). |
| remember_token | varchar(100) | Oui | NULL | Jeton « se souvenir de moi » (Laravel). Secret. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `email`. **Index** : `role`.
- **FK** (RESTRICT) : `agency_id` → `agencies`, `entity_id` → `processing_entities`, `customer_id` → `customers`.

### 2.2 `customers` — Clients réclamants

Personne (client ou mandataire) à l'origine d'une réclamation. Une fiche peut exister sans compte portail.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| full_name | varchar(150) | Non | — | Nom complet. Donnée personnelle. |
| email | varchar(190) | Oui | NULL | E-mail de contact. Indexé (non unique : un même e-mail peut figurer sur plusieurs fiches). |
| phone | varchar(40) | Oui | NULL | Téléphone. Donnée personnelle. |
| customer_number | text | Oui | NULL | Numéro client bancaire **chiffré** (cast `encrypted`) ; type `text` car le chiffré est plus long que la donnée. Non recherchable en SQL. |
| address | varchar(255) | Oui | NULL | Adresse postale. Donnée personnelle. |
| preferred_channel | varchar(30) | Non | 'courriel' | Canal de réponse préféré. Valeurs admises par l'API : `courriel`, `courrier`, `telephone` (`ApiRequest::REPLY_CHANNELS`), qui reprennent des codes réels de `channels` ; la colonne stocke le **code** (texte), sans FK. La reprise d'existant utilise `courrier`. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Index** : `email`.
- Référencée par `complaints.customer_id` et `users.customer_id` (RESTRICT : une fiche client liée à un dossier ne peut pas être supprimée).

### 2.3 `agencies` — Agences

Agences bancaires BSCA qui reçoivent les réclamations (agence de réception).

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(30) | Non | — | Code agence. **Unique**. Utilisé par la reprise (`agence_code`). |
| name | varchar(150) | Non | — | Nom de l'agence (ex. « Brazzaville Centre »). |
| city | varchar(100) | Non | — | Ville. |
| is_active | tinyint(1) | Non | 1 | Agence utilisable pour les nouveaux dossiers. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `code`. Référencée par `users.agency_id`, `complaints.receiving_agency_id`.

### 2.4 `processing_entities` — Entités de traitement

Fonction ou service interne qui instruit la réclamation (ex. « Cartes et paiements »), distincte de l'agence de réception.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(30) | Non | — | Code de l'entité. **Unique**. |
| name | varchar(150) | Non | — | Libellé de l'entité. |
| is_active | tinyint(1) | Non | 1 | Entité active. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `code`. Référencée par `users.entity_id`, `complaints.processing_entity_id`, `quality_actions.owner_entity_id`.

### 2.5 `categories` — Natures de réclamation

Nature (motif) de la réclamation, versionnée pour la traçabilité des évolutions du référentiel.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(40) | Non | — | Code de la nature. **Unique**. |
| label | varchar(150) | Non | — | Libellé FR. |
| description | text | Oui | NULL | Définition / consignes de qualification. |
| is_active | tinyint(1) | Non | 1 | Nature sélectionnable. |
| version | int unsigned | Non | 1 | Version du libellé / de la définition. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `code`. Référencée par `complaints.category_id`, `quality_actions.category_id`.

### 2.6 `products` — Produits et services

Produit ou service bancaire concerné (compte, carte, crédit…).

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(40) | Non | — | Code produit. **Unique**. |
| label | varchar(150) | Non | — | Libellé FR. |
| is_active | tinyint(1) | Non | 1 | Produit sélectionnable. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `code`. Référencée par `complaints.product_id`.

### 2.7 `channels` — Canaux de réception

Canal par lequel la réclamation ou un message est reçu. Codes seedés : `portail`, `agence`, `telephone`, `courriel`, `courrier`.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(30) | Non | — | Code canal. **Unique**. Utilisé dans les filtres KPI (`channel`). |
| label | varchar(100) | Non | — | Libellé FR. |
| is_active | tinyint(1) | Non | 1 | Canal actif. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `code`. Référencée par `complaints.channel_id`, `messages.channel_id`.

### 2.8 `settings` — Paramètres applicatifs

Paramètres clé / valeur modifiables par l'administration.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| key | varchar(100) | Non | — | Nom du paramètre. **Unique**. Clés utilisées : `amount_flag_threshold` (seuil « montant hors norme », défaut 50 000 000), `n2_threshold` (seuil d'approbation N2, défaut 500 000), `holiday_calendar_version` (version de calendrier férié active, défaut `CG-2025-2027`). |
| value | json | Non | — | Valeur typée JSON. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `key`.

---

## 3. Paramétrage des délais et modèles

### 3.1 `deadline_rules` — Règles de délai

Règles de calcul des échéances (accusé de réception, réponse finale, pré-alerte, contrôle), versionnées et soumises à validation par la conformité. Seules les règles `valide` (ou `a_valider` de type `demonstration` si `APP_DEMO_MODE=true`) sont appliquées ; la règle retenue est la plus récente version en vigueur à la date de réception.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(40) | Non | — | Code fonctionnel de la règle (stable d'une version à l'autre). |
| label | varchar(190) | Non | — | Libellé FR. |
| kind | enum('accuse','reponse_finale','prealerte','controle') | Non | — | Type d'échéance (§9 `DeadlineKind`). |
| unit | enum('calendar','business') | Non | — | Jours calendaires ou ouvrés (§9 `DeadlineUnit`). |
| duration | smallint unsigned | Non | — | Nombre de jours N. Pour `prealerte` : N jours ouvrés **avant** l'échéance finale. |
| start_point | varchar(30) | Non | 'received_at' | Point de départ du décompte (seule valeur utilisée : `received_at`). |
| source_type | enum('juridique','interne','demonstration') | Non | — | Origine de la règle (§9 `RuleSourceType`). |
| source_reference | varchar(255) | Non | — | Référence du texte ou de la note interne justifiant la règle. |
| effective_from | date | Non | — | Début d'application (date locale). |
| effective_to | date | Oui | NULL | Fin d'application ; NULL = sans fin. |
| version | int unsigned | Non | 1 | Version de la règle. |
| status | enum('brouillon','a_valider','valide','retire') | Non | 'brouillon' | Cycle de validation (§9 `RuleStatus`). |
| validated_by | bigint unsigned | Oui | NULL | FK → `users.id`. Validateur (conformité). |
| validated_at | timestamp | Oui | NULL | Date de validation. |
| notes | text | Oui | NULL | Commentaires. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : (`code`, `version`). **Index** : (`kind`, `status`).
- **FK** (RESTRICT) : `validated_by` → `users`. Référencée par `complaint_deadlines.deadline_rule_id` : une règle appliquée ne peut plus être supprimée ; on crée une nouvelle version.

### 3.2 `holidays` — Jours fériés

Calendrier des jours fériés (République du Congo) utilisé pour les délais en jours ouvrés. Versionné pour rejouer les calculs historiques.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| date | date | Non | — | Jour férié (date locale). |
| label | varchar(150) | Non | — | Libellé (ex. « Fête de l'Indépendance »). |
| calendar_version | varchar(30) | Non | — | Version de calendrier (ex. `CG-2025-2027`) ; la version active est dans `settings.holiday_calendar_version`. |
| country | char(2) | Non | 'CG' | Pays ISO 3166-1 alpha-2. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : (`date`, `calendar_version`, `country`).

### 3.3 `response_templates` — Modèles de courrier

Modèles versionnés d'accusé de réception, de réponse d'attente, de réponse et de clôture. Le corps accepte les variables `{{reference}}`, `{{client}}`, `{{date_limite}}`.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| code | varchar(40) | Non | — | Code du modèle. |
| kind | enum('accuse','attente','reponse','cloture') | Non | — | Type de modèle (§9 `TemplateKind`). |
| label | varchar(150) | Non | — | Libellé FR. |
| subject | varchar(190) | Non | — | Objet du message. |
| body | text | Non | — | Corps avec variables `{{…}}`. |
| version | int unsigned | Non | 1 | Version du modèle. |
| is_active | tinyint(1) | Non | 1 | Modèle proposé ; l'accusé automatique prend la version active la plus récente. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : (`code`, `version`). Référencée par `messages.template_id`.

---

## 4. Cœur métier

### 4.1 `reference_sequences` — Séquences de références

Compteur annuel servant à générer les références `TG-BSCA-AAAA-NNNNNN` (`ReferenceGenerator`). L'incrément se fait dans une transaction avec verrou de ligne (`SELECT … FOR UPDATE`) pour éviter toute collision ; l'année est celle de la réception en heure locale.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| year | smallint unsigned | Non | — | Année (clé primaire, pas d'`id`). |
| last_number | int unsigned | Non | 0 | Dernier numéro attribué pour l'année. Ne recule jamais (`ensureAtLeast` pour les jeux de données et imports). |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage. |

- **PK** : `year`. Aucune FK.

### 4.2 `complaints` — Réclamations (dossiers)

Table centrale : un enregistrement par dossier de réclamation. Le **statut de traitement** (`status`) et la **décision de fond** (`decision`) sont deux dimensions indépendantes. Une réouverture ne modifie pas le dossier d'origine : elle crée un **dossier enfant** (`parent_complaint_id`) au statut `reouvert`. Un doublon est **marqué** (`duplicate_of_id`) et jamais supprimé.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| reference | varchar(25) | Non | — | Référence métier `TG-BSCA-AAAA-NNNNNN`, non signifiante (aucune info client). **Unique**. |
| tracking_code_hash | varchar(255) | Non | — | Empreinte **bcrypt** du code de suivi client (8 caractères, alphabet sans ambiguïté), normalisé en majuscules sans espaces ni tirets. Le code en clair n'est jamais stocké : il est communiqué une seule fois au client. Les dossiers repris portent la valeur sentinelle `!import-sans-code` (empreinte inutilisable : jamais accessibles par code). |
| customer_id | bigint unsigned | Non | — | FK → `customers.id`. Réclamant. |
| channel_id | bigint unsigned | Non | — | FK → `channels.id`. Canal de réception. |
| receiving_agency_id | bigint unsigned | Oui | NULL | FK → `agencies.id`. Agence de réception. |
| processing_entity_id | bigint unsigned | Oui | NULL | FK → `processing_entities.id`. Entité en charge (renseignée à la qualification / affectation). |
| category_id | bigint unsigned | Oui | NULL | FK → `categories.id`. Nature (NULL tant que non qualifié). |
| product_id | bigint unsigned | Oui | NULL | FK → `products.id`. Produit concerné. |
| subject | varchar(190) | Non | — | Objet de la réclamation. |
| description | text | Non | — | Exposé des faits. Peut contenir des données personnelles. |
| operation_date | date | Oui | NULL | Date de l'opération contestée (date locale). |
| status | enum('brouillon','recu','a_qualifier','affecte','en_investigation','attente_information','solution_proposee','a_valider','reponse_envoyee','cloture','reouvert') | Non | 'recu' | Statut de traitement (§9 `ComplaintStatus`). Ne change que par une transition autorisée (`ComplaintWorkflow`), qui trace un `complaint_events` et un `audit_logs`. Indexé. |
| decision | enum('fondee','partiellement_fondee','non_fondee','irrecevable_motivee') | Oui | NULL | Décision de fond (§9 `Decision`), reprise de la solution approuvée à l'envoi de la réponse. |
| priority | enum('basse','normale','haute','critique') | Non | 'normale' | Priorité (§9 `Priority`). |
| risk_level | enum('faible','moyen','eleve') | Non | 'faible' | Niveau de risque (§9 `RiskLevel`). |
| amount | decimal(15,2) | Oui | NULL | Montant contesté. **NULL = inconnu (jamais 0)**. |
| currency | char(3) | Oui | NULL | Devise ISO 4217 du montant ; renseignée dès que `amount` l'est. |
| amount_flagged | tinyint(1) | Non | 0 | Montant hors norme : négatif ou ≥ `settings.amount_flag_threshold`. Calculé, jamais saisi. |
| received_at | timestamp | Non | — | Date-heure de réception (UTC) : point de départ des délais et base des KPI « reçues » / « stock ». Indexé. |
| acknowledged_at | timestamp | Oui | NULL | Date d'envoi **réussi** de l'accusé de réception. |
| acknowledgment_status | enum('en_attente','envoye','echec') | Non | 'en_attente' | État d'envoi de l'accusé (§9 `DeliveryStatus`). |
| final_response_at | timestamp | Oui | NULL | Date d'envoi de la réponse finale. Base des KPI « répondues », « cohorte traitée », « en retard ». Jamais inventée à la reprise. Indexé. |
| closed_at | timestamp | Oui | NULL | Date de clôture. |
| owner_id | bigint unsigned | Oui | NULL | FK → `users.id`. Gestionnaire propriétaire du dossier. Indexé (`complaints_owner_idx`). |
| deputy_id | bigint unsigned | Oui | NULL | FK → `users.id`. Suppléant. |
| parent_complaint_id | bigint unsigned | Oui | NULL | FK → `complaints.id` (auto-référence). Dossier d'origine en cas de **réouverture / contestation** ; le dossier enfant est compté comme nouvelle entrée. |
| duplicate_of_id | bigint unsigned | Oui | NULL | FK → `complaints.id` (auto-référence). Dossier principal dont celui-ci est le **doublon**. Un dossier ne peut pas être son propre doublon ni pointer vers un doublon ; un doublon ne peut pas être réouvert. |
| mediation_requested_at | timestamp | Oui | NULL | Date de demande de médiation. |
| source_system | varchar(50) | Oui | NULL | Système d'origine pour un dossier repris (NULL pour un dossier natif). |
| source_id | varchar(100) | Oui | NULL | Identifiant du dossier dans le système source. |
| source_status_label | varchar(150) | Oui | NULL | Libellé de statut d'origine, conservé tel quel. |
| consent_at | timestamp | Oui | NULL | Date du consentement du client au traitement de ses données. |
| created_by | bigint unsigned | Oui | NULL | FK → `users.id`. Auteur de la saisie (NULL si dépôt client sans compte). |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : `reference` ; (`source_system`, `source_id`) — idempotence de la reprise (les dossiers natifs, à `NULL`, ne sont pas concernés : MySQL admet plusieurs NULL).
- **Index** : `status`, `received_at`, `final_response_at`, `receiving_agency_id` (`complaints_receiving_agency_idx`), `processing_entity_id` (`complaints_processing_entity_idx`), `owner_id` (`complaints_owner_idx`), plus un index par FK.
- **FK** (RESTRICT) : `customer_id` → `customers`, `channel_id` → `channels`, `receiving_agency_id` → `agencies`, `processing_entity_id` → `processing_entities`, `category_id` → `categories`, `product_id` → `products`, `owner_id` / `deputy_id` / `created_by` → `users`, `parent_complaint_id` / `duplicate_of_id` → `complaints`.
- **Règles** :
  - Transitions autorisées : `brouillon→recu` ; `recu→a_qualifier` ; `a_qualifier→affecte` ; `affecte→en_investigation` ; `en_investigation→attente_information|solution_proposee` ; `attente_information→en_investigation` ; `solution_proposee→a_valider|en_investigation` ; `a_valider→solution_proposee|reponse_envoyee` (via l'envoi de réponse) ; `reponse_envoyee→cloture|reouvert` ; `cloture→reouvert` ; `reouvert→en_investigation`. Motif (`reason`) obligatoire hors transitions automatiques.
  - La réponse finale exige une solution approuvée (dernière version) ; elle fixe `final_response_at`, `decision` et le statut `reponse_envoyee`.
  - Réouverture possible seulement si le dossier est répondu ou clôturé, n'est pas un doublon et n'a pas déjà un enfant ouvert. L'enfant reçoit une nouvelle référence, un nouveau code de suivi et ses propres échéances.
  - Aucune suppression : pas de soft delete, FK RESTRICT depuis toutes les tables filles.

### 4.3 `complaint_events` — Chronologie du dossier (ajout seul)

Journal chronologique des faits d'un dossier (création, affectation, changements de statut, messages, réponses…). Il alimente la chronologie interne et, pour les événements `visibility = client`, le suivi client. **Table en ajout seul** : ni modification ni suppression.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| type | enum('created','acknowledged','qualified','assigned','status_changed','message','attachment','solution','approval','response_sent','reopened','duplicate','escalated','deadline') | Non | — | Type d'événement (§9 `EventType`). |
| from_status | enum(… 11 statuts `ComplaintStatus` …) | Oui | NULL | Statut avant transition (pour `status_changed`). |
| to_status | enum(… 11 statuts `ComplaintStatus` …) | Oui | NULL | Statut après transition. |
| title | varchar(190) | Non | — | Intitulé lisible de l'événement. |
| description | text | Oui | NULL | Détail. |
| visibility | enum('internal','client') | Non | 'internal' | Visible du client ou interne seulement (§9 `Visibility`). |
| actor_id | bigint unsigned | Oui | NULL | FK → `users.id`. Auteur (NULL = système ou client sans compte). |
| reason | text | Oui | NULL | Motif saisi (obligatoire pour les transitions manuelles). |
| created_at | timestamp | Non | CURRENT_TIMESTAMP | Date de l'événement (UTC). Pas de `updated_at`. |

- **PK** : `id`. **Index** : (`complaint_id`, `created_at`). **FK** (RESTRICT) : `complaint_id` → `complaints`, `actor_id` → `users`.
- **Append-only** : triggers MySQL `complaint_events_no_update` (BEFORE UPDATE) et `complaint_events_no_delete` (BEFORE DELETE) qui lèvent `SIGNAL SQLSTATE '45000'` ; double protection côté modèle Eloquent (`updating` / `deleting` → `LogicException`).

### 4.4 `complaint_deadlines` — Échéances du dossier

Échéances calculées pour chaque dossier à partir des règles de délai (`DeadlineCalculator`) : une ligne par type d'échéance. Calcul en Africa/Brazzaville, jour de réception non compté, échéance = 23:59:59 locale du jour cible ; pas de suspension pendant `attente_information`.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| deadline_rule_id | bigint unsigned | Non | — | FK → `deadline_rules.id`. Règle appliquée. |
| rule_version | int unsigned | Non | — | Version de la règle au moment du calcul (figée). |
| kind | enum('accuse','reponse_finale','prealerte','controle') | Non | — | Type d'échéance (copié de la règle). |
| unit | enum('calendar','business') | Non | — | Unité (copiée de la règle). |
| due_at | timestamp | Non | — | Échéance en vigueur (UTC). |
| initial_due_at | timestamp | Non | — | Échéance initiale calculée à la création. **Jamais modifiée.** |
| announced_at | timestamp | Oui | NULL | Nouvelle date annoncée au client (report communiqué), **stockée à part** : ne remplace ni `due_at` ni `initial_due_at` pour la mesure du respect des délais. |
| met_at | timestamp | Oui | NULL | Date à laquelle l'échéance a été honorée (envoi de l'accusé, de la réponse finale…). |
| status | enum('en_cours','respectee','depassee','respectee_en_retard') | Non | 'en_cours' | État (§9 `DeadlineStatus`) : `depassee` posé par tâche planifiée si non honorée et échue ; `respectee` / `respectee_en_retard` à l'atteinte selon `met_at ≤ due_at`. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : (`complaint_id`, `kind`) — une seule échéance par type et par dossier. **Index** : (`kind`, `due_at`).
- **FK** (RESTRICT) : `complaint_id` → `complaints`, `deadline_rule_id` → `deadline_rules`.
- **Règles** : une échéance existante n'est jamais écrasée (le recalcul ne crée que les types manquants). La pré-alerte est calculée à rebours depuis l'échéance finale et est honorée en même temps qu'elle. Le signal `deadline_flag` (`ok`, `a_risque`, `en_retard`, `clos_en_retard`, `sans_regle`) est **calculé** à la volée, non stocké.

### 4.5 `attachments` — Pièces jointes

Métadonnées des fichiers joints à un dossier. Le contenu est **chiffré** (`Crypt::encryptString`) sur le disque privé `attachments`, sous un chemin aléatoire.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| uploaded_by | bigint unsigned | Oui | NULL | FK → `users.id`. Déposant interne (NULL si dépôt client sans compte). |
| uploaded_by_client | tinyint(1) | Non | 0 | Dépôt effectué par le client. |
| original_name | varchar(255) | Non | — | Nom de fichier d'origine (affichage uniquement). |
| stored_path | varchar(255) | Non | — | Chemin de stockage **aléatoire** `AAAA/MM/<40 caractères>.enc`, sans lien avec le nom d'origine. Jamais exposé. |
| mime | varchar(100) | Non | — | Type MIME contrôlé. |
| size | bigint unsigned | Non | — | Taille en octets (du fichier en clair). |
| sha256 | char(64) | Non | — | Empreinte SHA-256 du contenu en clair (intégrité, détection de doublons). Indexé. |
| classification | enum('client','interne','confidentiel') | Non | 'interne' | Classification (§9 `AttachmentClassification`). |
| visibility | enum('internal','client') | Non | 'internal' | Visible du client ou non. |
| scan_status | enum('en_attente','sain','rejete') | Non | 'en_attente' | Résultat de l'analyse antivirale (§9 `ScanStatus`) ; seul un fichier `sain` est téléchargeable. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Index** : `sha256`. **FK** (RESTRICT) : `complaint_id` → `complaints`, `uploaded_by` → `users`.

### 4.6 `messages` — Messages et notes

Échanges avec le client (messages entrants / sortants, dont accusés et réponses) et notes internes.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| kind | enum('client_message','internal_note') | Non | — | Message client ou note interne (§9 `MessageKind`). Une note interne n'est jamais visible du client. |
| direction | enum('entrant','sortant') | Oui | NULL | Sens de l'échange (NULL pour une note interne). |
| channel_id | bigint unsigned | Oui | NULL | FK → `channels.id`. Canal utilisé. |
| author_id | bigint unsigned | Oui | NULL | FK → `users.id`. Auteur interne. |
| author_is_client | tinyint(1) | Non | 0 | Message rédigé par le client. |
| subject | varchar(190) | Oui | NULL | Objet. |
| body | text | Non | — | Contenu. Peut contenir des données personnelles. |
| delivery_status | enum('en_attente','envoye','echec') | Oui | NULL | État d'envoi d'un message sortant (§9 `DeliveryStatus`). |
| sent_at | timestamp | Oui | NULL | Date d'envoi. |
| template_id | bigint unsigned | Oui | NULL | FK → `response_templates.id`. Modèle utilisé. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Index** : (`complaint_id`, `kind`). **FK** (RESTRICT) : `complaint_id` → `complaints`, `channel_id` → `channels`, `author_id` → `users`, `template_id` → `response_templates`.

### 4.7 `tasks` — Tâches

Actions internes à réaliser sur un dossier (demande d'information à un service, vérification…).

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| title | varchar(190) | Non | — | Intitulé. |
| description | text | Oui | NULL | Détail. |
| assignee_id | bigint unsigned | Oui | NULL | FK → `users.id`. Personne en charge. |
| due_at | timestamp | Oui | NULL | Échéance de la tâche. |
| status | enum('a_faire','en_cours','terminee') | Non | 'a_faire' | État (§9 `TaskStatus`). |
| completed_at | timestamp | Oui | NULL | Date de réalisation. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **FK** (RESTRICT) : `complaint_id` → `complaints`, `assignee_id` → `users`.

---

## 5. Solutions et qualité

### 5.1 `solutions` — Solutions proposées (versionnées)

Proposition de traitement d'un dossier. Chaque nouvelle proposition crée une **nouvelle version** ; les versions précédentes ne sont jamais écrasées. Seule la dernière version peut être soumise.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| version | int unsigned | Non | — | Numéro de version (max + 1, sous verrou). |
| type | enum('remboursement','correction_operation','explication_motivee','autre_mesure','non_fondement') | Non | — | Nature de la solution (§9 `SolutionType`). |
| description | text | Non | — | Contenu de la solution. |
| root_cause | text | Oui | NULL | Cause racine identifiée. |
| amount | decimal(15,2) | Oui | NULL | Montant accordé ; NULL = sans montant (jamais 0 par défaut). |
| currency | char(3) | Oui | NULL | Devise, renseignée si `amount` l'est (défaut applicatif `XAF`). |
| decision | enum('fondee','partiellement_fondee','non_fondee','irrecevable_motivee') | Non | — | Décision de fond proposée (§9 `Decision`). |
| status | enum('brouillon','soumise','approuvee_n1','approuvee','rejetee') | Non | 'brouillon' | État de validation (§9 `SolutionStatus`). Indexé. |
| requires_n2 | tinyint(1) | Non | 0 | Approbation de niveau 2 (conformité) requise : montant ≥ `settings.n2_threshold`. |
| proposed_by | bigint unsigned | Non | — | FK → `users.id`. Proposant (ne peut pas approuver sa propre solution). |
| submitted_at | timestamp | Oui | NULL | Date de soumission à validation. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Unique** : (`complaint_id`, `version`). **Index** : `status`. **FK** (RESTRICT) : `complaint_id` → `complaints`, `proposed_by` → `users`.

### 5.2 `approvals` — Décisions d'approbation

Décisions de validation d'une solution : niveau 1 (responsable de traitement), niveau 2 (conformité, si `requires_n2`).

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| solution_id | bigint unsigned | Non | — | FK → `solutions.id`. |
| level | tinyint unsigned | Non | — | Niveau : `1` (N1) ou `2` (N2). Contrôlé par l'application (pas de contrainte CHECK). |
| approver_id | bigint unsigned | Non | — | FK → `users.id`. Approbateur (différent du proposant ; permission `solutions.approve_n1` / `_n2`). |
| decision | enum('approuve','rejete') | Non | — | Décision (§9 `ApprovalDecision`). Un rejet exige un commentaire. |
| comment | text | Oui | NULL | Commentaire (obligatoire si rejet). |
| decided_at | timestamp | Non | — | Date de la décision. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **FK** (RESTRICT) : `solution_id` → `solutions`, `approver_id` → `users`.

### 5.3 `quality_controls` — Contrôles qualité

Contrôle a posteriori d'un dossier par le service qualité.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| controller_id | bigint unsigned | Non | — | FK → `users.id`. Contrôleur. |
| result | enum('conforme','non_conforme','a_revoir') | Non | — | Résultat (§9 `ControlResult`). |
| findings | text | Oui | NULL | Constats. |
| controlled_at | timestamp | Non | — | Date du contrôle. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **FK** (RESTRICT) : `complaint_id` → `complaints`, `controller_id` → `users`.

### 5.4 `quality_actions` — Actions correctives

Plan d'actions correctives / préventives issues de l'analyse des causes racines, pouvant couvrir plusieurs dossiers.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| title | varchar(190) | Non | — | Intitulé de l'action. |
| root_cause | text | Non | — | Cause racine traitée. |
| category_id | bigint unsigned | Oui | NULL | FK → `categories.id`. Nature concernée. |
| owner_id | bigint unsigned | Oui | NULL | FK → `users.id`. Pilote de l'action. |
| owner_entity_id | bigint unsigned | Oui | NULL | FK → `processing_entities.id`. Entité pilote. |
| due_at | timestamp | Oui | NULL | Échéance. |
| status | enum('planifiee','en_cours','realisee','verifiee') | Non | 'planifiee' | Avancement (§9 `QualityActionStatus`). |
| effectiveness_measure | text | Oui | NULL | Indicateur d'efficacité. |
| evidence | text | Oui | NULL | Preuve de réalisation. |
| completed_at | timestamp | Oui | NULL | Date de réalisation. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **FK** (RESTRICT) : `category_id` → `categories`, `owner_id` → `users`, `owner_entity_id` → `processing_entities`.

### 5.5 `complaint_quality_action` — Lien dossiers ↔ actions correctives

Table d'association (plusieurs-à-plusieurs) entre réclamations et actions correctives.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| complaint_id | bigint unsigned | Non | — | FK → `complaints.id`. |
| quality_action_id | bigint unsigned | Non | — | FK → `quality_actions.id`. |

- **PK composite** : (`complaint_id`, `quality_action_id`) — pas d'`id` ni d'horodatage. **Index** : `quality_action_id`. **FK** (RESTRICT) vers les deux tables.

---

## 6. Traçabilité, exports, validation et reprise

### 6.1 `audit_logs` — Journal d'audit (ajout seul)

Journal de toutes les actions sensibles (connexion, transitions, qualification, approbations, exports, imports, administration) avec état avant / après. **Table en ajout seul.**

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| user_id | bigint unsigned | Oui | NULL | FK → `users.id`. Auteur (NULL = système / anonyme). |
| action | varchar(100) | Non | — | Code d'action (ex. `complaint.reopen`, `complaint.send_response`, `solution.propose`, `import.run`). Indexé. |
| auditable_type | varchar(150) | Oui | NULL | Type de l'objet concerné : **nom court de la classe** (`Complaint`, `Solution`, `ImportBatch`…). |
| auditable_id | bigint unsigned | Oui | NULL | Identifiant de l'objet concerné (référence polymorphe, sans FK). |
| before | json | Oui | NULL | Valeurs avant modification (sans secrets). |
| after | json | Oui | NULL | Valeurs après modification. |
| reason | text | Oui | NULL | Motif saisi. |
| ip | varchar(45) | Oui | NULL | Adresse IP (IPv4 / IPv6). Donnée personnelle. |
| user_agent | varchar(500) | Oui | NULL | Navigateur. |
| created_at | timestamp | Non | CURRENT_TIMESTAMP | Date de l'action (UTC). Pas de `updated_at`. |

- **PK** : `id`. **Index** : (`auditable_type`, `auditable_id`), `action`, `created_at`. **FK** (RESTRICT) : `user_id` → `users`.
- **Append-only** : triggers `audit_logs_no_update` et `audit_logs_no_delete` (`SIGNAL SQLSTATE '45000'`) + garde Eloquent (`LogicException`).

### 6.2 `exports` — Registre des exports

Trace de chaque export de données (liste de réclamations, rapport d'activité) pour la reproductibilité des chiffres.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| user_id | bigint unsigned | Non | — | FK → `users.id`. Auteur de l'export. |
| type | varchar(50) | Non | — | Type d'export (`reclamations`, `rapport-activite`). |
| format | enum('csv','xlsx','pdf') | Non | — | Format (§9 `ExportFormat`). |
| filters | json | Non | — | Filtres appliqués (période, agence, entité, catégorie, produit, canal, statut). |
| period_from | date | Oui | NULL | Début de période (date locale incluse). |
| period_to | date | Oui | NULL | Fin de période (incluse). |
| as_of | timestamp | Non | — | Date de calcul (« arrêté au »). |
| rule_version | varchar(100) | Oui | NULL | Libellé de la règle de délai finale appliquée (ex. `RF-45 v1 (démonstration, non validée)`). |
| row_count | int unsigned | Non | 0 | Nombre de lignes exportées. |
| created_at | timestamp | Non | CURRENT_TIMESTAMP | Date de l'export. |

- **PK** : `id`. **FK** (RESTRICT) : `user_id` → `users`. Le fichier exporté lui-même n'est pas stocké.

### 6.3 `report_validations` — Validations de rapports par la conformité

Trace de la validation d'un rapport (actuellement le rapport d'activité et de rapprochement du stock, `type = activity`) par la conformité (permission `reports.validate`) : qui, quand, sur quel périmètre, avec quelle version de règle, et les chiffres figés au moment de la validation. Une validation retrouvée pour le même type, la même période et les mêmes filtres (`filters_hash`) est affichée avec le rapport.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| type | varchar(50) | Non | — | Type de rapport validé (valeur utilisée : `activity`). |
| period_from | date | Non | — | Début de la période validée (date locale incluse). |
| period_to | date | Non | — | Fin de la période validée (incluse). |
| filters | json | Non | — | Filtres de dimension appliqués (agence, entité, catégorie, produit, canal, statut). |
| filters_hash | char(64) | Non | — | SHA-256 des filtres de dimension normalisés (clés triées, valeurs en chaîne) : permet de retrouver la validation d'un périmètre identique. |
| as_of | date | Non | — | Date de calcul du rapport (« arrêté au », date locale). |
| rule_version | varchar(100) | Oui | NULL | Libellé de la règle de délai finale appliquée au moment de la validation. |
| snapshot | json | Oui | NULL | Chiffres rapprochés figés (stock début, entrées, réponses finales, stock fin, `balanced`…). |
| comment | text | Oui | NULL | Commentaire du validateur. |
| validated_by | bigint unsigned | Non | — | FK → `users.id`. Validateur (conformité). |
| validated_at | timestamp | Non | — | Date-heure de validation (UTC). |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **Index** : `report_validations_scope_idx` (`type`, `period_from`, `period_to`, `filters_hash`) — non unique : plusieurs validations successives d'un même périmètre sont conservées, la plus récente fait foi. **FK** (RESTRICT) : `validated_by` → `users`.
- Chaque validation est aussi tracée dans `audit_logs` (`action = report.validate`).

### 6.4 `import_batches` — Lots de reprise

Un lot par fichier CSV de reprise de l'existant (`LegacyImportService`).

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| filename | varchar(255) | Non | — | Nom du fichier importé. |
| file_sha256 | char(64) | Non | — | Empreinte SHA-256 du fichier. **Unique** : réimporter le même fichier renvoie le lot existant (idempotence). |
| source_system | varchar(50) | Non | — | Système source, reporté dans `complaints.source_system`. |
| status | enum('en_cours','termine','termine_avec_anomalies','echec') | Non | 'en_cours' | État du lot (§9 `ImportStatus`). |
| rows_total | int unsigned | Non | 0 | Lignes lues. |
| rows_created | int unsigned | Non | 0 | Dossiers créés. |
| rows_skipped | int unsigned | Non | 0 | Lignes ignorées (déjà importées : même `source_system` + `source_id`). |
| rows_anomalies | int unsigned | Non | 0 | Anomalies consignées. |
| report | json | Oui | NULL | Rapport (références créées, identifiants ignorés, répartitions par statut / mois / canal). |
| imported_by | bigint unsigned | Non | — | FK → `users.id`. Opérateur. |
| created_at | timestamp | Non | CURRENT_TIMESTAMP | Date de l'import. |

- **PK** : `id`. **Unique** : `file_sha256`. **FK** (RESTRICT) : `imported_by` → `users`.
- **Règles de reprise** : aucune date de réponse n'est inventée (absente, illisible ou antérieure à la réception → `NULL` + anomalie) ; montant illisible ou sans devise valide → `NULL` ; libellé de statut source conservé ; ligne ininterprétable non créée et consignée.

### 6.5 `import_anomalies` — Anomalies de reprise

Lignes rejetées ou importées avec réserve lors d'une reprise, à traiter manuellement.

| Colonne | Type MySQL | Null | Défaut | Signification métier / règles |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | Identifiant technique. |
| import_batch_id | bigint unsigned | Non | — | FK → `import_batches.id`. |
| row_number | int unsigned | Non | — | Numéro de ligne dans le fichier. |
| source_id | varchar(100) | Oui | NULL | Identifiant source de la ligne, s'il est lisible. |
| issue | varchar(500) | Non | — | Description de l'anomalie (FR). |
| raw | json | Non | — | Ligne brute d'origine (peut contenir des données personnelles). |
| resolution_status | enum('a_traiter','resolu','ignore') | Non | 'a_traiter' | Suivi du traitement (§9 `AnomalyResolution`). |
| resolved_by | bigint unsigned | Oui | NULL | FK → `users.id`. |
| resolved_at | timestamp | Oui | NULL | Date de résolution. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage Laravel. |

- **PK** : `id`. **FK** (RESTRICT) : `import_batch_id` → `import_batches`, `resolved_by` → `users`.

---

## 7. Tables techniques (Laravel)

Tables de socle Laravel, sans valeur métier directe. Elles ne portent pas de FK déclarées.

### 7.1 `password_reset_tokens`

| Colonne | Type MySQL | Null | Défaut | Signification |
|---|---|---|---|---|
| email | varchar(255) | Non | — | **PK**. E-mail de l'utilisateur. |
| token | varchar(255) | Non | — | Jeton de réinitialisation **haché**. |
| created_at | timestamp | Oui | NULL | Émission (expiration applicative). |

### 7.2 `sessions`

Sessions web (Sanctum en mode SPA par cookie, driver `database`).

| Colonne | Type MySQL | Null | Défaut | Signification |
|---|---|---|---|---|
| id | varchar(255) | Non | — | **PK**. Identifiant de session. |
| user_id | bigint unsigned | Oui | NULL | Utilisateur connecté (indexé, **sans FK**). |
| ip_address | varchar(45) | Oui | NULL | IP. Donnée personnelle. |
| user_agent | text | Oui | NULL | Navigateur. |
| payload | longtext | Non | — | Données de session sérialisées (chiffrées si `SESSION_ENCRYPT=true`). |
| last_activity | int | Non | — | Dernière activité (timestamp Unix). Indexé. |

### 7.3 `cache` et 7.4 `cache_locks`

| Table | Colonne | Type MySQL | Null | Défaut | Signification |
|---|---|---|---|---|---|
| cache | key | varchar(255) | Non | — | **PK**. Clé de cache. |
| cache | value | mediumtext | Non | — | Valeur sérialisée. |
| cache | expiration | bigint | Non | — | Expiration (Unix). Indexé. |
| cache_locks | key | varchar(255) | Non | — | **PK**. Nom du verrou. |
| cache_locks | owner | varchar(255) | Non | — | Détenteur. |
| cache_locks | expiration | bigint | Non | — | Expiration (Unix). Indexé. |

### 7.5 `jobs`, 7.6 `job_batches`, 7.7 `failed_jobs`

| Table | Colonne | Type MySQL | Null | Défaut | Signification |
|---|---|---|---|---|---|
| jobs | id | bigint unsigned | Non | auto | **PK**. |
| jobs | queue | varchar(255) | Non | — | File. Indexé. |
| jobs | payload | longtext | Non | — | Tâche sérialisée. |
| jobs | attempts | smallint unsigned | Non | — | Tentatives. |
| jobs | reserved_at | int unsigned | Oui | NULL | Réservation (Unix). |
| jobs | available_at | int unsigned | Non | — | Disponibilité (Unix). |
| jobs | created_at | int unsigned | Non | — | Création (Unix). |
| job_batches | id | varchar(255) | Non | — | **PK**. |
| job_batches | name | varchar(255) | Non | — | Nom du lot. |
| job_batches | total_jobs / pending_jobs / failed_jobs | int | Non | — | Compteurs. |
| job_batches | failed_job_ids | longtext | Non | — | Identifiants en échec. |
| job_batches | options | mediumtext | Oui | NULL | Options sérialisées. |
| job_batches | cancelled_at / finished_at | int | Oui | NULL | Annulation / fin (Unix). |
| job_batches | created_at | int | Non | — | Création (Unix). |
| failed_jobs | id | bigint unsigned | Non | auto | **PK**. |
| failed_jobs | uuid | varchar(255) | Non | — | **Unique**. |
| failed_jobs | connection / queue | varchar(255) | Non | — | Connexion et file. |
| failed_jobs | payload / exception | longtext | Non | — | Tâche et trace d'erreur. |
| failed_jobs | failed_at | timestamp | Non | CURRENT_TIMESTAMP | Date d'échec. Index (`connection`, `queue`, `failed_at`). |

### 7.8 `personal_access_tokens`

Jetons d'API Sanctum (non utilisés par la SPA, qui s'authentifie par cookie).

| Colonne | Type MySQL | Null | Défaut | Signification |
|---|---|---|---|---|
| id | bigint unsigned | Non | auto | **PK**. |
| tokenable_type | varchar(255) | Non | — | Type du propriétaire (polymorphe, sans FK). Index (`tokenable_type`, `tokenable_id`). |
| tokenable_id | bigint unsigned | Non | — | Identifiant du propriétaire. |
| name | text | Non | — | Nom du jeton. |
| token | varchar(64) | Non | — | Empreinte SHA-256 du jeton. **Unique**. |
| abilities | text | Oui | NULL | Droits (JSON). |
| last_used_at | timestamp | Oui | NULL | Dernière utilisation. |
| expires_at | timestamp | Oui | NULL | Expiration. Indexé. |
| created_at / updated_at | timestamp | Oui | NULL | Horodatage. |

### 7.9 `migrations`

| Colonne | Type MySQL | Null | Défaut | Signification |
|---|---|---|---|---|
| id | int unsigned | Non | auto | **PK**. |
| migration | varchar(255) | Non | — | Nom du fichier de migration exécuté. |
| batch | int | Non | — | Numéro de lot d'exécution. |

---

## 8. Données sensibles

| Table.colonne | Nature | Protection |
|---|---|---|
| `users.password` | Secret d'authentification | **Haché** bcrypt (cast `hashed`). |
| `users.mfa_secret` | Secret TOTP | **Chiffré** (cast `encrypted`, AES-256-CBC + MAC, clé `APP_KEY`). |
| `users.remember_token`, `password_reset_tokens.token`, `personal_access_tokens.token` | Jetons | Aléatoires ; réinitialisation et API **hachés**. |
| `complaints.tracking_code_hash` | Code de suivi client | **Haché** bcrypt ; code en clair jamais stocké ; vérification à temps constant (hachage factice si référence inconnue). |
| `customers.customer_number` | Numéro client bancaire | **Chiffré** (cast `encrypted`). |
| `attachments` (fichiers sur disque) | Pièces justificatives | Contenu **chiffré** ; `stored_path` aléatoire ; intégrité `sha256`. |
| `customers.full_name`, `email`, `phone`, `address` | Données personnelles d'identification | Accès restreint par rôle et périmètre ; non exportées sans permission `complaints.export`. |
| `users.name`, `email`, `phone` | Données personnelles du personnel | Accès administrateur. |
| `complaints.description`, `messages.body`, `complaint_events.description`, `import_anomalies.raw` | Texte libre pouvant contenir des données personnelles ou bancaires | Accès par rôle ; notes internes et événements `internal` jamais montrés au client. |
| `complaints.amount`, `solutions.amount` | Données financières | Accès par rôle. |
| `audit_logs.ip`, `user_agent`, `sessions.ip_address`, `user_agent` | Données de connexion | Journal en ajout seul ; accès `admin.audit`. |
| `complaints.consent_at` | Preuve de consentement | Horodatage conservé. |

Rappel : toutes les données présentes dans les environnements du projet sont fictives.

---

## 9. Énumérations (valeurs techniques et libellés FR)

Source : `backend/app/Enums/*.php` (méthode `label()`).

**`Role`** — `users.role`
`client` Client ou mandataire · `agent_accueil` Agent d'accueil · `gestionnaire` Gestionnaire · `responsable` Responsable de traitement · `qualite` Qualité et service client · `conformite` Conformité et contrôle interne · `direction` Direction · `admin` Administrateur.

**`ComplaintStatus`** — `complaints.status`, `complaint_events.from_status` / `to_status`
`brouillon` Brouillon · `recu` Reçu · `a_qualifier` À qualifier · `affecte` Affecté · `en_investigation` En investigation · `attente_information` Attente d'information · `solution_proposee` Solution proposée · `a_valider` À valider · `reponse_envoyee` Réponse envoyée · `cloture` Clôturé · `reouvert` Réouvert.
Statut présenté au client (calculé) : brouillon / recu / a_qualifier → « Reçue » ; affecte / en_investigation / solution_proposee / a_valider → « En cours d'analyse » ; attente_information → « Information demandée » ; reponse_envoyee → « Réponse envoyée » ; cloture → « Clôturée » ; reouvert → « Réouverte ».

**`Decision`** — `complaints.decision`, `solutions.decision`
`fondee` Fondée · `partiellement_fondee` Partiellement fondée · `non_fondee` Non fondée · `irrecevable_motivee` Irrecevable motivée.

**`Priority`** — `complaints.priority`
`basse` Basse · `normale` Normale · `haute` Haute · `critique` Critique.

**`RiskLevel`** — `complaints.risk_level`
`faible` Faible · `moyen` Moyen · `eleve` Élevé.

**`DeliveryStatus`** — `complaints.acknowledgment_status`, `messages.delivery_status`
`en_attente` En attente · `envoye` Envoyé · `echec` Échec d'envoi.

**`EventType`** — `complaint_events.type`
`created` Création · `acknowledged` Accusé de réception · `qualified` Qualification · `assigned` Affectation · `status_changed` Changement de statut · `message` Message · `attachment` Pièce jointe · `solution` Solution · `approval` Approbation · `response_sent` Réponse envoyée · `reopened` Réouverture · `duplicate` Doublon · `escalated` Escalade · `deadline` Échéance.

**`Visibility`** — `complaint_events.visibility`, `attachments.visibility`
`internal` Interne · `client` Client.

**`DeadlineKind`** — `deadline_rules.kind`, `complaint_deadlines.kind`
`accuse` Accusé de réception · `reponse_finale` Réponse finale · `prealerte` Pré-alerte interne · `controle` Contrôle.

**`DeadlineUnit`** — `deadline_rules.unit`, `complaint_deadlines.unit`
`calendar` Jours calendaires · `business` Jours ouvrés.

**`DeadlineStatus`** — `complaint_deadlines.status`
`en_cours` En cours · `respectee` Respectée · `depassee` Dépassée · `respectee_en_retard` Respectée en retard.

**`DeadlineFlag`** — calculé, non stocké (champ API `deadline_flag`)
`ok` Dans les délais · `a_risque` À risque · `en_retard` En retard · `clos_en_retard` Clos en retard · `sans_regle` Règle à valider.

**`RuleSourceType`** — `deadline_rules.source_type`
`juridique` Juridique · `interne` Interne · `demonstration` Démonstration.

**`RuleStatus`** — `deadline_rules.status`
`brouillon` Brouillon · `a_valider` À valider · `valide` Validée · `retire` Retirée.

**`TemplateKind`** — `response_templates.kind`
`accuse` Accusé de réception · `attente` Réponse d'attente · `reponse` Réponse · `cloture` Clôture.

**`AttachmentClassification`** — `attachments.classification`
`client` Client · `interne` Interne · `confidentiel` Confidentiel.

**`ScanStatus`** — `attachments.scan_status`
`en_attente` En attente · `sain` Sain · `rejete` Rejeté.

**`MessageKind`** — `messages.kind`
`client_message` Message client · `internal_note` Note interne.

**`MessageDirection`** — `messages.direction`
`entrant` Entrant · `sortant` Sortant.

**`TaskStatus`** — `tasks.status`
`a_faire` À faire · `en_cours` En cours · `terminee` Terminée.

**`SolutionType`** — `solutions.type`
`remboursement` Remboursement · `correction_operation` Correction d'opération · `explication_motivee` Explication motivée · `autre_mesure` Autre mesure · `non_fondement` Décision de non-fondement.

**`SolutionStatus`** — `solutions.status`
`brouillon` Brouillon · `soumise` Soumise · `approuvee_n1` Approuvée N1 · `approuvee` Approuvée · `rejetee` Rejetée.

**`ApprovalDecision`** — `approvals.decision`
`approuve` Approuvé · `rejete` Rejeté.

**`ControlResult`** — `quality_controls.result`
`conforme` Conforme · `non_conforme` Non conforme · `a_revoir` À revoir.

**`QualityActionStatus`** — `quality_actions.status`
`planifiee` Planifiée · `en_cours` En cours · `realisee` Réalisée · `verifiee` Vérifiée.

**`ExportFormat`** — `exports.format`
`csv` CSV · `xlsx` Excel (XLSX) · `pdf` PDF.

**`ImportStatus`** — `import_batches.status`
`en_cours` En cours · `termine` Terminé · `termine_avec_anomalies` Terminé avec anomalies · `echec` Échec.

**`AnomalyResolution`** — `import_anomalies.resolution_status`
`a_traiter` À traiter · `resolu` Résolu · `ignore` Ignoré.
