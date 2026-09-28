# TSITA GEST × BSCA Bank — Plateforme de gestion des réclamations

Refonte de TSITA GEST aux couleurs de BSCA Bank (Banque Sino-Congolaise pour l'Afrique), conforme au
cahier des charges V4 et à la maquette interactive BSCA V1.

| Dossier | Contenu |
|---|---|
| [`frontend/`](frontend/) | React 19 + TypeScript + Vite — espace collaborateur et portail client |
| [`backend/`](backend/) | Laravel + Sanctum — API JSON `/api/v1`, moteur de délais, KPI, audit |
| [`base-de-donnees/`](base-de-donnees/) | Schéma MySQL, données fictives, dictionnaire, MCD |
| [`guide-interactif/`](guide-interactif/) | Guide utilisateur interactif (ouvrir `index.html`) |
| [`docs/`](docs/) | Contrat d'architecture, charte de design, sécurité, cahier des charges, maquette |
| [`assets/logos/`](assets/logos/) | Logos BSCA transmis |

## Démarrage rapide

Prérequis : PHP 8.3+, Composer, Node 20+, MySQL 8+.

```bash
# 1. Base de données
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS tsita_gest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 2. Back-end (terminal 1)
cd backend
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed
php artisan serve --port=8010

# 3. Front-end (terminal 2)
cd frontend
npm install
npm run dev          # http://localhost:5180
```

Comptes de démonstration (données 100 % fictives) — mot de passe `Bsca@Demo2026!` :
`admin@`, `accueil@`, `gestionnaire@`, `responsable@`, `qualite@`, `conformite@`, `direction@`, `client@` + `bsca.demo`.

## Navigation par profil

Après connexion, chaque profil arrive sur sa page : tableau de bord métier (avec « Mon travail »), vue d'ensemble Administration pour l'administrateur, « Mes réclamations » pour le client. La barre latérale regroupe les modules par catégorie repliable — Pilotage, Traitement des réclamations, Qualité et conformité, Comptes et sécurité, Référentiels, Règles et calendrier, Données, Mon compte (détail : `docs/ARCHITECTURE.md` §10.1).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — contrat d'architecture (modèle de données, API, rôles, règles de calcul)
- [`docs/SECURITE.md`](docs/SECURITE.md) — audit de sécurité, constats, checklist de mise en production
- [`docs/CHARTE-DESIGN.md`](docs/CHARTE-DESIGN.md) — charte de design BSCA (jetons, composants, contrastes)
- [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) — API documentée (OpenAPI 3.1)
- [`backend/README.md`](backend/README.md) — services, tests, décisions métier en attente

## Tests

```bash
cd backend && php artisan test      # 123 tests (dont 50 de sécurité)
cd frontend && npm test             # 55 tests
```

## Points d'attention

- Les seuils de délai (accusé 10 jours ouvrés, réponse 45 jours calendaires) sont des **valeurs de démonstration**,
  non validées par la conformité BSCA. Ils sont signalés comme tels dans l'interface.
- Les ports 8010 (API) et 5180 (front) sont utilisés car 8000/5173 sont pris par un autre projet sur ce poste.
- Toutes les données sont fictives ; aucune connexion aux systèmes BSCA n'est présumée.
- Les couleurs de marque sont relevées visuellement sur les logos transmis et restent à confirmer par BSCA.
