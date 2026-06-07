# Creativity Battery (DAT · RAT · SCTT · DRAT)

A configurable, **within-subjects** battery of four creativity/cognition tests,
built on the same serverless backend as the rating-study `template/` but with a
different frontend paradigm: participants *generate* responses (type words, solve
associations, write open-ended answers) rather than rate stimuli. Each participant
takes the included tests in a **counterbalanced order**; **scoring is offline**
(see `scoring/`).

| Test | Task | Item bank | Score |
|------|------|-----------|-------|
| **DAT** | type 10 maximally-different nouns (4 min) | none | mean pairwise embedding distance (Olson et al. 2021) |
| **RAT** | 3 cues → 1 connecting word, per item | Bowden & Jung-Beeman 144 CRA | accuracy |
| **SCTT** | 12 scenarios × 3 free-text responses | Beaty et al. 2026 (OSF 439zs) | fine-tuned RoBERTa creativity score |
| **DRAT** | 10 diverse nouns, each relatable to k anchors | your anchor sets + noun pool | utility-threshold + distance (Schapiro et al. 2026) |

## Layout

```
battery/
├── index.html                 ← jsPsych + plugins; loads modules then core.js
├── js/
│   ├── battery-data.js         ← GENERATED (window.BATTERY_CONFIG + ITEM_BANKS)
│   ├── battery-data.example.js ← bundle schema reference
│   ├── core.js                 ← engine: slot→(order,anchorSet), runs battery, submits
│   ├── countdown.js            ← timed-trial countdown + auto-submit
│   └── tests/{dat,rat,sctt,drat}.js   ← one self-registering module per test
├── prepare_battery.py          ← battery_config.yaml + item_banks/ → js/battery-data.js
├── battery_config.example.yaml ← which tests, order policy, per-test params
├── item_banks/                 ← RAT 144 CRA, SCTT items, DRAT anchors + noun pool
├── backend/                    ← Supabase / AWS (copied from template, get-data adapted)
├── deploy.sh · get_data.sh · vercel.json
└── scoring/                    ← offline pipeline (see scoring/README.md)
```

## Quickstart

```bash
# 1. Configure the battery (which tests, order policy, timings) and DRAT anchors
$EDITOR battery_config.example.yaml
$EDITOR item_banks/drat_anchors.example.json   # → save as drat_anchors.json
$EDITOR item_banks/drat_noun_pool.example.txt  # → save as drat_noun_pool.txt

# 2. Generate the client bundle. Note the printed TOTAL_SLOTS.
python prepare_battery.py --config battery_config.example.yaml

# 3. Set TOTAL_SLOTS in backend/supabase/schema.sql (generate_series upper bound
#    = TOTAL_SLOTS - 1) and export it, then deploy backend + frontend.
export COMPLETION_URL='https://app.prolific.com/submissions/complete?cc=XXXX'
export TOTAL_SLOTS=160
bash deploy.sh supabase

# 4. Test locally first: open index.html with no PROLIFIC_PID → debug mode
#    (slot 0, no submission; the payload is logged to the console).

# 5. Recruit on Prolific with:
#    https://<deploy>.vercel.app?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}

# 6. Collect + score
bash get_data.sh supabase
cd scoring && pip install -r requirements.txt
python score_battery.py --input ../data/battery_raw.json --glove glove-wiki-gigaword-300
```

## Deploying the frontend to Vercel

The frontend is a static site (no build step). **Only `index.html`, `js/`, and
`vercel.json` are deployed** — `.vercelignore` excludes `item_banks/` (RAT answer
key!), `backend/`, `scoring/`, and all build scripts, so nothing sensitive is ever
served publicly.

Deployment config (`API_BASE`, `COMPLETION_URL`) lives in `js/config.js`
(gitignored; `window.BATTERY_RUNTIME`). `prepare_battery.py` writes a placeholder
stub; `deploy.sh` overwrites it with real values at deploy time, so the tracked
`core.js` is never mutated.

**Recommended (one command, backend + frontend):**

```bash
export COMPLETION_URL='https://app.prolific.com/submissions/complete?cc=XXXX'
export TOTAL_SLOTS=160
bash deploy.sh supabase      # deploys backend, writes js/config.js, runs `vercel --prod`
```

**Frontend only (manual), e.g. for a preview before the backend exists:**

```bash
python prepare_battery.py --config battery_config.example.yaml   # ensures js/config.js stub
# (optional) cp js/config.example.js js/config.js and fill in real URLs
vercel            # first run: link/create the project (root = this dir)
vercel --prod     # promote to production
```

In local debug mode (no `PROLIFIC_PID`) the API is never called, so a frontend-only
deploy is fully walkable; real submissions just need `API_BASE` set in `js/config.js`.

> Project root: run `vercel` **from this `battery/` directory** (or set the Vercel
> project's Root Directory to `src/human_experiments/battery`). The repo is a
> monorepo, so deploying the whole repo root would be wrong.

## How it works

- **Configurable inclusion / order.** `included_tests` decides which modules run;
  `order_policy` (`latin_square` | `full_permutations` | `explicit`) decides how
  test order is counterbalanced. The order list is precomputed by `prepare_battery.py`
  and shipped in `BATTERY_CONFIG.orders`.
- **Slot = balanced counter.** The backend's `claim_slot()` (atomic, idempotent,
  dropout-self-healing) is reused unchanged. `core.js` decodes the integer slot into
  `orderIndex = slot % n_orders` and `anchorSetIndex = ⌊slot/n_orders⌋ % n_anchor_sets`,
  so order × DRAT-anchor-set stay jointly balanced. `TOTAL_SLOTS` must equal
  `n_orders × n_anchor_sets × replications_per_cell`.
- **One JSON per session.** On finish, `core.js` POSTs `{participant_id, slot,
  order_index, order, anchor_set_index, responses:[…], client_metadata}`. Each
  `responses[i]` is one test trial (`test, item_id, response, rt, timed_out`).
- **Answer keys never ship.** `prepare_battery.py` strips RAT solutions from the
  bundle; the scorer reads them from `item_banks/`.

See `DESIGN_NOTES.md` for the *why* behind these choices, and `../DESIGN_NOTES.md`
for the shared backend rationale.

## Adding or modifying a test

Each test is a self-registering module in `js/tests/<id>.js`:

```js
window.BATTERY_MODULES["<id>"] = {
  id: "<id>",
  buildTimeline(cfg, ctx) { /* return jsPsych trial[] */ }
};
```

`cfg` is `BATTERY_CONFIG.tests["<id>"]`; `ctx` provides `{ jsPsych, participantId,
slot, order, anchorSetIndex, itemBank, seededShuffle, makeCountdown }`. Tag every
task trial `data:{ test:"<id>", item_id, battery_tag:"task" }` so the engine picks
it up. Add the module's `<script>` to `index.html` (before `core.js`), add it to
`included_tests`, and write a matching scorer in `scoring/`.
