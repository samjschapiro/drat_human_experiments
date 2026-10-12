# Next-phase implementation plan

Updated: October 12, 2026
Status: **approved by Prit; frontend and backend integration implemented, development deployment/pilot pending**

## Implementation progress — October 12, 2026

- Completed locally: stamped consent gate, six strict meeting-order URLs, stable
  Q-global self-registration link, supervised new-tab Raven checkpoint, order and
  consent audit fields, and hard minimum-exposure locks for all protocol-timed tasks.
- Verified: Pearson blocks cross-site framing with `X-Frame-Options: SAMEORIGIN`, so
  new-tab launch is the explicit implementation; local browser checks passed for
  consent decline/agreement, order 2, blank DAT rejection, and Raven link gating.
- Integrated: issued-code validation, session/event storage, server-side Session 2
  gate, fixed meeting-order validation, consent audit fields, protected export, and
  researcher reset/code tooling.
- Still pending: development deployment, Babak's deidentified Pearson score
  export/score-field decision, station reset and interrupted-Raven procedure, and
  the supervised pilot.

## Purpose

This plan translates the decisions from the October 2 and October 7 meetings with
Babak into the next implementation phase for the existing two-session Thinking
Tasks application. It updates the earlier local-prototype plan; it does not authorize
deployment, production data collection, or changes to IRB-approved wording.

## Sources reviewed

- `Oct2_meeting_transcript`
- `oct7_meeting_babak.md`
- `DRAT_Exp_Notes.md`
- `DRAT_Human_Exp/IRB-approved docs/Consent_DRAT_v3_tracked.pdf`
- Current participant flow in `src/human_experiments/battery/`
- `docs/STUDY_FLOW_IMPLEMENTATION.md`
- `docs/WASIQ_DEPLOYMENT_HANDOFF.md`

## Outcome of this phase

Produce a development build that:

1. shows the stamped IRB consent PDF and stops anyone who does not agree;
2. accepts only a pre-issued study code;
3. gives every participant in one lab meeting the same Session 1 task order;
4. opens Pearson Q-global through its self-registration page without handling
   Pearson credentials or personal information;
5. prevents manual blank submissions while still allowing timed tasks to expire;
6. persists and resumes both sessions through Wasiq's server-side session/event
   backend; and
7. passes a supervised development pilot before any production launch.

## Decisions established by the meetings

### Consent

- The participant must see the actual stamped consent PDF. Copying its text into an
  HTML page is not an acceptable substitute.
- The app must offer **I agree** and **I do not agree**.
- A participant who selects **I do not agree** must not enter the study or create a
  research-data session.
- The PDF wording and stamped document must not be edited by the implementation.

### Study codes and privacy

- The experiment application uses only a pre-issued study code; it does not request
  a participant's name, email address, or other direct identifier.
- Babak keeps the private identity-to-study-code key outside the application and
  repository.
- A syntactically valid but unissued code must be rejected by the production backend.
- Session 2 must be server-gated on a completed Session 1.
- October 2 included discussion of either one code across both sessions or a pair of
  linked codes. No final choice was captured. The current implementation continues
  using one code across both sessions until Babak explicitly approves paired codes.

### Pearson Q-global / Raven

- Use Pearson's Q-global self-registration page:
  `https://qglobal.pearsonassessments.com/qg/selfRegisterLogin.seam`.
- Babak creates a group session code for each lab meeting. The code may expire, so
  it should be created shortly before the meeting.
- The test code written in `DRAT_Exp_Notes.md` is a test artifact. It must not be
  committed to configuration, displayed in production, or treated as reusable.
- Q-global asks the participant for name, date of birth, and gender; email can be
  omitted. Those details go directly to Pearson. Thinking Tasks must not read,
  duplicate, transmit, or store them.
- Q-global remains the assessment and scoring authority. Thinking Tasks cannot
  inspect Pearson's cross-origin screen, verify completion automatically, or inject
  instructions into the Pearson assessment.
- Pearson expects spoken administrator instructions at its red/yellow/green
  instruction stages. Participants in the room therefore need to reach Raven at
  approximately the same time and wait for the researcher before advancing.
- Q-global may cache an active administration in the browser. The operational pilot
  must test consecutive participants on the same station and define the reset/sign-
  out procedure.
- Each live Pearson test consumes a licensed administration. Automated tests must
  use a local stub, and manual Pearson testing must stay within Babak's approved
  test allowance.

### Session 1 order

- Session 1 still has the six permutations of DAT, RAT, and Raven.
- Every participant attending the same lab meeting must receive the same order so
  spoken Raven instructions can be administered to the room together.
- Different lab meetings cycle through the six orders to preserve
  counterbalancing.
- Demographics remain at the end and are not part of the six-way rotation.
- The agreed minimal operator workflow is six fixed Session 1 URLs, one for each
  order. The research team loads the chosen URL on every station and keeps the
  meeting-level order count.
- For the first approximately 20-person pilot, Raven should be second or third,
  rather than first, to expose synchronization problems.

### Response requirements

- A participant must not manually advance from a task screen without the required
  response content.
- A timed task may advance automatically at its deadline with partial or empty
  content; the saved record must say `timed_out=true`.
- Demographic questions remain optional.
- SCTT continues to require exactly three responses per item and remains self-paced.
- Participants cannot navigate backward to change submitted responses.

## Changes from the earlier plan

| Earlier assumption | Updated direction |
|---|---|
| Final Q-global URL was unknown | The stable Q-global self-registration URL is now known. |
| A unique Pearson link might be needed per participant | Use one self-registration URL and a fresh group session code per lab meeting. |
| Session 1 order was derived from each participant's assignment slot | Select one of six orders for the entire lab meeting; assignment slot no longer chooses Session 1 order. |
| Consent stayed entirely outside the app | Show the stamped consent PDF in the app with agree/decline controls. |
| Raven could be treated as an individual asynchronous handoff | Treat it as a supervised room checkpoint with spoken instructions. |
| Blank timed responses were always accepted | Block manual blank submissions; allow only timer-forced partial/empty saves. |

## Proposed participant and researcher workflow

### Before a lab meeting

1. Babak creates a fresh Q-global group session and records its session code on the
   authorized run sheet; the code is not added to Git or app configuration.
2. The researcher selects the next Session 1 order from the six-order rotation.
3. The same fixed-order app URL is loaded on all stations.
4. The researcher verifies that the consent PDF, app URL, Q-global page, CAPTCHA,
   and fresh group code work on a development station.
5. The researcher prepares Pearson's printed spoken-instruction pages.

### Session 1 participant flow

```text
Stamped consent PDF
  -> I agree / I do not agree
  -> enter pre-issued study code
  -> backend validates code and starts/resumes Session 1
  -> DAT/RAT/Raven in the lab meeting's selected order
  -> Raven waiting screen: do not advance until instructed
  -> open Q-global self-registration page
  -> participant enters group code and Pearson-required details directly in Q-global
  -> researcher gives spoken Pearson instructions to the room
  -> participant completes Raven and returns to Thinking Tasks
  -> BFI-10 and optional demographics
  -> server verifies expected events and marks Session 1 complete
```

If consent is declined, the app shows a neutral stop screen and stores no study
session. If Raven is interrupted or not completed, the app must stop at a researcher-
assistance screen rather than silently continuing.

### Session 2 participant flow

```text
Enter study code
  -> backend verifies completed Session 1 and restores its assignment slot
  -> eight DRAT blocks
  -> break
  -> orange attention check
  -> twelve SCTT items
  -> server verifies expected events and marks Session 2 complete
```

The consent display is proposed as a one-time Session 1 gate. Repeating it in
Session 2 requires Babak's explicit direction.

## Technical implementation plan

### Phase 1 — Configuration and terminology

Files:

- `js/study-config.js`
- `js/core.js`
- `js/study-code.js`

Changes:

1. Put the stable Q-global self-registration URL in `study-config.js`.
2. Keep the group session code out of all committed configuration and event data.
3. Standardize terminology in code and participant text:
   - `study_session`: the participant's Session 1 or Session 2;
   - `lab_meeting_order`: one of the six DAT/RAT/Raven orders.
4. Add and strictly validate a Session 1 order parameter with six accepted values.
   Production must fail clearly if Session 1 is opened without an approved order.
5. Provide six documented fixed-order URLs. All stations in one lab meeting use the
   same URL.
6. Stop deriving Session 1 order from `slot % 6`. Keep the slot for the participant's
   reproducible DRAT assignment and Session 2 linkage.
7. Persist both the order index and full order array in the session record and every
   event assignment.

Exit condition: two different study codes opened with the same fixed-order URL
receive the same Session 1 order, while their assignment slots may differ.

### Phase 2 — Stamped consent gate

Files:

- `index.html`
- `js/study-code.js`
- `core.js`
- `deploy.sh`
- `.vercelignore`
- one browser-safe copy of the approved PDF under the battery's public assets

Changes:

1. Add the approved stamped PDF as the only new public study document.
2. Render it in a scrollable browser PDF frame with a direct-open link for browsers
   that cannot display inline PDFs.
3. Add **I agree** and **I do not agree** controls before study-code entry and before
   any session record or assignment is created.
4. Continue only on explicit agreement. Decline shows a stop/notify-researcher page.
5. Record the consent document version and agreement timestamp only after agreement.
6. Update deployment staging and the Vercel allowlist to publish this PDF without
   exposing the rest of `DRAT_Human_Exp/`, answer keys, backend code, or scoring files.

Exit condition: the exact stamped PDF is visible in dev, agreement is explicit, and
declining creates no participant session or task event.

### Phase 3 — Pearson handoff and supervised checkpoint

Files:

- `js/tests/raven.js`
- `js/study-config.js`
- `js/save-client.js`

Changes:

1. Replace the placeholder with the stable self-registration page.
2. Add a clear pre-launch waiting screen: participants must stop until the researcher
   gives permission and the current group session code.
3. Run a small development spike to determine whether Q-global permits iframe
   embedding and whether CAPTCHA/cookies work there.
4. If Pearson blocks or destabilizes embedding, use an explicit new-tab handoff.
   Do not implement hidden fallback behavior; the approved launch mode must be one
   deliberate configuration.
5. Do not prefill or capture name, date of birth, gender, email, Pearson credentials,
   or the group session code.
6. Preserve `raven_handoff` and `raven_return`, adding only non-identifying metadata:
   launch mode, self-registration host, lab-meeting order, timestamps, and completion
   self-report.
7. Replace the current **Not completed** path with a researcher-assistance state that
   cannot silently advance to the next task.
8. Treat `raven_return` as participant self-report, never as verified Pearson
   completion. No Pearson callback or API is assumed.

Exit condition: each of the six orders reaches Q-global and returns to the correct
next task; no Pearson credential, group code, or personal field appears in app data.

### Phase 4 — Response validation and timeout behavior

Files:

- `js/countdown.js`
- `js/tests/dat.js`
- `js/tests/rat.js`
- `js/tests/drat.js`
- `js/tests/sctt.js`
- `js/tests/bfi10.js`
- `js/tests/attention-checks.js`

Changes:

1. Implement the timing rule once in the shared form/countdown path rather than
   duplicating inconsistent checks across tasks.
2. Timed DAT, RAT, and DRAT screens have no early manual-submission path. For the
   remaining self-paced forms, SCTT requires all three responses, BFI-10 requires
   every radio item, the orange check requires a nonblank answer, and demographics
   remain optional.
3. Timed tasks disable button and keyboard submission for the full configured
   duration. At zero, the shared path bypasses only blank-response validation,
   submits current content, and sets `timed_out=true`.
4. Keep SCTT self-paced so its native required fields cannot deadlock a timer.
5. Show a short inline message on rejected manual submission rather than clearing or
   changing the participant's responses.

Exit condition: timed tasks cannot advance early by button or keyboard, zero advances
automatically, partial timed data is preserved, and optional demographics remain
optional.

### Phase 5 — Production session and event integration

Owners: Prit and Wasiq jointly. The detailed backend contract remains in
`docs/WASIQ_DEPLOYMENT_HANDOFF.md`.

Files expected to change:

- `js/core.js`
- `js/save-client.js`
- `js/deploy-config.js`
- `backend/supabase/migrations/` through a new migration
- `backend/supabase/functions/`
- `backend/supabase/deploy.sh`
- `get_data.sh`

Required behavior:

1. `start-session` accepts a pre-issued study code, study-session number, and the
   validated lab-meeting order for Session 1.
2. The server rejects unknown codes without consuming a slot.
3. The server assigns one stable slot, returns saved item IDs, and resumes the same
   session idempotently.
4. Session 2 starts only after server-confirmed Session 1 completion and reuses its
   slot.
5. `save-block` authenticates the active session, makes `event_id` idempotent, and
   rejects conflicting duplicates.
6. `finish-session` verifies the exact expected item inventory before completion.
7. The production schema uses 260 assignment slots.
8. Research records and exports contain no source IP, user-agent, name, email, date
   of birth, gender copied from Pearson, or browser fingerprint.
9. Locally queued events retry before the participant continues, and the browser
   cache remains a recovery aid rather than the source of truth.
10. Protected export returns ordered session/event records compatible with
    `scoring/score_battery.py`.

Exit condition: a second approved browser can resume from server state, Session 2
cannot bypass Session 1, and all dev export/privacy checks pass.

### Phase 6 — Pearson score linkage

This phase cannot be finalized from the meetings alone.

1. Babak supplies one deidentified Q-global result export and identifies the Raven
   score field required for analysis.
2. Babak defines the authorized offline mapping from Pearson's name/date-of-birth
   record to the deidentified Thinking Tasks study code.
3. The authorized researcher produces a normalized file containing only:

   ```text
   study_code,standardized_score
   ```

4. Reuse the existing Raven import in `scoring/score_battery.py`.
5. Add a small Pearson-export normalizer only if the real export cannot be converted
   reliably without one. It must fail on missing, duplicate, or unmapped records.
6. The identity mapping and raw identifiable Pearson export remain outside Git,
   Vercel, Supabase, and participant event data.

Exit condition: a sample export joins exactly once to the correct deidentified
participant and produces no unmatched or duplicate identifiers.

### Phase 7 — Documentation and operator runbook

Update:

- `src/human_experiments/battery/README.md`
- `docs/HANDOFF.md`
- `docs/STUDY_FLOW_IMPLEMENTATION.md`
- `docs/WASIQ_DEPLOYMENT_HANDOFF.md`

Document:

1. the six Session 1 order URLs and order-rotation log;
2. how Babak creates a fresh Q-global group session code;
3. how the RA pauses the room, reads Pearson's printed instructions, and handles the
   help-hand screen;
4. what to do when CAPTCHA, group-code validation, browser cache, or Raven return
   fails;
5. how to reset a station between participants without deleting required study
   progress;
6. how to confirm the participant entered the assigned study code before departure;
7. how to export and normalize Raven scores without exposing the identity key.

## Development and pilot verification

### Automated/local checks

- JavaScript syntax checks and Python compilation pass.
- Existing 260-assignment generation and scoring checks still pass unchanged.
- All six fixed order URLs produce the exact configured order.
- Invalid/missing Session 1 order parameters fail visibly.
- Consent decline creates no saved session.
- Blank manual submission and timeout-forced submission are both tested for DAT,
  RAT, and DRAT.
- Resume does not duplicate consent, Raven, or task events.
- Export contains order index, full order, timestamps, and Raven self-report without
  personal information or a Pearson group code.

### Manual dev checks

- The stamped PDF renders and opens directly in the supported lab browser.
- Q-global self-registration opens through the approved launch mode.
- CAPTCHA and cookies work on a lab station.
- A fresh group session code works for concurrent participants.
- Participants can leave email blank as expected by the meeting walkthrough.
- The room can pause at Raven and follow the spoken red/yellow/green instruction
  sequence.
- The help-hand/sample recovery procedure works.
- An incomplete Raven attempt cannot silently continue.
- Two consecutive test participants on one computer do not inherit each other's
  cached Pearson administration.
- Public Vercel URLs return 404 for answer keys, backend files, scoring code, raw
  research materials, and every IRB file except the intended consent PDF.

### First supervised pilot

- Use approximately 20 participants.
- Choose an order with Raven second or third.
- Record arrival spread at the Raven waiting point and whether room-level verbal
  administration remains practical.
- Record Q-global code failures, CAPTCHA failures, help-hand interventions, cached-
  session issues, incomplete administrations, and app return failures.
- Babak performs the final application review before scheduling participant data
  collection beyond the pilot.

## Remaining approval questions

These must be answered before their affected phase is considered complete:

1. Is one study code reused across both study sessions, or are two paired codes
   required?
2. Is consent shown only in Session 1, as proposed, or repeated in Session 2?
3. What is the confirmed lifetime of a Q-global group session code?
4. What exact station reset procedure prevents cached Pearson administrations from
   crossing participants?
5. What should the app do after an interrupted Raven test: retry immediately, wait
   for an RA, or end the session?
6. Which Q-global result column is the required standardized Raven score?
7. Who performs the identifiable Pearson-to-study-code mapping, and where is that
   mapping stored?
8. Does the server use a one-code allowlist, or a paired Session 1/Session 2 code
   registry?

## Ownership

| Owner | Next-phase responsibilities |
|---|---|
| Prit | Consent UI, fixed-order URLs, Pearson handoff UI, response validation, frontend/backend connection, local and browser QA, scoring import verification. |
| Wasiq | Pre-issued-code validation, session/event schema and endpoints, server-side Session 2 gate, secure dev deployment/export, privacy controls, deployment QA. |
| Babak | Fresh Q-global group codes, Pearson account/licensing, approved launch and interruption procedure, printed instructions, consent interpretation, identity linkage, score field, pilot and launch approval. |
| Research assistants | Load the correct order URL, issue/check study codes, administer spoken Raven instructions, handle help screens, verify completion, follow station-reset procedure. |

## Risks and controls

| Risk | Control |
|---|---|
| Pearson blocks iframe embedding | Confirmed by `SAMEORIGIN`; use the implemented explicit new-tab workflow. |
| Group session code expires | Create and preflight it immediately before the lab meeting; never hardcode it. |
| Pearson browser state leaks across participants | Test consecutive administrations and document a mandatory reset procedure. |
| Participants advance before spoken Raven instructions | Same order for the room, a visible app waiting screen, verbal warning, and active RA monitoring. |
| Pearson personal data enters the app | Do not prefill, intercept, or copy Pearson fields; normalize scores offline through an authorized researcher. |
| Participants use unissued or another person's code | Backend allowlist plus RA assignment/check; finalize one-code versus paired-code policy. |
| Required HTML fields prevent timer submission | Shared timeout path explicitly bypasses only client-side required validation and records `timed_out=true`. |
| Consent PDF deployment exposes other protected files | Stage and allowlist only the single approved PDF. |
| Live testing consumes paid Pearson administrations | Use a local stub for automation and reserve live tests for Babak-approved manual checks. |

## Approval boundary

Approval of this document authorizes implementation on Prit's feature branch and a
development deployment for supervised testing. It does **not** authorize:

- merging into `main`;
- production deployment or participant launch;
- editing the stamped consent document or Pearson instructions;
- storing Pearson credentials, group session codes, names, dates of birth, gender,
  email, or the private study key in the application;
- implementing an unapproved Pearson API integration; or
- using additional paid Pearson administrations beyond Babak's test allowance.
