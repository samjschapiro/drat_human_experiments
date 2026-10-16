# 2026-10-12 — Dev deploy + acceptance run of Prit's meeting-order integration

## Summary
Deployed `prit/study-backend-integration` (025e424; contains `wasiq/session-backend`
and `main`) to dev unchanged and ran the dev acceptance checklist end to end with
browser automation. Everything automatable passed; no code changes were needed.

## Decisions recorded
- Session 1 order: same order for everyone in a lab meeting (Raven instructions read
  to the room), rotated across meetings via six `?session=1&order=N` URLs (Babak,
  Oct 2/7 meetings). Supersedes the per-student round-robin idea; slot now only picks
  the DRAT assignment. Session 2 order fixed (DRAT then SCTT).

## Verified on dev (https://drat-dev.vercel.app, app version 025e424)
- Migration 20261012 applied; regenerated manifest identical to committed one;
  Prit's node tests pass.
- API: Session 1 rejected without order 1–6, without consent, or with v1 protocol;
  same meeting URL → same order, different slots; resume with a different order URL
  rejected (order_mismatch); consent version/timestamp stored.
- Browser (Q-global stubbed, never contacted): consent decline → no session row.
  All six orders completed Session 1 (35/35 each) in ~12 min; executed task order
  matched stored order; exactly one raven_handoff + raven_return each; reload and
  device switch mid-session resumed correctly.
- Session 2: blocked without Session 1; three runs 22/22 (~16 min), same slot as
  Session 1, all 8 relation×size cells and 12 SCTT items; partial DRAT (3 words)
  saved with timed_out=true.
- Export: no IP/user-agent/name/email fields; `score_battery.py` (no embeddings)
  links both sessions per code.
- Public site: consent PDF served; answer keys, scoring, backend, docs, tests 404.

## Still open (study team / manual)
- Q-global identifier mapping, sample export, interrupted-Raven procedure.
- Supervised human pilot on a PBEL station; prod project + lock removal.
- Dev test codes TEST-101..TEST-130 loaded (TEST-101..107, 128..130 used by tests).
