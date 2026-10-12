# DRAT study-flow handoff

Updated: October 12, 2026

Detailed handoffs:

- `docs/NEXT_PHASE_IMPLEMENTATION_PLAN.md` — approved post-meeting plan covering consent,
  meeting-level task order, Pearson self-registration, response validation, backend
  integration, score linkage, and pilot acceptance.
- `docs/WASIQ_DEPLOYMENT_HANDOFF.md` — production integration and deployment.
- `docs/STUDY_FLOW_IMPLEMENTATION.md` — complete implementation record.
- `docs/BABAK_QUESTIONNAIRE.md` — historical pre-meeting question list.

## Current state

- Work is isolated on branch `prit/drat-study-flow`, based on Wasiq's deployment
  changes. The repository's `main` branch remains unchanged.
- `docs/WASIQ_DEPLOYMENT_HANDOFF.md` has been reconciled against Wasiq's PR #2
  through commit `a17ad14`; it now distinguishes his completed deployment baseline
  from the additional backend work required by Prit's two-session flow.
- Earlier study-flow commits are published separately for collaboration; the
  October 12 implementation in this working tree is not yet committed or pushed.
  Nothing has been merged or deployed.
- The app is a local-only two-session development build. Production mode fails loudly.

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

## Backend contract for Wasiq

The client is ready to POST each event to `/save-block`. The server must make
`event_id` idempotent, group rows by `(study_code, session_number)`, return a
stable `session_record_id`, and preserve the JSON fields produced by
`js/save-client.js`. The production database needs 260 assignment slots rather
than the current deployment migration's 160. The inherited `submit-data`
backends still capture request IP and/or user-agent metadata; remove those fields
before production so they never enter the research record.
The production endpoint must also enforce the completed-Session-1 prerequisite;
the local browser gate is not a security boundary.

## Required decisions before deployment

The October 2 and October 7 meetings established the stamped in-app consent gate,
Pearson's stable self-registration URL with a fresh group code per lab meeting,
room-level Session 1 ordering, supervised spoken Raven instructions, and the
manual-response/timeout rule. Pearson's `SAMEORIGIN` response header rules out an
iframe, so the frontend now uses a deliberate new-tab launch. Remaining decisions
include one versus paired study codes, Raven interruption recovery, Pearson export
linkage/score field, and the station reset procedure. Wasiq must implement and test
the server-side session/event contract, protected export, 260-slot migration, and
dev deployment. Prit's approved frontend changes are complete locally; the remaining
Prit work is connecting them to Wasiq's contract and verifying scoring/export. The
study team must approve an end-to-end dev pilot before any participant launch.

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
