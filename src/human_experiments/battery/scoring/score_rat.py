"""
RAT scoring (Bowden & Jung-Beeman, 2003 CRA set).

Accuracy = fraction of administered items answered with the canonical solution.
Answers are normalized (lowercased, trimmed, trailing-plural folded). The answer
key is read from item_banks/rat_cra_144.json — solutions never reach the client,
so this is the only place they live.
"""

from __future__ import annotations

import json
from pathlib import Path

KEY_PATH = Path(__file__).parent.parent / "item_banks" / "rat_cra_144.json"


def load_key(path: Path = KEY_PATH) -> dict[str, str]:
    bank = json.loads(Path(path).read_text())
    return {it["item_id"]: it["solution"].strip().lower() for it in bank["items"]}


def _norm(ans: str) -> str:
    a = (ans or "").strip().lower()
    # Fold a simple trailing plural so "cheeses" matches "cheese".
    if len(a) > 3 and a.endswith("s") and not a.endswith("ss"):
        return a[:-1]
    return a


def _matches(ans: str, solution: str) -> bool:
    return _norm(ans) == _norm(solution)


def score_rat(responses: list[dict], key: dict[str, str]) -> dict:
    """responses: list of {item_id, response:{answer}, rt, timed_out}."""
    n = 0
    correct = 0
    rt_correct = []
    per_item = []
    for r in responses:
        item_id = r.get("item_id")
        sol = key.get(item_id)
        if sol is None:
            continue
        ans = (r.get("response") or {}).get("answer", "")
        ok = _matches(ans, sol)
        n += 1
        if ok:
            correct += 1
            if isinstance(r.get("rt"), (int, float)):
                rt_correct.append(r["rt"])
        per_item.append({"item_id": item_id, "answer": ans, "solution": sol,
                         "correct": ok, "rt": r.get("rt"),
                         "timed_out": r.get("timed_out")})
    return {
        "rat_accuracy": round(correct / n, 4) if n else None,
        "rat_n_correct": correct,
        "rat_n_items": n,
        "rat_mean_rt_correct_ms": round(sum(rt_correct) / len(rt_correct), 1) if rt_correct else None,
        "rat_per_item": per_item,
    }


if __name__ == "__main__":
    key = load_key()
    demo = [
        {"item_id": "rat_001", "response": {"answer": "cheese"}, "rt": 4200, "timed_out": False},
        {"item_id": "rat_002", "response": {"answer": "ICE "}, "rt": 3100, "timed_out": False},
        {"item_id": "rat_003", "response": {"answer": "wrong"}, "rt": 15000, "timed_out": True},
    ]
    res = score_rat(demo, key)
    print({k: v for k, v in res.items() if k != "rat_per_item"})
