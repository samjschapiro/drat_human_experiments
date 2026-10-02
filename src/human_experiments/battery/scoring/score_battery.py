"""Score linked two-session study exports, preserving one row per DRAT block.

Accepts a single local-preview download, a list of session downloads, or the
Supabase get-data wrapper. DAT/DRAT scores require --glove; raw condition and
completion fields are still exported without an embedding model.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import csv
import json
from pathlib import Path
from statistics import mean

import score_dat
import score_drat
import score_sctt
from score_rat import load_key, score_rat


def load_sessions(input_path: Path) -> list[dict]:
    data = json.loads(input_path.read_text())
    if isinstance(data, list):
        return [row.get("payload", row) for row in data]
    if "raw_data" in data:
        return [row["payload"] for row in data["raw_data"] if row.get("payload")]
    if "responses" in data:
        return [data]
    raise SystemExit(f"Unrecognized input shape in {input_path}")


def write_csv(path: Path, rows: list[dict], preferred: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    keys = {key for row in rows for key in row}
    first = [key for key in (preferred or []) if key in keys]
    fields = first + sorted(keys - set(first))
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def normalize_response(response: dict) -> dict:
    out = dict(response)
    out.setdefault("test", response.get("test_id"))
    out.setdefault("rt", response.get("response_time_ms"))
    assignment = response.get("assignment") or {}
    for key in ("presentation_index", "anchor_size", "relation", "source_triplet_id"):
        if key in assignment and key not in out:
            out[key] = assignment[key]
    if not out.get("anchors"):
        out["anchors"] = (response.get("displayed_stimuli") or {}).get("anchors")
    return out


def by_test(responses: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for raw in responses:
        response = normalize_response(raw)
        if response.get("test"):
            grouped[response["test"]].append(response)
    return grouped


def bfi_scores(response: dict | None) -> dict:
    if not response:
        return {}
    values = response.get("response") or {}
    pairs = {
        "extraversion": ((1, True), (6, False)),
        "agreeableness": ((2, False), (7, True)),
        "conscientiousness": ((3, True), (8, False)),
        "neuroticism": ((4, True), (9, False)),
        "openness": ((5, True), (10, False)),
    }
    scores = {}
    for name, items in pairs.items():
        ratings = []
        for number, reverse in items:
            raw = values.get(f"bfi_{number}")
            if raw is None or raw == "":
                break
            rating = int(raw)
            if not 1 <= rating <= 5:
                raise ValueError(f"Invalid BFI rating for item {number}: {raw}")
            ratings.append(6 - rating if reverse else rating)
        scores[f"bfi_{name}"] = round(mean(ratings), 2) if len(ratings) == 2 else None
    return scores


def load_raven_scores(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if not {"study_code", "standardized_score"} <= set(reader.fieldnames or []):
            raise ValueError("Raven score CSV must have study_code and standardized_score columns")
        scores = {}
        for row in reader:
            code = row["study_code"].strip()
            if code in scores:
                raise ValueError(f"Duplicate Raven score for study code {code}")
            scores[code] = row["standardized_score"].strip()
        return scores


def score_participants(sessions: list[dict], model, pool: list[str], raven_scores: dict[str, str]):
    grouped_sessions: dict[str, dict[int, dict]] = defaultdict(dict)
    for session in sessions:
        code = session.get("study_code") or session.get("participant_id")
        if not code:
            raise ValueError("Every session must have a study code or legacy participant ID")
        number = int(session.get("session_number") or 1)
        if number in grouped_sessions[code]:
            raise ValueError(f"Duplicate Session {number} for study code {code}")
        grouped_sessions[code][number] = session

    rat_key = load_key()
    summary_rows: list[dict] = []
    drat_rows: list[dict] = []
    sctt_rows: list[dict] = []
    for code, participant_sessions in sorted(grouped_sessions.items()):
        first = participant_sessions.get(1, {})
        second = participant_sessions.get(2, {})
        s1 = by_test(first.get("responses", []))
        s2 = by_test(second.get("responses", []))
        row = {
            "study_code": code,
            "slot": first.get("slot", second.get("slot")),
            "session1_record_id": first.get("session_record_id"),
            "session2_record_id": second.get("session_record_id"),
            "session1_saved_complete": bool(first.get("complete")),
            "session2_saved_complete": bool(second.get("complete")),
            "session1_expected_items_present": (
                len(s1.get("dat", [])) == 1 and len(s1.get("rat", [])) == 30
                and len(s1.get("raven", [])) == 2 and len(s1.get("bfi10", [])) == 1
                and len(s1.get("demographics", [])) == 1
            ),
            "session2_expected_items_present": (
                len(s2.get("drat", [])) == 8 and len(s2.get("sctt", [])) == 12
                and len(s2.get("attention", [])) == 1 and len(s2.get("break", [])) == 1
            ),
            "session1_order": "/".join(first.get("order", [])),
            "raven_standardized_score": raven_scores.get(code),
            "drat_n_blocks": len(s2.get("drat", [])),
        }
        if s1.get("dat") and model:
            words = score_dat.extract_words(s1["dat"][0].get("response") or {})
            result = score_dat.score_dat(words, model)
            row.update({key: value for key, value in result.items() if key != "valid_words"})
        if s1.get("rat"):
            result = score_rat(s1["rat"], rat_key)
            row.update({key: value for key, value in result.items() if key != "rat_per_item"})
        bfi = s1.get("bfi10", [None])[0]
        row.update(bfi_scores(bfi))
        row["attention_1_passed"] = (bfi.get("attention_check") or {}).get("passed") if bfi else None
        orange = s2.get("attention", [None])[0]
        row["attention_2_passed"] = (orange.get("attention_check") or {}).get("passed") if orange else None
        raven_return = next((r for r in s1.get("raven", []) if r.get("item_id") == "raven_return"), None)
        row["raven_marked_complete"] = (raven_return.get("response") == 0) if raven_return else None

        scored_blocks = []
        for response in s2.get("drat", []):
            block = {
                "study_code": code,
                "session_record_id": second.get("session_record_id"),
                "item_id": response.get("item_id"),
                "set_id": response.get("set_id"),
                "anchor_size": response.get("anchor_size"),
                "relation": response.get("relation"),
                "source_triplet_id": response.get("triplet_id") or response.get("source_triplet_id"),
                "pair_id": response.get("pair_id"),
                "presentation_index": response.get("presentation_index"),
                "anchors": "/".join(response.get("anchors") or []),
                "response_time_ms": response.get("rt"),
                "timed_out": response.get("timed_out"),
                "n_responses": len(score_drat.extract_words(response.get("response") or {})),
            }
            if model:
                result = score_drat.score_drat(
                    score_drat.extract_words(response.get("response") or {}),
                    response.get("anchors") or [], model, pool,
                )
                block.update({key: value for key, value in result.items() if key != "survivors"})
                if result["drat_score"] is not None:
                    scored_blocks.append(result["drat_score"])
            drat_rows.append(block)
        row["drat_mean_score"] = round(mean(scored_blocks), 2) if scored_blocks else None

        if s2.get("sctt"):
            row.update(score_sctt.fluency(s2["sctt"]))
            sctt_rows.extend(score_sctt.flatten_responses(code, s2["sctt"]))
        summary_rows.append(row)
    return summary_rows, drat_rows, sctt_rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, nargs="+", required=True,
                        help="One export or both local Session 1 and Session 2 downloads")
    parser.add_argument("--glove", default=None,
                        help="Embedding model for DAT and DRAT; omit to export raw condition data")
    parser.add_argument("--sctt-model", default=None)
    parser.add_argument("--raven-scores", type=Path, default=None,
                        help="Optional CSV with study_code,standardized_score")
    parser.add_argument("--out", type=Path, default=Path("scores.csv"))
    parser.add_argument("--drat-out", type=Path, default=Path("drat_blocks.csv"))
    parser.add_argument("--sctt-out", type=Path, default=Path("sctt_responses.csv"))
    args = parser.parse_args()

    model = None
    if args.glove:
        from _embed import load_keyed_vectors
        model = load_keyed_vectors(args.glove)
    pool = score_drat.load_pool() if model else []
    sessions = [session for path in args.input for session in load_sessions(path)]
    summary, drat, sctt = score_participants(
        sessions, model, pool, load_raven_scores(args.raven_scores)
    )
    write_csv(args.out, summary, ["study_code", "slot", "session1_record_id", "session2_record_id"])
    write_csv(args.drat_out, drat, ["study_code", "presentation_index", "relation", "anchor_size"])
    if sctt:
        if args.sctt_model:
            sctt = score_sctt.run_roberta(sctt, args.sctt_model)
        score_sctt.write_scorer_csv(sctt, args.sctt_out)
    print(f"Scored {len(summary)} study codes across {len(sessions)} sessions")
    print(f"Wrote {args.out} and {args.drat_out}")


if __name__ == "__main__":
    main()
