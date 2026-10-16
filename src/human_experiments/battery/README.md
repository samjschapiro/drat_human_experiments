# Creativity and Reasoning Tasks (DRAT human study battery)

The two-visit, in-person battery for the DRAT human study (IRB2026-00448).
Participants sign in with their Stony Brook email.

- **Visit 1:** consent, then DAT, RAT and Raven's (Pearson Q-global, in a new tab)
  in the lab meeting's order, then BFI-10 and demographics. That is 35 saved items.
- **Visit 2:** a DRAT practice set, the 8 DRAT sets, a break, the attention check
  and the 12 SCTT items. That is 22 saved items, plus the practice set.

Every answer is saved to the server as soon as it is given. A reload or a crash
resumes at the first unsaved task.

| Environment | Participant site | Admin panel | Use it for |
|---|---|---|---|
| dev | https://drat-dev.vercel.app | https://drat-dev.vercel.app/admin | Testing. Shows a DEV banner. Test data only. |
| prod | https://drat-prod.vercel.app | https://drat-prod.vercel.app/admin | Real participants. Never wipe it. |

The two environments use separate Supabase projects and separate Vercel projects,
so a dev deploy can never write to the prod database.

## Running a lab session

Every station in a Visit 1 meeting opens the same URL, which fixes the task order:

| Order | Visit 1 URL | Task order |
|---|---|---|
| 1 | `https://drat-prod.vercel.app/?session=1&order=1` | DAT → RAT → Raven's |
| 2 | `https://drat-prod.vercel.app/?session=1&order=2` | DAT → Raven's → RAT |
| 3 | `https://drat-prod.vercel.app/?session=1&order=3` | RAT → DAT → Raven's |
| 4 | `https://drat-prod.vercel.app/?session=1&order=4` | RAT → Raven's → DAT |
| 5 | `https://drat-prod.vercel.app/?session=1&order=5` | Raven's → DAT → RAT |
| 6 | `https://drat-prod.vercel.app/?session=1&order=6` | Raven's → RAT → DAT |

Visit 2 uses `https://drat-prod.vercel.app/?session=2` and is locked until that
email has finished Visit 1.

Before Raven's, set the day's Q-global group session code in the admin panel. The
participant page picks it up within a few seconds. The admin panel also shows each
participant's progress and can reset a visit; a reset keeps the old data.

## Making changes

### One-time setup

1. **Accounts.** Ask a current admin to add you to:
   - this GitHub repository, with write access;
   - the Supabase organization "AI3", which holds `DRAT-DEV` and `DRAT-PROD`;
   - the Vercel team that holds `drat-dev` and `drat-prod`.
2. **Tools.** Install `git`, `python3` (3.10+), Node.js 18+ (the scripts call the
   Supabase and Vercel CLIs through `npx`) and `curl`.
3. **Secrets.** Create three gitignored files at the repository root, using
   [`.env.example`](../../../.env.example) as the template. A value in `.env.dev`
   or `.env.prod` overrides the same key in `.env`.

   | Key | File | Dev and prod | What it is |
   |---|---|---|---|
   | `SUPABASE_API_KEY` | `.env` (and `.env.prod`) | Different | Supabase personal access token (supabase.com/dashboard/account/tokens). Prod has its own, because the shared one cannot see `DRAT-PROD`. |
   | `VERCEL_API_KEY` | `.env` | Shared | Vercel token (vercel.com/account/tokens) |
   | `SUPABASE_PROJECT_REF` | `.env.<env>` | Different | `DRAT-DEV` or `DRAT-PROD` project ref |
   | `DB_PASSWORD` | `.env.<env>` | Different | That project's database password |
   | `DATA_EXPORT_TOKEN` | `.env.<env>` | **Different** | Researcher token for `get_data.sh` and `admin.sh` (`openssl rand -hex 32`) |
   | `ADMIN_PASSWORD` | `.env.<env>` | **Different** | Password for that site's `/admin` panel |
   | `RESEARCHER_EMAILS` | `.env.<env>` | Same list | Emails allowed into `/admin`, comma-separated |

   The export token and admin password are deliberately different per
   environment, so a dev credential can never read or change prod data. Each
   server rejects the other environment's token. The server secrets are set
   from these files on every deploy, so after changing a value, run
   `bash deploy.sh <env>` to apply it.

   Get the values from a current admin over a secure channel. Never commit these
   files or paste them into Slack or email.

### Workflow

Using a coding agent? Point it at [`AGENTS.md`](AGENTS.md) first. It has the safety
rules for prod data and the architecture.

1. Start a branch from `main`. Never commit to `main` directly:
   ```bash
   git checkout main && git pull
   git checkout -b <your-name>/<short-description>
   ```
2. Edit the code. The participant-facing text lives here:

   | What | File |
   |---|---|
   | DAT and RAT instructions | `js/sessions/session1.js` |
   | DRAT and SCTT instructions, SCTT part pages | `js/sessions/session2.js` |
   | Raven's handoff page | `js/tests/raven.js` |
   | BFI-10 | `js/tests/bfi10.js` |
   | Demographics | `js/tests/demographics.js` |
   | Sign-in, consent and visit screens | `js/study-code.js` |
   | Task orders, consent PDF, Q-global link | `js/study-config.js` |

3. Preview it locally. Without a backend, data stays in the browser and a
   "LOCAL PREVIEW" banner shows:
   ```bash
   python3 -m http.server 8001
   # open http://127.0.0.1:8001/?session=1&order=1
   ```
4. Run the checks:
   ```bash
   node tests/online-store.test.js && node tests/study-flow-config.test.js
   python3 prepare_backend_manifest.py
   ```
5. Deploy to dev and take the changed screens there:
   ```bash
   bash deploy.sh dev
   ```
   One command deploys both halves. It rebuilds the backend manifest, applies
   database migrations, sets the server secrets, deploys the Supabase Edge
   Functions, and publishes the frontend to Vercel.
6. Commit, push, and open a pull request into `main`. After merging, deploy prod
   from an up-to-date `main`:
   ```bash
   git checkout main && git pull
   echo prod | bash deploy.sh prod   # or run it plain and type 'prod' at the prompt
   ```
   Each deploy stamps the git commit into every saved answer (`app_version`), so
   deploy prod only from a clean, committed `main`. A tree with uncommitted
   changes is recorded as `<sha>-dirty`.

If you change which items a visit saves, finish-session will reject visits that
don't match. Examples are adding or removing a task, a SCTT item or a DRAT set. In
that case, update `prepare_backend_manifest.py` and the counts it prints (Visit 1 =
35, Visit 2 = 22). Test a full visit on dev before deploying prod.

### Data

```bash
bash get_data.sh prod     # data/prod/: raw JSON plus participant, session and event CSVs
bash admin.sh prod status # every participant's visit 1/2 progress
```

`data/` is gitignored. Participant emails are stored only in the `participants`
table; every other table uses the study code. Exports and backups contain those
emails, so keep them on secure university storage, never in git, Slack or email.
The Supabase Free plan has **no automatic backups**, so run `get_data.sh prod`
after every lab session.

## About the battery

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
| **DRAT** | 10 diverse nouns, each relatable to k anchors | 260 assignments built from the study's anchor workbooks | utility-threshold + distance (Schapiro et al. 2026) |

## Layout

```
battery/
├── AGENTS.md                   ← rules and architecture for coding agents (read first)
├── index.html                  ← participant page: jsPsych 7.3.4 + plugins, then js/
├── admin.html                  ← researcher panel (/admin)
├── js/
│   ├── core.js                 ← main(): sign-in, start-session, builds the visit, saves, finishes
│   ├── study-code.js           ← email, consent and visit screens
│   ├── study-config.js         ← protocol version, the 6 Visit 1 orders, consent PDF, Q-global URL
│   ├── save-client.js          ← localStorage + /save-block event store
│   ├── countdown.js            ← task timers and reading delays
│   ├── sessions/session{1,2}.js ← each visit's timeline and its instruction text
│   ├── tests/                  ← dat, rat, sctt, drat, raven, bfi10, demographics, attention-checks
│   ├── admin.js                ← admin panel logic
│   ├── battery-data.js         ← GENERATED by prepare_battery.py (RAT and SCTT items, task settings)
│   ├── study-materials.js      ← GENERATED by prepare_study_materials.py (260 DRAT assignments)
│   └── deploy-config.js        ← empty in git; deploy.sh writes one per environment
├── assets/                     ← consent PDF
├── item_banks/                 ← RAT 144 CRA items (with solutions), SCTT items
├── backend/supabase/           ← Edge Functions, migrations, backend deploy script
├── prepare_battery.py          ← battery_config.example.yaml + item_banks/ → js/battery-data.js
├── prepare_study_materials.py  ← DRAT workbooks (not in git) → js/study-materials.js
├── prepare_backend_manifest.py ← browser bundles → the server's list of expected items
├── deploy.sh · admin.sh · get_data.sh ← take `dev` or `prod`
├── tests/                      ← node tests for the event store and study config
├── scoring/                    ← offline scoring (see scoring/README.md)
├── data/                       ← (gitignored) exports
└── .deploy/                    ← (gitignored) staged frontend per environment
```

## How it works

[`AGENTS.md`](AGENTS.md) has the full picture: the request flow, the manifest of
expected items, the database tables and the generated files. In short:

- **The server decides.** `start-session` maps the email to a study code, and
  keeps each participant's slot, Visit 1 order and consent. It also locks Visit 2
  until Visit 1 is complete.
- **Every answer is saved on its own.** The answer is written to localStorage,
  then sent to `save-block`, which stores each item once and rejects anything
  outside the manifest. `finish-session` completes a visit only when all 35
  (Visit 1) or 22 (Visit 2) items are saved.
- **Visit 1 order comes from the lab URL** (`order=1..6`), so a whole lab meeting
  reaches Raven's together. The slot (0–259) only selects the participant's DRAT
  sets for Visit 2.
- **Answer keys never ship.** `prepare_battery.py` strips the RAT solutions from
  the browser bundle; the scorer reads them from `item_banks/`.
- **Scoring is offline,** from the exported data (`scoring/`).

`DESIGN_NOTES.md` explains why these choices were made.

## Adding or changing a task

- **Timed tasks** (`dat`, `rat`, `sctt`, `drat`) register in
  `window.BATTERY_MODULES["<id>"] = { id, buildTimeline(cfg, ctx) }`. `cfg` is
  `BATTERY_CONFIG.tests["<id>"]`, merged with the instruction text from the
  session file.
- **The other screens** (`raven`, `bfi10`, `demographics`, `orangeCheck`) are
  functions on `window.STUDY_MODULES`.
- **Building a visit:** `js/sessions/session1.js` and `session2.js` call these
  modules to assemble the visit.
- **Making a trial saveable:** give it
  `data: { test: "<id>", item_id: "<unique id>", battery_tag: "task" }`.
  Instruction screens leave out `battery_tag`.
- **Adding a new file:** add its `<script>` to `index.html` before the session
  files and `core.js`.
- **Changing which items a visit saves:** follow "Saved items and the manifest"
  in `AGENTS.md`, then add the matching scorer in `scoring/`.
