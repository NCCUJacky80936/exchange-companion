#!/usr/bin/env python3
"""Initialize or audit a per-surface Exchange Concierge coverage manifest."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


STATUS = {"updated", "no-new-evidence", "needs-confirmation"}
RUN_SUFFIX = re.compile(r"(run-\d{8}-\d{6}(?:-[a-z0-9]+)*)$")


def fail(message: str) -> None:
    raise ValueError(message)


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        fail(f"{path} must contain a JSON object")
    return value


def handoff_surfaces(handoff: dict) -> list[dict]:
    if handoff.get("kind") != "exchange-companion-handoff" or handoff.get("schemaVersion") != 1:
        fail("handoff must be an exchange-companion-handoff schemaVersion 1 file")
    surfaces = handoff.get("editableSurfaces")
    if not isinstance(surfaces, list) or not surfaces:
        fail("handoff.editableSurfaces is required")
    if not all(isinstance(item, dict) and isinstance(item.get("id"), str) and isinstance(item.get("proposalEntity"), str) for item in surfaces):
        fail("handoff.editableSurfaces entries need id and proposalEntity")
    return surfaces


def initialize(handoff_path: Path, output_path: Path) -> None:
    handoff = load(handoff_path)
    manifest = {
        "schemaVersion": 1,
        "journeyScope": handoff.get("journeyScope"),
        "surfaces": [
            {"id": item["id"], "status": "unchecked", "checks": [], "evidenceIds": [], "missingEvidence": []}
            for item in handoff_surfaces(handoff)
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"INITIALIZED {output_path} surfaces={len(manifest['surfaces'])}")


def has_proposal(bundle: dict, entity: str, target_id: str | None = None, category: str | None = None) -> bool:
    for proposal in bundle.get("proposals", []):
        if not isinstance(proposal, dict) or proposal.get("entity") != entity:
            continue
        if target_id is not None and proposal.get("targetId") != target_id:
            continue
        value = proposal.get("value") if isinstance(proposal.get("value"), dict) else {}
        if category is not None and value.get("category") != category:
            continue
        return True
    return False


def audit_ids(bundle: dict) -> str:
    ids = []
    for key in ("sources", "proposals"):
        items = bundle.get(key)
        if not isinstance(items, list):
            fail(f"bundle.{key} must be an array")
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                fail(f"bundle.{key} entries need string ids")
            ids.append(item["id"])
    if not ids:
        fail("bundle needs at least one run-versioned source and proposal")
    suffixes = []
    for item_id in ids:
        match = RUN_SUFFIX.search(item_id)
        if not match:
            fail(f"ID is not run-versioned: {item_id}")
        suffixes.append(match.group(1))
    if len(set(suffixes)) != 1:
        fail(f"bundle mixes run versions: {sorted(set(suffixes))}")
    return suffixes[0]


def audit_cross_surface(state: dict, bundle: dict, coverage: dict[str, dict]) -> None:
    tasks = [item for item in state.get("tasks", []) if isinstance(item, dict)]
    budget = [item for item in state.get("budget", []) if isinstance(item, dict)]
    bags = [item for item in state.get("bags", []) if isinstance(item, dict)]

    housing_active = any(item.get("templateKind") == "housing" and item.get("status") not in {"not-started", "not-applicable"} for item in tasks)
    housing_confirmed = any(item.get("category") == "housing" and item.get("basis") == "confirmed" and item.get("amount", 0) > 0 for item in budget)
    if housing_active and not housing_confirmed and not has_proposal(bundle, "budget-item", category="housing") and coverage["base-budget"]["status"] != "needs-confirmation":
        fail("active housing evidence has no confirmed housing budget proposal or base-budget confirmation gap")

    flight_active = any(item.get("templateKind") == "flight" and item.get("status") not in {"not-started", "not-applicable"} for item in tasks)
    if flight_active and not state.get("flightAllowances") and not has_proposal(bundle, "flight-allowance") and coverage["flight-allowances"]["status"] != "needs-confirmation":
        fail("active flight evidence has no flight-allowance proposal or confirmation gap")

    unresolved_paid = [item for item in budget if item.get("paid") is True and (item.get("amount") == 0 or item.get("basis") == "unset")]
    for item in unresolved_paid:
        item_id = item.get("id")
        if isinstance(item_id, str) and not has_proposal(bundle, "budget-item", target_id=item_id) and coverage["base-budget"]["status"] != "needs-confirmation":
            fail(f"paid budget item remains unset without proposal or confirmation gap: {item_id}")

    bags_unconfirmed = any(item.get("limitKg") == 0 or item.get("limitSource") == "unconfirmed" for item in bags)
    if has_proposal(bundle, "flight-allowance") and bags_unconfirmed and not has_proposal(bundle, "bag") and coverage["bags"]["status"] != "needs-confirmation":
        fail("flight allowance proposal has no physical bag proposal or confirmation gap")


def audit(handoff_path: Path, bundle_path: Path, manifest_path: Path) -> None:
    handoff = load(handoff_path)
    bundle = load(bundle_path)
    manifest = load(manifest_path)
    surfaces = handoff_surfaces(handoff)
    if manifest.get("schemaVersion") != 1 or manifest.get("journeyScope") != handoff.get("journeyScope"):
        fail("coverage manifest is not bound to this handoff")
    rows = manifest.get("surfaces")
    if not isinstance(rows, list):
        fail("coverage manifest surfaces must be an array")
    coverage = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or row["id"] in coverage:
            fail("coverage surface ids must be unique strings")
        coverage[row["id"]] = row
    expected_ids = {item["id"] for item in surfaces}
    if set(coverage) != expected_ids:
        fail(f"coverage surfaces differ from handoff: missing={sorted(expected_ids - set(coverage))} extra={sorted(set(coverage) - expected_ids)}")

    source_ids = {item.get("id") for item in bundle.get("sources", []) if isinstance(item, dict)}
    surface_by_entity = {item["proposalEntity"]: item["id"] for item in surfaces}
    entities = {item.get("entity") for item in bundle.get("proposals", []) if isinstance(item, dict) and isinstance(item.get("entity"), str)}
    for item in surfaces:
        row = coverage[item["id"]]
        if row.get("status") not in STATUS:
            fail(f"surface {item['id']} is unchecked or has invalid status")
        if not isinstance(row.get("checks"), list) or not row["checks"] or not all(isinstance(value, str) and value.strip() for value in row["checks"]):
            fail(f"surface {item['id']} needs non-empty checks")
        evidence_ids = row.get("evidenceIds")
        if not isinstance(evidence_ids, list) or not all(isinstance(value, str) and value in source_ids for value in evidence_ids):
            fail(f"surface {item['id']} has invalid evidenceIds")
        missing = row.get("missingEvidence")
        if not isinstance(missing, list) or not all(isinstance(value, str) and value.strip() for value in missing):
            fail(f"surface {item['id']} has invalid missingEvidence")
        if row["status"] == "needs-confirmation" and not missing:
            fail(f"surface {item['id']} needs explicit missingEvidence")
        has_matching = item["proposalEntity"] in entities
        if row["status"] == "updated" and not has_matching:
            fail(f"surface {item['id']} says updated but has no {item['proposalEntity']} proposal")
        if has_matching and row["status"] != "updated":
            fail(f"surface {item['id']} has a proposal but is not marked updated")
    unknown_entities = entities - set(surface_by_entity)
    if unknown_entities:
        fail(f"proposal entities lack editable surfaces: {sorted(unknown_entities)}")

    run_version = audit_ids(bundle)
    state = handoff.get("state")
    if not isinstance(state, dict):
        fail("handoff.state is required")
    audit_cross_surface(state, bundle, coverage)
    updated = sum(row["status"] == "updated" for row in rows)
    needs_confirmation = sum(row["status"] == "needs-confirmation" for row in rows)
    print(f"COVERAGE_VALID run={run_version} surfaces={len(surfaces)} updated={updated} needs_confirmation={needs_confirmation}")


def main() -> int:
    try:
        if len(sys.argv) == 4 and sys.argv[1] == "--init":
            initialize(Path(sys.argv[2]), Path(sys.argv[3]))
        elif len(sys.argv) == 4:
            audit(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
        else:
            print("usage: audit_import_coverage.py --init HANDOFF COVERAGE | HANDOFF BUNDLE COVERAGE", file=sys.stderr)
            return 2
    except (OSError, json.JSONDecodeError, ValueError, TypeError, KeyError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
