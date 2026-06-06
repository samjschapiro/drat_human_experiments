"""
Pull submissions from one or more deployed variants and z-score per
participant per rating dimension.

Z-scoring controls for individual differences in scale usage: each
participant's ratings are normalized to mean 0, std 1 within each
(participant_id, rating_dimension) cell. Effect sizes are then computed
on the z-scored values.

Usage:
    python analyze.py --campaign-root path/to/instances/ --backend supabase
"""

import argparse
import subprocess
from pathlib import Path

import pandas as pd


def pull_csvs(campaign_root: Path, backend: str) -> list[Path]:
    """Run each variant's get_data.sh; return paths to the resulting CSVs."""
    csvs: list[Path] = []
    for variant_dir in sorted(campaign_root.iterdir()):
        if not variant_dir.is_dir():
            continue
        subprocess.run(["bash", "get_data.sh", backend], cwd=variant_dir, check=False)
        csv = variant_dir / "data" / f"{variant_dir.name}.csv"
        if csv.exists():
            csvs.append(csv)
        else:
            print(f"  ! {variant_dir.name}: no CSV produced")
    return csvs


def zscore_per_participant(df: pd.DataFrame) -> pd.DataFrame:
    """For each (participant_id, rating_dimension), z-score rating_value."""
    grouped = df.groupby(["participant_id", "rating_dimension"])["rating_value"]
    df = df.copy()
    df["rating_z"] = grouped.transform(lambda s: (s - s.mean()) / s.std(ddof=0))
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-root", type=Path, required=True)
    parser.add_argument("--backend", default="supabase", choices=["aws", "supabase"])
    parser.add_argument("--out", type=Path, default=Path("pooled.csv"))
    parser.add_argument("--no-pull", action="store_true",
                        help="Skip get_data.sh; use existing data/ CSVs.")
    args = parser.parse_args()

    if args.no_pull:
        csvs = list(args.campaign_root.glob("*/data/*.csv"))
    else:
        csvs = pull_csvs(args.campaign_root, args.backend)
    print(f"Found {len(csvs)} CSVs.")

    frames = []
    for csv in csvs:
        df = pd.read_csv(csv)
        df["variant"] = csv.parent.parent.name
        frames.append(df)
    if not frames:
        raise SystemExit("No data found.")
    pooled = pd.concat(frames, ignore_index=True)
    pooled = zscore_per_participant(pooled)
    pooled.to_csv(args.out, index=False)
    print(f"Wrote pooled CSV: {args.out}  ({len(pooled)} rows)")

    # Cell summary
    summary = (
        pooled.groupby(["variant", "condition", "rating_dimension"])["rating_z"]
              .agg(["mean", "std", "count"])
              .round(3)
    )
    print("\nCell summary (z-scored):")
    print(summary)


if __name__ == "__main__":
    main()
