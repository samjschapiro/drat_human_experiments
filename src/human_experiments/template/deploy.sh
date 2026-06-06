#!/bin/bash
# Per-experiment deploy: backend (AWS or Supabase) + frontend (Vercel) +
# sed-substitute the API base URL into js/experiment.js.
#
# Usage:
#   bash deploy.sh aws       # uses backend/aws (default if omitted)
#   bash deploy.sh supabase  # uses backend/supabase

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND="${1:-aws}"
EXPERIMENT_NAME=$(basename "$SCRIPT_DIR")

case "$BACKEND" in
    aws)
        command -v sam >/dev/null 2>&1 || { echo "SAM CLI required (brew install aws-sam-cli)"; exit 1; }
        command -v jq  >/dev/null 2>&1 || { echo "jq required (brew install jq)"; exit 1; }
        cd backend/aws
        STACK_NAME="${EXPERIMENT_NAME//_/-}"

        for d in lambda/*/; do
            [ -f "$d/package.json" ] && (cd "$d" && npm install --silent)
        done
        sam build
        sam deploy --stack-name "$STACK_NAME" --parameter-overrides "ExperimentName=$EXPERIMENT_NAME" --no-confirm-changeset
        API_BASE=$(sam list stack-outputs --stack-name "$STACK_NAME" --output json \
            | jq -r '.[] | select(.OutputKey=="APIGatewayURL") | .OutputValue')
        cd "$SCRIPT_DIR"
        ;;
    supabase)
        bash backend/supabase/deploy.sh
        echo ""
        read -p "Paste the Supabase functions base URL (https://<ref>.supabase.co/functions/v1): " API_BASE
        ;;
    *)
        echo "Unknown backend: $BACKEND. Use 'aws' or 'supabase'."
        exit 1
        ;;
esac

# Patch experiment.js with the API base URL
if [ -z "$API_BASE" ]; then
    echo "ERROR: could not resolve API_BASE"
    exit 1
fi
echo ""
echo "Patching js/experiment.js with API_BASE=$API_BASE"
sed -i.bak "s|const API_BASE = '__API_BASE__';|const API_BASE = '$API_BASE';|" js/experiment.js
rm -f js/experiment.js.bak

# Frontend
if ! command -v vercel >/dev/null 2>&1; then
    echo "Vercel CLI not found. Install: npm install -g vercel"
    echo "Then run: vercel --prod"
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
echo "Next: configure crowd platform with study URL:"
echo "  ${FRONTEND_URL}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}"
echo "================================================"
