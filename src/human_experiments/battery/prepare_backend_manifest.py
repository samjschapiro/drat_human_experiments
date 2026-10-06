"""Build the backend's study manifest from the same bundles the browser loads.

    python prepare_backend_manifest.py

Reads js/study-config.js, js/study-materials.js and js/battery-data.js and writes
backend/supabase/functions/_shared/study_manifest.json, which the Edge Functions
use to (a) assign the Session 1 test order for a slot and (b) check that every
saved item and every completed session matches exactly what the browser shows.
deploy.sh runs this before every backend deploy, so the two cannot drift.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "backend/supabase/functions/_shared/study_manifest.json"

SESSION2_ORDER = ["drat", "sctt"]
SESSION1_FIXED = {"raven": ["raven_handoff", "raven_return"], "dat": ["dat_single"],
                  "bfi10": ["bfi10"], "demographics": ["demographics"]}
SESSION2_FIXED = {"break": ["session2_break"], "attention": ["attention_orange"]}
EXPECTED_SESSION1 = 35
EXPECTED_SESSION2 = 22


def read_js_object(path: Path, global_name: str) -> dict:
    """Parse `window.<global_name> = {...};` where the object is JSON."""
    text = path.read_text()
    match = re.search(rf"window\.{global_name}\s*=\s*", text)
    if not match:
        raise SystemExit(f"{path}: window.{global_name} not found")
    obj, _ = json.JSONDecoder().raw_decode(text[match.end():])
    return obj


def read_study_config(path: Path) -> dict:
    """study-config.js is a JS literal, not JSON; pull out the two fields we need."""
    text = path.read_text()
    version = re.search(r'protocolVersion:\s*"([^"]+)"', text)
    orders = re.search(r"session1Orders:\s*(\[.*?\],?\s*\])\s*,", text, re.S)
    if not version or not orders:
        raise SystemExit(f"{path}: protocolVersion or session1Orders not found")
    orders_json = re.sub(r",\s*\]", "]", orders.group(1))  # drop JS trailing commas
    return {"protocol_version": version.group(1), "session1_orders": json.loads(orders_json)}


def main() -> None:
    config = read_study_config(HERE / "js/study-config.js")
    materials = read_js_object(HERE / "js/study-materials.js", "STUDY_MATERIALS")
    banks = read_js_object(HERE / "js/battery-data.js", "ITEM_BANKS")

    if materials["protocol_version"] != config["protocol_version"]:
        raise SystemExit("study-materials.js and study-config.js protocol versions differ")

    rat_ids = [item["item_id"] for item in banks["rat"]]
    sctt_ids = [item["item_id"] for item in banks["sctt"]]
    drat_by_slot = []
    for index, assignment in enumerate(materials["assignments"]):
        if assignment["slot"] != index:
            raise SystemExit(f"assignment {index} has slot {assignment['slot']}")
        drat_by_slot.append([block["set_id"] for block in assignment["blocks"]])

    session1 = {**SESSION1_FIXED, "rat": rat_ids}
    session2_fixed = {**SESSION2_FIXED, "sctt": sctt_ids}
    n1 = sum(len(ids) for ids in session1.values())
    n2 = sum(len(ids) for ids in session2_fixed.values()) + len(drat_by_slot[0])
    if n1 != EXPECTED_SESSION1 or n2 != EXPECTED_SESSION2:
        raise SystemExit(f"expected {EXPECTED_SESSION1}/{EXPECTED_SESSION2} items, got {n1}/{n2}")
    if any(len(ids) != 8 for ids in drat_by_slot):
        raise SystemExit("every slot must have exactly 8 DRAT blocks")

    manifest = {
        "protocol_version": config["protocol_version"],
        "n_slots": len(drat_by_slot),
        "session1_orders": config["session1_orders"],
        "session2_order": SESSION2_ORDER,
        "session1_items": session1,            # test_id -> item ids (same for every slot)
        "session2_items": session2_fixed,      # plus "drat" from drat_by_slot[slot]
        "drat_by_slot": drat_by_slot,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    print(f"wrote {OUT.relative_to(HERE)}: {len(drat_by_slot)} slots, "
          f"{n1} Session 1 items, {n2} Session 2 items")


if __name__ == "__main__":
    main()
