# AGENTS.md

Read and follow `docs/repo_usage.md` — it is the single source of truth for all development conventions, project structure, and workflow guidelines.

## The DRAT study (start here for almost any task)

The live in-person study "Creativity and Reasoning Tasks" (IRB2026-00448) is in
[`src/human_experiments/battery/`](src/human_experiments/battery/). Before touching
it, read [`src/human_experiments/battery/AGENTS.md`](src/human_experiments/battery/AGENTS.md)
(safety rules for prod data, participant wording, Pearson and secrets; how the
pieces fit) and [`src/human_experiments/battery/README.md`](src/human_experiments/battery/README.md)
(running, deploying, exporting data).

## Subdirectories with their own context

- **`src/human_experiments/template/`** — the original scaffold for online rating
  studies (jsPsych + serverless backend + Prolific). Not used by the DRAT study;
  kept as a reference. See [`src/human_experiments/README.md`](src/human_experiments/README.md).

Documents in `docs/archive/` are historical and may contradict the current code.
