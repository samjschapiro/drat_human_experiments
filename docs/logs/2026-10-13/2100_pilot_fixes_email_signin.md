# 2026-10-13 — Pilot fixes: Stony Brook email sign-in, DRAT wording, Pearson hand-off

Branch `wasiq/pilot_fixes` (on top of `prit/study-backend-integration` 025e424).
Prit is busy; Wasiq's side now owns these changes. Pilot (real paid participants,
data likely discarded) Thursday 2026-10-16 3:30; Babak checks prod end to end first.

## Decisions (Babak meeting, 2026-10-13)
- Participants identify with their Stony Brook email, asked BEFORE consent. Deviates
  from the IRB anonymization plan; Babak accepts the risk; emails may be deleted after
  sessions are verified.
- DRAT instruction: nouns "as different as possible from each other, but still related
  to the anchors" (Sam to confirm the final wording).
- Submit button hidden on timed tasks; participants spend the full time.
- Participant-facing "session" -> "visit". Visit 2 order fixed (DRAT, SCTT).
- Pilot runs Raven second in Visit 1 -> use `?session=1&order=2` (dat, raven, rat).

## Changes
- Backend: `participants(email pk, study_code)` + `participant_code()` (migration
  20261014). start-session takes `email`; mints an internal `P-XXXXXXXX` code on the
  first consented Visit 1; sessions/events only ever hold the code. Visit 1 without
  consent resumes an existing visit or returns `consent_required`; Visit 2 rejects
  unknown emails (`unknown_email`, typo guard). Admin reset/status accept an email;
  get-data returns `participants` separately -> `battery_participants.csv`.
- Frontend: email entry -> consent (new Visit 1 only) -> tasks; retryable errors shown
  inline. DRAT intro/prompt paraphrased from the paper (arXiv:2605.13450, Fig. 8 prompt
  + App. E.1 DAT rules). Raven: one "Open the Pearson test" button (new tab), then a
  bold "do not move forward until you have finished" screen. BFI-10 as a matrix.
  Countdown is deadline-based (background-tab throttling let 15 s RAT items run 30-49 s).
  Prod lock removed.

## Verified on dev (adc6cfd)
- API: non-SBU email, unknown Visit 2 email, Visit 1 without consent all rejected
  correctly; no participant created before consent; parallel first logins (mixed case)
  got one code; resume without consent; order mismatch; Visit 2 gate.
- Browser: decline -> no record; two Visit 1 runs (reload, device switch) 35/35 with
  consent shown once, Raven second, one Pearson tab, no visible submit on timed tasks;
  Visit 2 typo email -> inline error; Visit 2 22/22, 8 DRAT cells, partial words kept.
- Export: emails only in `participants`; admin status/reset by email works.

## Open
- Prod: token cannot create Supabase projects (Forbidden) -> create `DRAT-prod` in the
  dashboard; `.env.prod` already holds generated DB_PASSWORD and DATA_EXPORT_TOKEN.
- Q-global group session code on screen (admin-set field) — not built.
- Sam to confirm DRAT wording; Babak owner access on the prod project.
