# 2026-10-01 — Battery: first live deploy, dev/prod split

## Summary
Deployed the battery to Supabase + Vercel, verified it end to end on the live
site, then split deployment into separate dev and prod environments. Dev is live;
prod is deferred until the team creates its Supabase project.

## Tasks completed
- First live deploy (Supabase project `lvrspzwomnsxyoxptjlh`, now dev).
  Verified: full browser run saved to the DB; get-data 401 without token;
  RAT answer key, scoring code and backend files 404 on the site.
- `deploy.sh dev|prod` and `get_data.sh dev|prod`: shared tokens in repo-root
  `.env`, per-env settings in `.env.dev` / `.env.prod` (gitignored via `.env.*`).
  Frontend staged into `.deploy/drat-<env>/` with its own `deploy-config.js`;
  the committed one is empty (local debug only). Prod deploy requires typing `prod`.
- Visible DEV / DEBUG banners (old debug div was wiped by jsPsych; a user's test
  without `PROLIFIC_PID` silently ran in debug mode and saved nothing).
- `get_data.sh` CSV step uses stdlib csv (pandas not installed).
- Dev live at https://drat-dev.vercel.app; two test submissions in dev DB.

## Decisions
- Participants have no accounts: the study code is the login (IRB forbids
  names/emails). Server-issued per-session token for saves; resume by re-entering
  the code. Researchers later get Supabase Auth magic-link with an allowlist.
- Network restriction: station passcode as baseline; PBEL IP allowlist on prod
  as an optional layer pending Babak/Ignacio.

## Open questions (for Babak, meeting 2026-10-02)
- Code format (suffix for unguessability?), daily station passcode, IP allowlist,
  data-sharing opt-out recording, Supabase Pro, record-ID format, Session 1 order.

## Next steps
- Prod Supabase project + `.env.prod`; delete orphan Vercel project `battery`.
- Data contract with Prit; participants/sessions/blocks tables; code-entry flow,
  per-block saving, resume, completeness check, vendored jsPsych, backups.
