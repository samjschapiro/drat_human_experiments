#!/bin/bash
# Pull all submissions for this experiment into data/ and flatten to CSV.
#
# Usage:
#   bash get_data.sh aws       # uses AWS get-data endpoint
#   bash get_data.sh supabase  # uses Supabase get-data endpoint;
#                              # needs SUPABASE_PROJECT_REF and DATA_EXPORT_TOKEN

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND="${1:?Usage: $0 supabase|aws}"
EXPERIMENT_NAME=$(basename "$SCRIPT_DIR")
OUTPUT_DIR="$SCRIPT_DIR/data"
mkdir -p "$OUTPUT_DIR"

case "$BACKEND" in
    aws)
        STACK_NAME="${EXPERIMENT_NAME//_/-}"
        DATA_URL=$(sam list stack-outputs --stack-name "$STACK_NAME" --output json \
            | jq -r '.[] | select(.OutputKey=="DataRetrievalURL") | .OutputValue')
        AUTH_HEADER=()
        ;;
    supabase)
        : "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
        : "${DATA_EXPORT_TOKEN:?Set DATA_EXPORT_TOKEN}"
        DATA_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/get-data"
        AUTH_HEADER=(-H "Authorization: Bearer ${DATA_EXPORT_TOKEN}")
        ;;
    *)
        echo "Unknown backend: $BACKEND"
        exit 1
        ;;
esac

# -f: an HTTP error (e.g. 401) fails the script instead of saving the error body.
# Each pull is also kept under a timestamped name so earlier exports are never overwritten.
STAMP=$(date +%Y%m%d_%H%M%S)
curl -fsS ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} "$DATA_URL" -o "$OUTPUT_DIR/${EXPERIMENT_NAME}_raw_${STAMP}.json"
cp "$OUTPUT_DIR/${EXPERIMENT_NAME}_raw_${STAMP}.json" "$OUTPUT_DIR/${EXPERIMENT_NAME}_raw.json"
echo "Raw data → $OUTPUT_DIR/${EXPERIMENT_NAME}_raw_${STAMP}.json (copied to ${EXPERIMENT_NAME}_raw.json)"

python3 - <<EOF
import json, pandas as pd
from pathlib import Path

out = Path("$OUTPUT_DIR")
name = "$EXPERIMENT_NAME"
with open(out / f"{name}_raw.json") as f:
    data = json.load(f)

print(f"  participants:    {data.get('participants', '?')}")
print(f"  total_responses: {data.get('total_responses', '?')}")

rows = data.get("csv_data", [])
if rows:
    df = pd.DataFrame(rows)
    df.to_csv(out / f"{name}.csv", index=False)
    print(f"  → {out}/{name}.csv  ({len(df)} rows)")
else:
    print("  no submissions yet")
EOF
