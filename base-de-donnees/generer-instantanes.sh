#!/usr/bin/env bash
# Régénère schema.sql et donnees-demo.sql depuis la base locale (après migrate:fresh --seed).
# Usage : ./generer-instantanes.sh [base] [utilisateur]
set -euo pipefail
DB="${1:-tsita_gest}"
USER_DB="${2:-root}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mysqldump -u"$USER_DB" --no-data --routines --triggers --skip-comments --no-tablespaces --set-gtid-purged=OFF "$DB" > "$TMP/schema.sql"
python3 - "$TMP/schema.sql" "$DIR/schema.sql" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r' AUTO_INCREMENT=\d+', '', s)
s = re.sub(r'/\*!50017 DEFINER=`[^`]+`@`[^`]+`\*/ ', '', s)
s = re.sub(r'DEFINER=`[^`]+`@`[^`]+` ', '', s)
header = """-- =====================================================================
-- TSITA GEST × BSCA Bank — Schéma MySQL (instantané, structure seule)
-- Généré par : mysqldump --no-data --routines --triggers tsita_gest (nettoyé :
--   compteurs AUTO_INCREMENT et clauses DEFINER retirés).
-- Source de vérité : migrations Laravel (backend/database/migrations).
-- Ce fichier est un INSTANTANÉ destiné à la revue et à l'audit ; pour installer,
-- préférer `php artisan migrate` (voir base-de-donnees/README.md).
-- Moteur InnoDB, jeu de caractères utf8mb4 / utf8mb4_unicode_ci. Dates stockées en UTC.
-- Tables append-only : audit_logs et complaint_events (triggers *_no_update / *_no_delete).
-- =====================================================================

"""
open(sys.argv[2], 'w').write(header + s)
PY

IGNORE=""
for t in sessions cache cache_locks jobs job_batches failed_jobs personal_access_tokens password_reset_tokens; do
  IGNORE="$IGNORE --ignore-table=$DB.$t"
done
# shellcheck disable=SC2086
mysqldump -u"$USER_DB" --no-create-info --skip-triggers --skip-comments --no-tablespaces --complete-insert \
  --extended-insert --set-gtid-purged=OFF --hex-blob $IGNORE "$DB" > "$TMP/data.sql"
{
cat <<'HDR'
-- =====================================================================
-- TSITA GEST × BSCA Bank — Données de DÉMONSTRATION (100 % fictives)
-- Généré après `php artisan migrate:fresh --seed` par :
--   mysqldump --no-create-info --skip-triggers --complete-insert tsita_gest
--   (tables exclues : sessions, cache, cache_locks, jobs, job_batches,
--    failed_jobs, personal_access_tokens, password_reset_tokens)
-- AUCUNE donnée réelle BSCA. Noms, comptes et montants sont inventés.
-- Comptes démo : *@bsca.demo — mot de passe commun « Bsca@Demo2026! » (à changer hors démo).
--
-- ATTENTION :
--  * À charger APRÈS schema.sql (ou après `php artisan migrate`).
--  * Les colonnes chiffrées (customers.customer_number, users.mfa_secret) et le contenu
--    des pièces jointes (storage/app/private/attachments, non inclus) dépendent de l'APP_KEY
--    de l'instance qui a généré ce jeu. Avec une autre APP_KEY, ces valeurs sont
--    indéchiffrables : préférer `php artisan migrate:fresh --seed` (voir README.md).
--  * Les dates sont en UTC (TIME_ZONE='+00:00').
-- =====================================================================
HDR
cat "$TMP/data.sql"
} > "$DIR/donnees-demo.sql"
echo "Instantanés régénérés : $DIR/schema.sql, $DIR/donnees-demo.sql"
