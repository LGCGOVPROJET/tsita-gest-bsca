# TSITA GEST × BSCA Bank — Base de données (MySQL)

> Données **100 % fictives**. Aucun extrait de base BSCA n'est présent ni présumé.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `01-creer-base.sql` | Création des bases `tsita_gest` / `tsita_gest_test` (utf8mb4) et des comptes applicatifs à privilèges minimaux (**mots de passe d'exemple à changer**) |
| `schema.sql` | Instantané de la structure (`mysqldump --no-data --routines --triggers`, nettoyé des `DEFINER` et compteurs) |
| `donnees-demo.sql` | Instantané des données de démonstration (après `migrate:fresh --seed`, sans sessions/cache/jobs) |
| `dictionnaire-donnees.md` | Dictionnaire : chaque table, colonne, type, nullabilité, signification métier, règles |
| `mcd.md` | Modèle conceptuel (diagramme entité-relation Mermaid `erDiagram`) |
| `generer-instantanes.sh` | Régénère `schema.sql` et `donnees-demo.sql` depuis une base locale |

## Source de vérité

Les **migrations Laravel** (`backend/database/migrations`) font foi. Les fichiers `.sql` sont des **instantanés** destinés à la revue,
à l'audit et à une restauration rapide ; ils sont régénérés par `./generer-instantanes.sh` après toute évolution du schéma.

Caractéristiques : InnoDB, `utf8mb4_unicode_ci`, dates stockées en **UTC** (session MySQL `+00:00`, conversion Africa/Brazzaville
dans l'application), clés étrangères `ON DELETE RESTRICT`, tables `audit_logs` et `complaint_events` protégées par triggers
(UPDATE/DELETE refusés), montants `DECIMAL(15,2)` nullables (absent = NULL, jamais 0) toujours accompagnés d'une devise.

## Installation

### Voie recommandée (Laravel)

```bash
mysql -uroot < base-de-donnees/01-creer-base.sql      # en local : root sans mot de passe
cd backend
cp .env.example .env && php artisan key:generate      # renseigner DB_USERNAME / DB_PASSWORD
php artisan migrate:fresh --seed                      # structure + jeu de démonstration
```

En production, exécuter les migrations avec le compte `tsita_migrate` (déverrouillé le temps du déploiement), puis faire tourner
l'application avec le compte `tsita_app` (DML uniquement). Ne jamais lancer `migrate:fresh` ni les seeders de démonstration en production.

### Voie « instantané SQL » (revue, poste sans PHP)

```bash
mysql -uroot < base-de-donnees/01-creer-base.sql
mysql -uroot tsita_gest < base-de-donnees/schema.sql
mysql -uroot tsita_gest < base-de-donnees/donnees-demo.sql
```

Limite : les colonnes chiffrées (`customers.customer_number`, `users.mfa_secret`) et les pièces jointes (fichiers chiffrés de
`backend/storage/app/private/attachments`, non inclus) dépendent de l'`APP_KEY` de l'instance d'origine. Avec une autre clé,
ces valeurs sont illisibles : utiliser la voie Laravel.

## Sauvegarde et restauration

```bash
# Sauvegarde cohérente (InnoDB) — structure, données, triggers ; UTC conservé par mysqldump
mysqldump -u<compte_sauvegarde> -p --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF --hex-blob tsita_gest | gzip > tsita_gest_$(date +%Y%m%d_%H%M).sql.gz

# Pièces jointes (contenu chiffré) et clé applicative : à sauvegarder AVEC la base
tar czf attachments_$(date +%Y%m%d_%H%M).tgz -C backend/storage/app/private attachments
# APP_KEY : conservée dans le coffre de secrets (sans elle, pièces et colonnes chiffrées sont irrécupérables)

# Restauration (sur une base vide)
mysql -uroot -e "CREATE DATABASE tsita_gest_restaure CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip < tsita_gest_AAAAMMJJ_HHMM.sql.gz | mysql -uroot tsita_gest_restaure
```

Tester la restauration régulièrement (le CDC exige des sauvegardes testées) : restaurer dans une base temporaire, comparer
`SELECT COUNT(*)` des tables principales et vérifier la présence des 4 triggers (`information_schema.TRIGGERS`).
Objectifs de rétention, RPO/RTO et hébergement : à définir avec BSCA.

## Procédure de retour arrière d'un import historique

L'import (`POST /api/v1/admin/imports`) est **idempotent** : un même fichier (empreinte SHA-256 identique) n'est jamais réimporté,
et une ligne déjà présente (`source_system`, `source_id`) est ignorée. Chaque lot est enregistré dans `import_batches`
(rapport JSON avec la liste `created_references`) et ses anomalies dans `import_anomalies`.

Un import s'exécute dans **une transaction unique** : en cas d'erreur technique globale, rien n'est écrit. Pour annuler un lot
terminé :

1. **Voie recommandée — restauration** : faire une sauvegarde juste avant chaque import de reprise (étape obligatoire du plan
   de migration, lot 4) ; en cas de rejet du lot, restaurer cette sauvegarde (voir ci-dessus).
2. **Voie ciblée (sous contrôle DBA + conformité)**, si d'autres saisies ont eu lieu depuis l'import :
   ```sql
   -- 0. Identifier le lot et les dossiers créés (aucune activité métier ne doit avoir eu lieu sur ces dossiers)
   SELECT id, filename, rows_created, JSON_LENGTH(report->'$.created_references') FROM import_batches WHERE id = :lot;
   CREATE TEMPORARY TABLE lot_ids AS
     SELECT c.id, c.customer_id FROM complaints c
     WHERE c.source_system = (SELECT source_system FROM import_batches WHERE id = :lot)
       AND JSON_CONTAINS((SELECT report->'$.created_references' FROM import_batches WHERE id = :lot), JSON_QUOTE(c.reference));
   -- 1. Vérifier l'absence d'activité postérieure (messages, solutions, pièces, enfants, doublons) — doit renvoyer 0
   SELECT COUNT(*) FROM complaint_events e JOIN lot_ids l ON l.id = e.complaint_id WHERE e.type <> 'created';
   -- 2. Les tables append-only refusent DELETE : suspension encadrée des triggers (compte tsita_migrate), tracée hors application
   DROP TRIGGER complaint_events_no_delete;
   START TRANSACTION;
     DELETE e FROM complaint_events e JOIN lot_ids l ON l.id = e.complaint_id;
     DELETE d FROM complaint_deadlines d JOIN lot_ids l ON l.id = d.complaint_id;
     DELETE c FROM complaints c JOIN lot_ids l ON l.id = c.id;
     DELETE cu FROM customers cu JOIN lot_ids l ON l.customer_id = cu.id
       WHERE NOT EXISTS (SELECT 1 FROM complaints x WHERE x.customer_id = cu.id);
     UPDATE import_anomalies SET resolution_status = 'ignore', resolved_at = UTC_TIMESTAMP() WHERE import_batch_id = :lot;
   COMMIT;
   CREATE TRIGGER complaint_events_no_delete BEFORE DELETE ON complaint_events FOR EACH ROW
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Table complaint_events en ajout seul : suppression interdite';
   -- 3. Consigner l'opération (motif, auteur, validation) dans audit_logs
   INSERT INTO audit_logs (user_id, action, auditable_type, auditable_id, reason, created_at)
     VALUES (:admin_id, 'import.rollback', 'ImportBatch', :lot, :motif, UTC_TIMESTAMP());
   ```
   Le lot `import_batches` est conservé (preuve) ; son empreinte restant enregistrée, un réimport du même fichier corrigé exige un
   fichier modifié (nouvelle empreinte). Les lignes ignorées/anomalies sont traitées via `import_anomalies.resolution_status`.

## Comptes et privilèges

`01-creer-base.sql` crée : `tsita_app` (SELECT/INSERT/UPDATE/DELETE sur `tsita_gest`, pas de DDL ; variante stricte documentée
pour limiter `audit_logs`/`complaint_events` à SELECT/INSERT), `tsita_migrate` (DDL + TRIGGER, verrouillé hors déploiement).
Les mots de passe du script sont des **exemples** : générer des secrets forts, les stocker dans un coffre et les reporter dans `.env`.
