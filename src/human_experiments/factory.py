"""
Clone template/ into one directory per (variant) in a campaign.

A "campaign" is a list of variants you want to deploy as separate Prolific
studies (e.g. one per (model, task) pair). This script copies template/ to
<campaign_root>/<variant_tag>/ for each variant, re-runs prepare_stimuli.py
for each clone with the variant's upstream path, and reports what it did.

Usage:
    python factory.py --campaign configs/campaigns/my_campaign.yaml

The campaign YAML schema:

    campaign_root: src/human_experiments/instances
    variants:
      - tag: model_a_task_x
        upstream: data/foo/results.csv
      - tag: model_b_task_x
        upstream: data/bar/results.csv
      - tag: model_a_task_y
        upstream: data/foo/y_results.csv
        seed: 123          # optional override
        n_per_condition: 30  # optional override

EDIT this script's `CAMPAIGN_SCHEMA_KEYS` if your variants need extra fields.
"""

import argparse
import shutil
import subprocess
from pathlib import Path

# yaml is the only optional dep; fall back to a stub message if not installed
try:
    import yaml
except ImportError:
    yaml = None

TEMPLATE_DIR = Path(__file__).parent / "template"

# Files we never copy (regenerated per-variant or backend artifacts)
SKIP_PATHS = {
    "js/stimuli-data.js",
    "node_modules",
    ".aws-sam",
    "data",
}


def copy_template(dest: Path) -> None:
    """Mirror template/ → dest, skipping artifacts."""
    if dest.exists():
        print(f"  ! {dest} already exists, skipping copy (use --force to overwrite)")
        return
    shutil.copytree(
        TEMPLATE_DIR, dest,
        ignore=shutil.ignore_patterns("node_modules", ".aws-sam", "data",
                                      "stimuli-data.js"),
    )
    print(f"  + cloned template/ → {dest}")


def regen_stimuli(variant_dir: Path, upstream: Path, extra_args: list[str]) -> None:
    cmd = [
        "python", str(variant_dir / "prepare_stimuli.py"),
        "--input", str(upstream),
        "--output", str(variant_dir / "js" / "stimuli-data.js"),
        *extra_args,
    ]
    print(f"  $ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=variant_dir)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", type=Path, required=True,
                        help="YAML file describing the campaign's variants.")
    parser.add_argument("--force", action="store_true",
                        help="Re-clone even if target exists.")
    parser.add_argument("--skip-stimuli", action="store_true",
                        help="Clone only; do not run prepare_stimuli.py.")
    args = parser.parse_args()

    if yaml is None:
        raise SystemExit("PyYAML not installed; `pip install pyyaml`.")

    spec = yaml.safe_load(args.campaign.read_text())
    campaign_root = Path(spec["campaign_root"])
    campaign_root.mkdir(parents=True, exist_ok=True)

    for variant in spec["variants"]:
        tag = variant["tag"]
        upstream = Path(variant["upstream"])
        dest = campaign_root / tag
        print(f"\n=== {tag} ===")
        if args.force and dest.exists():
            shutil.rmtree(dest)
        copy_template(dest)
        if not args.skip_stimuli:
            extra: list[str] = []
            if "seed" in variant:
                extra += ["--seed", str(variant["seed"])]
            if "n_per_condition" in variant:
                extra += ["--n-per-condition", str(variant["n_per_condition"])]
            regen_stimuli(dest, upstream, extra)

    print(f"\nDone. Materialized {len(spec['variants'])} variants under {campaign_root}.")


if __name__ == "__main__":
    main()
