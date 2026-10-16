# DRAT study-flow handoff

> **Archived 2026-10-16. Historical; may not match the current code.** Written while the study flow was being built (October 2026). For the current study see [`src/human_experiments/battery/README.md`](../../src/human_experiments/battery/README.md) and [`AGENTS.md`](../../src/human_experiments/battery/AGENTS.md).

Updated: October 12, 2026

Detailed handoffs:

- `docs/NEXT_PHASE_IMPLEMENTATION_PLAN.md` — approved post-meeting plan covering consent,
  meeting-level task order, Pearson self-registration, response validation, backend
  integration, score linkage, and pilot acceptance.
- `docs/WASIQ_DEPLOYMENT_HANDOFF.md` — production integration and deployment.
- `docs/STUDY_FLOW_IMPLEMENTATION.md` — complete implementation record.
- `docs/BABAK_QUESTIONNAIRE.md` — historical pre-meeting question list.

## Current state

- `prit/drat-study-flow` publishes Prit's verified frontend through commit `930c721`.
- `prit/study-backend-integration` is based on Wasiq's `wasiq/session-backend`
  commit `7057ec7` and combines the two-session backend with the October 12
  consent, fixed-order, Pearson, validation, and hard-timer work.
- `main` remains unchanged by this integration. Nothing here has been deployed.
- The combined app supports local preview and a Supabase-backed development
  deployment. Production mode still fails loudly pending study-team approval.

## Implemented

- Deidentified study-code entry, Session 1/2 routing, and resumable browser saves.
- Stamped Session 1 consent PDF with explicit agree/decline; decline creates no
  session record.
- Six strict `order=1..6` lab-meeting URLs; Session 1 order is no longer derived
  from the participant's DRAT assignment slot.
- Pearson Q-global self-registration opens in a supervised new tab. The app stores
  neither the fresh group code nor Pearson-requested personal details, and records
  return as participant self-report only.
- Every timed task is a hard minimum-exposure screen: DAT stays for 4 minutes, each
  RAT item for 15 seconds, and each DRAT block for 2 minutes. Submit and Enter-key
  bypasses are blocked until the current response auto-submits at zero.
- Session 2 is locally locked until the same study code has a completed Session 1;
  it automatically reuses Session 1's assignment slot.
- Session 1: six-way DAT/RAT/Raven counterbalancing, BFI-10, instructed-response
  check, and optional demographics.
- Session 2: eight two-minute DRAT blocks covering every anchor-size × relation
  cell, a break, orange check, and 12 SCTT prompts with three responses each.
- 260 reproducible DRAT assignments generated from the approved workbooks and
  validated against the directional propensity-score CSV. Every assignment has
  20 distinct anchor words and eight distinct source triplets.
- Displayed stimuli, order, timing, source IDs, responses, and attention flags are
  captured. Names, emails, IPs, and user-agent strings are not collected.
- Offline export links both sessions by study code, preserves all DRAT blocks,
  flags incomplete sessions, accepts an optional Raven score CSV, supports the
  paper's three-embedding DRAT composite, and round-trips SCTT scores through CAP.

## Verified locally

- JavaScript syntax checks and Python compilation pass.
- All 260 DRAT assignments pass protocol invariants and source-balance checks.
- Full browser runs pass for Session 1 (35 saved events) and Session 2 (22 saved
  events), with no JavaScript errors. Session 2 rejects a missing/incomplete
  Session 1, rejects a mismatched slot, and inherits the completed assignment.
- Refreshing after the first DAT save resumes without duplicating the event.
- Synthetic linked-session scoring covers the three-model DRAT composite and CAP
  SCTT score import. The v2 material bundle was checksum-verified to differ from the
  validated v1 bundle only by the protocol label; full regeneration currently needs
  the uninstalled `openpyxl` dependency.
- The stamped PDF, order-2 flow, and Pearson launch gate passed a local browser
  check with no console warnings/errors.
- A live RAT browser check confirmed that Submit remained disabled, Enter could not
  advance, zero triggered automatic submission, and the next item locked again.
- The integrated event store test verifies the bearer token, v2 event ID, meeting
  order, consent audit fields, application version, incremental save, and finish call.
- The regenerated backend manifest reports 260 slots, 35 Session 1 items, and 22
  Session 2 items. JavaScript syntax, Python compilation, and shell syntax pass.

## Integrated backend status

The integration branch now includes Wasiq's issued-code allowlist, 260-slot schema,
server-issued session tokens, `/start-session`, idempotent `/save-block`, strict
`/finish-session`, server-side Session 2 gating, protected exports, and researcher
admin/reset tooling. The October 12 migration additionally persists and validates
the operator-selected Session 1 order and consent version/timestamp. Saved events
must match the server session's code, slot, order, consent, item manifest, and v2
event ID. No IP address, browser user-agent, Pearson group code, or Pearson personal
information is stored.

## Required decisions before deployment

The October 2 and October 7 meetings established the stamped in-app consent gate,
Pearson's stable self-registration URL with a fresh group code per lab meeting,
room-level Session 1 ordering, supervised spoken Raven instructions, and the
manual-response/timeout rule. Pearson's `SAMEORIGIN` response header rules out an
iframe, so the frontend now uses a deliberate new-tab launch. Remaining decisions
include one versus paired study codes, Raven interruption recovery, Pearson export
linkage/score field, and the station reset procedure. The next engineering step is
deploying this integration branch to the isolated development environment and
running the two-session acceptance matrix against Supabase. The study team must
approve that supervised dev pilot before any production deployment or participant
launch.

## Supplied-material coverage

- `All_Triplets.xlsx`, `DRAT_k2_Anchor_Pairs.xlsx`, and
  `propensity_score_sub.csv` drive and validate DRAT assignments.
- `Materials_DRAT_v3_tracked.docx`, `SCTT.pdf`, `DRAT_Draft.pdf`, and
  `Big_Five.pdf` define task wording, item selection, timing, and scoring.
- `DRAT_RA_Getting_Started.docx`, `High-level Details.docx`, the protocol form,
  and study-key template define the two-session flow, privacy model, and IDs.
- Consent, recruitment, screening, scheduling, and IRB correspondence are
  operational/Qualtrics records; only the exact stamped consent PDF is bundled into
  the app, while all other IRB files stay private.

## Local run

```bash
cd src/human_experiments/battery
python3 -m http.server 8001
```

Open `http://127.0.0.1:8001/?session=1&order=2&slot=0` or replace `session=1` with
`session=2`. Use the same deidentified code for both sessions.
