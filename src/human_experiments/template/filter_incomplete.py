"""
Drop incomplete submissions from data/{experiment}.csv in-place.

A submission counts as incomplete when the participant's row count is
< (STIMULI_PER_SLOT * len(RATING_DIMENSIONS)). Adjust both as needed.

Usage:
    python filter_incomplete.py [--csv PATH]
"""

import argparse
from pathlib import Path

import pandas as pd


STIMULI_PER_SLOT = 10           # must match the frontend
N_RATING_DIMENSIONS = 3         # must match the frontend
EXPECTED_ROWS_PER_PARTICIPANT = STIMULI_PER_SLOT * N_RATING_DIMENSIONS


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path,
                        default=Path(__file__).parent / "data" /
                        (Path(__file__).parent.name + ".csv"))
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(f"No such file: {args.csv}")

    df = pd.read_csv(args.csv)
    before = df["participant_id"].nunique()

    counts = df.groupby("participant_id").size()
    complete = counts[counts >= EXPECTED_ROWS_PER_PARTICIPANT].index
    df_clean = df[df["participant_id"].isin(complete)]

    after = df_clean["participant_id"].nunique()
    print(f"participants: {before} → {after} "
          f"(dropped {before - after} incomplete)")

    out = args.csv.with_name(args.csv.stem + "_complete.csv")
    df_clean.to_csv(out, index=False)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
