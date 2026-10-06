#!/bin/bash
# Researcher admin actions. Authenticates with the environment's researcher key
# (DATA_EXPORT_TOKEN in the gitignored .env.<env> at the repo root); there are
# no researcher accounts.
#
#   bash admin.sh dev status                      # every code: session 1/2 progress
#   bash admin.sh dev status DRAT-042             # one code
#   bash admin.sh dev add-codes codes.txt         # one code per line (first CSV column ok)
#   bash admin.sh dev generate 20 DRAT            # create 20 random DRAT-XXXXXX codes
#   bash admin.sh dev reset DRAT-042 1 "station crashed at RAT"
#
# Codes only: never put names or emails in a codes file.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ENV_NAME="${1:-}"
ACTION="${2:-}"
case "$ENV_NAME" in dev|prod) ;; *) sed -n '2,13p' "$0"; exit 1 ;; esac

ENV_FILE="$REPO_ROOT/.env.$ENV_NAME"
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found (see .env.example)"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${SUPABASE_PROJECT_REF:?missing in .env.$ENV_NAME}"
: "${DATA_EXPORT_TOKEN:?missing in .env.$ENV_NAME}"
API="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1"

admin_post() {
    curl -sS -X POST "$API/admin" -H "Authorization: Bearer $DATA_EXPORT_TOKEN" \
        -H "Content-Type: application/json" -d "$1"
    echo
}

case "$ACTION" in
    status)
        STATUS_PY=$(cat <<'EOF'
import json, sys
only = sys.argv[1].upper() if len(sys.argv) > 1 and sys.argv[1] else None
expected = {1: 35, 2: 22}
rows = []
for s in json.load(sys.stdin)["sessions"]:
    if only and s["study_code"] != only:
        continue
    state = "RESET" if s["reset_at"] else ("complete" if s["complete"] else "in progress")
    tasks = f"{len(s['events'])}/{expected[s['session_number']]}"
    when = (s["completed_at"] or s["updated_at"])[:19].replace("T", " ")
    rows.append((s["study_code"], s["session_number"], s["slot"], tasks, state, when))
print(f"{'code':<16} {'sess':>4} {'slot':>4} {'tasks':>6}  {'state':<12} last activity (UTC)")
for r in sorted(rows):
    print(f"{r[0]:<16} {r[1]:>4} {r[2]:>4} {r[3]:>6}  {r[4]:<12} {r[5]}")
print(f"({len(rows)} sessions)")
EOF
)
        curl -fsS "$API/get-data" -H "Authorization: Bearer $DATA_EXPORT_TOKEN" \
            | python3 -c "$STATUS_PY" "${3:-}"
        ;;
    add-codes)
        FILE="${3:?Usage: admin.sh $ENV_NAME add-codes <file>}"
        BODY=$(python3 - "$FILE" <<'EOF'
import csv, json, sys
codes = [row[0].strip() for row in csv.reader(open(sys.argv[1])) if row and row[0].strip()]
if codes and codes[0].lower() in ("code", "study_code"):
    codes = codes[1:]
print(json.dumps({"action": "add_codes", "codes": codes}))
EOF
)
        admin_post "$BODY"
        ;;
    generate)
        COUNT="${3:?Usage: admin.sh $ENV_NAME generate <count> <prefix>}"
        PREFIX="${4:?Usage: admin.sh $ENV_NAME generate <count> <prefix>}"
        OUT="$SCRIPT_DIR/data/$ENV_NAME/generated_codes_$(date +%Y%m%d_%H%M%S).txt"
        mkdir -p "$(dirname "$OUT")"
        admin_post "{\"action\":\"generate_codes\",\"count\":$COUNT,\"prefix\":\"$PREFIX\"}" \
            | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\n".join(d["codes"])) if "codes" in d else sys.exit(json.dumps(d))' \
            | tee "$OUT"
        echo "Saved to $OUT"
        ;;
    reset)
        CODE="${3:?Usage: admin.sh $ENV_NAME reset <code> <session 1|2> <reason>}"
        SESSION="${4:?Usage: admin.sh $ENV_NAME reset <code> <session 1|2> <reason>}"
        REASON="${5:?Usage: admin.sh $ENV_NAME reset <code> <session 1|2> <reason>}"
        BODY=$(python3 -c 'import json,sys; print(json.dumps({"action":"reset_session","study_code":sys.argv[1],"session_number":int(sys.argv[2]),"reason":sys.argv[3]}))' \
            "$CODE" "$SESSION" "$REASON")
        admin_post "$BODY"
        ;;
    *)
        sed -n '2,13p' "$0"
        exit 1
        ;;
esac
