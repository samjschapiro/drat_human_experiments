"""
Generate js/battery-data.js from battery_config.yaml + item_banks/.

The battery is a configurable, within-subjects session: each participant takes
the `included_tests` in a counterbalanced order. This script:

  1. Builds the counterbalance ORDER list (full permutations / Latin square /
     explicit).
  2. Assembles the client-facing item banks — and STRIPS answer keys (RAT
     solutions) so they never reach the public page source.
  3. Computes TOTAL_SLOTS = n_orders * n_anchor_sets * replications_per_cell and
     asserts it stays an exact multiple so order × anchor-set stay jointly
     balanced as the server slot counter fills.
  4. Emits window.BATTERY_CONFIG and window.ITEM_BANKS into js/battery-data.js.

It PRINTS the resulting TOTAL_SLOTS — set that in backend/supabase/schema.sql
(generate_series upper bound = TOTAL_SLOTS - 1) and as the get-slot TOTAL_SLOTS
env var.

Usage:
    python prepare_battery.py --config battery_config.example.yaml
"""

import argparse
import itertools
import json
import random
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

HERE = Path(__file__).parent


# ── Default participant-facing instruction copy (override per-test in config) ──
DEFAULT_INTRO = {
    "dat": (
        "<h2>Word Association</h2>"
        "<p>Please enter <b>10 words</b> that are <b>as different from each other "
        "as possible</b>, in all meanings and uses of the words.</p>"
        "<p><b>Rules</b></p>"
        "<ul style='text-align:left;display:inline-block'>"
        "<li>Use only single words.</li>"
        "<li>Use only nouns (e.g., things, objects, concepts).</li>"
        "<li>No proper nouns (no specific people or places).</li>"
        "<li>No specialised vocabulary (no technical terms).</li>"
        "</ul>"
        "<p>You have 4 minutes. Think of the words on your own — do not look them up.</p>"
    ),
    "rat": (
        "<h2>Word Connections</h2>"
        "<p>On each screen you will see <b>three words</b>. Type the <b>single word</b> "
        "that connects all three — it forms a compound word or a common phrase with "
        "each of them.</p>"
        "<p>Example: <b>cottage&nbsp;/&nbsp;swiss&nbsp;/&nbsp;cake</b> &rarr; "
        "<b>cheese</b> (cottage cheese, swiss cheese, cheesecake).</p>"
        "<p>You have a few seconds per item. If you don't know, make your best guess "
        "and move on.</p>"
    ),
    "sctt": (
        "<h2>Scientific Thinking</h2>"
        "<p>You will read a series of short scenarios. For each one, type "
        "<b>three responses</b> in the boxes provided. Be as creative as you can — "
        "there are no right or wrong answers.</p>"
    ),
    "drat": (
        "<h2>Creative Word Generation</h2>"
        "<p>You will see four <b>anchor words</b>. Enter <b>10 words</b> that are "
        "<b>as different from each other as possible</b>, but where <b>each word can "
        "be related — even metaphorically — to the anchor words</b>.</p>"
        "<p>Use single-word nouns. You have 4 minutes.</p>"
    ),
}

DEFAULT_TESTS = {
    "dat": {"n_words": 10, "time_limit_sec": 240},
    "rat": {"item_bank": "item_banks/rat_cra_144.json", "n_items": 30,
            "item_select": "easiest", "item_time_limit_sec": 15},
    "sctt": {"item_bank": "item_banks/sctt_beaty_2026.json",
             "n_responses_per_item": 3, "time_limit_sec": None},
    "drat": {"anchor_bank": "item_banks/drat_anchors.example.json",
             "n_words": 10, "k_anchors": 4, "time_limit_sec": 240},
}


def load_config(path: Path) -> dict:
    if yaml is None:
        raise SystemExit("PyYAML not installed; `pip install pyyaml`.")
    return yaml.safe_load(path.read_text())


def merge_test_cfg(test_id: str, user_cfg: dict) -> dict:
    merged = dict(DEFAULT_TESTS.get(test_id, {}))
    merged.update(user_cfg or {})
    merged.setdefault("intro_html", DEFAULT_INTRO.get(test_id, ""))
    return merged


# ── Counterbalance orders ──────────────────────────────────────────────────
def williams_latin_square(items: list[str]) -> list[list[str]]:
    """Balanced (Williams) Latin square: each test appears once in each position,
    and each ordered adjacent pair is balanced. Even n → n sequences; odd n →
    2n sequences (the square plus its reverse) for full first-order balance."""
    n = len(items)
    kseq = [j // 2 if j % 2 == 0 else n - 1 - (j // 2) for j in range(n)]
    rows = [[items[(i + k) % n] for k in kseq] for i in range(n)]
    if n % 2 == 1:
        rows += [list(reversed(r)) for r in rows]
    return rows


def build_orders(included: list[str], policy: str,
                 explicit: list[list[str]]) -> list[list[str]]:
    if len(included) == 1:
        return [list(included)]
    if policy == "full_permutations":
        return [list(p) for p in itertools.permutations(included)]
    if policy == "latin_square":
        return williams_latin_square(list(included))
    if policy == "explicit":
        if not explicit:
            raise SystemExit("order_policy=explicit but explicit_orders is empty.")
        want = set(included)
        for o in explicit:
            if set(o) != want:
                raise SystemExit(f"explicit order {o} is not a permutation of {included}.")
        return [list(o) for o in explicit]
    raise SystemExit(f"Unknown order_policy: {policy!r}")


# ── Item-bank assembly (strips answer keys) ────────────────────────────────
def _read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def assemble_rat(cfg: dict) -> list[dict]:
    bank = _read_json(HERE / cfg["item_bank"])
    items = bank["items"]
    n = cfg.get("n_items")
    select = cfg.get("item_select", "easiest")
    if n and n < len(items):
        if select == "easiest":
            chosen = sorted(items, key=lambda x: x["norm_rank"])[:n]
        elif select == "hardest":
            chosen = sorted(items, key=lambda x: x["norm_rank"], reverse=True)[:n]
        elif select == "random":
            rng = random.Random(12345)  # fixed: all participants see the same set
            chosen = rng.sample(items, n)
        else:
            raise SystemExit(f"Unknown rat.item_select: {select!r}")
    else:
        chosen = list(items)
    # STRIP solutions — never ship answer keys to the client.
    return [{"item_id": it["item_id"], "cues": it["cues"]} for it in chosen]


def assemble_sctt(cfg: dict) -> list[dict]:
    bank = _read_json(HERE / cfg["item_bank"])
    return [{"item_id": it["item_id"], "task": it["task"],
             "prompt": it["prompt"], "prompt_html": it["prompt_html"]}
            for it in bank["items"]]


def assemble_drat(cfg: dict) -> dict:
    bank = _read_json(HERE / cfg["anchor_bank"])
    return {
        "k_anchors": bank.get("k_anchors", cfg.get("k_anchors", 4)),
        "anchor_sets": [{"set_id": s["set_id"], "anchors": s["anchors"]}
                        for s in bank["anchor_sets"]],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path,
                        default=HERE / "battery_config.example.yaml")
    parser.add_argument("--output", type=Path, default=HERE / "js" / "battery-data.js")
    args = parser.parse_args()

    spec = load_config(args.config)
    included = spec["included_tests"]
    tests = {t: merge_test_cfg(t, (spec.get("tests") or {}).get(t, {})) for t in included}

    orders = build_orders(included, spec.get("order_policy", "latin_square"),
                           spec.get("explicit_orders", []))

    item_banks: dict = {t: None for t in included}
    if "rat" in included:
        item_banks["rat"] = assemble_rat(tests["rat"])
    if "sctt" in included:
        item_banks["sctt"] = assemble_sctt(tests["sctt"])
    if "drat" in included:
        item_banks["drat"] = assemble_drat(tests["drat"])

    n_orders = len(orders)
    n_anchor_sets = len(item_banks["drat"]["anchor_sets"]) if "drat" in included else 1
    reps = int(spec.get("replications_per_cell", 5))
    total_slots = n_orders * n_anchor_sets * reps
    # Joint balance holds iff total is an exact multiple of (n_orders * n_anchor_sets).
    assert total_slots % (n_orders * n_anchor_sets) == 0, "slot space not jointly balanced"

    # Strip the item_bank file paths out of the per-test config we ship (the
    # client only needs runtime params; banks are shipped separately).
    client_tests = {}
    for t, c in tests.items():
        client_tests[t] = {k: v for k, v in c.items()
                           if k not in ("item_bank", "anchor_bank")}

    battery_config = {
        "battery_version": spec.get("battery_version", "1.0.0"),
        "total_slots": total_slots,
        "n_anchor_sets": n_anchor_sets,
        "orders": orders,
        "tests": client_tests,
    }

    content = (
        "// Auto-generated by prepare_battery.py — do not edit by hand.\n"
        "window.BATTERY_CONFIG = " + json.dumps(battery_config, indent=2) + ";\n\n"
        "window.ITEM_BANKS = " + json.dumps(item_banks, indent=2) + ";\n"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content)

    # Ensure a runtime-config stub exists so index.html's <script src="js/config.js">
    # resolves locally (no 404). deploy.sh overwrites it with real values; it is
    # gitignored, so deployment URLs never get committed.
    config_js = args.output.parent / "config.js"
    if not config_js.exists():
        config_js.write_text(
            "// Auto-generated stub by prepare_battery.py — deploy.sh overwrites this.\n"
            "// In local debug mode (no PROLIFIC_PID) these values are unused.\n"
            "window.BATTERY_RUNTIME = "
            + json.dumps({"API_BASE": "__API_BASE__",
                          "COMPLETION_URL": "__COMPLETION_URL__"}, indent=2)
            + ";\n"
        )
        print(f"Wrote {config_js} (placeholder stub)")

    print(f"Wrote {args.output}")
    print(f"  tests:        {included}")
    print(f"  orders:       {n_orders} ({spec.get('order_policy')})")
    print(f"  anchor sets:  {n_anchor_sets}")
    print(f"  reps/cell:    {reps}")
    print(f"  RAT items:    {len(item_banks['rat']) if item_banks.get('rat') else 0}")
    print()
    print(f"  >>> TOTAL_SLOTS = {total_slots} <<<")
    print(f"  Set schema.sql: generate_series(0, {total_slots - 1})")
    print(f"  Set get-slot env: TOTAL_SLOTS={total_slots}")


if __name__ == "__main__":
    main()
