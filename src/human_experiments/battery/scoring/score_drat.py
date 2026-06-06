"""
DRAT scoring (Schapiro, Gladstone, Black & Ji, 2026; arXiv:2605.13450).

For a response set W and anchor set A:
  1. utility(w; A) = max_i cos(emb(w), emb(a_i))          # closest anchor
  2. tau_A = 90th percentile of {utility(p; A) : p in noun pool}
  3. survivors = { w in W : utility(w; A) > tau_A }, require >= 3
  4. score = 100 / |pairs| * sum_{i<j} (1 - cos(emb(w_i), emb(w_j)))   # over survivors

`model` supports `word in model` and `model[word] -> np.ndarray`. The noun pool
(item_banks/drat_noun_pool.txt) is used only here. For robustness the paper
averages across several embedding models; pass them via `models` to do the same.
"""

from __future__ import annotations

import itertools
from pathlib import Path

import numpy as np

from _embed import cosine_dist, cosine_sim, in_vocab, normalize_word

POOL_PATH = Path(__file__).parent.parent / "item_banks" / "drat_noun_pool.example.txt"


def load_pool(path: Path = POOL_PATH) -> list[str]:
    words = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            words.append(line.lower())
    return words


def extract_words(response: dict, n_words: int = 10) -> list[str]:
    out = []
    for i in range(n_words):
        w = response.get(f"w{i}", "")
        if w and w.strip():
            out.append(w.strip())
    return out


def _utility(word: str, anchors: list[str], model) -> float | None:
    if not in_vocab(model, word):
        return None
    sims = [cosine_sim(model[word], model[a]) for a in anchors if in_vocab(model, a)]
    return max(sims) if sims else None


def _threshold(anchors: list[str], pool: list[str], model, q: float = 0.90) -> float | None:
    utils = [u for p in pool if (u := _utility(p, anchors, model)) is not None]
    if not utils:
        return None
    return float(np.quantile(utils, q))


def score_drat(words: list[str], anchors: list[str], model, pool: list[str],
               quantile: float = 0.90, min_survivors: int = 3) -> dict:
    anchors = [normalize_word(a) for a in anchors]
    tau = _threshold(anchors, pool, model, quantile)
    if tau is None:
        return {"drat_score": None, "n_survivors": 0, "threshold": None, "survivors": []}

    survivors = []
    seen = set()
    for w in words:
        nw = normalize_word(w)
        if not nw or " " in nw or nw in seen:
            continue
        u = _utility(nw, anchors, model)
        if u is not None and u > tau:
            seen.add(nw)
            survivors.append(nw)

    if len(survivors) < min_survivors:
        return {"drat_score": None, "n_survivors": len(survivors),
                "threshold": round(tau, 4), "survivors": survivors}

    dists = [cosine_dist(model[a], model[b]) for a, b in itertools.combinations(survivors, 2)]
    score = 100.0 * (sum(dists) / len(dists))
    return {"drat_score": round(score, 2), "n_survivors": len(survivors),
            "threshold": round(tau, 4), "survivors": survivors}


def score_drat_composite(words, anchors, models: list, pool, **kw) -> dict:
    """Average drat_score across multiple embedding models (paper's composite)."""
    parts = [score_drat(words, anchors, m, pool, **kw) for m in models]
    scores = [p["drat_score"] for p in parts if p["drat_score"] is not None]
    return {
        "drat_score": round(sum(scores) / len(scores), 2) if scores else None,
        "drat_per_model": parts,
    }


if __name__ == "__main__":
    rng = np.random.default_rng(1)
    anchors = ["fire", "ice", "wind", "stone"]
    words = ["ember", "glacier", "storm", "boulder", "ash", "frost", "gale"]
    pool = ["table", "river", "engine", "planet", "silence", "marble", "orbit", "ribbon"]
    vocab = set(anchors + words + pool)
    fake = {w: rng.normal(size=50) for w in vocab}
    print(score_drat(words, anchors, fake, pool))
