"""
SCTT scoring (Cortes, Luchini, Green & Beaty, 2026).

The validated automated scorer is the fine-tuned SCTT-AI RoBERTa model. It is not
bundled here. This module:

  1. ALWAYS flattens each participant's responses into the scorer's input rows
     `{participant_id, item_id, item, task, prompt, response}` and reports fluency
     (the count of non-empty responses; fixed at 3/item by design).
  2. Writes a CAP-compatible CSV. CAP adds `prediction` and `modelname`; those
     scores are joined back by participant_id + item_id + response_index.

Scorer input schema (matches the OSF example CSV): columns item, task, prompt,
response → the model appends a `prediction` column.
"""

from __future__ import annotations

import csv
import html
from pathlib import Path
import re

TASKS = {"research question", "hypothesis", "experiment"}


def flatten_responses(participant_id: str, responses: list[dict]) -> list[dict]:
    """One row per individual free-text answer across all SCTT items."""
    rows = []
    for r in responses:
        task = r.get("task")
        if task not in TASKS:
            raise ValueError(f"Unknown SCTT task for {r.get('item_id')}: {task}")
        shown = r.get("displayed_stimuli") or {}
        item_html = shown.get("prompt_html") or r.get("item") or r.get("prompt")
        if not item_html:
            raise ValueError(f"Missing SCTT item text for {r.get('item_id')}")
        item = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(item_html))).strip()
        resp = r.get("response") or {}
        # textareas are named r0, r1, r2 ...
        for idx in sorted(k for k in resp if k.startswith("r")):
            text = (resp.get(idx) or "").strip()
            rows.append({
                "participant_id": participant_id,
                "item_id": r.get("item_id"),
                "item": item,
                "task": task,
                "prompt": r.get("prompt"),
                "response_index": idx,
                "response": text,
            })
    return rows


def fluency(responses: list[dict]) -> dict:
    """Per-participant fluency: count of non-empty SCTT responses."""
    n_nonempty = 0
    n_items = 0
    for r in responses:
        n_items += 1
        resp = r.get("response") or {}
        n_nonempty += sum(1 for k, v in resp.items()
                          if k.startswith("r") and (v or "").strip())
    return {"sctt_n_items": n_items, "sctt_fluency": n_nonempty}


def write_scorer_csv(rows: list[dict], out_path: Path) -> Path:
    cols = ["participant_id", "item_id", "response_index", "item", "response", "task", "prompt"]
    for optional in ("prediction", "modelname"):
        if any(optional in row for row in rows):
            cols.append(optional)
    out_path = Path(out_path)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in rows:
            w.writerow(row)
    return out_path


if __name__ == "__main__":
    demo = [{
        "item_id": "sctt_hyp_2", "task": "hypothesis",
        "prompt": "why dogs like one friend and cats like another",
        "displayed_stimuli": {"prompt_html": "Why do dogs like one friend and cats like another?"},
        "response": {"r0": "one friend speaks at a pitch dogs prefer", "r1": "scent", "r2": ""},
    }]
    print(fluency(demo))
    for row in flatten_responses("p1", demo):
        print(row)
