# Questions and blockers for Babak

Updated: October 2, 2026

## Purpose

These are the decisions and materials required from Babak/the study team before the
local two-session prototype can become an approved dev deployment. The first section
is the immediate Pearson Q-global/Raven blocker. No implementation should guess these
answers.

## 1. Pearson Q-global / Raven — hard blockers

1. What exact licensed Q-global URL should the study use?
2. Should Thinking Tasks embed Q-global, open it in a separate tab/window, or pause
   while a researcher launches it separately?
3. Who signs into Q-global and starts each administration: the participant or an RA?
4. Will every PBEL station already have an authenticated Q-global session, and does
   the license permit the planned number of simultaneous administrations?
5. Is the Q-global examinee ID exactly the deidentified Thinking Tasks study code
   (for example, `DRAT-001`), or does Q-global create a separate ID?
6. If Q-global creates a separate examinee ID, who creates it, where is the mapping
   stored, and how should the exported score be linked back to the study code?
7. Please confirm that no name, email, NetID, or other direct identifier should be
   entered in Thinking Tasks or sent in the Q-global handoff.
8. What exact instructions should participants and RAs see before opening Raven and
   after returning?
9. What is the approved return mechanism: close the Q-global tab, switch back to the
   original tab, follow a return link, or have the RA resume Thinking Tasks?
10. What should happen when Raven is not started, is interrupted, times out, or is
    abandoned? May the participant retry, continue the remaining Session 1 tasks, or
    must the session stop?
11. Is participant/RA self-report sufficient to record Raven completion, or is a
    Q-global confirmation required?
12. Please provide one deidentified sample Q-global score export with its real column
    headers and representative values.
13. Which exact Raven standardized-score column should be retained for analysis?
    Should any other Raven fields be retained, and which fields must be discarded?
14. Is the intended workflow a manual export and offline merge, as the supplied
    documents imply, or is an automated Pearson API integration required and
    approved under the license?
15. Who exports the scores, who verifies unmatched/duplicate examinees, and when is
    the export merged with the two Thinking Tasks sessions?

### Current verified implementation boundary

- Raven is counterbalanced with DAT and RAT in Session 1.
- Thinking Tasks can open one configured HTTPS link in a separate tab.
- It records a handoff event and a participant-reported return/completion event.
- Offline scoring can merge an already-normalized CSV containing
  `study_code,standardized_score`.
- It does not authenticate to Q-global, create an examinee, pass an identifier,
  verify completion, retrieve a score, or parse Pearson's native export.

A URL alone does not resolve the remaining integration.

## 2. Study identity and participant flow

1. What is the final study-code format, and who issues the code at Session 1?
2. How should an RA recover a mistyped or forgotten code without entering identity
   information into Thinking Tasks?
3. Is the same code always used for both sessions and the Q-global export?
4. Where does approved consent occur, and should Thinking Tasks contain any consent
   confirmation or only begin after the external consent process?
5. Please approve the final participant-facing wording for study entry, task
   transitions, breaks, completion, and error/recovery screens.
6. May a participant continue Session 1 when Raven is incomplete, and can Session 2
   ever begin before a valid Raven result exists?

## 3. Final scoring resources

1. Please provide or approve the exact DRAT random-noun pool used to compute the
   utility threshold.
2. Please confirm the production GloVe, FastText, and Sentence-BERT resources and
   versions for final DAT/DRAT scoring.
3. Please confirm that CAP SCTT-AI is the scoring authority for SCTT and identify who
   performs the upload/download round trip.

## 4. Deployment and lab operation

1. Is a station passcode, PBEL network restriction, or researcher authentication
   required before a participant can enter a study code?
2. Who is authorized to start, resume, invalidate, or repeat a participant session?
3. Which PBEL browsers and station configuration must be supported, including popup
   rules for Q-global?
4. Who gives final approval after the supervised dev pilot, and what evidence must be
   reviewed before production launch?

## Minimum answers needed to unblock the Pearson dev pilot

- Final Q-global URL and opening method.
- RA/participant sign-in and launch procedure.
- Study-code versus Q-global-examinee-ID rule.
- Approved return, interruption, and retry procedure.
- Deidentified sample export and exact standardized-score field.
- Confirmation of manual export versus approved automated integration.
- Approved participant/RA wording.

## Copy/paste message to Babak

Hi Babak,

We have implemented the local Session 1 Raven handoff shell: Raven is
counterbalanced with DAT and RAT, the app can open an approved HTTPS link, and it
records handoff and participant-reported return events. Offline scoring can merge a
normalized Raven score file by deidentified study code.

To complete and test the real Q-global workflow, could you please provide or confirm:

1. the final Q-global URL and whether it should be embedded, opened in a new tab, or
   launched separately by an RA;
2. who signs in and starts each administration;
3. whether the Q-global examinee ID is the DRAT study code or a separate identifier;
4. the approved return, interruption, and retry procedure;
5. one deidentified sample score export and the exact standardized-score column; and
6. whether score export/merge should remain manual or an approved Pearson API
   integration is required?

We will not put Raven items, participant identities, Pearson credentials, or the
private study key in the application or repository.

Thank you.
