#!/bin/bash
# Deploy the Supabase backend: apply migrations, set function secrets, deploy
# the three Edge Functions.
#
# Required env:
#   SUPABASE_PROJECT_REF  project ref (the <ref> in https://<ref>.supabase.co);
#                         may instead be passed as $1
#   TOTAL_SLOTS           must equal the number of slots the migration seeds
#   DATA_EXPORT_TOKEN     bearer token that get-data requires; generate once with
#                         `openssl rand -hex 32` and keep it out of git
#
# Prerequisites: Node (for npx) and `npx supabase login` done once.
#
# The Supabase CLI's project root is battery/backend/ (it contains supabase/
# with config.toml, migrations/ and functions/), so everything runs from there.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

PROJECT_REF="${1:-${SUPABASE_PROJECT_REF:-}}"
: "${PROJECT_REF:?Usage: $0 <project-ref>  (or set SUPABASE_PROJECT_REF)}"
: "${TOTAL_SLOTS:?Set TOTAL_SLOTS (printed by prepare_battery.py)}"
: "${DATA_EXPORT_TOKEN:?Set DATA_EXPORT_TOKEN (generate with: openssl rand -hex 32)}"
command -v npx >/dev/null 2>&1 || { echo "npx required (Node.js)"; exit 1; }

# The migration seeds slots 0..N; TOTAL_SLOTS must be N+1 or counterbalancing
# silently breaks.
SEEDED_MAX=$(grep -o 'generate_series(0, *[0-9]*)' supabase/migrations/*_init.sql \
    | grep -o '[0-9]*)$' | tr -d ')')
if [ "$((SEEDED_MAX + 1))" != "$TOTAL_SLOTS" ]; then
    echo "ERROR: TOTAL_SLOTS=$TOTAL_SLOTS but the migration seeds $((SEEDED_MAX + 1)) slots."
    echo "Edit the generate_series bound in supabase/migrations/*_init.sql (a new migration if already applied)."
    exit 1
fi

npx supabase link --project-ref "$PROJECT_REF"

echo ""
echo "Applying migrations ..."
npx supabase db push

echo ""
echo "Setting function secrets ..."
npx supabase secrets set --project-ref "$PROJECT_REF" \
    "TOTAL_SLOTS=$TOTAL_SLOTS" "DATA_EXPORT_TOKEN=$DATA_EXPORT_TOKEN"

for fn in get-slot submit-data get-data; do
    echo ""
    echo "Deploying function: $fn"
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
echo ""
echo "========================================"
echo "Edge functions deployed at: $BASE"
echo "  GET  $BASE/get-slot?PROLIFIC_PID=..."
echo "  POST $BASE/submit-data"
echo "  GET  $BASE/get-data   (Authorization: Bearer \$DATA_EXPORT_TOKEN)"
echo "========================================"
