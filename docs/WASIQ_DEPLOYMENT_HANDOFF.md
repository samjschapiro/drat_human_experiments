# Deployment handoff for Wasiq

Updated: October 2, 2026

## Purpose

This document contains the deployment work needed to move the completed local
two-session study flow onto the existing Supabase + Vercel infrastructure.
It is written for Wasiq, who owns deployment and backend integration.

The current branch is **not safe to deploy unchanged**. The participant flow is
implemented and locally verified, but production mode is deliberately locked until
the incremental-save backend, server-side session gate, and study-team decisions
listed below are complete.

## Code to integrate

| Item | Value |
|---|---|
| Repository | `https://github.com/samjschapiro/drat_human_experiments` |
| Review branch | `prit/drat-study-flow` |
| Branch URL | `https://github.com/samjschapiro/drat_human_experiments/tree/prit/drat-study-flow` |
| Deployment base | `a17ad14` (`origin/deploy-fixes`) |
| Study-flow commit | `95c6119` — local two-session flow |
| Completion commit | `c9ace09` — Session 2 gate and scoring pipeline |
| Upstream main | `9f1f4fa` (`origin/main`) |

The review branch is separate from `main`. Nothing from it has been merged or
deployed, and production remains deliberately locked.

## What is already working

- Vercel/Supabase dev/prod deployment scripts from the deployment branch.
- A local Session 1 flow: counterbalanced DAT, RAT, and Raven handoff, followed by
  BFI-10, an instructed-response check, and optional demographics.
- A local Session 2 flow: eight two-minute DRAT blocks, a break, the orange
  attention check, and 12 SCTT items with three required responses each.
- A deterministic set of 260 DRAT assignments generated from the supplied study
  workbooks and validated against the propensity-score CSV.
- A local event store with resume and idempotent item capture.
- A client transport that can send unsynced events to `POST /save-block` once that
  endpoint exists.
- Offline linked-session export and scoring.

## Pearson Q-global / Raven boundary

Raven is not implemented inside Thinking Tasks. Pearson Q-global is the licensed
external administration and scoring system. The intended direction is:

```text
Thinking Tasks handoff -> Q-global administration and scoring
                       -> research-team score export
                       -> offline merge by deidentified study code
```

The review branch currently supplies only an HTTPS-link handoff, a return screen,
two auditable events (`raven_handoff` and `raven_return`), and an offline importer for
an already-normalized CSV with `study_code,standardized_score`.

It does not authenticate to Q-global, provision an examinee, pass an identifier,
verify completion, retrieve scores, or understand Pearson's native export schema.
The current participant can also advance without proving that the Q-global link was
opened; `raven_return` must not be treated as verified Pearson completion. Pearson
credentials, licensed test content, and the private study key must never enter the
browser or repository.

Before wiring Raven for dev, obtain the decisions and sample export listed in
`docs/BABAK_QUESTIONNAIRE.md`. Unless Babak explicitly requires and documents an
approved automated Pearson integration, the minimal supported production workflow
is a supervised external handoff followed by a manual deidentified score export and
offline merge.

## Current production blockers

The following are hard blockers, not optional refinements:

1. The existing Supabase backend stores one completed submission. The new client
   saves one event after every task and therefore needs session and event storage.
2. `/save-block` does not exist in the current Supabase functions.
3. Session completion is only marked in browser storage; the backend needs a
   completion operation.
4. Slot assignment is still local/URL-based in the new flow. Production must assign
   or retrieve the slot from the server by deidentified study code.
5. Session 2 is gated by local browser storage only. The backend must independently
   verify that Session 1 is complete.
6. The current migration seeds 160 slots while the study material bundle contains
   260 assignments. `js/battery-data.js` also still reports 160 slots.
7. The inherited `submissions` table/function stores a user-agent string. The study
   record must contain neither user-agent nor source IP.
8. `js/study-config.js` has `localPreviewOnly: true`, and `js/core.js` deliberately
   rejects a configured API and all production runs.
9. The relationship between the Thinking Tasks study code and Q-global examinee ID
   is not confirmed.
10. Pearson's real deidentified score-export columns and standardized-score field
    have not been supplied, so the generic CSV importer is not yet a verified
    Q-global adapter.
11. The deployment scripts still deploy the inherited `get-slot` / `submit-data`
    functions and print a Prolific-style test URL. They do not yet deploy the new
    session/event endpoints.
12. The start/resume contract does not yet define approved study-code authorization
    or return the server-side event inventory needed to resume on another device.

## Recommended production data flow

```text
Participant enters deidentified study code and session number
        |
        v
start/resume endpoint
  - validate an issued study code through the approved access mechanism
  - Session 1: claim or return one stable slot and saved-item inventory
  - Session 2: require completed Session 1 and reuse its slot
        |
        v
Browser runs the assigned jsPsych timeline
        |
        v
POST /save-block after every recordable task
  - event_id makes retries idempotent
  - response returns stable session_record_id
        |
        v
finish-session operation
  - server checks expected saved events
  - server marks the session complete
        |
        v
Authenticated researcher export -> offline scoring
```

The backend is authoritative for slot assignment, completion, and the Session 2
prerequisite. `localStorage` remains a retry/resume cache, not a security boundary.

## Minimal backend contract

Endpoint names other than `/save-block` can be adjusted, but the client and server
must agree exactly before the production lock is removed.

### Start or resume a session

Recommended endpoint: `POST /start-session`

Request:

```json
{
  "protocol_version": "drat-human-2026-v1",
  "study_code": "DRAT-001",
  "session_number": 1
}
```

Response:

```json
{
  "protocol_version": "drat-human-2026-v1",
  "session_record_id": "uuid",
  "session_token": "opaque-rotatable-token",
  "slot": 17,
  "session_number": 1,
  "test_order": ["dat", "rat", "raven"],
  "saved_item_ids": [],
  "complete": false
}
```

Required behavior:

- Normalize and validate the study code using the same 3–32 character rule as the
  frontend: uppercase letters, digits, and hyphens only.
- Accept only a pre-issued study code or the alternative access mechanism approved
  by Babak. A syntactically valid arbitrary code must not consume a slot.
- Session 1 atomically claims the lowest available slot or returns the previously
  assigned slot for that study code.
- Session 2 returns the Session 1 slot only when Session 1 is complete; otherwise it
  returns a clear 409/403 error.
- Repeated calls return the same session record and slot.
- Return the assigned test order and server-saved item IDs so refreshes and a second
  approved browser/device can resume without repeating completed tasks.
- Never accept a client-provided slot as authoritative.
- Issue an opaque session token (or equivalent approved session credential) that
  subsequent save/finish calls can use. Store only a hash server-side.
- Token reissuance/resume must follow the approved researcher, station-passcode, or
  equivalent recovery procedure; knowing a predictable study code alone is not
  sufficient authorization.

### Save one event

Required endpoint: `POST /save-block`

The current payload is produced in `js/save-client.js`:

```json
{
  "protocol_version": "drat-human-2026-v1",
  "study_code": "DRAT-001",
  "session_number": 2,
  "session_record_id": "uuid",
  "event_id": "DRAT-001:2:slot_017_causal_k3",
  "test_id": "drat",
  "block_id": "slot_017_causal_k3",
  "item_id": "slot_017_causal_k3",
  "assignment": {
    "slot": 17,
    "test_order": ["drat", "sctt"],
    "presentation_index": 0,
    "anchor_size": 3,
    "relation": "causal",
    "source_triplet_id": 4
  },
  "displayed_stimuli": {},
  "response": {},
  "started_at": "ISO-8601 timestamp",
  "completed_at": "ISO-8601 timestamp",
  "response_time_ms": 12345,
  "timed_out": false,
  "attention_check": null,
  "app_version": "approved-deployment-version"
}
```

The real payload can additionally contain `task`, `prompt`, `anchors`, `set_id`,
and `pair_id`.

Required behavior:

- Authenticate the request to the session established from the study code. Do not
  trust the payload's slot or session number without checking the stored session.
  The recommended browser contract is `Authorization: Bearer <session_token>`.
- Validate the protocol version, required fields, expected test/item ID for that
  session, and a reasonable request-size limit before storing the event.
- Make `event_id` unique and idempotent. Replaying an identical event succeeds
  without creating a second row.
- Reject a conflicting replay of the same `event_id` rather than overwriting data.
- Return `{ "session_record_id": "uuid" }` on every success.
- Preserve the entire event payload so displayed stimuli, order, timing, source IDs,
  responses, and attention flags remain auditable.
- Do not capture request IP or user-agent.

### Finish a session

Recommended endpoint: `POST /finish-session`

The server should verify the exact expected item IDs—not only the total count—before
setting `complete=true`.
Expected recordable events are:

- Session 1: 35 events — DAT 1, RAT 30, Raven 2, BFI-10 1, demographics 1.
- Session 2: 22 events — DRAT 8, break 1, orange check 1, SCTT 12.

The operation must be idempotent. A completed Session 1 is the only state that
permits Session 2 to start.

### Researcher export

The existing `GET /get-data` bearer-token protection can be retained. Its export
must now return session records plus ordered event payloads rather than assuming a
single `payload.responses` array in `submissions`.

Keep `DATA_EXPORT_TOKEN` server-side. A failed or missing token must remain 401.

## Recommended database shape

Use a new migration for the already-deployed dev project; do not edit history and
assume the modified old migration will rerun.

If Babak confirms a pre-generated code list, store only the approved deidentified
codes in an allowlist table or equivalent server-side registry. The private mapping
from study code to participant identity remains outside this application and
database.

### `slots`

- Keep atomic assignment with `FOR UPDATE SKIP LOCKED`.
- Seed slots `0..259`.
- Store the deidentified `study_code` as the stable assignee.
- Preserve the uniqueness constraint so one study code cannot claim two slots.

### `study_sessions`

Suggested fields:

- `id uuid primary key`
- `study_code text not null`
- `session_number smallint check (session_number in (1,2))`
- `slot integer not null references slots(id)`
- `protocol_version text not null`
- `test_order jsonb not null`
- `session_token_hash text not null` (or equivalent server-managed session state)
- `complete boolean not null default false`
- `created_at`, `completed_at`, `updated_at` timestamps
- `unique (study_code, session_number)`

### `study_events`

Suggested fields:

- `event_id text primary key`
- `session_id uuid not null references study_sessions(id)`
- `test_id text not null`
- `item_id text not null`
- `presentation_index integer`
- `payload jsonb not null`
- `received_at timestamptz not null default now()`
- `unique (session_id, item_id)`

Row-level security should remain enabled with no public table policies. Edge
functions use the service-role key; that key must never enter frontend files.

## Frontend integration tasks

1. Replace URL/default slot selection in `js/core.js` with the server response from
   the start/resume operation.
2. Hydrate the client with the returned test order and `saved_item_ids` so it can
   resume from server state, including on an approved second browser/device.
3. Pass the server-issued `session_record_id` into `createStudyStore` rather than
   beginning with a `local-*` identifier in production.
4. Send the server-issued session token with save and completion requests; never
   put a service-role key or researcher export token in the browser.
5. Extend `save-client.js` so `finish()` calls the completion endpoint and only
   reports success after the server confirms completion.
6. On page load, retry locally queued unsynced events before allowing the participant
   to continue.
7. Keep the local assignment/order mismatch guard.
8. Change participant-facing text in `study-code.js` from “local preview” after the
   final wording is approved.
9. Supply the approved HTTPS Q-global link in `study-config.js`.
10. Implement only the approved identifier handoff. Do not place a participant name,
    email, Pearson credential, or study-key file in frontend configuration or event
    payloads.
11. Preserve `raven_handoff` and `raven_return` in the production export. Treat the
    participant's return response as self-report, not proof of Q-global completion.
12. After receiving a sample Pearson export, add the smallest explicit normalization
    step needed to produce `study_code,standardized_score`; fail on missing,
    duplicate, or unmapped identifiers.
13. Only after dev integration passes, set `localPreviewOnly` to false and replace the
   unconditional production fatal guard with an explicit approved deployment flag.
14. Update `app_version` from `local-study-prototype` to a deployable version identifier.

## Existing deployment files to reuse

| File | Role |
|---|---|
| `src/human_experiments/battery/deploy.sh` | Loads dev/prod settings, deploys Supabase, stages browser files, deploys Vercel |
| `src/human_experiments/battery/backend/supabase/deploy.sh` | Applies migrations, secrets, and Edge Functions |
| `src/human_experiments/battery/backend/supabase/config.toml` | Disables gateway JWT for participant-facing functions |
| `src/human_experiments/battery/vercel.json` | Static Vercel configuration |
| `src/human_experiments/battery/js/deploy-config.js` | Empty committed local config; deployment generates the environment-specific copy |
| `src/human_experiments/battery/get_data.sh` | Protected, timestamped data export |

Before deployment:

- Update `backend/supabase/deploy.sh` and `config.toml` to deploy/configure
  `start-session`, `save-block`, and `finish-session`, plus the revised `get-data`.
- Update `get_data.sh` for the new session/event export schema.
- Retire or clearly exclude the inherited `get-slot` / `submit-data` endpoints from
  this study flow.
- Derive `TOTAL_SLOTS` from the generated `STUDY_MATERIALS.assignments` count (260),
  not the obsolete `js/battery-data.js` value (160), and add a new migration that
  seeds the missing slots without rewriting applied migration history.
- Remove the inherited `PROLIFIC_PID` test URL. `COMPLETION_URL` is unused by the new
  in-person flow and should be removed unless the study team approves a specific
  post-session destination.

## Configuration names

Do not commit values. The existing scripts expect these names:

- Shared deployment credentials: `SUPABASE_API_KEY`, `VERCEL_API_KEY`.
- Per environment: `SUPABASE_PROJECT_REF`, `DB_PASSWORD`, `DATA_EXPORT_TOKEN`.
- Supabase function/runtime: `TOTAL_SLOTS` plus automatically provided Supabase URL
  and service-role credentials.

Dev and production must remain separate Supabase and Vercel projects. Never test by
resetting or wiping production.

## Privacy and security requirements

- The study code is the only participant identifier in the experiment application.
- Do not request or store names or email addresses.
- Do not store source IP, user-agent, browser fingerprint, or unnecessary client
  metadata.
- Confirm Supabase/Vercel request-log retention with the study team if the IRB rule
  applies beyond research database rows and exports.
- Keep RAT answer keys, scoring code, database functions, and source materials out
  of the Vercel public artifact.
- Keep RLS enabled and revoke direct public execution of slot-claiming functions.
- Keep researcher export protected by a strong server-side bearer token or approved
  researcher authentication.
- Restrict CORS to the approved dev/prod origins if practical; never use CORS as the
  only authorization control.

## Dev acceptance checklist

Complete all checks against dev before any production deployment:

- [ ] A new study code gets one slot in `0..259`; repeated entry returns the same slot.
- [ ] An unknown/unissued study code is rejected without consuming a slot.
- [ ] A second browser/device can resume using the same study code.
- [ ] Start/resume returns the server-saved item inventory and the browser skips those
      completed items without trusting local storage.
- [ ] Session 2 is rejected before Session 1 is complete.
- [ ] Session 2 inherits Session 1's slot and cannot submit a different slot.
- [ ] Refresh after a saved task resumes at the next task.
- [ ] Retrying a block does not create a duplicate event.
- [ ] A conflicting duplicate `event_id` is rejected and logged.
- [ ] Session 1 finishes with 35 stored events.
- [ ] Every Raven position in the six Session 1 orders reaches the approved Q-global
      handoff and resumes at the correct next task.
- [ ] The production export contains exactly one `raven_handoff` and one
      `raven_return` event per completed Session 1.
- [ ] The approved study-code/Q-global-examinee-ID mapping works without sending a
      name, email, or other direct identifier to the experiment database.
- [ ] A deidentified Q-global sample export is normalized and merged without missing
      or duplicate study codes.
- [ ] An interrupted or incomplete Q-global administration follows Babak's approved
      recovery procedure and is not falsely marked complete.
- [ ] Session 2 finishes with 22 stored events.
- [ ] All eight DRAT cells and all 12 SCTT items appear in the export.
- [ ] Timed-out trials preserve partial responses and `timed_out=true`.
- [ ] `/get-data` is 401 without the correct token.
- [ ] The public site returns 404 for RAT answers, scoring code, backend files, and
      non-browser study materials.
- [ ] Database rows contain no IP, user-agent, name, or email.
- [ ] The linked two-session export runs through `scoring/score_battery.py`.
- [ ] Vercel and Supabase point to the same environment; dev never points to prod.
- [ ] The study team completes one supervised end-to-end pilot and approves it.

## Supervisor decisions still required

Babak/the study team must provide or approve:

- Study-code issuance and format.
- Final Q-global/Raven URL; embed, new-tab, or researcher-launch behavior; and the
  return/recovery workflow.
- Whether the Q-global examinee ID is the Thinking Tasks study code or a separate
  identifier, and who creates/records it.
- A deidentified Q-global export sample and the exact standardized-score field to
  retain.
- Whether score export/merge is intentionally manual or an approved Pearson API
  integration is required.
- Q-global station sign-in and simultaneous-administration procedure.
- Consent placement and final participant-facing wording.
- Whether a station passcode, PBEL network restriction, or researcher authentication
  is required.
- The exact DRAT random-noun pool and approved embedding resources for final scoring.
- Production launch approval after the dev pilot.

These decisions should be configuration or copy changes where possible; they should
not silently change the experimental assignment logic.

## Ownership

| Owner | Responsibility |
|---|---|
| Prit | Participant flow, test implementation, assignment generation, client-side integration in `core.js` / `save-client.js`, local scoring, and study-flow QA |
| Wasiq | Supabase schema/functions, server-side session authorization and gating, tokens/secrets, Vercel/Supabase dev deployment, protected export, and deployment QA |
| Shared | Final API contract, frontend/backend integration test, privacy verification, and supervised end-to-end dev pilot |
| Babak/study team | Study codes; Q-global URL, license/account workflow, identifier mapping, score export, and recovery procedure; consent/copy; scoring resources; and launch approval |

## Reproducibility note

The committed `js/study-materials.js` already contains the 260 validated assignments
and should be deployed as-is. Regenerating it is not a deployment step. If regeneration
is required, `prepare_study_materials.py` needs Python `openpyxl`; declare/install that
dependency explicitly and verify that regeneration reproduces the committed bundle.

## Definition of deployment done

Deployment is done only when the production backend is authoritative for assignment,
incremental saves, completion, and the Session 2 prerequisite; all privacy and export
checks pass; the dev pilot is approved; and the production lock is removed in an
explicit reviewed commit. A successful Vercel build by itself is not completion.
