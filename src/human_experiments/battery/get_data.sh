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

# Derived files (stdlib only), all from battery_raw.json:
#   battery_events.csv    one row per saved task, every session incl. reset ones
#   battery_sessions.csv  one row per session: status, slot, event count
#   battery_sessions.json active (not reset) sessions in the shape
#                         scoring/score_battery.py reads (--input this file)
python3 - "$OUTPUT_DIR" <<'EOF'
import csv, json, sys
from pathlib import Path

out = Path(sys.argv[1])
data = json.loads((out / "battery_raw.json").read_text())
sessions = data["sessions"]
print(f"  sessions: {data['n_sessions']}   events: {data['n_events']}")


def cell(value):
    return json.dumps(value) if isinstance(value, (dict, list)) else value


def write(name, rows):
    fields = []
    for row in rows:
        fields += [k for k in row if k not in fields]
    with open(out / name, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: cell(v) for k, v in row.items()})
    print(f"  → {out}/{name}  ({len(rows)} rows)")


session_cols = ["id", "study_code", "session_number", "slot", "complete", "created_at",
                "completed_at", "reset_at", "reset_reason"]
write("battery_sessions.csv",
      [{**{k: s[k] for k in session_cols}, "n_events": len(s["events"])} for s in sessions])
write("battery_events.csv",
      [{"session_record_id": s["id"], "study_code": s["study_code"],
        "session_number": s["session_number"], "slot": s["slot"], "session_reset": bool(s["reset_at"]),
        "received_at": e["received_at"], **e["payload"]}
       for s in sessions for e in s["events"]])

# Scoring input: one object per active session, responses flattened the same way
# as the frontend's local download (core.js showLocalResult).
scoring = []
for s in sessions:
    if s["reset_at"]:
        continue
    scoring.append({
        "study_code": s["study_code"], "session_number": s["session_number"],
        "session_record_id": s["id"], "slot": s["slot"], "order": s["test_order"],
        "protocol_version": s["protocol_version"], "complete": s["complete"],
        "responses": [{**e["payload"], "test": e["payload"]["test_id"],
                       "rt": e["payload"]["response_time_ms"], **e["payload"]["assignment"]}
                      for e in s["events"]],
    })
(out / "battery_sessions.json").write_text(json.dumps(scoring, indent=1))
print(f"  → {out}/battery_sessions.json  ({len(scoring)} active sessions, for scoring)")
EOF
