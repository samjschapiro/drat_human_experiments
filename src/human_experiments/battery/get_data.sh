#!/bin/bash
# Pull all submissions for this experiment into data/ and flatten to CSV.
#
# Usage:
#   bash get_data.sh aws       # uses AWS get-data endpoint
#   bash get_data.sh supabase  # uses Supabase get-data endpoint

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND="${1:-aws}"
EXPERIMENT_NAME=$(basename "$SCRIPT_DIR")
OUTPUT_DIR="$SCRIPT_DIR/data"
mkdir -p "$OUTPUT_DIR"

case "$BACKEND" in
    aws)
        STACK_NAME="${EXPERIMENT_NAME//_/-}"
        DATA_URL=$(sam list stack-outputs --stack-name "$STACK_NAME" --output json \
            | jq -r '.[] | select(.OutputKey=="DataRetrievalURL") | .OutputValue')
        ;;
    supabase)
        DATA_URL="${SUPABASE_GET_DATA_URL:?Set SUPABASE_GET_DATA_URL in env}"
        ;;
    *)
        echo "Unknown backend: $BACKEND"
        exit 1
        ;;
esac

curl -s -X GET "$DATA_URL" -o "$OUTPUT_DIR/${EXPERIMENT_NAME}_raw.json"
echo "Raw data → $OUTPUT_DIR/${EXPERIMENT_NAME}_raw.json"

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
