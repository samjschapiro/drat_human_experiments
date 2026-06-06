# Design notes

The *why* behind specific choices, captured separately from the README walkthroughs.

## Why slot-based balancing instead of per-trial random assignment

Random per-trial assignment gives you, in expectation, equal ratings per stimulus. Slot-based assignment gives you that *exactly*: with 40 stimuli, 40 slots, and 10 stimuli per slot, each stimulus is seen by exactly `40/10 = 4` of the slots, and if every slot gets 10 participants, every stimulus gets exactly 40 ratings.

This matters when:

- You're running a small study (N ≤ 200) where Poisson variance in per-stimulus ratings would noticeably affect power.
- You're paying participants — over-rating some items is wasted money.
- You need to report "every stimulus received N ratings" cleanly in a paper.

For larger studies (N ≥ 1000) the variance is small enough that per-trial randomization is fine.

## Why JSON-per-session, not row-per-rating

Each `/submit-data` call writes one document containing the full session (all ratings, metadata, timing). Alternative: write one row per rating.

JSON-per-session wins because:

- One network round trip per participant instead of N.
- The participant is the unit of analysis (intra-participant z-scoring); keeping them grouped at the storage layer matches.
- Idempotency at the participant level: a single submission either succeeds or doesn't.

The trade-off: you need to flatten JSON → rows for analysis. `/get-data` does this in the response shape; `analyze.py` consumes it.

## Why an explicit `getSlot` endpoint instead of client-side hashing

You could deterministically assign slots client-side via `hash(PROLIFIC_PID) % TOTAL_SLOTS`. That avoids the round trip. It also produces uneven slot fills when participants drop out: a participant who fetches the URL, gets slot 5, and walks away leaves slot 5 idle — but two other participants both hash to slot 7 and you over-fill it.

Server-side `getSlot` is the cheapest fix: hand out the lowest-numbered unclaimed slot first. Drop-outs leave gaps in the front; recruitment fills them naturally.

## Why service-role key, not anon key

Supabase exposes two keys:

- `anon` — for client-side use; subject to row-level security.
- `service_role` — bypasses RLS; for trusted server-side use.

The edge functions run server-side (in Deno on Supabase's infra), so they use `service_role`. The frontend never sees it. Anon-key + RLS-policy approach would also work but requires writing policies for every table and reasoning about JWT claims; with edge functions in the middle, the simpler model is preferable.

## Why `FOR UPDATE SKIP LOCKED` in `claim_slot()`

Two participants might hit `/getSlot` within the same millisecond. Naïve `UPDATE slots SET taken_by=... WHERE taken_by IS NULL ORDER BY id LIMIT 1` is a race: both transactions can read the same row before either commits.

`FOR UPDATE SKIP LOCKED` makes the row-pick atomic: whichever transaction gets there first locks its chosen row; the second one transparently skips that row and picks the next unclaimed one.

S3-based slot assignment can't do this — S3 doesn't have row-level locks. The original AWS Lambda does an optimistic read-modify-write on a versioned JSON object, which is functional but uglier.

## Why `prepare_stimuli.py` is per-variant, not centralized

Two reasons:

1. Each variant typically has different upstream data with different schemas (e.g. one model's outputs are in `results.csv` with columns `prompt, response, score`, another's are in `outputs.json`). Centralizing forces a global format adapter.
2. Domain-specific stimulus selection (balance by object × condition? by prompt × condition? sample uniformly across the top quartile?) lives in this file. Keeping it next to the experiment instance makes it easy to grep for "how did this variant's stimuli get chosen".

The factory re-runs each variant's local `prepare_stimuli.py` after cloning, so customizing one variant doesn't bleed into others.

## Why no real-time monitoring dashboard

The `/get-data` endpoint is sufficient for the question "how many submissions have I received?" via:

```bash
curl ... | jq '.participants'
```

Anything more sophisticated (per-condition counts, drop-out rate) is one pandas snippet on the CSV from `get_data.sh`. Building a dashboard adds 200 lines of code and one more thing to maintain; the CLI suffices for studies of this scale.

## Why two backends instead of one

The AWS backend is included because:

- The original CN deployment used it; some readers want to reproduce or extend that.
- Some research groups have AWS credits but no Supabase budget.
- Sub-second cold starts on Lambda + global edge of CloudFront are real advantages for international participant pools.

The Supabase backend is the recommended default for new projects:

- Zero AWS dependency.
- One-command deploy.
- Atomic slot assignment is one SQL function.
- Free tier covers ~720 participants.

Adding a third (Cloudflare Workers + D1, Firebase + Firestore, etc.) is a matter of re-implementing the three endpoints. See `template/backend/README.md`.
