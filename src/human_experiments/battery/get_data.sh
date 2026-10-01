#!/bin/bash
# Pull all submissions from one environment into data/<env>/ and flatten to CSV.
#
#   bash get_data.sh dev
#   bash get_data.sh prod
#
# Reads SUPABASE_PROJECT_REF and DATA_EXPORT_TOKEN from the gitignored
# .env.<env> at the repo root (see .env.example). data/ is gitignored.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$SCRIPT_DIR"

ENV_NAME="${1:-}"
case "$ENV_NAME" in
    dev|prod) ;;
    *) echo "Usage: $0 dev|prod"; exit 1 ;;
esac

ENV_FILE="$REPO_ROOT/.env.$ENV_NAME"
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found (see .env.example)"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${SUPABASE_PROJECT_REF:?missing in .env.$ENV_NAME}"
: "${DATA_EXPORT_TOKEN:?missing in .env.$ENV_NAME}"

DATA_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/get-data"
OUTPUT_DIR="$SCRIPT_DIR/data/$ENV_NAME"
mkdir -p "$OUTPUT_DIR"

# -f: an HTTP error (e.g. 401) fails the script instead of saving the error body.
# Every pull is kept under a timestamped name, so no export is ever overwritten.
STAMP=$(date +%Y%m%d_%H%M%S)
RAW="$OUTPUT_DIR/battery_raw_${STAMP}.json"
curl -fsS -H "Authorization: Bearer ${DATA_EXPORT_TOKEN}" "$DATA_URL" -o "$RAW"
cp "$RAW" "$OUTPUT_DIR/battery_raw.json"
echo "[$ENV_NAME] raw data → $RAW (copied to battery_raw.json)"

# Flatten to one row per test trial for quick inspection (stdlib only).
# Offline scoring reads the raw JSON for full fidelity.
python3 - "$OUTPUT_DIR" <<'EOF'
import csv, json, sys
from pathlib import Path

out = Path(sys.argv[1])
data = json.loads((out / "battery_raw.json").read_text())
print(f"  participants:    {data['participants']}")
print(f"  total_responses: {data['total_responses']}")

rows = data["csv_data"]
if not rows:
    print("  no submissions yet")
    sys.exit(0)
fields = []
for r in rows:
    fields += [k for k in r if k not in fields]
with open(out / "battery.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for r in rows:
        w.writerow({k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in r.items()})
print(f"  → {out}/battery.csv  ({len(rows)} rows)")
EOF
