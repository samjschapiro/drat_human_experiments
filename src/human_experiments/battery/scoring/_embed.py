"""
Embedding utilities shared by the DAT and DRAT scorers.

Scorers operate on any "model" that supports `word in model` and `model[word]`
returning a 1-D numpy array — this is true of gensim KeyedVectors AND of a plain
dict, so tests can inject a tiny dict-backed model without downloading GloVe.
"""

from __future__ import annotations

import numpy as np


def cosine_sim(u: np.ndarray, v: np.ndarray) -> float:
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu == 0 or nv == 0:
        return 0.0
    return float(np.dot(u, v) / (nu * nv))


def cosine_dist(u: np.ndarray, v: np.ndarray) -> float:
    """1 - cosine similarity (range 0..2), the DAT/DRAT distance."""
    return 1.0 - cosine_sim(u, v)


def normalize_word(w: str) -> str:
    return (w or "").strip().lower()


def in_vocab(model, word: str) -> bool:
    try:
        return word in model
    except Exception:
        return False


def load_keyed_vectors(spec: str):
    """Load a word-embedding model by spec:
        - a gensim.downloader name, e.g. 'glove-wiki-gigaword-300'
        - a local path to a word2vec/GloVe text or .kv file
    Returns a gensim KeyedVectors. Requires `gensim`.
    """
    import os

    from gensim.models import KeyedVectors  # noqa: F401

    if os.path.exists(spec):
        if spec.endswith(".kv"):
            return KeyedVectors.load(spec)
        # Assume word2vec/GloVe text format. GloVe files have no header.
        no_header = spec.endswith(".txt") or "glove" in os.path.basename(spec).lower()
        return KeyedVectors.load_word2vec_format(spec, binary=spec.endswith(".bin"),
                                                 no_header=no_header)
    import gensim.downloader as api
    return api.load(spec)
