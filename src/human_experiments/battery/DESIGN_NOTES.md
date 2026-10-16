# Design notes — creativity battery

The *why* behind the battery, separate from the README walkthrough.

> **History note (2026-10-16).** The battery started as a one-sitting, online
> Prolific battery that reused the rating template's backend (`getSlot`,
> `submit-data`). The live study is now an in-person, two-visit study with its own
> session backend (`start-session`, `save-block`, `finish-session`; see
> [`AGENTS.md`](AGENTS.md)). The two sections below on reusing the template
> backend and `getSlot` describe that earlier design; the rest still applies. For the shared
backend rationale (slot locking, JSON-per-session, service-role key), see
[`../DESIGN_NOTES.md`](../DESIGN_NOTES.md).

## Why a sibling `battery/` instead of generalizing `template/`

`template/` is the documented *rating* scaffold: its public contract is sliders over
`STIMULI_DATA × RATING_DIMENSIONS`, slot-as-Latin-square into a stimulus list. The
four creativity tests are a generation paradigm (everyone sees the same items;
responses are free text; scoring is offline). Folding both into one template means
either breaking that contract or threading `if (mode === 'battery')` through every
file. Instead we forked the part that is genuinely generic — the backend — and built
a parallel frontend. `template/` stays pristine; `battery/` is its own reference.

## Why the backend was reused almost verbatim

The backend never looked at rating semantics: `submit-data` stores the entire POST
body as a `payload` jsonb, and `claim_slot()` is a pure atomic counter. So the only
substantive backend change is one line in `get-data` (flatten `payload.responses`
instead of `payload.ratings`). `submit-data`, `claim_slot()`, and the `slots` table
are unchanged.

## Why reuse `getSlot` for counterbalancing instead of hashing the PID

We could assign test order client-side via `hash(PROLIFIC_PID) % n_orders` and skip
the round trip. But hashing is uniform only in expectation and does **not** self-heal
on dropout: if order #3 participants disproportionately quit, hashing never
compensates. The server's `claim_slot()` (lowest unclaimed, `FOR UPDATE SKIP LOCKED`,
idempotent) hands out a *balanced* sequence and refills gaps left by dropouts — the
exact property the rating scaffold introduced it for. We keep it and just reinterpret
the returned integer.

## Why Session 1 order is separate from the slot

The original battery decoded task order from the participant slot. The in-person
protocol instead requires everyone in one lab meeting to reach Raven together for
spoken instructions. Session 1 therefore reads one explicit `order=1..6` value from
the meeting URL, while the slot selects only the participant's validated DRAT
assignment for Session 2.

Researchers cycle the six fixed URLs across meetings and record that choice on the
run sheet. The backend must preserve both the meeting order and slot; it must never
silently derive one from the other.

## Why scoring is offline, not in the browser or an edge function

- **DAT / DRAT** need word embeddings (GloVe 840B ≈ 2 GB). Shipping that to the client
  is impossible and putting it in a serverless function means a multi-GB cold start.
- **DRAT** additionally needs a random-noun pool to compute each anchor set's 90th-
  percentile utility threshold — a corpus statistic, not a per-participant value.
- **SCTT** creativity scoring is a fine-tuned transformer; its training target (JRT θ)
  is a whole-sample quantity, so a lone participant cannot be scored in isolation in
  real time.

Only **RAT** could be scored live (string match), but keeping all four offline means
one uniform pipeline, no answer keys in client source, and the ability to re-score
with a better model later. The frontend's only job is faithful raw capture.

## Why timers actively submit instead of relying on `trial_duration`

jsPsych's `survey-text` / `survey-html-form` do not reliably auto-end on
`trial_duration`. Rather than depend on plugin-specific behavior, `countdown.js`
disables the submit control, blocks Enter-key form submission for the full protocol
duration, and clicks the submit button at zero. The plugin's normal submit path then
records whatever was typed (empty fields serialize as `""`, giving the DAT/DRAT
scorer a stable `w0..w9` vector). The interval and form listener are always cleared
in `on_finish` so neither can bleed into the next trial.

## Why RAT defaults to a 30-item subsample

The full Bowden & Jung-Beeman set is 144 items; at ~15 s each that is ~36 minutes —
untenable stacked with three other tests. `prepare_battery.py` subsamples (default 30,
easiest-first by the published 15 s solve-rate order) at build time, so every
participant sees the same set. Raise `n_items` or switch `item_select` for a
RAT-focused deployment; set it to `null` to administer all 144.

## Why SCTT fixes 3 responses per item

Beaty et al. deliberately cap responses at 3 to remove fluency as a confound — the
creative-quality model is the signal, not how many ideas a participant typed. We
mirror that: three fixed boxes per item, self-paced.

## What's intentionally not here

- **No real-time feedback / scores to participants** — scoring is a batch pass.
- **No within-test item balancing** — everyone sees the same item set; only *order*
  (of tests, and of items within a test) is randomized/counterbalanced.
- **No bundled SCTT model** — `scoring/` formats the input and documents the OSF /
  CAP scorer; the ~500 MB model is downloaded separately.
