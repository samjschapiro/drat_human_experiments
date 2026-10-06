# Backend swap guide

The frontend doesn't care where the API lives. Pick one of the two backends below and deploy it; `../deploy.sh` writes the resulting base URL into `js/deploy-config.js` as `API_BASE`.

Both backends expose the same three endpoints:

| Endpoint        | Method | Body / Query                                | Returns                                          |
|-----------------|--------|---------------------------------------------|--------------------------------------------------|
| `/get-slot`     | GET    | `?PROLIFIC_PID=...`                         | `{ slot, total_slots, status }`                  |
| `/submit-data`  | POST   | `{ participant_id, slot, responses, ... }`  | `{ status, submission_id }`                      |
| `/get-data`     | GET    | admin; Supabase requires `Authorization: Bearer $DATA_EXPORT_TOKEN` | `{ participants, total_responses, csv_data, raw_data }` |

Switching backends is a one-line change in `js/deploy-config.js`.

---

## Option A — AWS SAM (S3 + Lambda + API Gateway)

Files: `aws/template.yaml`, `aws/samconfig.toml`, `aws/lambda/{getSlot,submit-data,get-data}/`.

**Prerequisites:** AWS account, SAM CLI (`brew install aws-sam-cli`), Node 18+.

**Deploy:**
```bash
cd aws/
# Edit samconfig.toml: replace CHANGE-ME with your experiment name
for d in lambda/*/; do (cd "$d" && npm install --silent); done
sam build
sam deploy
sam list stack-outputs --stack-name <your-stack> | grep URL
```

**Costs (rough):** ~$0 idle; ~$0.20 per 1K participants on the free tier.

---

## Option B — Supabase (Edge Functions + Postgres)

Files: `supabase/config.toml`, `supabase/migrations/*_init.sql`, `supabase/functions/{get-slot,submit-data,get-data}/`, `supabase/deploy.sh`. The Supabase CLI's project root is this `backend/` folder.

**Prerequisites:** Supabase project (free tier OK), `npx supabase login` once (no install needed).

**Deploy:** normally via `../deploy.sh dev|prod`, which loads the right env file and
calls `supabase/deploy.sh` for you. Standalone:
```bash
export SUPABASE_ACCESS_TOKEN=... SUPABASE_DB_PASSWORD=... TOTAL_SLOTS=160 DATA_EXPORT_TOKEN=...
bash supabase/deploy.sh <your-project-ref>
```

`../deploy.sh` only drives Supabase; the AWS backend (Option A) is kept for reference
and must be deployed by hand with `sam`.

**Access model:** all three functions are deployed without the gateway JWT check (`config.toml`), because participants have no Supabase session. `get-slot` / `submit-data` are intentionally public; `get-data` checks the `DATA_EXPORT_TOKEN` secret itself. Tables have RLS on with no policies, and `claim_slot()` is not executable by the `anon`/`authenticated` roles, so the publishable key can't read data or claim slots directly. No IP addresses are stored.

**Local testing:** `npx supabase start` from this folder (needs Docker) runs Postgres + the functions locally; `npx supabase functions serve --env-file <file with TOTAL_SLOTS, DATA_EXPORT_TOKEN>` serves them at `http://127.0.0.1:54321/functions/v1`.

**Costs (rough):** $0 on the free tier (500 MB Postgres + 2M edge-function invocations/month). Comfortable headroom for 720+ participants.

**Trade-offs vs AWS:**
- Atomic slot assignment is one SQL function (`claim_slot` with `FOR UPDATE SKIP LOCKED`) instead of an S3 versioned-object dance. Cleaner.
- One Postgres row per submission instead of one S3 object — easier to query/dedupe.
- Service-role key needs to be stored as a Supabase secret, not pasted into client code.
- Vendor lock-in is shallower than AWS but real.

---

## Adding a third backend

The endpoints are intentionally simple. To add e.g. Cloudflare Workers + D1, or Firebase + Firestore, or a self-hosted PocketBase:

1. Re-implement the three endpoints to match the table above.
2. Update `js/experiment.js` to point `API_BASE` at the new URL.
3. (Optional) Add a `<vendor>/deploy.sh` here so future-you can redeploy without thinking.

Slot-assignment correctness is the only non-trivial part: it needs to be **atomic** (two participants simultaneously hitting `/getSlot` must never end up with the same slot). Postgres-style `SELECT ... FOR UPDATE SKIP LOCKED` is the cleanest pattern; a Redis `INCR` works too; S3 versioned writes work but require optimistic-retry logic.
