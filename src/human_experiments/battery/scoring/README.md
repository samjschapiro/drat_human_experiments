# Offline scoring

The frontend captures **raw responses only**. All scoring happens here, after data
collection, because three of the four tests need resources too heavy or too
sample-dependent to run in the browser:

| Test | Scorer | Needs |
|------|--------|-------|
| **RAT** | `score_rat.py` | answer key (`item_banks/rat_cra_144.json`) — pure Python |
| **SCTT** | `score_sctt.py` | fluency: pure Python · creativity: fine-tuned RoBERTa (OSF 439zs) |
| **DAT** | `score_dat.py` | GloVe word embeddings (gensim) |
| **DRAT** | `score_drat.py` | GloVe embeddings + the random-noun pool |

`score_battery.py` orchestrates all four over the JSON-per-session dump.

## Setup

```bash
pip install -r requirements.txt          # numpy, pandas, gensim
```

The embedding model is downloaded on first use by gensim (`glove-wiki-gigaword-300`
≈ 376 MB; the paper uses the larger `glove.840B.300d` ≈ 2 GB — point `--glove` at a
local copy for an exact match).

## Run

```bash
# 1. Pull submissions (writes data/battery_raw.json)
cd .. && bash get_data.sh supabase && cd scoring

# 2. Score everything
python score_battery.py \
    --input ../data/battery_raw.json \
    --glove glove-wiki-gigaword-300        # omit to skip DAT/DRAT

# Outputs:
#   scores.csv          — one wide row per participant (dat/rat/drat/sctt)
#   sctt_responses.csv  — long, one row per SCTT answer (for the RoBERTa scorer)
```

Without `--glove`, RAT accuracy and SCTT fluency are still produced; DAT/DRAT
columns are left blank with a printed warning.

## SCTT creativity scores

`sctt_responses.csv` has the columns the OSF scorer expects (`item, task, prompt,
response`). Two ways to get creativity predictions:

1. **Hosted (easiest):** upload it to the CAP SCTT-AI tool
   (https://cap.ist.psu.edu/sctt-ai); join the returned `prediction` back by
   `participant_id` + `item_id` + `response_index`.
2. **Local:** download the fine-tuned RoBERTa dir from OSF `439zs` and pass
   `--sctt-model /path/to/model` to `score_battery.py` (needs `torch` +
   `transformers`).

## Notes on the algorithms

- **DAT** (Olson et al. 2021): first 7 valid in-vocab words, mean pairwise cosine
  distance × 100.
- **DRAT** (Schapiro et al. 2026): keep words whose max-similarity to the k anchors
  exceeds the 90th-percentile of the noun pool's anchor-similarities, then DAT-style
  distance over the survivors (need ≥ 3). Use `score_drat_composite()` to average
  across GloVe/FastText/SBERT as in the paper.
- **RAT**: string match vs the canonical solution (trailing-plural folded).
- **SCTT**: fluency is fixed at 3 responses/item by design, so the creativity model
  is the primary signal.
