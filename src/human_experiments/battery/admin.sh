#!/bin/bash
# Researcher admin actions. Authenticates with the environment's researcher key
# (DATA_EXPORT_TOKEN in the gitignored .env.<env> at the repo root); there are
# no researcher accounts.
#
#   bash admin.sh dev status                      # every participant: visit 1/2 progress
#   bash admin.sh dev status abc@stonybrook.edu   # one participant (email or code)
#   bash admin.sh dev add-codes codes.txt         # one code per line (first CSV column ok)
#   bash admin.sh dev generate 20 DRAT            # create 20 random DRAT-XXXXXX codes
#   bash admin.sh dev reset abc@stonybrook.edu 1 "station crashed at RAT"
#   bash admin.sh dev group-code [NEW-CODE]       # show / set the Q-global group code
#
# The same actions are in the web panel at <site>/admin (researcher email +
# ADMIN_PASSWORD).
#
# Participants sign in with their Stony Brook email; add-codes / generate only
# create researcher test codes.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ENV_NAME="${1:-}"
ACTION="${2:-}"
case "$ENV_NAME" in dev|prod) ;; *) sed -n '2,18p' "$0"; exit 1 ;; esac

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
only = sys.argv[1].strip().lower() if len(sys.argv) > 1 and sys.argv[1] else None
expected = {1: 35, 2: 22}
data = json.load(sys.stdin)
email_of = {p["study_code"]: p["email"] for p in data.get("participants", [])}
rows = []
for s in data["sessions"]:
    email = email_of.get(s["study_code"], "")
    if only and only not in (s["study_code"].lower(), email):
        continue
    state = "RESET" if s["reset_at"] else ("complete" if s["complete"] else "in progress")
    required = [e for e in s['events'] if e['item_id'] != 'drat_practice']  # practice is optional
    tasks = f"{len(required)}/{expected[s['session_number']]}"
    when = (s["completed_at"] or s["updated_at"])[:19].replace("T", " ")
    rows.append((email, s["study_code"], s["session_number"], s["slot"], tasks, state, when))
print(f"{'email':<32} {'code':<12} {'visit':>5} {'slot':>4} {'tasks':>6}  {'state':<12} last activity (UTC)")
for r in sorted(rows):
    print(f"{r[0]:<32} {r[1]:<12} {r[2]:>5} {r[3]:>4} {r[4]:>6}  {r[5]:<12} {r[6]}")
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
        WHO="${3:?Usage: admin.sh $ENV_NAME reset <email|code> <visit 1|2> <reason>}"
        SESSION="${4:?Usage: admin.sh $ENV_NAME reset <email|code> <visit 1|2> <reason>}"
        REASON="${5:?Usage: admin.sh $ENV_NAME reset <email|code> <visit 1|2> <reason>}"
        BODY=$(python3 -c 'import json,sys; w=sys.argv[1]; print(json.dumps({"action":"reset_session",("email" if "@" in w else "study_code"):w,"session_number":int(sys.argv[2]),"reason":sys.argv[3]}))' \
            "$WHO" "$SESSION" "$REASON")
        admin_post "$BODY"
        ;;
    group-code)
        if [ -n "${3:-}" ]; then
            BODY=$(python3 -c 'import json,sys; print(json.dumps({"action":"set_group_code","code":sys.argv[1]}))' "$3")
        else
            BODY='{"action":"get_group_code"}'
        fi
        admin_post "$BODY"
        ;;
    *)
        sed -n '2,18p' "$0"
        exit 1
        ;;
esac
