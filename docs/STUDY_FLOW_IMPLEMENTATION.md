# Two-session study-flow implementation record

Updated: October 2, 2026

## Purpose

This document records what was implemented on top of the code received from the
GitHub repository. It describes the baseline, current study behavior, files changed,
research materials used, scoring support, verification, and known limits.

## Baseline

The GitHub `main` branch at `9f1f4fa` contained a configurable single-session
jsPsych creativity battery for DAT, RAT, SCTT, and DRAT, plus offline scorers and
AWS/Supabase backend scaffolds.

Wasiq's deployment work through `a17ad14` added and verified:

- Supabase + Vercel deployment fixes.
- Separate dev and production environments.
- Protected data export.
- Atomic slot assignment.
- A staged frontend artifact that excludes answer keys and backend files.
- Deployment logs and a first live dev deployment.

The implementation described here is based on `a17ad14`, not directly on an
unmodified copy of `main`.

## Local implementation commits

| Commit | Summary |
|---|---|
| `95c6119` | Implemented the local two-session study flow, generated DRAT assignments, incremental capture, questionnaires, Raven handoff, and linked-session export |
| `c9ace09` | Enforced the Session 1 prerequisite, completed DRAT/SCTT administration and scoring integration, validated supplied data, and documented deployment requirements |

Both implementation commits are included on the review branch
`prit/drat-study-flow`. They have not been merged or deployed.

## Resulting participant flow

### Study entry

- The participant enters a deidentified study code containing 3–32 uppercase
  letters, digits, or hyphens.
- The participant/researcher chooses Session 1 or Session 2.
- No name, email, IP address, or user-agent is collected by the local study flow.
- Local saves are namespaced by protocol version, study code, and session number.

### Session 1

DAT, RAT, and Raven are assigned in one of six counterbalanced orders:

1. DAT → RAT → Raven
2. DAT → Raven → RAT
3. RAT → DAT → Raven
4. RAT → Raven → DAT
5. Raven → DAT → RAT
6. Raven → RAT → DAT

After those three tasks, every participant receives BFI-10 with an instructed-
response check and the optional demographics questionnaire.

Session 1 contains 35 recordable events:

- DAT: one four-minute, ten-noun task.
- RAT: 30 randomized CRA items, 15 seconds each.
- Raven: external-assessment handoff plus completion confirmation.
- BFI-10: ten personality items plus the embedded attention item.
- Demographics: age, gender, race/ethnicity, year, field of study, and English-
  language questions, all optional.

The Raven link is currently an explicit local placeholder because the licensed
Q-global URL has not been supplied.

### Session 2 prerequisite

Session 2 is locally locked unless the same study code has a completed Session 1.
It automatically reuses Session 1's assignment slot and rejects an explicitly
different slot.

This local gate is correct for local testing. Production must repeat the check on
the server so it works across browsers/devices and cannot be bypassed by editing
browser storage.

### Session 2

Session 2 contains 22 recordable events:

- Eight DRAT blocks.
- One break marker.
- One orange attention check.
- Twelve SCTT items.

Each DRAT block:

- Lasts two minutes.
- Shows either two or three anchors.
- Requests up to ten single-word nouns.
- Records the exact anchors, anchor size, relation type, triplet/pair source,
  presentation position, response, timing, and timeout state.

Every participant receives one block for each design cell:

| Anchor size | Relation |
|---|---|
| 2 | causal |
| 2 | constitutive |
| 2 | categorical |
| 2 | unrelated |
| 3 | causal |
| 3 | constitutive |
| 3 | categorical |
| 3 | unrelated |

Each SCTT administration contains four research-question items, four hypothesis
items, and four experiment items. The three subtest blocks are randomized by slot,
while the published order is preserved within each subtest. Every item requires
exactly three responses.

## DRAT assignment generation

`prepare_study_materials.py` was added to transform the supplied research material
into the browser bundle `js/study-materials.js`.

It generates 260 reproducible assignments using seed `20260929`. Every assignment:

- Contains eight blocks covering all anchor-size × relation cells.
- Uses eight distinct source triplets.
- Uses 20 distinct anchor words across its blocks.
- Preserves source triplet and pair identifiers for auditing.
- Randomizes block presentation order deterministically.

Input validation now checks:

- Expected triplet and pair workbook shapes and relation labels.
- The rule distinguishing designated related pairs from eligible unrelated pairs.
- Exactly 842 unique directional propensity rows.
- Exactly 421 unordered propensity pairs, each present in both directions.
- Designated related-pair ratings against the propensity-score source.
- All 260 final assignments against the study invariants.

## Incremental capture and resume

`js/save-client.js` provides a local event store and the future `/save-block`
transport.

For every task it records:

- Protocol version, study code, session number, and session record ID.
- Stable `event_id`, `test_id`, `block_id`, and `item_id`.
- Slot, test order, presentation index, and DRAT condition/source information.
- Exactly what was shown to the participant.
- Raw response, start/end timestamps, response time, and timeout flag.
- Attention-check result when applicable.

The event is written to browser storage before jsPsych advances. Refreshing the page
skips already recorded items and resumes at the first unfinished task. Event IDs and
item IDs prevent duplicate local capture.

When `API_BASE` is configured, unsynced events are queued for `POST /save-block`.
That endpoint and production completion handling remain deployment work, documented
in `docs/WASIQ_DEPLOYMENT_HANDOFF.md`.

## Offline export and scoring

`scoring/score_battery.py` now links Session 1 and Session 2 by deidentified study
code and produces:

- Participant-level summary rows.
- One auditable row per DRAT block.
- One row per SCTT response.
- Completeness flags based on the expected event inventory.
- RAT accuracy and per-item results.
- BFI-10 trait scores with reverse coding.
- Optional Raven standardized score import.
- DAT and DRAT scores by embedding plus composite scores.
- SCTT fluency and imported creativity predictions.

### DRAT scoring

The implemented rule is:

1. Compute each response's maximum cosine similarity to the anchors.
2. Compute the 90th-percentile utility threshold from the approved random-noun pool.
3. Keep responses strictly above the threshold.
4. Return zero when fewer than three responses survive.
5. Otherwise calculate mean pairwise cosine distance × 100.
6. Report GloVe, FastText, and Sentence-BERT results separately and average the
   available scores into the paper-comparable composite.

The scorer supports static gensim vectors and
`sentence-transformers/all-mpnet-base-v2`. It requires an explicit noun-pool path
and will not silently use the bundled 30-word example file.

The exact approved random-noun pool and production embedding assets were not present
in the supplied folder. Final research DRAT scores therefore remain blocked on those
external resources, although the complete scoring path is implemented and tested
with controlled vectors.

### SCTT scoring

The previous unverified local RoBERTa approximation was removed. The pipeline now:

- Validates SCTT task labels and item text.
- Produces a UTF-8 CSV with CAP's case-sensitive `item` and `response` columns plus
  stable participant/item/response join keys.
- Imports CAP-returned `prediction` and `modelname` fields.
- Rejects duplicate, missing, or response-mismatched score rows.
- Reports the participant's mean creativity prediction.

The validated SCTT-AI model remains hosted externally; its weights are not included
in the repository.

## Source-material coverage

### Runtime/generation inputs

| Supplied file | Use |
|---|---|
| `All_Triplets.xlsx` | DRAT k=3 anchors, relation classes, and source IDs |
| `DRAT_k2_Anchor_Pairs.xlsx` | DRAT k=2 designated/eligible anchor pairs |
| `propensity_score_sub.csv` | Directional relatedness validation for designated related pairs |

### Design and scoring references

| Supplied file | Use |
|---|---|
| `Materials_DRAT_v3_tracked.docx` | Participant wording, questionnaires, timing, and task materials |
| `DRAT_Draft.pdf` | DRAT design and scoring algorithm |
| `SCTT.pdf` | SCTT item/subtest structure and scoring model |
| `Big_Five.pdf` | BFI-10 item and scoring reference |
| `DRAT_RA_Getting_Started.docx` | Required workflow, privacy, and implementation priorities |
| `High-level Details.docx` | Final two-session study composition and infrastructure direction |
| `DRAT_Protocol_Form_v2_tracked.docx` | Procedure, sequencing, and protocol constraints |
| `Study_Key_Code_Template_DRAT.docx` | Deidentified study-code linkage model |

### Operational documents

Consent, recruitment, screening, scheduling, and IRB correspondence were reviewed
as operational constraints. They are intentionally not bundled into the browser
application. The supplied workflow places screening/consent in the approved external
process rather than duplicating it inside this app.

## File-level implementation inventory

| File | Change |
|---|---|
| `index.html` | Loads study materials, configuration, study entry, save client, questionnaires, and session builders |
| `js/core.js` | Replaced the original single-session engine with two-session routing, capture, resume, local completion, and Session 2 gating |
| `js/study-code.js` | Added validated deidentified code and session entry |
| `js/study-config.js` | Added protocol version, six Session 1 orders, local-production lock, and Raven placeholder |
| `js/save-client.js` | Added incremental local event records, idempotent resume, and `/save-block` transport |
| `js/sessions/session1.js` | Added DAT/RAT/Raven order assembly followed by BFI-10 and demographics |
| `js/sessions/session2.js` | Added eight-block DRAT, break, attention check, and SCTT assembly |
| `js/tests/bfi10.js` | Added BFI-10 and instructed-response check |
| `js/tests/demographics.js` | Added optional protocol demographics |
| `js/tests/attention-checks.js` | Added orange attention check |
| `js/tests/raven.js` | Added secure external Q-global handoff/return placeholder |
| `js/tests/drat.js` | Reworked DRAT into eight validated two-minute assignment blocks |
| `js/tests/sctt.js` | Added validated subtest-block ordering and three required responses |
| `js/tests/dat.js`, `js/tests/rat.js` | Added complete displayed-stimulus and presentation metadata capture |
| `prepare_study_materials.py` | Added source ingestion, validation, balancing, and deterministic assignment generation |
| `js/study-materials.js` | Added generated 260-slot DRAT assignment bundle |
| `item_banks/sctt_beaty_2026.json` | Corrected/aligned SCTT items with the supplied source |
| `scoring/score_battery.py` | Reworked linked-session normalization, completeness checks, multi-model DRAT/DAT scoring, and CAP imports |
| `scoring/_embed.py` | Added cached Sentence-BERT word-vector support and unified embedding loading |
| `scoring/score_drat.py` | Enforced explicit validated noun-pool input and duplicate/empty checks |
| `scoring/score_sctt.py` | Added CAP-compatible export and removed the unvalidated local approximation |
| `README.md`, `scoring/README.md`, `docs/HANDOFF.md` | Added run, scoring, status, limitations, and deployment documentation |

## Verification completed

- JavaScript syntax checks pass for the complete battery.
- Every Python file in the battery compiles.
- The generator reproduces the committed material bundle exactly.
- All 260 DRAT assignments pass invariants and source-balance validation.
- Full Session 1 browser run passes with 35 saved events and no JavaScript errors.
- Full Session 2 browser run passes with 22 saved events and no JavaScript errors.
- Session 2 rejects a missing/incomplete Session 1.
- Session 2 rejects a mismatched explicit slot and inherits the saved Session 1 slot.
- Refresh/resume does not duplicate a previously saved event.
- SCTT requires three responses and preserves subtest blocks.
- Synthetic scoring passes for the three-model DRAT composite and CAP SCTT import.
- Git whitespace/diff validation passes.

## Intentionally not implemented

- Production Supabase integration and deployment; this belongs to the deployment
  workstream.
- Final Q-global URL, examinee-ID mapping, approved launch/return and recovery
  workflow, real export normalization, and any separately approved automated
  Q-global integration.
- Participant-facing consent/screening pages already handled by the approved
  operational workflow.
- Final DRAT numeric research scoring without the missing approved pool/embeddings.
- A bundled SCTT model; the validated CAP service is the scoring authority.
- Any push, merge, pull request, or production change.

## Local reproduction

```bash
cd src/human_experiments/battery
python3 -m http.server 8001
```

Complete `http://127.0.0.1:8001/?session=1&slot=0`, then open
`http://127.0.0.1:8001/?session=2` and enter the same study code. Session 2 will
reuse the completed Session 1 assignment.

For linked raw export/scoring:

```bash
cd scoring
python score_battery.py \
  --input /path/to/drat-local-session-1.json /path/to/drat-local-session-2.json
```

Final embedding-based options and CAP round-trip instructions are in
`src/human_experiments/battery/scoring/README.md`.

## Current boundary

The participant-facing study behavior is complete against the supplied materials
and has passed local acceptance testing. The next engineering boundary is production
integration: server-authoritative assignment, incremental persistence, completion,
Session 2 gating, secure export, and dev deployment. Those requirements are captured
in `docs/WASIQ_DEPLOYMENT_HANDOFF.md`.
