# Agent guide: DRAT study battery

Read this before changing anything in `src/human_experiments/battery/`. It is the
live, in-person study "Creativity and Reasoning Tasks" (Stony Brook IRB2026-00448,
PI Babak Hemmatian), with real participant data in prod. For running and
deploying, see [`README.md`](README.md); this file is what an agent needs on top
of that.

## Rules

1. **Never wipe, reset, truncate or migrate destructively in prod.** Never run
   SQL that deletes or updates participant rows. Never delete data at all; the
   admin "reset" only archives a visit (`reset_at`) and keeps its events.
2. **Back up before touching prod data.** Run `bash get_data.sh prod` first, and
   only read prod data when the person you work for asks you to. Reads use the
   researcher token or a read-only database connection.
3. **Deploy prod only when asked, and only from a clean, committed `main`**:
   `echo prod | bash deploy.sh prod`. Deploy and test on dev first.
4. **No identifying data.** Emails exist only in the `participants` table (the PI
   approved that one exception). Never add names, NetIDs, IPs or emails to any
   other table, to event payloads, logs, the repo or commit messages.
5. **Participant-facing wording belongs to the PI.** Instructions, consent,
   questionnaires and button labels are IRB-reviewed; change them only with
   the PI's approval, and quote the exact text you changed when reporting.
6. **Never run the real Raven's test.** Pearson Q-global charges per
   administration. In automated browsers, intercept
   `qglobal.pearsonassessments.com` (Playwright: `context.route(...)`) so the
   Pearson tab never loads.
7. **Secrets** live in the gitignored `.env`, `.env.dev`, `.env.prod` at the
   repository root. Never print, commit or copy them into code. The browser gets
   only `js/deploy-config.js`, generated per deploy, which holds no secrets.
8. **Fail fast.** No silent fallbacks or default values that hide a missing
   config, item or response (`docs/repo_usage.md`).
9. **Git:** never commit to `main`; use a branch and a pull request.
   `data/`, `.env*` (except `.env.example`) and `.deploy/` are gitignored.

## How a visit works

```
browser (Vercel, static)                       Supabase Edge Functions + Postgres
------------------------                       ----------------------------------
email + (Visit 1) consent ───────────────────► start-session
                                               maps email → study_code (participants),
                                               returns slot, task order, session token,
                                               item IDs already saved
each answered task ── localStorage, then ────► save-block   (idempotent per item;
                                               rejects items not in the manifest)
Raven's screen ──────────────────────────────► raven-code   (Q-global group code)
Finish button ───────────────────────────────► finish-session (complete only if every
                                               expected item is saved)
researchers: /admin page, admin.sh ──────────► admin, get-data (researcher token)
```

- **Entry point:** `index.html` loads jsPsych 7.3.4 from a CDN, then the files
  in `js/`, then `js/core.js`, which runs `main()`.
- **URL:** `?session=1&order=1..6` for Visit 1 (the order is fixed per lab
  meeting) or `?session=2`. The orders are in `js/study-config.js`
  (`session1Orders`).
- **Timeline:** `js/sessions/session1.js` and `session2.js` build each visit from
  the modules in `js/tests/` and hold the PI-approved instruction text
  (`STUDY_INSTRUCTIONS`, `dratConfig`, `scttConfig`).
- **What gets saved:** `attachCapture` in `core.js` saves every trial whose
  `data` has `battery_tag: "task"`, keyed by `data.item_id`. On resume it skips
  saved tasks, and any instruction screen whose next task is already saved.
  `js/save-client.js` writes each answer to localStorage synchronously, then
  POSTs it, and retries until the server has it.
- **Slot:** `start-session` gives each participant a slot (0–259) once and keeps
  it. The slot selects their 8 DRAT sets from `js/study-materials.js`.
- **Delays:** `js/countdown.js` holds the timers.
  - `makeCountdown` locks Submit for the full time and submits at zero (DAT 4
    min, RAT 15 s per item, DRAT 2 min per set, practice 60 s).
  - `timedInstructions` and `revealButtonsAfter` keep a Next button disabled for
    a reading delay, with the time left shown on hover. Raven's finish button
    waits 10 minutes from when Pearson was opened.

## Saved items and the manifest

The server accepts only the item IDs the browser is expected to produce.

- **Visit 1 = 35 items:** `dat_single`, 30 RAT items, `raven_handoff`,
  `raven_return`, `bfi10`, `demographics`.
- **Visit 2 = 22 items:** 8 DRAT sets, `session2_break`, `attention_orange`, 12
  SCTT items. `drat_practice` is also saved but optional.
- **`prepare_backend_manifest.py`** builds the manifest from the browser bundles.
  It writes `backend/supabase/functions/_shared/study_manifest.json` (committed),
  and `deploy.sh` rebuilds it on every deploy.
- **If you add, remove or rename a saved item,** update the constants in that
  script (`SESSION1_FIXED`, `SESSION2_FIXED`, `SESSION2_OPTIONAL`,
  `EXPECTED_SESSION1/2`). Then update the scorer and the admin task counts
  (`admin.sh`, `js/admin.js`). Otherwise finish-session rejects every visit.
- **Never change the meaning of an existing `item_id`** mid-study. Data already
  collected is keyed by it.

## Generated files (do not edit by hand)

| File | Built by | From |
|---|---|---|
| `js/battery-data.js` | `prepare_battery.py --config battery_config.example.yaml` | `item_banks/` (RAT: 30 easiest of the 144 CRA items, solutions stripped; SCTT items) |
| `js/study-materials.js` | `prepare_study_materials.py --materials-dir <dir>` | the study team's DRAT workbooks (not in the repo) |
| `backend/.../study_manifest.json` | `prepare_backend_manifest.py` | the three files above plus `js/study-config.js` |
| `.deploy/drat-<env>/js/deploy-config.js` | `deploy.sh` | env name, API base, git SHA |

`js/battery-data.js` also contains a legacy `orders` list from the original
four-test battery. It is not used; the visit orders come from `js/study-config.js`.

## Database (Supabase Postgres, `backend/supabase/migrations/`)

| Table | Holds |
|---|---|
| `participants` | email → `study_code`. The only place emails are stored. |
| `study_codes` | every valid study code (a code must exist here to start a visit) |
| `study_sessions` | one row per visit attempt: order, slot, consent, `complete`, `reset_at` |
| `study_events` | one row per saved item, with the full `payload` |
| `slots` | the 260 DRAT slots (`taken_by` = study code), handed out once and kept |
| `study_settings` | the current Q-global group code |
| `admin_audit` | every admin change (group code, reset) and who made it |
| `submissions` | unused; left over from the original one-JSON-per-session backend |

Row-level security is on and the browser never talks to the database directly.
Only the Edge Functions do, using the service role. To change the schema, add a
new timestamped migration file; never edit one that has been deployed.

## Checking a change

1. `node tests/online-store.test.js && node tests/study-flow-config.test.js`
2. `python3 prepare_backend_manifest.py` must report 260 slots, 35 Session 1
   items and 22 Session 2 items.
3. Preview locally: `python3 -m http.server 8001`, then open
   `http://127.0.0.1:8001/?session=1&order=1`. The local preview needs no
   backend.
4. `bash deploy.sh dev`, then run the changed part on https://drat-dev.vercel.app
   with a test email (`something@stonybrook.edu`).
   - Timers are real, so a full Visit 1 takes about 25 minutes, most of it the
     Raven's wait.
   - `bash admin.sh dev reset <email> <1|2> "<reason>"` lets you rerun a visit.
   - Check the saved data with `bash get_data.sh dev`.
5. If the saved data format changed, run the scorer on the dev export:
   `cd scoring && python score_battery.py --input ../data/dev/battery_sessions.json`.

## Where things are

| Change | File |
|---|---|
| Task instructions and reading delays | `js/sessions/session1.js`, `js/sessions/session2.js` |
| Task behaviour | `js/tests/<task>.js` |
| Sign-in, consent, visit picker | `js/study-code.js` |
| Orders, consent PDF, Q-global URL, protocol version | `js/study-config.js` |
| Admin panel | `admin.html`, `js/admin.js`, `backend/supabase/functions/admin/` |
| Server validation | `backend/supabase/functions/_shared/common.ts` and each function |
| Scoring | `scoring/` (see `scoring/README.md`) |
| Design rationale | `DESIGN_NOTES.md` |
| Past work sessions | `docs/logs/` at the repository root |
