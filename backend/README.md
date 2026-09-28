# TSITA GEST × BSCA Bank — Back-end (API Laravel)

API JSON versionnée `/api/v1` de la plateforme de gestion des réclamations TSITA GEST, adaptée à BSCA Bank.
Contrat obligatoire : [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md). Documentation OpenAPI 3.1 : [`docs/openapi.yaml`](docs/openapi.yaml).

> **Données 100 % fictives.** Aucun chiffre, nom ou dossier BSCA réel. Les règles de délai seedées sont des
> règles de **démonstration** (`source_type=demonstration`, `status=a_valider`) : elles ne constituent pas un engagement BSCA.

## Pile

| Élément | Version |
|---|---|
| PHP | 8.3+ (testé en 8.5) — `declare(strict_types=1)` partout |
| Laravel | 13 (Sanctum 4, mode SPA par cookie) |
| MySQL | 8+ (testé en 26.7), InnoDB, utf8mb4 |
| Paquets | `pragmarx/google2fa` (TOTP RFC 6238), `openspout/openspout` (XLSX), `barryvdh/laravel-dompdf` (PDF) |

## Installation

```bash
cd backend
composer install
cp .env.example .env && php artisan key:generate
# Bases (utilisateur root local sans mot de passe en développement) :
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS tsita_gest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
                 CREATE DATABASE IF NOT EXISTS tsita_gest_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php artisan migrate:fresh --seed        # schéma + jeu de démonstration (~30 s)
php artisan serve --host=127.0.0.1 --port=8010
```

Le front-end (Vite, `http://localhost:5180`) proxifie `/api` et `/sanctum` vers `http://127.0.0.1:8010` : front et API sont
donc de même origine en développement. Variables clés (`.env`) :

| Variable | Valeur de développement | Rôle |
|---|---|---|
| `APP_TIMEZONE` | `UTC` | Stockage en UTC |
| `APP_BUSINESS_TIMEZONE` | `Africa/Brazzaville` | Calcul des échéances, affichage (+01:00) |
| `APP_DEMO_MODE` | `true` | Applique les règles de démonstration non validées (bandeau côté front) |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost:5180,127.0.0.1:5180` | Domaines SPA « stateful » |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5180,http://127.0.0.1:5180` | CORS restreint (avec `supports_credentials`) |
| `FRONTEND_URL` | `http://localhost:5180` | Liens de réinitialisation de mot de passe |
| `SESSION_DRIVER` / `SESSION_LIFETIME` | `database` / `30` | Session serveur, expiration 30 min d'inactivité, chiffrée |

## Commandes utiles

```bash
php artisan test                         # 72 tests (base tsita_gest_test, RefreshDatabase)
php artisan migrate:fresh --seed         # réinitialise la démo
php artisan route:list --path=api        # 66 routes
php artisan tsita:refresh-deadlines      # passe au statut « dépassée » les échéances échues (planifiée toutes les heures)
vendor/bin/pint                          # style de code
```

## Comptes de démonstration

Mot de passe commun : **`Bsca@Demo2026!`** (à changer hors démonstration). MFA désactivée par défaut (activable via `/auth/mfa/setup`).

| Email | Rôle | Périmètre |
|---|---|---|
| `admin@bsca.demo` | admin | Référentiels, comptes, règles, imports, journaux — aucun dossier |
| `accueil@bsca.demo` | agent_accueil | Agence Brazzaville Centre + dossiers qu'il a créés |
| `gestionnaire@bsca.demo` | gestionnaire | Entité Cartes et paiements + dossiers dont il est propriétaire/suppléant |
| `responsable@bsca.demo` | responsable | Entité Cartes et paiements (affectation, approbation N1) |
| `qualite@bsca.demo` | qualite | Tous les dossiers (lecture), contrôles et plan d'actions |
| `conformite@bsca.demo` | conformite | Tous les dossiers (lecture), approbation N2, validation des règles et rapports, audit |
| `direction@bsca.demo` | direction | Agrégats ; noms clients masqués, aucune pièce ni échange |
| `client@bsca.demo` | client | Ses propres dossiers (espace client) |

Comptes supplémentaires (fictifs) : `g.cartes2@`, `g.comptes1@`, `g.comptes2@`, `g.virements1@`, `g.virements2@`, `g.digital1@`,
`g.credits1@` (gestionnaires), `r.comptes@`, `r.virements@`, `r.digital@`, `r.credits@` (responsables), `a.potopoto@`, `a.pnrcentre@`,
`a.lumumba@`, `a.dolisie@`, `a.oyo@` (agents d'accueil) — tous `@bsca.demo`, même mot de passe.

**Dossier de démonstration** : `TG-BSCA-2026-000018` « Paiement par carte contesté », reçu le 12/09/2026 via le portail,
statut `en_investigation`, signal **À risque** (accusé de réception préparé mais non envoyé, échéance d'accusé le 28/09/2026).
Code de suivi public : **`K7M4P9QX`** (`POST /api/v1/public/track`). Il appartient au client `client@bsca.demo`.

Jeu généré (graine fixe, « aujourd'hui » = 28/09/2026) : ~246 réclamations sur 12 mois (dont 7 reprises d'un lot d'import historique),
accusés dont échecs d'envoi, affectations, échanges et notes internes, solutions versionnées et approbations N1/N2, décisions,
retards ouverts et clos, 8 réouvertures (dossiers enfants), 6 doublons, montants absents (NULL) et 4 hors norme, 7 actions qualité,
28 contrôles qualité, un lot d'import avec 7 anomalies. Fichier de test d'import **non importé** :
`storage/app/demo/registre-historique-exemple.csv` (8 lignes dont anomalies).

## Parcours de vérification (curl)

```bash
B=http://127.0.0.1:8010; H=(-H "Origin: http://localhost:5180" -H "Referer: http://localhost:5180/" -H "Accept: application/json")
curl -s -c j -b j "${H[@]}" $B/sanctum/csrf-cookie
X=$(python3 -c "import urllib.parse;print(urllib.parse.unquote([l.split('\t')[6].strip() for l in open('j') if 'XSRF-TOKEN' in l][0]))")
curl -s -c j -b j "${H[@]}" -H "X-XSRF-TOKEN: $X" -H "Content-Type: application/json" \
     -d '{"email":"gestionnaire@bsca.demo","password":"Bsca@Demo2026!"}' $B/api/v1/auth/login
curl -s -b j "${H[@]}" $B/api/v1/auth/me
curl -s -b j "${H[@]}" "$B/api/v1/dashboard"
curl -s -b j "${H[@]}" "$B/api/v1/complaints?per_page=5&sort=-received_at"
```

## Architecture

```
app/
├── Enums/                 Énumérations PHP 8 (backed) avec label() FR ; Role::permissions() = matrice des droits
├── Models/                Eloquent + casts (décimaux, encrypted : users.mfa_secret, customers.customer_number)
│                          Complaint::scopeVisibleTo(User) = périmètres §4 ; ComplaintEvent/AuditLog append-only
├── Policies/              Complaint, Attachment, Solution, Task, QualityAction, DeadlineRule, User
├── Services/
│   ├── ReferenceGenerator     TG-BSCA-AAAA-NNNNNN, séquence annuelle verrouillée (SELECT … FOR UPDATE)
│   ├── TrackingCodeService    code 8 car. non ambigus, stocké haché (bcrypt), comparaison à temps homogène
│   ├── DeadlineCalculator     §7 : jours ouvrés/calendaires, fériés CG versionnés, Africa/Brazzaville, pas de suspension
│   ├── ComplaintWorkflow      transitions §6 motivées, affectation, qualification, accusé, échanges, réponse,
│   │                          réouverture (dossier enfant), doublon (sans suppression), contrôle qualité
│   ├── ComplaintIntakeService dépôt portail et saisie omnicanale
│   ├── SolutionService        versions, soumission, approbation N1 / N2 (seuil settings.n2_threshold)
│   ├── KpiService             §8 : définitions uniques, mêmes filtres partout
│   ├── ReportService          rapport d'activité + réconciliation de stock (balanced)
│   ├── ClientViewPresenter    vue client filtrée (§9.2)
│   ├── ExportService          CSV (BOM, « ; »), XLSX (OpenSpout), PDF (dompdf) avec en-tête ; journal `exports`
│   ├── AttachmentService      disque privé, contenu chiffré, nom aléatoire, MIME réel, SHA-256, contrôle FileScanner
│   ├── AuditLogger            avant/après, motif, IP, user agent (append-only)
│   ├── TotpService            RFC 6238 via pragmarx/google2fa
│   └── LegacyImportService    CSV idempotent (sha256 fichier + unique(source_system, source_id)), anomalies
├── Http/Controllers/Api/  contrôleurs minces (validation FormRequest → service → Resource)
├── Http/Requests/         validation stricte, messages FR (lang/fr)
├── Http/Resources/        formes JSON du contrat (ComplaintListItem, ComplaintDetail, …)
├── Http/Middleware/       SecurityHeaders (CSP stricte, nosniff, DENY, Referrer-Policy, HSTS en prod), EnsureActiveStaff
└── Support/               Dt (fuseaux), ComplaintFilters (filtres §8), Paginated ({data, meta}), Money
```

### Sécurité intégrée

- Sanctum SPA (cookie httpOnly, `SameSite=Lax`, CSRF `X-XSRF-TOKEN`), session régénérée à la connexion, expiration 30 min.
- Connexion : 5 tentatives/min (email+IP) → 429 ; verrouillage 15 min après 10 échecs ; message neutre ; MFA TOTP si activée.
- Mot de passe : 12 caractères, majuscule, minuscule, chiffre, symbole. Mot de passe oublié : réponse toujours identique.
- Contrôle d'accès **côté serveur** : Gates par permission + Policies + scope `visibleTo`. Admin sans accès aux dossiers ; direction sans données nominatives.
- Pièces : `storage/app/private/attachments`, contenu chiffré (`Crypt::encryptString`), nom aléatoire, MIME réel (finfo) + signature binaire,
  rejet des PDF à contenu actif, ≤ 10 Mo, ≤ 5 fichiers, empreinte SHA-256 vérifiée au téléchargement, téléchargement journalisé.
- Code de suivi haché ; mauvais code et référence inconnue → même 404 neutre ; portail limité à 10 requêtes/min/IP.
- Tri sur liste blanche, recherche échappée, `$fillable` explicites, `preventSilentlyDiscardingAttributes` hors production.
- Journalisation : consultation de dossier, téléchargement, export, recherche client, connexions, toutes les actions métier.
- Tables `audit_logs` et `complaint_events` en ajout seul : garde Eloquent + triggers MySQL refusant UPDATE/DELETE.
- Exports : neutralisation des formules (injection CSV/Excel).

## Tests

`php artisan test` → **72 tests, 412 assertions** (base `tsita_gest_test`). Couverture principale :
DeadlineCalculator (cas de contrôle du guide, fin de mois, férié, week-end, même jour, fin d'année, pré-alerte, pas de suspension,
réouverture, règle non validée sans mode démo, cohérence SQL/PHP des signaux) ; KPI (reçues ≠ réponses en fin de période, stock à deux dates,
réconciliation équilibrée, taux avec numérateur/dénominateur, doublons exclus, filtres identiques liste/tableau de bord) ; périmètres par rôle ;
portail client (aucune note ni pièce interne, 404 neutre, throttle) ; transitions interdites ; réouverture ; doublon sans suppression ;
import idempotent ; connexion (throttle, verrouillage, MFA, message neutre) ; montant NULL ≠ 0 ; en-têtes de sécurité ; exports journalisés ;
espace client connecté ; recherche client ; validation de rapport.

## Décisions métier en attente (à valider par BSCA)

1. **Règles de délai** : durées (AR 10 jours ouvrés, réponse 45 jours calendaires, pré-alerte 5 jours ouvrés) purement illustratives ;
   la conformité doit confirmer les textes applicables, puis valider les règles (`POST /admin/deadline-rules/{id}/validate`) et passer `APP_DEMO_MODE=false`.
2. **Échéance calendaire tombant un jour chômé** : aucun report actuellement (ex. 23/12/2026 + 45 j = samedi 06/02/2027).
3. **Réception un jour non ouvré** (règles ouvrées) : dossier réputé reçu le prochain jour ouvré, décompte le lendemain — convention à confirmer.
4. **Signal « à risque »** : pré-alerte atteinte ou accusé non envoyé arrivant à échéance le jour même — définition à confirmer.
5. **Seuil d'approbation N2** (500 000, tous montants confondus sans conversion de devise) et **seuil « hors norme »** (50 000 000) : à fixer.
6. **Ajustements de stock** : `adjustments = 0` faute de procédure validée ; les écarts éventuels rendent `balanced=false` au lieu d'être compensés.
   Les « réponses non ventilées » (répondues sans agence/entité) apparaissent sous « Non renseigné » dans les ventilations.
7. **Doublons** : exclus de tous les indicateurs (références uniques) ; statut du doublon laissé inchangé — faut-il le clôturer ?
8. **Réouverture** : le dossier parent garde son statut ; délai maximal de contestation et règle de médiation non définis.
9. **MFA obligatoire** pour conformité/admin/responsable/direction : exigée si activée ; l'activation forcée reste à décider.
10. **Antivirus** : `FileScanner` ne fait qu'un contrôle de signature et de contenu actif PDF ; intégration d'un moteur (ClamAV/ICAP) à décider.
11. **Dossiers repris** (import) : pas de code de suivi client ; processus d'émission d'un code à définir. Correspondance des statuts source (`LegacyImportService::STATUS_MAP`) à valider sur les extractions réelles.
12. **Rétention, sauvegarde, hébergement, notifications courriel/SMS réelles** : hors périmètre démo (les messages sont enregistrés, pas envoyés).

## Limites connues

- Pas d'envoi réel de courriels/SMS (accusés et réponses sont tracés comme messages) ; pas de file d'attente asynchrone pour les exports volumineux (limite 10 000 lignes).
- Le PDF d'export embarque la police DejaVu (fichier ~0,9 Mo).
- Le jeu de démonstration stocke les codes de suivi avec un coût bcrypt réduit (10) pour accélérer le seed ; l'application utilise le coût par défaut.
- Les pièces seedées et les colonnes chiffrées dépendent de l'`APP_KEY` : après changement de clé, relancer `migrate:fresh --seed`.
