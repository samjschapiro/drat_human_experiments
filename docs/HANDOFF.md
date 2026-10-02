# DRAT study-flow handoff

Updated: October 2, 2026

## Current state

- Work is isolated in `/Users/pritmhala/Computer_Graphics_HW1/Babak_AI3_Project`
  on branch `feature/drat-study-flow`, based on Wasiq's deployment changes.
- The original checkout at `/Users/pritmhala/Babak_AI3_Project` is untouched.
- Nothing from this branch has been pushed, merged, or deployed.
- The app is a local-only two-session prototype. Production mode fails loudly.

## Implemented

- Deidentified study-code entry, Session 1/2 routing, and resumable browser saves.
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
  SCTT score import; the material generator reproduces all 260 assignments.

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

Babak must confirm the study-code issuance rule, the Q-global URL and return
workflow, consent placement, final participant wording, and supply/confirm the
exact DRAT random-noun pool and embedding files. Wasiq must
connect and test `/save-block`, export both sessions, update the slot migration,
and run the dev deployment. The study team must approve an end-to-end dev pilot
before any participant launch.

## Supplied-material coverage

- `All_Triplets.xlsx`, `DRAT_k2_Anchor_Pairs.xlsx`, and
  `propensity_score_sub.csv` drive and validate DRAT assignments.
- `Materials_DRAT_v3_tracked.docx`, `SCTT.pdf`, `DRAT_Draft.pdf`, and
  `Big_Five.pdf` define task wording, item selection, timing, and scoring.
- `DRAT_RA_Getting_Started.docx`, `High-level Details.docx`, the protocol form,
  and study-key template define the two-session flow, privacy model, and IDs.
- Consent, recruitment, screening, scheduling, and IRB correspondence are
  operational/Qualtrics records; they are intentionally not bundled into the app.

## Local run

```bash
cd /Users/pritmhala/Computer_Graphics_HW1/Babak_AI3_Project/src/human_experiments/battery
python3 -m http.server 8001
```

Open `http://127.0.0.1:8001/?session=1&slot=0` or replace `session=1` with
`session=2`. Use the same deidentified code for both sessions.
