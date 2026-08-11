#!/usr/bin/env python3
"""Create a fresh import bundle shell bound to one website handoff."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"INVALID: {message}")


def journey_scope(state: object) -> str:
    if not isinstance(state, dict) or not isinstance(state.get("journey"), dict):
        fail("handoff.state.journey is required")
    journey = state["journey"]
    journey_id = journey.get("id")
    if not isinstance(journey_id, str) or not journey_id:
        fail("handoff.state.journey.id is required")
    return f"exchange:{journey_id}"


def main() -> None:
    if len(sys.argv) not in {2, 3}:
        fail("usage: initialize_import_bundle.py HANDOFF [OUTPUT]")
    handoff_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) == 3 else Path("outputs/exchange-companion-import.json")
    handoff = json.loads(handoff_path.read_text(encoding="utf-8"))
    if not isinstance(handoff, dict) or handoff.get("kind") != "exchange-companion-handoff" or handoff.get("schemaVersion") != 1:
        fail("input must be an exchange-companion-handoff schemaVersion 1 file")
    expected_scope = journey_scope(handoff.get("state"))
    if handoff.get("journeyScope") != expected_scope:
        fail("handoff journeyScope does not match handoff.state")
    template = handoff.get("outputTemplate")
    if not isinstance(template, dict) or template.get("journeyScope") != expected_scope:
        fail("handoff outputTemplate is missing or not bound to this journey")
    bundle = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "journeyScope": expected_scope,
        **({"baseRevision": handoff["baseRevision"]} if isinstance(handoff.get("baseRevision"), int) and handoff["baseRevision"] > 0 else {}),
        "sources": [],
        "proposals": [],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"INITIALIZED {output_path} for {expected_scope}")


if __name__ == "__main__":
    main()
