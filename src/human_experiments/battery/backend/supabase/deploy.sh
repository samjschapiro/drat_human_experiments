#!/bin/bash
# Deploy the Supabase backend: apply migrations, set function secrets, deploy
# the Edge Functions. Normally called by ../../deploy.sh dev|prod.
#
# Required env:
#   SUPABASE_PROJECT_REF   project ref (the <ref> in https://<ref>.supabase.co);
#                          may instead be passed as $1
#   SUPABASE_ACCESS_TOKEN  personal access token (or `npx supabase login` once)
#   SUPABASE_DB_PASSWORD   that project's database password
#   DATA_EXPORT_TOKEN      researcher token for get-data and admin
#
# Requires functions/_shared/study_manifest.json (prepare_backend_manifest.py).
# The Supabase CLI's project root is battery/backend/, so everything runs there.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

PROJECT_REF="${1:-${SUPABASE_PROJECT_REF:-}}"
: "${PROJECT_REF:?Usage: $0 <project-ref>  (or set SUPABASE_PROJECT_REF)}"
: "${DATA_EXPORT_TOKEN:?Set DATA_EXPORT_TOKEN (generate with: openssl rand -hex 32)}"
command -v npx >/dev/null 2>&1 || { echo "npx required (Node.js)"; exit 1; }

MANIFEST=supabase/functions/_shared/study_manifest.json
[ -f "$MANIFEST" ] || { echo "ERROR: $MANIFEST missing; run prepare_backend_manifest.py"; exit 1; }

# Every DRAT assignment needs a slot row, and no slot may exist without one.
# Slots are seeded by generate_series(a, b) across the migrations; the highest
# bound + 1 must equal the manifest's slot count.
N_SLOTS=$(grep -Eo '"n_slots":[0-9]+' "$MANIFEST" | grep -Eo '[0-9]+$')
SEEDED_MAX=$(grep -ho 'generate_series([0-9]*, *[0-9]*)' supabase/migrations/*.sql \
    | grep -Eo '[0-9]+\)$' | tr -d ')' | sort -n | tail -n1)
if [ "$((SEEDED_MAX + 1))" != "$N_SLOTS" ]; then
    echo "ERROR: manifest has $N_SLOTS assignments but migrations seed slots 0..$SEEDED_MAX."
    echo "Add a migration that seeds the missing slots (never edit an applied migration)."
    exit 1
fi

npx supabase link --project-ref "$PROJECT_REF"

echo ""
echo "Applying migrations ..."
npx supabase db push

echo ""
echo "Setting function secrets ..."
npx supabase secrets set --project-ref "$PROJECT_REF" "DATA_EXPORT_TOKEN=$DATA_EXPORT_TOKEN"

for fn in start-session save-block finish-session get-data admin; do
    echo ""
    echo "Deploying function: $fn"
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
echo ""
echo "========================================"
echo "Edge functions deployed at: $BASE"
echo "  POST $BASE/start-session"
echo "  POST $BASE/save-block      (Bearer session token)"
echo "  POST $BASE/finish-session  (Bearer session token)"
echo "  GET  $BASE/get-data        (Bearer \$DATA_EXPORT_TOKEN)"
echo "  POST $BASE/admin           (Bearer \$DATA_EXPORT_TOKEN)"
echo "========================================"
