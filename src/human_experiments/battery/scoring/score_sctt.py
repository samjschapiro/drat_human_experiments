"""
SCTT scoring (Cortes, Luchini, Green & Beaty, 2026).

The validated automated scorer is a fine-tuned RoBERTa-base (or Llama-2) creativity
model from OSF 439zs. It is NOT bundled here. This module:

  1. ALWAYS flattens each participant's responses into the scorer's input rows
     `{participant_id, item_id, task, prompt, response}` and reports fluency
     (the count of non-empty responses; fixed at 3/item by design).
  2. If a local model dir is provided AND `transformers`/`torch` are installed,
     runs it to add a `creativity` prediction per response. Otherwise it writes a
     `sctt_responses.csv` you can score with the OSF script
     `run_sctt_roberta_bestfit.py` or the hosted CAP tool (cap.ist.psu.edu/sctt-ai)
     and join back by (participant_id, item_id, response index).

Scorer input schema (matches the OSF example CSV): columns item, task, prompt,
response → the model appends a `prediction` column.
"""

from __future__ import annotations

import csv
from pathlib import Path

TASKS = {"research question", "hypothesis", "experiment"}


def flatten_responses(participant_id: str, responses: list[dict]) -> list[dict]:
    """One row per individual free-text answer across all SCTT items."""
    rows = []
    for r in responses:
        resp = r.get("response") or {}
        # textareas are named r0, r1, r2 ...
        for idx in sorted(k for k in resp if k.startswith("r")):
            text = (resp.get(idx) or "").strip()
            rows.append({
                "participant_id": participant_id,
                "item_id": r.get("item_id"),
                "task": r.get("task"),
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
    cols = ["participant_id", "item_id", "task", "prompt", "response_index", "response"]
    out_path = Path(out_path)
    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in rows:
            w.writerow(row)
    return out_path


def run_roberta(rows: list[dict], model_dir: str) -> list[dict]:
    """Optional: add a `creativity` score per row using a local fine-tuned model.
    Requires `transformers` + `torch` and the OSF model directory. The OSF model
    is a sequence-regression head over RoBERTa-base; we wrap each response in the
    task-appropriate sentence frame the authors used."""
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    import torch

    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    model.eval()

    def frame(task, prompt, response):
        verb = {"hypothesis": "A creative hypothesis for",
                "research question": "A creative research question about",
                "experiment": "A creative way to test"}.get(task, "A creative response to")
        return f"{verb} {prompt} is {response}"

    out = []
    with torch.no_grad():
        for row in rows:
            if not row["response"]:
                out.append({**row, "creativity": None})
                continue
            text = frame(row["task"], row["prompt"], row["response"])
            enc = tok(text, return_tensors="pt", truncation=True, max_length=128)
            score = float(model(**enc).logits.squeeze().item())
            out.append({**row, "creativity": score})
    return out


if __name__ == "__main__":
    demo = [{
        "item_id": "sctt_hyp_2", "task": "hypothesis",
        "prompt": "why dogs like one friend and cats like another",
        "response": {"r0": "one friend speaks at a pitch dogs prefer", "r1": "scent", "r2": ""},
    }]
    print(fluency(demo))
    for row in flatten_responses("p1", demo):
        print(row)
