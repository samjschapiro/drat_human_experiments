# 2026-09-29 — Battery: make the Supabase + Vercel deploy path work

## Summary
Ran the inherited battery end to end, found that its Supabase/Vercel deploy path
could not work as shipped (and would have exposed data), fixed it on branch
`deploy-fixes`, and verified against a local Supabase stack.

## Tasks completed
- Clicked through the battery in headless Chromium (debug mode): all four tests
  run, no JS errors, payload complete (1 DAT, 1 DRAT, 30 RAT, 12 SCTT); RAT
  per-item timer auto-submits at 15 s with `timed_out: true`.
- Fixed deploy blockers:
  - Frontend called `/getSlot`, `/submitData`; Supabase functions are `get-slot`,
    `submit-data`. Frontend now uses the hyphenated names; AWS routes renamed to match.
  - `deploy.sh`'s sed looked for single-quoted placeholders but `core.js` used
    double quotes, so API_BASE was never substituted. Replaced with a committed
    `js/deploy-config.js` written by `deploy.sh`; `core.js` refuses real sessions
    if it's empty.
  - Supabase CLI layout: added `backend/supabase/config.toml`, moved
    `schema.sql` → `migrations/20260929000000_init.sql` (`db push` ignored it before).
  - Functions deploy with `verify_jwt = false` (participants have no session).
- Security / privacy:
  - `get-data` was unauthenticated; now requires `Authorization: Bearer $DATA_EXPORT_TOKEN`.
  - Dropped `source_ip` column (IRB: no IPs).
  - Revoked EXECUTE on `claim_slot()` from anon/authenticated (was callable via REST RPC).
  - `.vercelignore` allowlist: only `index.html` + `js/` are uploaded
    (previously the RAT answer key in `item_banks/` would have been public).
  - `get-slot` no longer silently defaults TOTAL_SLOTS to 40.
- `get_data.sh`: sends the token, fails on HTTP errors, keeps timestamped copies.

## Verification (local Supabase via Docker/OrbStack)
- Migration applies; `submissions` has no IP column; RLS on; anon/authenticated
  cannot execute `claim_slot`.
- get-slot idempotent per ID; submit-data stores; get-data 401 without/with wrong
  token, 200 with correct token.
- Full browser run with `PROLIFIC_PID=e2e_browser_1` → slot 3, all 44 responses stored.

## Not verified
- Real Supabase/Vercel deploy (accounts being created). `.vercelignore` allowlist
  behaviour needs checking on first deploy (try fetching `/item_banks/rat_cra_144.json` → expect 404).
- `template/` has the same bugs; left untouched (not used for DRAT).

## Next steps
- First real deploy with a test ID; then study-code entry, session gating,
  per-block saves, researcher auth (see plan discussed in session).
