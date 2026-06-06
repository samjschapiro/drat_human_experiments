#!/bin/bash
# Deploy the Supabase backend for this experiment instance.
#
# Prerequisites:
#   - npx supabase  (CLI)
#   - SUPABASE_PROJECT_REF in env, OR pass as $1
#
# What this does:
#   1. Pushes schema.sql to the linked project's database (idempotent).
#   2. Deploys the three Edge Functions (get-slot, submit-data, get-data).
#   3. Prints the function URLs to paste into experiment.js.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROJECT_REF="${1:-$SUPABASE_PROJECT_REF}"
if [ -z "$PROJECT_REF" ]; then
    echo "Usage: $0 <project-ref>"
    echo "    or set SUPABASE_PROJECT_REF in env"
    exit 1
fi

command -v npx >/dev/null 2>&1 || { echo "npx required (Node.js)"; exit 1; }

# Link project (no-op if already linked)
npx supabase link --project-ref "$PROJECT_REF"

# Apply schema
echo ""
echo "Applying schema.sql ..."
npx supabase db push --include-all

# Deploy edge functions
for fn in get-slot submit-data get-data; do
    echo ""
    echo "Deploying function: $fn"
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

# Print URLs
BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
echo ""
echo "========================================"
echo "Edge function URLs:"
echo "  GET  $BASE/get-slot?PROLIFIC_PID=..."
echo "  POST $BASE/submit-data"
echo "  GET  $BASE/get-data"
echo ""
echo "Paste the base URL into js/experiment.js as API_BASE:"
echo "  $BASE"
echo "========================================"
