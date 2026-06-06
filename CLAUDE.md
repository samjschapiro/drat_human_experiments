# CLAUDE.md

Read and follow `docs/repo_usage.md` — it is the single source of truth for all development conventions, project structure, and workflow guidelines.

## Subdirectories with their own context

- **`src/human_experiments/`** — A reusable scaffold for online between-subjects rating studies (jsPsych frontend + serverless backend + Prolific integration). Self-contained with its own README, design notes, and per-experiment template. If your task touches anything in there, start with [`src/human_experiments/README.md`](src/human_experiments/README.md) and [`src/human_experiments/DESIGN_NOTES.md`](src/human_experiments/DESIGN_NOTES.md).
