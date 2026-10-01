#!/bin/bash
# Deploy the battery: backend (Supabase or AWS) + frontend (Vercel), writing the
# resulting API base URL into js/deploy-config.js.
#
# Before deploying:
#   1. python prepare_battery.py --config battery_config.example.yaml
#      → note the printed TOTAL_SLOTS; it must match the slots seeded in
#        backend/supabase/migrations/*_init.sql (backend deploy checks this).
#   2. export TOTAL_SLOTS=160
#      export COMPLETION_URL='https://...'        # where participants go after submitting
#   3. Supabase only:
#      export SUPABASE_PROJECT_REF=<ref>
#      export DATA_EXPORT_TOKEN=<openssl rand -hex 32>   # keep out of git
#
# Usage:
#   bash deploy.sh supabase   # recommended
#   bash deploy.sh aws

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND="${1:?Usage: $0 supabase|aws}"
EXPERIMENT_NAME=$(basename "$SCRIPT_DIR")
: "${COMPLETION_URL:?Set COMPLETION_URL (where participants are sent after submitting)}"

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
        : "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
        bash backend/supabase/deploy.sh "$SUPABASE_PROJECT_REF"
        API_BASE="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1"
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
echo "Writing js/deploy-config.js"
cat > js/deploy-config.js <<EOF
/*
 * Deployment settings, written by deploy.sh (or edited by hand). Committed on
 * purpose: nothing here is secret — the browser has to know the API URL anyway.
 * Keys that grant data access (service role, DATA_EXPORT_TOKEN) never go here.
 *
 *   API_BASE        e.g. "https://<project-ref>.supabase.co/functions/v1"
 *   COMPLETION_URL  where to send the participant after a successful submit
 *
 * Leave API_BASE empty to run only in debug mode (no PROLIFIC_PID in the URL);
 * core.js refuses to start a real session while it is empty.
 */
window.DEPLOY_CONFIG = {
    API_BASE: "$API_BASE",
    COMPLETION_URL: "$COMPLETION_URL",
};
EOF

command -v vercel >/dev/null 2>&1 || {
    echo "Vercel CLI not found. Install: npm install -g vercel ; then re-run, or: vercel --prod"
    exit 1
}
# .vercelignore limits the upload to index.html + js/ (keeps the RAT answer key private).
FRONTEND_URL=$(vercel --prod --yes | tail -n1)

echo ""
echo "================================================"
echo "Deployed: $EXPERIMENT_NAME"
echo "  Backend:  $BACKEND"
echo "  API base: $API_BASE"
echo "  Frontend: $FRONTEND_URL"
echo ""
echo "Study URL:"
echo "  ${FRONTEND_URL}?PROLIFIC_PID=<participant id>"
echo "Commit js/deploy-config.js so the deployed settings are recorded."
echo "================================================"
