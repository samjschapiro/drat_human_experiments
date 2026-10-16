# 2026-10-14 to 10-16: Prod launch, Babak's review, first pilot data, handoff docs

Branch `wasiq/pilot_fixes` (commits 15bff3e..HEAD). Dev and prod both run bdc8051;
the later commits change only documentation and the offline scorer.

## Infrastructure
- **Admin panel** at `/admin` (ed52ccf). Researchers sign in with an email from
  `RESEARCHER_EMAILS` plus `ADMIN_PASSWORD`. The panel sets the Q-global group
  code, shows each participant's progress and resets a visit (archives, never
  deletes). Changes are logged in `admin_audit`.
- **Researcher list:** Babak Hemmatian, Ignacio Urbina, Lav Varshney, Prit Mhala,
  Uyen Le and Wasiq Malik, the same in dev and prod.
- **Prod:**
  - Supabase project `DRAT-PROD`, ref `yqrjzjqjkdnkhgijbtyz`, region
    ca-central-1, Free plan, org "AI3".
  - Vercel site `drat-prod` (https://drat-prod.vercel.app).
  - `.env.prod` has its own `SUPABASE_API_KEY`, because the shared token only
    sees the dev project.
  - The export token, admin password and database password differ from dev;
    each server rejects the other environment's token (checked 10-16).
- **Prod end-to-end test** with `test@stonybrook.edu` (P-CAVGPCKZ): Visit 1 35/35
  and Visit 2 22/22.
- **Changes:** removed `COMPLETION_URL` (unused) and renamed the study
  "Creativity and Reasoning Tasks".

## Babak's review (2026-10-15, 14bdeef and later)
- **Instructions:** DAT, RAT, DRAT and SCTT now use the standard instruction text.
  The Next button stays disabled for a reading delay (DAT 20 s, RAT 15 s, DRAT
  30 s, SCTT 20 s, each SCTT part 8 s), with the time left shown on hover
  (ea408e6).
- **RAT example:** "sleeping / bean / trash → bag", CRA item 35, outside the 30
  scored items (6c37855).
- **DRAT:** an unscored 60 s practice set (`drat_practice`), followed by a "raise
  your hand" screen. The manifest marks it as optional, so finish-session does
  not require it.
- **SCTT:** the sections run in a fixed order (research question, hypothesis,
  experiment), each introduced by its own "Part" page.
- **Raven's:** Babak's 5-step page with click-to-copy for the code. The
  return button activates 10 minutes after Pearson was opened.
- **Demographics:** Babak's Qualtrics set plus "major" (bdc8051), and an optional
  final comment box taken from his list. Two wording changes, flagged to him at
  the time: "finish the study" became "continue", and "(Optional)" was added.
- **Resume:** instruction screens are skipped for tasks already started (d9a0dc5).

## Pilot data (prod, 2026-10-15)
- **Participants:** 18 students. All completed Visit 1 (order 1, not the planned
  order 2) and Visit 2. The data is complete, with no duplicates and no lost
  saves.
- **Attention checks:** 17/18 passed both; P-PHQ9SD93 failed both.
- **Lab clocks:** some lab computers' clocks are off by up to 101 s. The offset
  is constant per participant; the server's `received_at` is reliable.
- **P-9WYDTDPE** (10-16) stopped Visit 1 after DAT, at 31/35; unclear whether
  it is a real participant.
- **Backups:** prod dumps are in the gitignored `battery/data/prod/` and contain
  emails, so they must move to secure storage. The Supabase Free plan has no
  automatic backups.

## Docs and scoring (10-16)
- **New docs:**
  - `battery/AGENTS.md`: rules and architecture for coding agents.
  - `battery/CLAUDE.md`: points Claude Code to `AGENTS.md`.
  - Battery README rewritten as the run/deploy guide.
  - Root `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` now point to the battery.
- **Archived:** the October 12 handoff docs moved to `docs/archive/`, with a note
  saying they are historical.
- **Scorer fix:** `score_battery.py` crashed on the prod export because
  `raven_handoff` now saves a string response (`"opened_pearson"`). It now
  skips any response that is not a dict, and runs on the prod export (22
  participants, 160 DRAT rows).

## Open
- **Merge:** merge `wasiq/pilot_fixes` into `main`.
- **Babak's access:**
  - GitHub write access (the repo is under Sam's account);
  - Owner access on the Supabase org and the Vercel team;
  - the secrets, sent over a secure channel.
- **Sam's branch:** `add-creativity-battery` has 3 commits never merged
  (June–September). Ask Sam before deleting it.
- **Backups:** Supabase Pro, or a regular export routine.
- **Data residency:** prod is in ca-central-1, which may matter for the IRB
  data plan.
- **Dev database password:** rotate it.
- **Comment box:** decide whether to keep it in Visit 1; its wording mentions
  "chat contents", which does not apply to this study.
