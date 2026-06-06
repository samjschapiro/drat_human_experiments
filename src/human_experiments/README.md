# Human-Experiment Template

A reusable scaffold for online between-subjects human studies that collect continuous-scale ratings on a set of stimuli, recruit participants from a crowd-sourcing platform (Prolific by default), and persist one JSON per completed session.

Originally extracted from the CreativityNeuro AUT/TT human evaluation pipeline (N=720 participants across 24 deployments). Domain-stripped here so the same scaffold can drive any rating study.

---

## What this template gives you

1. A **frontend** (static HTML + jsPsych 7) that presents a list of stimuli and collects ratings on a fixed set of continuous scales. Hosted on Vercel.
2. A **backend** (serverless functions + a persistence layer) with three endpoints:
   - `getSlot` — assigns each participant to one of N pre-defined slots so each stimulus reaches exactly `M` raters (balanced between-subjects design).
   - `submit-data` — persists one JSON per completed session.
   - `get-data` — admin endpoint that batch-retrieves all submissions.
3. A **factory** for cloning the per-experiment scaffold into N variants (one per condition / model / task), regenerating each variant's stimuli bundle from upstream CSVs.
4. A **deploy orchestrator** that runs the cloud provisioning + frontend deploy for every variant in turn.
5. A **recruiter integration** stub that creates the matching Prolific study for each deployed URL.

---

## Repository layout

```
src/human_experiments/
├── README.md                       ← this file
├── factory.py                      ← clone template/ into N per-condition copies
├── deploy_all.sh                   ← deploy every variant in turn
├── deploy_recruiter.py             ← create one Prolific study per deployed URL
├── analyze.py                      ← pull submissions, z-score, summarize
│
└── template/                       ← the per-experiment scaffold (cloned by factory.py)
    ├── README.md                   ← per-unit usage
    ├── index.html
    ├── js/
    │   ├── experiment.js           ← jsPsych timeline; one block per rating dim
    │   └── stimuli-data.example.js ← shape of the bundle prepare_stimuli writes
    ├── prepare_stimuli.py          ← upstream CSV → stimuli-data.js
    ├── vercel.json
    ├── deploy.sh                   ← per-unit deploy (sam deploy + vercel)
    ├── get_data.sh                 ← per-unit data pull (curl get-data → CSV)
    ├── filter_incomplete.py        ← drop incomplete sessions
    │
    └── backend/
        ├── README.md               ← backend swap guide
        ├── aws/                    ← Option A: AWS SAM (S3 + Lambda + API Gateway)
        │   ├── template.yaml
        │   ├── samconfig.toml
        │   └── lambda/
        │       ├── getSlot/
        │       ├── submit-data/
        │       └── get-data/
        └── supabase/               ← Option B: Supabase edge functions + Postgres
            ├── schema.sql
            ├── functions/
            │   ├── get-slot/
            │   ├── submit-data/
            │   └── get-data/
            └── deploy.sh
```

---

## Per-participant lifecycle

```
crowd platform link with PROLIFIC_PID, STUDY_ID, SESSION_ID query params
  ↓
frontend (Vercel) loads index.html
  ↓
experiment.js calls GET /getSlot?PROLIFIC_PID=...
  ↓
backend returns slot S (0..N-1); idempotent if PID already seen
  ↓
frontend filters its stimuli bundle to {items whose slot == S}
  ↓
participant rates each item on each scale (jsPsych slider blocks)
  ↓
on_finish: POST /submitData with {participant_id, ratings: [...], metadata}
  ↓
backend writes one JSON record keyed by (timestamp, participant_id)
  ↓
frontend redirects to crowd platform completion URL
```

Offline analysis pulls all submissions via `/getData` and z-scores per participant per dimension.

---

## Setting up a new study

### 1. Pick a backend

The template ships two interchangeable backends. The frontend code is identical for both — only the API URLs change.

| Backend     | Pros                                               | Cons                                | When to pick     |
|-------------|----------------------------------------------------|-------------------------------------|------------------|
| AWS (SAM)   | Battle-tested at scale; full IAM controls          | Requires AWS account + SAM CLI      | You already pay for AWS |
| Supabase    | Free tier covers ~720 participants; no AWS needed  | Vendor lock-in; less granular auth  | Default for new projects |

See `template/backend/README.md` for the swap procedure.

### 2. Define your stimuli

Edit `template/prepare_stimuli.py`:
- Point it at your upstream data source (CSV, JSON, database).
- Specify the conditions you're balancing across.
- Specify the rating dimensions you'll collect.

The script writes `template/js/stimuli-data.js`, which is bundled into the frontend at build time.

### 3. Define your rating task

Edit `template/js/experiment.js`:
- Set the consent text and instructions.
- Specify rating dimensions (one slider block per dimension per stimulus).
- Set the trial timing constraints.

### 4. Deploy

```bash
# from template/ directory (single experiment)
bash deploy.sh

# OR from src/human_experiments/ (multi-condition campaign)
python factory.py    # materializes N variants
bash deploy_all.sh   # deploys every variant
```

### 5. Recruit

```bash
python deploy_recruiter.py    # creates one Prolific study per deployed URL
```

### 6. Analyze

```bash
python analyze.py    # pulls submissions, z-scores per participant per dim
```

---

## Design assumptions

The template hard-codes a few choices. Anywhere these don't fit, you'll need to edit:

| Choice | Where to change |
|--------|-----------------|
| **Continuous-scale ratings** (0–100 sliders) | Swap `html-slider-response` for `html-keyboard-response` or `survey-likert` in `experiment.js`. |
| **Between-subjects, balanced slots** | Replace the `getSlot` logic; e.g. for within-subjects, drop slot assignment entirely and use the full bundle per participant. |
| **One stimulus per trial** | jsPsych supports nested timelines; restructure `experiment.js` if presenting pairs / triples. |
| **Prolific as recruiter** | `getSlot` reads `PROLIFIC_PID` query param. For CloudResearch / MTurk, rename the param and update the Prolific deploy script. |
| **JSON-per-session storage** | The backend abstraction is "one document per session"; works equally with S3 keys, Postgres rows, or Firestore docs. |

---

## What's intentionally not in here

- **No analysis pipeline beyond z-scoring** — your domain-specific analysis lives outside this template.
- **No participant authentication** — relies on the crowd platform's PID system. If you're not using a recruiter, add an email/code gate.
- **No real-time monitoring dashboard** — `get-data` returns the full JSON dump; bring your own viewer.
- **No payment automation** — Prolific handles payment when you mark sessions as complete.
- **No piloting / sandbox mode** — the frontend has a "debug mode" when called without a PID; that's the extent.

---

## Provenance

The original (CreativityNeuro) deployment that this template was extracted from:
- 24 separate experiment instances (6 models × {AUT, TT} × {CN, CAA})
- N=720 participants
- ~$1.5K Prolific payments, ~$15 AWS bill

If you find a bug, the original code is in `llm_creativity_mech_interp/src/experiments/`.
