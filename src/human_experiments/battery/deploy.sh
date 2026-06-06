#!/bin/bash
# Deploy the battery: backend (AWS or Supabase) + frontend (Vercel) +
# sed-substitute API_BASE / COMPLETION_URL into js/core.js.
#
# Before deploying:
#   1. python prepare_battery.py --config battery_config.example.yaml
#      → note the printed TOTAL_SLOTS, set it in backend/supabase/schema.sql
#        (generate_series upper bound = TOTAL_SLOTS - 1) and export it below.
#   2. export COMPLETION_URL='https://app.prolific.com/submissions/complete?cc=XXXX'
#   3. export TOTAL_SLOTS=160   # must match schema + bundle
#
# Usage:
#   bash deploy.sh supabase   # uses backend/supabase (recommended)
#   bash deploy.sh aws        # uses backend/aws

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND="${1:-supabase}"
EXPERIMENT_NAME=$(basename "$SCRIPT_DIR")
COMPLETION_URL="${COMPLETION_URL:-https://app.prolific.com/submissions/complete}"

if [ ! -f js/battery-data.js ]; then
    echo "ERROR: js/battery-data.js missing. Run prepare_battery.py first."
    exit 1
fi

case "$BACKEND" in
    aws)
        command -v sam >/dev/null 2>&1 || { echo "SAM CLI required"; exit 1; }
        command -v jq  >/dev/null 2>&1 || { echo "jq required"; exit 1; }
        cd backend/aws
        STACK_NAME="${EXPERIMENT_NAME//_/-}"
        for d in lambda/*/; do
            [ -f "$d/package.json" ] && (cd "$d" && npm install --silent)
        done
        sam build
        sam deploy --stack-name "$STACK_NAME" \
            --parameter-overrides "ExperimentName=$EXPERIMENT_NAME" --no-confirm-changeset
        API_BASE=$(sam list stack-outputs --stack-name "$STACK_NAME" --output json \
            | jq -r '.[] | select(.OutputKey=="APIGatewayURL") | .OutputValue')
        cd "$SCRIPT_DIR"
        ;;
    supabase)
        echo "Reminder: set the get-slot TOTAL_SLOTS secret to match your bundle:"
        echo "  npx supabase secrets set TOTAL_SLOTS=${TOTAL_SLOTS:-160}"
        bash backend/supabase/deploy.sh
        echo ""
        read -p "Paste the Supabase functions base URL (https://<ref>.supabase.co/functions/v1): " API_BASE
        ;;
    *)
        echo "Unknown backend: $BACKEND. Use 'aws' or 'supabase'."
        exit 1
        ;;
esac

if [ -z "$API_BASE" ]; then
    echo "ERROR: could not resolve API_BASE"
    exit 1
fi

echo ""
echo "Patching js/core.js (API_BASE, COMPLETION_URL)"
sed -i.bak \
    -e "s|const API_BASE = '__API_BASE__';|const API_BASE = '$API_BASE';|" \
    -e "s|const COMPLETION_URL = '__COMPLETION_URL__';|const COMPLETION_URL = '$COMPLETION_URL';|" \
    js/core.js
rm -f js/core.js.bak

if ! command -v vercel >/dev/null 2>&1; then
    echo "Vercel CLI not found. Install: npm install -g vercel ; then: vercel --prod"
    exit 0
fi
FRONTEND_URL=$(vercel --prod --yes 2>/dev/null | tail -n1)

echo ""
echo "================================================"
echo "Deployed: $EXPERIMENT_NAME"
echo "  Backend:  $BACKEND"
echo "  API base: $API_BASE"
echo "  Frontend: $FRONTEND_URL"
echo ""
echo "Study URL for Prolific:"
echo "  ${FRONTEND_URL}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}"
echo "================================================"
