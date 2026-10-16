# DRAT Human Experiments

Study platform for administering four creativity/cognition tests (plus Raven's,
BFI-10 and demographics) to Stony Brook students in the lab, and scoring their
responses:

| Test | What the participant does | Score |
|------|---------------------------|-------|
| **DAT** — Divergent Association Task | Type 10 nouns as different from each other as possible (4 min) | Mean pairwise embedding distance (Olson et al. 2021) |
| **RAT** — Remote Associates Test | See 3 cue words, type the one word that connects them | Accuracy vs. answer key (Bowden & Jung-Beeman 2003, 144-CRA set) |
| **SCTT** — Scientific Creative Thinking Test | Answer scientific scenarios (hypotheses, research questions, experiment design) | Fine-tuned RoBERTa creativity score (Beaty et al. 2026) |
| **DRAT** — Divergent Remote Association Task | Type 10 diverse nouns, each relatable to *k* anchor words | Utility-threshold + divergence (Schapiro, Gladstone, Black & Ji 2026) |

**DRAT** is the test introduced in *"Assessing the Creativity of Large Language
Models: Testing, Limits, and New Frontiers"* (arXiv:2605.13450). This repo collects
the **human baselines** for it alongside the three established instruments, so the
four can be compared within-person.

## The study platform

The live study lives in [`src/human_experiments/battery/`](src/human_experiments/battery/).
It is an in-person, two-visit study at Stony Brook (IRB2026-00448):

- **Visit 1:** DAT, RAT and Raven's (Pearson Q-global) in the lab meeting's order,
  then BFI-10 and demographics.
- **Visit 2:** eight DRAT sets, then the SCTT.

How it is built:

- **Frontend:** static HTML + jsPsych 7 on Vercel. Participants sign in with
  their Stony Brook email.
- **Backend:** Supabase Edge Functions + Postgres. Every answer is saved as it is
  given, and a visit completes only when every expected item is saved.
- **Scoring:** an offline Python pipeline. Embeddings for DAT/DRAT, answer-key
  match for RAT, and the CAP SCTT-AI model for SCTT.

Coding agents should start with
[`src/human_experiments/battery/AGENTS.md`](src/human_experiments/battery/AGENTS.md).
[`src/human_experiments/battery/DESIGN_NOTES.md`](src/human_experiments/battery/DESIGN_NOTES.md)
has the design rationale.

## Running, changing and deploying the study

The study runs as **Creativity and Reasoning Tasks** at https://drat-prod.vercel.app,
with a test copy at https://drat-dev.vercel.app. To run a lab session, set up
access, make a change, deploy it (`bash deploy.sh dev|prod`) or export data
(`bash get_data.sh prod`), follow
[`src/human_experiments/battery/README.md`](src/human_experiments/battery/README.md).

## Repository layout

This is a research-template repo organized into parallel **tracks** (see
[`docs/repo_usage.md`](docs/repo_usage.md) for the full conventions):

```
src/
└── human_experiments/        ← the experiment platform
    ├── battery/              ← the live DRAT study (frontend, backend, scoring)
    │   ├── js/               ← jsPsych engine + per-test modules
    │   ├── item_banks/       ← RAT 144-CRA items, SCTT items
    │   ├── backend/          ← Supabase Edge Functions + migrations
    │   ├── scoring/          ← offline DAT/RAT/SCTT/DRAT scorers
    │   └── prepare_battery.py
    └── template/             ← original rating-study scaffold (reference)

configs/        ← experiment configs (per track)
scripts/        ← thin bash wrappers around Python entry points
docs/           ← repo_usage.md, logs/ (work-session logs), archive/ (historical)
literature/     ← papers converted to markdown for reference
papers/         ← Overleaf-synced paper drafts (gitignored)
resources/      ← external reference material (gitignored)
```

## Conventions

- **Fail fast, no silent fallbacks** — this is a research repo; explicit behavior
  protects experiment integrity. See `docs/repo_usage.md`.
- **Python via `uv`** (`uv sync`, `uv run …`); JS frontend needs no build step
  (jsPsych is loaded from CDN).
- `data/`, `.env`, `papers/`, and `resources/` are gitignored.

## Status

Visit 1 is running with participants on prod. Visit 2 started on 2026-10-15.
Scoring runs offline from the exported data (`src/human_experiments/battery/scoring/`).
