# DRAT Human Experiments

Online experiment platform for administering four creativity/cognition tests to
crowd-sourced human participants and scoring their responses:

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

## The battery platform

The core deliverable lives in [`src/human_experiments/battery/`](src/human_experiments/battery/):
a configurable, **within-subjects battery** where each participant takes some or all
of the four tests in a counterbalanced order, in one browser session.

- **Frontend:** static HTML + jsPsych 7. Each test is a self-registering module;
  include / exclude / reorder them via config.
- **Backend:** serverless (Supabase Edge Functions + Postgres, or AWS Lambda). One
  JSON per completed session; atomic balanced assignment of test order and DRAT
  anchor set.
- **Scoring:** offline Python pipeline — embeddings for DAT/DRAT, answer-key match
  for RAT, the RoBERTa model for SCTT.

It is adapted from the sibling rating-study scaffold in
[`src/human_experiments/template/`](src/human_experiments/template/), reusing its
backend almost verbatim. See
[`src/human_experiments/battery/README.md`](src/human_experiments/battery/README.md)
for full usage and
[`src/human_experiments/battery/DESIGN_NOTES.md`](src/human_experiments/battery/DESIGN_NOTES.md)
for the design rationale.

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
    ├── battery/              ← DAT · RAT · SCTT · DRAT within-subjects battery
    │   ├── js/               ← jsPsych engine + per-test modules
    │   ├── item_banks/       ← RAT 144-CRA, SCTT items, DRAT anchors + noun pool
    │   ├── backend/          ← Supabase / AWS serverless backend
    │   ├── scoring/          ← offline DAT/RAT/SCTT/DRAT scorers
    │   └── prepare_battery.py
    └── template/             ← original rating-study scaffold (reference)

configs/        ← experiment configs (per track)
scripts/        ← thin bash wrappers around Python entry points
docs/           ← repo_usage.md, research_context.md, tracks/, memos/, reports/
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
