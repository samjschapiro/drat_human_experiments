"""
DAT scoring (Olson et al., 2021, PNAS).

Algorithm:
  1. Normalize + validate words (must be in the embedding vocabulary; invalids
     are dropped). Optional noun filtering via WordNet if available.
  2. Keep the first MAX_WORDS (=7) valid words.
  3. Mean cosine distance over all unique pairs, × 100.

`model` is any mapping supporting `word in model` and `model[word] -> np.ndarray`
(gensim KeyedVectors or a dict). Range ~0..200; typical human scores ~65–90.
"""

from __future__ import annotations

import itertools

from _embed import cosine_dist, in_vocab, normalize_word

MAX_WORDS = 7


def extract_words(response: dict, n_words: int = 10) -> list[str]:
    """Pull w0..w{n-1} out of a DAT survey-html-form response object, in order."""
    out = []
    for i in range(n_words):
        w = response.get(f"w{i}", "")
        if w and w.strip():
            out.append(w.strip())
    return out


def score_dat(words: list[str], model, max_words: int = MAX_WORDS) -> dict:
    valid = []
    seen = set()
    for w in words:
        nw = normalize_word(w)
        if not nw or " " in nw or not nw.isalpha():
            continue
        if nw in seen or not in_vocab(model, nw):
            continue
        seen.add(nw)
        valid.append(nw)
        if len(valid) >= max_words:
            break

    if len(valid) < 2:
        return {"dat_score": None, "n_valid": len(valid), "valid_words": valid}

    dists = [cosine_dist(model[a], model[b]) for a, b in itertools.combinations(valid, 2)]
    score = 100.0 * (sum(dists) / len(dists))
    return {"dat_score": round(score, 2), "n_valid": len(valid), "valid_words": valid}


if __name__ == "__main__":
    # Self-test with a tiny dict-backed model (no GloVe download needed).
    import numpy as np

    rng = np.random.default_rng(0)
    vocab = ["cat", "justice", "galaxy", "spoon", "ocean", "anger", "brick"]
    fake = {w: rng.normal(size=50) for w in vocab}
    print(score_dat(["cat", "justice", "galaxy", "spoon", "ocean", "anger", "brick"], fake))
