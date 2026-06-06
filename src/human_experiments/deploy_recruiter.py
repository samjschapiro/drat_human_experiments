"""
Create one Prolific study per deployed variant.

Reads a (variant → frontend URL) mapping (either from deploy_results.txt
or a YAML you maintain), then hits the Prolific API to create a draft
study for each. Writes a `prolific_study_state.json` mapping
(variant → Prolific study ID) so you can rerun this script without
duplicating studies.

Prerequisites:
    pip install requests
    export PROLIFIC_API_TOKEN=<your_token>

Adjust the STUDY_TEMPLATE below to your study's parameters. Prolific docs:
    https://docs.prolific.com/docs/api-docs/public/

Usage:
    python deploy_recruiter.py --urls configs/campaigns/my_urls.yaml
"""

import argparse
import json
import os
from pathlib import Path

try:
    import requests
    import yaml
except ImportError as e:
    raise SystemExit(f"Missing dependency: {e}. Install: pip install requests pyyaml")


PROLIFIC_API_BASE = "https://api.prolific.com/api/v1"

# ── EDIT: study parameters ─────────────────────────────────────────────────
STUDY_TEMPLATE = {
    "name":                 "Rating study (variant: {variant})",
    "description":          "Rate items on a 0–100 scale across 3 dimensions. ~10 minutes.",
    "estimated_completion_time": 10,                  # minutes
    "reward":               150,                       # pence, GBP
    "total_available_places": 40,
    "device_compatibility": ["desktop"],
    "peripheral_requirements": [],
    "completion_codes": [
        {"code": "CHANGE_ME", "code_type": "COMPLETED", "actions": [
            {"action": "AUTOMATICALLY_APPROVE"}
        ]},
    ],
    # Filters (eligibility) live under "filters" — add age / language / etc.
    "filters": [],
}


def url_for(variant_url: str, completion_url: str = "") -> str:
    """Add Prolific URL parameters."""
    sep = "&" if "?" in variant_url else "?"
    return (f"{variant_url}{sep}PROLIFIC_PID={{{{%PROLIFIC_PID%}}}}"
            f"&STUDY_ID={{{{%STUDY_ID%}}}}&SESSION_ID={{{{%SESSION_ID%}}}}")


def create_study(token: str, variant: str, frontend_url: str) -> dict:
    payload = {
        **STUDY_TEMPLATE,
        "name":                STUDY_TEMPLATE["name"].format(variant=variant),
        "external_study_url":  url_for(frontend_url),
        "completion_option":   "url",
        "completion_codes": STUDY_TEMPLATE["completion_codes"],
    }
    res = requests.post(
        f"{PROLIFIC_API_BASE}/studies/",
        headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
        json=payload, timeout=30,
    )
    res.raise_for_status()
    return res.json()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--urls", type=Path, required=True,
                        help="YAML mapping variant tag → frontend URL.")
    parser.add_argument("--state", type=Path,
                        default=Path(__file__).parent / "prolific_study_state.json")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be created; do not call Prolific.")
    args = parser.parse_args()

    token = os.environ.get("PROLIFIC_API_TOKEN")
    if not token and not args.dry_run:
        raise SystemExit("Set PROLIFIC_API_TOKEN in env (or pass --dry-run).")

    urls = yaml.safe_load(args.urls.read_text())
    state = json.loads(args.state.read_text()) if args.state.exists() else {}

    for variant, frontend_url in urls.items():
        if variant in state:
            print(f"[skip] {variant} — already has study {state[variant]}")
            continue
        if args.dry_run:
            print(f"[dry]  {variant} → {url_for(frontend_url)}")
            continue
        result = create_study(token, variant, frontend_url)
        state[variant] = result["id"]
        print(f"[OK]   {variant} → {result['id']}")
        args.state.write_text(json.dumps(state, indent=2))

    print(f"\nState: {args.state}")


if __name__ == "__main__":
    main()
