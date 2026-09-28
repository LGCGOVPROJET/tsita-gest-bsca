-- =====================================================================
-- TSITA GEST × BSCA Bank — Création des bases et de l'utilisateur applicatif
-- À exécuter par un administrateur MySQL (ex. : mysql -uroot < 01-creer-base.sql).
-- EXEMPLE UNIQUEMENT : remplacez le mot de passe ci-dessous par un secret fort,
-- généré et conservé dans un coffre (jamais versionné), puis reportez-le dans .env.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `tsita_gest`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Base dédiée aux tests automatisés (php artisan test) — jamais en production.
CREATE DATABASE IF NOT EXISTS `tsita_gest_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 1) Compte d'EXPLOITATION (runtime) : droits DML minimaux, pas de DDL.
--    L'application lit/écrit ; elle ne crée ni ne supprime de table.
--    Les tables append-only (audit_logs, complaint_events) sont protégées
--    en plus par des triggers qui refusent UPDATE/DELETE.
-- ---------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'tsita_app'@'localhost'
  IDENTIFIED BY 'A_CHANGER_Mot2Passe#Fort!'
  PASSWORD EXPIRE INTERVAL 180 DAY
  FAILED_LOGIN_ATTEMPTS 10 PASSWORD_LOCK_TIME 1;

GRANT SELECT, INSERT, UPDATE, DELETE ON `tsita_gest`.* TO 'tsita_app'@'localhost';

-- Journal d'audit et chronologie : lecture + ajout uniquement.
-- (MySQL n'autorisant pas de REVOKE partiel sur un GRANT de niveau base, on
--  documente ici la variante stricte à appliquer en production : accorder les
--  droits table par table et limiter audit_logs / complaint_events à SELECT, INSERT.)
-- Exemple strict :
--   REVOKE ALL PRIVILEGES ON `tsita_gest`.* FROM 'tsita_app'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `tsita_gest`.`complaints` TO 'tsita_app'@'localhost';
--   ... (une ligne par table métier) ...
--   GRANT SELECT, INSERT ON `tsita_gest`.`audit_logs`       TO 'tsita_app'@'localhost';
--   GRANT SELECT, INSERT ON `tsita_gest`.`complaint_events` TO 'tsita_app'@'localhost';

-- ---------------------------------------------------------------------
-- 2) Compte de MIGRATION (déploiements uniquement) : DDL + création des triggers.
--    À utiliser le temps de `php artisan migrate`, puis à verrouiller.
-- ---------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'tsita_migrate'@'localhost'
  IDENTIFIED BY 'A_CHANGER_Migration#Fort!'
  ACCOUNT LOCK;

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER
  ON `tsita_gest`.* TO 'tsita_migrate'@'localhost';
-- Déverrouiller pendant une mise en production : ALTER USER 'tsita_migrate'@'localhost' ACCOUNT UNLOCK;
-- Reverrouiller ensuite :                         ALTER USER 'tsita_migrate'@'localhost' ACCOUNT LOCK;

-- ---------------------------------------------------------------------
-- 3) Compte de TEST (poste de développement uniquement).
-- ---------------------------------------------------------------------
-- CREATE USER IF NOT EXISTS 'tsita_test'@'localhost' IDENTIFIED BY 'A_CHANGER_Test#Local1';
-- GRANT ALL PRIVILEGES ON `tsita_gest_test`.* TO 'tsita_test'@'localhost';

FLUSH PRIVILEGES;
