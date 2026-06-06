#!/bin/bash
# Deploy every variant in a materialized campaign.
#
# Usage:
#   bash deploy_all.sh <campaign_root> [aws|supabase]
#
# Walks every immediate subdirectory of <campaign_root>, runs each one's
# deploy.sh, and appends (variant → frontend URL) pairs to a log file.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CAMPAIGN_ROOT="${1:?Usage: $0 <campaign_root> [aws|supabase]}"
BACKEND="${2:-aws}"

LOG="$SCRIPT_DIR/deploy_results.txt"
{
    echo "Campaign deploy — $(date -u +%FT%TZ)"
    echo "Root:    $CAMPAIGN_ROOT"
    echo "Backend: $BACKEND"
    echo "================================================"
} > "$LOG"

count=0
for variant_dir in "$CAMPAIGN_ROOT"/*/; do
    [ -d "$variant_dir" ] || continue
    name=$(basename "$variant_dir")
    echo ""
    echo "─── deploying $name ───"
    (cd "$variant_dir" && bash deploy.sh "$BACKEND") | tee -a "$LOG"
    count=$((count + 1))
done

echo "" | tee -a "$LOG"
echo "Deployed $count variants. Log: $LOG"
