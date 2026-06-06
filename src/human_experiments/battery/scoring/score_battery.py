"""
Battery scoring orchestrator.

Reads the JSON-per-session submissions (from get_data.sh, or a debug payload),
dispatches each participant's responses to the per-test scorers, and writes:

  - scores.csv          : one wide row per participant (dat/rat/drat/sctt columns)
  - sctt_responses.csv  : one long row per SCTT free-text answer, formatted for the
                          OSF RoBERTa scorer (item, task, prompt, response).

DAT and DRAT need a word-embedding model (--glove). Without it, those columns are
left blank and a warning is printed; RAT and SCTT-fluency always run.

Usage:
    python score_battery.py --input ../data/battery_raw.json --glove glove-wiki-gigaword-300
    python score_battery.py --input debug_payload.json            # RAT + SCTT only
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import score_dat
import score_drat
import score_sctt
from score_rat import load_key, score_rat


def load_sessions(input_path: Path) -> list[dict]:
    """Accept a get-data dump ({raw_data:[{payload}]}), a single payload
    ({responses:[...]}), or a bare list of payloads."""
    data = json.loads(Path(input_path).read_text())
    if isinstance(data, list):
        return data
    if "raw_data" in data:
        return [row["payload"] for row in data["raw_data"] if row.get("payload")]
    if "responses" in data:
        return [data]
    raise SystemExit(f"Unrecognized input shape in {input_path}")


def by_test(responses: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in responses:
        out.setdefault(r.get("test"), []).append(r)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--glove", default=None,
                    help="gensim model name or local path for DAT/DRAT (e.g. "
                         "glove-wiki-gigaword-300). Omit to skip embedding scores.")
    ap.add_argument("--sctt-model", default=None,
                    help="Local fine-tuned RoBERTa dir to add SCTT creativity scores.")
    ap.add_argument("--out", type=Path, default=Path("scores.csv"))
    ap.add_argument("--sctt-out", type=Path, default=Path("sctt_responses.csv"))
    args = ap.parse_args()

    model = None
    if args.glove:
        try:
            from _embed import load_keyed_vectors
            print(f"Loading embeddings: {args.glove} (this can take a minute)…")
            model = load_keyed_vectors(args.glove)
        except Exception as e:
            print(f"WARNING: could not load embeddings ({e}); DAT/DRAT skipped.")

    rat_key = load_key()
    pool = score_drat.load_pool() if model else []

    sessions = load_sessions(args.input)
    print(f"Scoring {len(sessions)} session(s).")

    rows = []
    sctt_rows = []
    for s in sessions:
        pid = s.get("participant_id", "unknown")
        grouped = by_test(s.get("responses", []))
        row = {
            "participant_id": pid,
            "order_index": s.get("order_index"),
            "anchor_set_index": s.get("anchor_set_index"),
        }

        # DAT
        if "dat" in grouped and model:
            words = score_dat.extract_words((grouped["dat"][0].get("response") or {}))
            row.update({f"dat_{k}": v for k, v in score_dat.score_dat(words, model).items()
                        if k != "valid_words"})

        # RAT
        if "rat" in grouped:
            r = score_rat(grouped["rat"], rat_key)
            row.update({k: v for k, v in r.items() if k != "rat_per_item"})

        # DRAT
        if "drat" in grouped and model:
            d = grouped["drat"][0]
            words = score_drat.extract_words((d.get("response") or {}))
            anchors = d.get("anchors") or []
            res = score_drat.score_drat(words, anchors, model, pool)
            row.update({f"drat_{k}": v for k, v in res.items() if k != "survivors"})

        # SCTT
        if "sctt" in grouped:
            row.update(score_sctt.fluency(grouped["sctt"]))
            sctt_rows.extend(score_sctt.flatten_responses(pid, grouped["sctt"]))

        rows.append(row)

    # SCTT long CSV (+ optional creativity scores)
    if sctt_rows:
        if args.sctt_model:
            try:
                sctt_rows = score_sctt.run_roberta(sctt_rows, args.sctt_model)
            except Exception as e:
                print(f"WARNING: SCTT model scoring failed ({e}); writing raw rows.")
        score_sctt.write_scorer_csv(sctt_rows, args.sctt_out)
        print(f"Wrote {args.sctt_out} ({len(sctt_rows)} SCTT responses).")

    # Wide per-participant CSV
    try:
        import pandas as pd
        df = pd.DataFrame(rows)
        df.to_csv(args.out, index=False)
    except ImportError:
        import csv
        cols = sorted({k for r in rows for k in r})
        with open(args.out, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
    print(f"Wrote {args.out} ({len(rows)} participants).")


if __name__ == "__main__":
    main()
