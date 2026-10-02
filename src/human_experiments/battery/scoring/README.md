# Offline scoring

The frontend captures **raw responses only**. All scoring happens here, after data
collection, because three of the four tests need resources too heavy or too
sample-dependent to run in the browser:

| Test | Scorer | Needs |
|------|--------|-------|
| **RAT** | `score_rat.py` | answer key (`item_banks/rat_cra_144.json`) — pure Python |
| **SCTT** | `score_sctt.py` | fluency: pure Python · creativity: CAP SCTT-AI |
| **DAT** | `score_dat.py` | GloVe / FastText / SBERT embeddings |
| **DRAT** | `score_drat.py` | the same embeddings + the study's random-noun pool |

`score_battery.py` orchestrates all four over the JSON-per-session dump.

## Setup

```bash
pip install -r requirements.txt          # numpy, pandas, gensim
```

Paper-comparable composite scoring uses GloVe 840B 300d, FastText
`crawl-300d-2M`, and Sentence-BERT `all-mpnet-base-v2`. Static embeddings are
loaded by gensim. Install `sentence-transformers` to include SBERT.

## Run

```bash
# 1. Pull submissions (writes data/battery_raw.json)
cd .. && bash get_data.sh supabase && cd scoring

# 2. Score everything
python score_battery.py \
    --input ../data/battery_raw.json \
    --embedding glove=/models/glove.840B.300d.txt \
    --embedding fasttext=/models/crawl-300d-2M.vec \
    --embedding sbert=sbert:sentence-transformers/all-mpnet-base-v2 \
    --drat-pool /path/to/approved-random-nouns.txt

# Or score the two local-preview downloads together
python score_battery.py \
    --input ~/Downloads/drat-local-session-1.json \
            ~/Downloads/drat-local-session-2.json

# Outputs:
#   scores.csv          — one wide row per participant (dat/rat/drat/sctt)
#   drat_blocks.csv     — one auditable row per DRAT block
#   sctt_responses.csv  — long, one row per SCTT answer (for the RoBERTa scorer)
```

Without `--embedding`, RAT accuracy and SCTT fluency are still produced and raw
DAT/DRAT fields remain available. DRAT scoring fails loudly if embeddings are
requested without an explicit noun pool; the bundled example pool is not valid
for research scoring.

## SCTT creativity scores

`sctt_responses.csv` includes CAP's case-sensitive `item` and `response` columns,
plus stable join keys. Upload it to https://cap.ist.psu.edu/sctt-ai. CAP returns
`prediction` and `modelname`; import that file with `--sctt-scores` to add the
per-response predictions and participant mean to the scored outputs.

## Notes on the algorithms

- **DAT** (Olson et al. 2021): first 7 valid in-vocab words, mean pairwise cosine
  distance × 100.
- **DRAT** (Schapiro et al. 2026): keep words whose max-similarity to the k anchors
  exceeds the 90th-percentile of the noun pool's anchor-similarities, then DAT-style
  distance over the survivors (need ≥ 3). The CLI reports each embedding separately
  and averages them into the paper-comparable composite.
- **RAT**: string match vs the canonical solution (trailing-plural folded).
- **SCTT**: fluency is fixed at 3 responses/item by design, so the creativity model
  is the primary signal.
