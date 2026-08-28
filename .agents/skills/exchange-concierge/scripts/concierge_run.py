#!/usr/bin/env python3
"""Prepare compact Exchange Concierge context and finalize validated proposal runs.

The complete private handoff stays on disk for validation. Agents work from a
small, query-focused context and inspect exact entities only when needed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONNECTION = ROOT / "work/exchange-concierge-connection.json"
DEFAULT_HANDOFF = ROOT / "work/latest-exchange-companion-handoff.json"
DEFAULT_CONTEXT = ROOT / "work/exchange-concierge-context.json"
DEFAULT_RUN_STATE = ROOT / "work/exchange-concierge-run-state.json"
DEFAULT_CHECKPOINT = ROOT / "work/exchange-concierge-monitor-state.json"
DEFAULT_BUNDLE = ROOT / "outputs/exchange-companion-import.json"
DEFAULT_COVERAGE = ROOT / "outputs/exchange-companion-coverage.json"
DEFAULT_SUMMARY = ROOT / "outputs/exchange-concierge-run-summary.json"

SURFACE_KEYS = {
    "journey": "journey",
    "tasks": "tasks",
    "resources": "resources",
    "resource-intake": "resourceIntake",
    "packing": "packingItems",
    "bags": "bags",
    "flight-allowances": "flightAllowances",
    "base-budget": "budget",
    "study-events": "studyEvents",
    "travel-plans": "travelPlans",
}

INDEX_FIELDS = {
    "journey": ("id", "title", "ownerName", "homeCity", "hostCity", "hostSchool", "program", "startDate", "endDate", "orientationDate", "destinations"),
    "tasks": ("id", "title", "status", "phase", "priority", "dueDate", "verifiedAt", "templateKind"),
    "resources": ("id", "title", "category", "type", "region", "verifiedAt", "privacy", "origin"),
    "resource-intake": ("id", "note", "status", "createdAt", "intent", "targetTravelPlanId"),
    "packing": ("id", "name", "category", "decision", "bagId", "packed"),
    "bags": ("id", "name", "kind", "limitKg", "limitSource"),
    "flight-allowances": ("id", "label", "airline", "segment", "confirmed", "verifiedAt"),
    "base-budget": ("id", "name", "category", "amount", "currency", "cadence", "basis", "paid", "verifiedAt"),
    "study-events": ("id", "title", "kind", "startDate", "endDate", "mandatory"),
    "travel-plans": ("id", "title", "destinations", "startDate", "endDate", "updatedAt"),
}

DEFAULT_SCAN_EXTENSIONS = {".md", ".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}
SKIP_SCAN_DIRS = {
    ".git",
    ".next",
    ".venv",
    ".vinext",
    ".wrangler",
    "__pycache__",
    "dist",
    "node_modules",
    "output",
    "outputs",
    "work",
}


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def repo_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def read_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read valid JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value


def atomic_write_json(path: Path, value: object, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        if compact:
            json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def run_checked(command: list[str]) -> str:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise ValueError(detail or f"Command failed: {' '.join(command)}")
    return result.stdout.strip()


def canonical_hash(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def telegram_run_key(moment: datetime | None = None) -> str:
    current = moment or datetime.now().astimezone()
    digest = hashlib.sha256(current.isoformat().encode("utf-8")).hexdigest()[:8]
    return f"run-{current.strftime('%Y%m%d-%H%M%S')}-telegram-{digest}"


def safe_telegram_batch(batch: dict[str, Any]) -> tuple[str | None, list[dict[str, str]]]:
    lease_id = batch.get("leaseId")
    raw_requests = batch.get("requests")
    if lease_id is not None and (not isinstance(lease_id, str) or not lease_id.startswith("tql_")):
        raise ValueError("Telegram claim returned an invalid lease")
    if not isinstance(raw_requests, list) or len(raw_requests) > 20:
        raise ValueError("Telegram claim returned an invalid request list")
    requests: list[dict[str, str]] = []
    total_characters = 0
    request_ids: set[str] = set()
    for item in raw_requests:
        if not isinstance(item, dict):
            raise ValueError("Telegram claim returned an invalid request")
        request_id = item.get("requestId")
        text = item.get("text")
        received_at = item.get("receivedAt")
        parent_request_id = item.get("parentRequestId")
        if not isinstance(request_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", request_id, re.IGNORECASE):
            raise ValueError("Telegram claim returned an invalid request ID")
        if request_id in request_ids or not isinstance(text, str) or not text or len(text) > 4096 or not isinstance(received_at, str):
            raise ValueError("Telegram claim returned invalid request content")
        if parent_request_id is not None and (not isinstance(parent_request_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", parent_request_id, re.IGNORECASE)):
            raise ValueError("Telegram claim returned an invalid parent request ID")
        request = {"requestId": request_id, "text": text, "receivedAt": received_at}
        if parent_request_id is not None:
            request["parentRequestId"] = parent_request_id
        requests.append(request)
        request_ids.add(request_id)
        total_characters += len(text)
    if total_characters > 32_000 or (requests and not lease_id) or (not requests and lease_id):
        raise ValueError("Telegram claim returned inconsistent lease metadata")
    return lease_id, requests


def active_telegram_lease(run_state: dict[str, Any]) -> tuple[str, list[str]] | None:
    telegram = run_state.get("telegram")
    if not isinstance(telegram, dict):
        return None
    lease_id = telegram.get("leaseId")
    request_ids = telegram.get("requestIds")
    if not isinstance(lease_id, str) or not lease_id.startswith("tql_") or not isinstance(request_ids, list) or not request_ids:
        return None
    if any(not isinstance(item, str) or not re.fullmatch(r"[0-9a-f-]{36}", item, re.IGNORECASE) for item in request_ids):
        raise ValueError("Prepared Telegram run state is invalid")
    return lease_id, request_ids


def handoff_state(handoff: dict[str, Any]) -> dict[str, Any]:
    if handoff.get("kind") != "exchange-companion-handoff" or handoff.get("schemaVersion") != 1:
        raise ValueError("Handoff must be exchange-companion-handoff schemaVersion 1")
    state = handoff.get("state")
    if not isinstance(state, dict):
        raise ValueError("Handoff state is missing")
    return state


def surface_ids(handoff: dict[str, Any]) -> list[str]:
    surfaces = handoff.get("editableSurfaces")
    if not isinstance(surfaces, list):
        raise ValueError("Handoff editableSurfaces is missing")
    result = [item.get("id") for item in surfaces if isinstance(item, dict) and isinstance(item.get("id"), str)]
    if not result or any(item not in SURFACE_KEYS for item in result):
        raise ValueError("Handoff contains unsupported editable surfaces")
    return result


def records_for_surface(state: dict[str, Any], surface: str) -> list[dict[str, Any]]:
    key = SURFACE_KEYS[surface]
    value = state.get(key)
    if surface == "journey":
        return [value] if isinstance(value, dict) else []
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def compact_record(surface: str, record: dict[str, Any]) -> dict[str, Any]:
    return {key: record[key] for key in INDEX_FIELDS[surface] if key in record}


def entity_hashes(handoff: dict[str, Any]) -> dict[str, dict[str, str]]:
    state = handoff_state(handoff)
    result: dict[str, dict[str, str]] = {}
    for surface in surface_ids(handoff):
        result[surface] = {}
        for index, record in enumerate(records_for_surface(state, surface)):
            record_id = record.get("id")
            if not isinstance(record_id, str) or not record_id:
                record_id = f"index-{index}"
            result[surface][record_id] = canonical_hash(record)
    return result


def compare_hashes(current: dict[str, dict[str, str]], previous: dict[str, Any]) -> dict[str, dict[str, list[str]]]:
    result: dict[str, dict[str, list[str]]] = {}
    for surface, current_items in current.items():
        old_value = previous.get(surface)
        old_items = old_value if isinstance(old_value, dict) else {}
        added = sorted(item for item in current_items if item not in old_items)
        modified = sorted(item for item in current_items if item in old_items and current_items[item] != old_items[item])
        removed = sorted(item for item in old_items if item not in current_items)
        result[surface] = {"added": added, "modified": modified, "removed": removed}
    return result


def keyword_values(intent: str, explicit: list[str]) -> list[str]:
    values = [item.strip().casefold() for item in explicit if item.strip()]
    if not values and intent.strip():
        values = [item.casefold() for item in re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]{1,}|[\u3400-\u9fff]{2,}", intent)]
    return list(dict.fromkeys(values))


def record_matches(record: dict[str, Any], keywords: list[str]) -> bool:
    if not keywords:
        return False
    text = json.dumps(record, ensure_ascii=False, sort_keys=True).casefold()
    return any(keyword in text for keyword in keywords)


def scan_files(root: Path, extensions: set[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Scan root is not a directory: {root}")
    for directory, names, files in os.walk(root):
        names[:] = [name for name in names if name not in SKIP_SCAN_DIRS and not name.startswith(".cache")]
        base = Path(directory)
        for name in files:
            path = base / name
            if path.suffix.casefold() not in extensions:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            relative = path.relative_to(root).as_posix()
            result[relative] = f"{stat.st_size}:{stat.st_mtime_ns}"
    return result


def compare_files(current: dict[str, str], previous: dict[str, Any], limit: int = 200) -> tuple[list[dict[str, Any]], dict[str, int | bool]]:
    old = previous if isinstance(previous, dict) else {}
    changes: list[dict[str, Any]] = []
    for path in sorted(current):
        if path not in old:
            changes.append({"path": path, "change": "added"})
        elif current[path] != old[path]:
            changes.append({"path": path, "change": "modified"})
    for path in sorted(old):
        if path not in current:
            changes.append({"path": path, "change": "removed"})
    summary: dict[str, int | bool] = {
        "total": len(changes),
        "added": sum(item["change"] == "added" for item in changes),
        "modified": sum(item["change"] == "modified" for item in changes),
        "removed": sum(item["change"] == "removed" for item in changes),
        "truncated": len(changes) > limit,
    }
    return changes[:limit], summary


def initialize_outputs(handoff: Path, bundle: Path, coverage: Path) -> None:
    run_checked([sys.executable, str(SCRIPT_DIR / "initialize_import_bundle.py"), str(handoff), str(bundle)])
    run_checked([sys.executable, str(SCRIPT_DIR / "audit_import_coverage.py"), "--init", str(handoff), str(coverage)])


def prefill_targeted_coverage(coverage_path: Path, affected: set[str], pending_intake: bool) -> set[str]:
    coverage = read_object(coverage_path)
    rows = coverage.get("surfaces")
    if not isinstance(rows, list):
        raise ValueError("Coverage manifest has no surfaces")
    all_surfaces = {row.get("id") for row in rows if isinstance(row, dict) and isinstance(row.get("id"), str)}
    unknown = affected - all_surfaces
    if unknown:
        raise ValueError(f"Unknown affected surfaces: {sorted(unknown)}")
    effective = set(all_surfaces) if pending_intake else set(affected)
    for row in rows:
        if not isinstance(row, dict) or row.get("id") in effective:
            continue
        row.update({
            "status": "no-new-evidence",
            "checks": [
                "targeted run dependency scope excluded this surface; latest handoff index and pending resource intake were checked"
            ],
            "evidenceIds": [],
            "missingEvidence": [],
        })
    atomic_write_json(coverage_path, coverage)
    return effective


def prepare(args: argparse.Namespace) -> None:
    connection = repo_path(args.connection)
    handoff_path = repo_path(args.handoff)
    context_path = repo_path(args.context)
    run_state_path = repo_path(args.run_state)
    checkpoint_path = repo_path(args.checkpoint)
    bundle_path = repo_path(args.bundle)
    coverage_path = repo_path(args.coverage)

    if args.include_telegram and args.no_pull:
        raise ValueError("Telegram claims require a fresh cloud pull; remove --no-pull")
    if not args.no_pull:
        if not connection.exists():
            raise ValueError(f"Cloud connection is missing: {connection}")
        run_checked([
            sys.executable,
            str(SCRIPT_DIR / "concierge_cloud_sync.py"),
            "--connection",
            str(connection),
            "pull",
            "--output",
            str(handoff_path),
        ])
    telegram_lease_id: str | None = None
    telegram_requests: list[dict[str, str]] = []
    if args.include_telegram:
        context_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="telegram-claim-", dir=context_path.parent) as directory:
            claim_path = Path(directory) / "batch.json"
            run_checked([
                sys.executable,
                str(SCRIPT_DIR / "concierge_cloud_sync.py"),
                "--connection",
                str(connection),
                "claim",
                "--output",
                str(claim_path),
            ])
            telegram_lease_id, telegram_requests = safe_telegram_batch(read_object(claim_path))
    if not handoff_path.exists():
        raise ValueError(f"Handoff is missing: {handoff_path}")

    handoff = read_object(handoff_path)
    state = handoff_state(handoff)
    surfaces = surface_ids(handoff)
    initialize_outputs(handoff_path, bundle_path, coverage_path)

    checkpoint = read_object(checkpoint_path) if checkpoint_path.exists() else {}
    current_hashes = entity_hashes(handoff)
    previous_hashes = checkpoint.get("entityHashes") if isinstance(checkpoint.get("entityHashes"), dict) else {}
    entity_changes = compare_hashes(current_hashes, previous_hashes)

    pending_intake = [item for item in records_for_surface(state, "resource-intake") if item.get("status") == "pending"]
    requested_surfaces = set(args.affected_surface)
    if args.mode == "full":
        affected = set(surfaces)
    elif requested_surfaces:
        affected = prefill_targeted_coverage(coverage_path, requested_surfaces, bool(pending_intake))
    else:
        # Omitting dependency scope is safe but intentionally less compact.
        affected = set(surfaces)
    indexed_surfaces = set(surfaces) if args.mode == "full" else affected | {"journey"}

    keywords = keyword_values(args.intent, args.keyword)
    entity_index: dict[str, list[dict[str, Any]]] = {}
    matches: dict[str, list[dict[str, Any]]] = {}
    counts: dict[str, int] = {}
    for surface in surfaces:
        records = records_for_surface(state, surface)
        counts[surface] = len(records)
        if surface in indexed_surfaces:
            entity_index[surface] = [compact_record(surface, record) for record in records]
        selected = [compact_record(surface, record) for record in records if record_matches(record, keywords)]
        if selected:
            matches[surface] = selected[:50]

    inbox = state.get("aiInbox") if isinstance(state.get("aiInbox"), dict) else {}
    proposals = inbox.get("proposals") if isinstance(inbox.get("proposals"), list) else []
    sources = inbox.get("sources") if isinstance(inbox.get("sources"), list) else []
    review_history = [
        {key: proposal.get(key) for key in ("title", "summary", "status", "entity", "targetId", "createdAt") if key in proposal}
        for proposal in proposals
        if isinstance(proposal, dict) and proposal.get("status") != "applied"
    ]

    previous_files = checkpoint.get("fileFingerprints") if isinstance(checkpoint.get("fileFingerprints"), dict) else {}
    file_fingerprints: dict[str, str] = dict(previous_files)
    changed_files: list[dict[str, Any]] = []
    file_change_summary: dict[str, int | bool] = {"total": 0, "added": 0, "modified": 0, "removed": 0, "truncated": False}
    scan_root = repo_path(args.scan_root) if args.scan_root else None
    if scan_root is not None:
        extensions = {item if item.startswith(".") else f".{item}" for item in args.scan_extension} if args.scan_extension else DEFAULT_SCAN_EXTENSIONS
        extensions = {item.casefold() for item in extensions}
        file_fingerprints = scan_files(scan_root, extensions)
        changed_files, file_change_summary = compare_files(file_fingerprints, previous_files)

    recent_changes = handoff.get("recentChanges") if isinstance(handoff.get("recentChanges"), list) else []
    context = {
        "schemaVersion": 1,
        "kind": "exchange-concierge-run-context",
        "generatedAt": now_iso(),
        "mode": args.mode,
        "intent": args.intent,
        "keywords": keywords,
        "journeyScope": handoff.get("journeyScope"),
        "baseRevision": handoff.get("baseRevision"),
        "fullHandoff": handoff_path.relative_to(ROOT).as_posix() if handoff_path.is_relative_to(ROOT) else str(handoff_path),
        "bundle": bundle_path.relative_to(ROOT).as_posix() if bundle_path.is_relative_to(ROOT) else str(bundle_path),
        "coverage": coverage_path.relative_to(ROOT).as_posix() if coverage_path.is_relative_to(ROOT) else str(coverage_path),
        "safety": {
            "fullHandoffStaysLocal": True,
            "validateAgainstFullHandoff": True,
            "proposalStatus": "pending",
            "manualAndAppliedValuesAreDurable": True,
        },
        "checkpoint": {
            "exists": checkpoint_path.exists(),
            "lastSuccessfulAt": checkpoint.get("lastSuccessfulAt"),
            "baseRevision": checkpoint.get("baseRevision"),
        },
        "affectedSurfaces": sorted(affected),
        "surfaceCounts": counts,
        "entityChangesSinceCheckpoint": {
            surface: changes for surface, changes in entity_changes.items() if surface in indexed_surfaces
        },
        "entityIndex": entity_index,
        "matchedEntities": matches,
        "pendingResourceIntake": pending_intake,
        "reviewHistory": review_history,
        "historyCounts": {
            "sources": len(sources),
            "proposals": len(proposals),
            "applied": sum(isinstance(item, dict) and item.get("status") == "applied" for item in proposals),
            "pending": sum(isinstance(item, dict) and item.get("status") == "pending" for item in proposals),
            "dismissed": sum(isinstance(item, dict) and item.get("status") == "dismissed" for item in proposals),
        },
        "recentChanges": recent_changes[:10],
        "changedFilesSinceCheckpoint": changed_files,
        "fileChangeSummary": file_change_summary,
        "instructions": [
            "Use this compact context for triage; do not print or load the complete handoff into model context.",
            "Use the inspect command for exact current entities that need comparison.",
            "Edit only the initialized bundle and coverage files, then run finalize.",
            "A full weekly run audits every authorized evidence category; a targeted run follows only the current event plus its cross-surface dependencies.",
        ],
    }
    if args.include_telegram:
        context["telegramRequests"] = telegram_requests
        context["instructions"].append(
            "Telegram requests are de-identified private evidence. Use only their requestId, text, receivedAt, and parentRequestId fields."
        )
    atomic_write_json(context_path, context, compact=True)

    run_state = {
        "schemaVersion": 1,
        "generatedAt": context["generatedAt"],
        "mode": args.mode,
        "journeyScope": handoff.get("journeyScope"),
        "baseRevision": handoff.get("baseRevision"),
        "handoff": str(handoff_path),
        "entityHashes": current_hashes,
        "fileFingerprints": file_fingerprints,
        "scanRoot": str(scan_root) if scan_root else checkpoint.get("scanRoot"),
    }
    if telegram_lease_id:
        run_state["runKey"] = telegram_run_key()
        run_state["telegram"] = {
            "leaseId": telegram_lease_id,
            "requestIds": [item["requestId"] for item in telegram_requests],
        }
    atomic_write_json(run_state_path, run_state)
    context_chars = len(json.dumps(context, ensure_ascii=False))
    reported_changes = context["entityChangesSinceCheckpoint"]
    changed_entities = sum(len(values[kind]) for values in reported_changes.values() for kind in ("added", "modified", "removed"))
    matched_entities = sum(len(items) for items in matches.values())
    telegram_report = f" telegram_requests={len(telegram_requests)}" if args.include_telegram else ""
    print(
        f"PREPARED mode={args.mode} revision={handoff.get('baseRevision')} context_chars={context_chars} "
        f"matches={matched_entities} changed_entities={changed_entities} changed_files={file_change_summary['total']}"
        f"{telegram_report}"
    )


def inspect_entities(args: argparse.Namespace) -> None:
    handoff = read_object(repo_path(args.handoff))
    state = handoff_state(handoff)
    if args.surface not in surface_ids(handoff):
        raise ValueError(f"Unknown surface: {args.surface}")
    keywords = keyword_values("", args.keyword)
    records = records_for_surface(state, args.surface)
    selected = []
    for record in records:
        if args.entity_id and record.get("id") != args.entity_id:
            continue
        if keywords and not record_matches(record, keywords):
            continue
        selected.append(record)
    value = {"surface": args.surface, "count": len(selected), "items": selected[: args.limit]}
    output = repo_path(args.output) if args.output else None
    if output:
        atomic_write_json(output, value)
        print(f"INSPECTED surface={args.surface} count={len(selected)} output={output}")
    else:
        print(json.dumps(value, ensure_ascii=False, indent=2))


def validate_noop(bundle: dict[str, Any], coverage: dict[str, Any]) -> None:
    if bundle.get("sources") or bundle.get("proposals"):
        return
    rows = coverage.get("surfaces")
    if not isinstance(rows, list) or any(not isinstance(row, dict) or row.get("status") != "no-new-evidence" for row in rows):
        raise ValueError("A no-proposal run requires every surface to be no-new-evidence")


def update_telegram_run_state(run_state_path: Path, run_state: dict[str, Any], **updates: Any) -> None:
    telegram = run_state.get("telegram")
    if not isinstance(telegram, dict):
        raise ValueError("Prepared run has no active Telegram lease")
    telegram.update(updates)
    run_state["telegram"] = telegram
    atomic_write_json(run_state_path, run_state)


def clarify_telegram(args: argparse.Namespace) -> None:
    run_state_path = repo_path(args.run_state)
    run_state = read_object(run_state_path)
    lease = active_telegram_lease(run_state)
    if not lease:
        raise ValueError("Prepared run has no active Telegram lease")
    lease_id, request_ids = lease
    request_id = args.request_id
    if request_id is None:
        if len(request_ids) != 1:
            raise ValueError("Use --request-id when the run contains more than one Telegram request")
        request_id = request_ids[0]
    if request_id not in request_ids:
        raise ValueError("Telegram request is not part of the current lease")
    connection_path = repo_path(args.connection)
    if not connection_path.exists():
        raise ValueError(f"Cloud connection is missing: {connection_path}")
    run_checked([
        sys.executable,
        str(SCRIPT_DIR / "concierge_cloud_sync.py"),
        "--connection",
        str(connection_path),
        "clarify",
        "--lease-id",
        lease_id,
        "--request-id",
        request_id,
        "--question",
        args.question,
    ])
    remaining = [item for item in request_ids if item != request_id]
    update_telegram_run_state(
        run_state_path,
        run_state,
        leaseId=lease_id if remaining else None,
        requestIds=remaining,
        clarifiedRequestIds=sorted(set(run_state.get("telegram", {}).get("clarifiedRequestIds", [])) | {request_id}),
    )
    print(f"CLARIFIED request={request_id}")


def fail_telegram(args: argparse.Namespace) -> None:
    run_state_path = repo_path(args.run_state)
    run_state = read_object(run_state_path)
    lease = active_telegram_lease(run_state)
    if not lease:
        raise ValueError("Prepared run has no active Telegram lease")
    lease_id, request_ids = lease
    connection_path = repo_path(args.connection)
    if not connection_path.exists():
        raise ValueError(f"Cloud connection is missing: {connection_path}")
    run_checked([
        sys.executable,
        str(SCRIPT_DIR / "concierge_cloud_sync.py"),
        "--connection",
        str(connection_path),
        "fail",
        "--lease-id",
        lease_id,
        *[argument for request_id in request_ids for argument in ("--request-id", request_id)],
        "--error",
        args.error,
    ])
    update_telegram_run_state(
        run_state_path,
        run_state,
        leaseId=None,
        requestIds=[],
        failedAt=now_iso(),
        failureReason=args.error,
    )
    print(f"FAILED_TELEGRAM requests={len(request_ids)}")


def finalize(args: argparse.Namespace) -> None:
    handoff_path = repo_path(args.handoff)
    bundle_path = repo_path(args.bundle)
    coverage_path = repo_path(args.coverage)
    run_state_path = repo_path(args.run_state)
    checkpoint_path = repo_path(args.checkpoint)
    summary_path = repo_path(args.summary)
    connection_path = repo_path(args.connection)

    handoff = read_object(handoff_path)
    bundle = read_object(bundle_path)
    coverage = read_object(coverage_path)
    run_state = read_object(run_state_path)
    telegram_lease = active_telegram_lease(run_state)
    if run_state.get("journeyScope") != handoff.get("journeyScope") or run_state.get("baseRevision") != handoff.get("baseRevision"):
        raise ValueError("Prepared run state does not match the current handoff")
    validate_noop(bundle, coverage)

    validator_output = run_checked([
        sys.executable,
        str(SCRIPT_DIR / "validate_import_bundle.py"),
        str(bundle_path),
        str(handoff_path),
    ])
    coverage_output = run_checked([
        sys.executable,
        str(SCRIPT_DIR / "audit_import_coverage.py"),
        str(handoff_path),
        str(bundle_path),
        str(coverage_path),
    ])

    proposals = bundle.get("proposals") if isinstance(bundle.get("proposals"), list) else []
    sources = bundle.get("sources") if isinstance(bundle.get("sources"), list) else []
    push_output = ""
    pushed = False
    delivery_run_key = run_state.get("runKey") if isinstance(run_state.get("runKey"), str) else ""
    if telegram_lease and not re.fullmatch(r"run-\d{8}-\d{6}(?:-[a-z0-9]+)*", delivery_run_key):
        raise ValueError("Prepared Telegram run is missing a valid run key")
    if args.push and proposals:
        if not connection_path.exists():
            raise ValueError(f"Cloud connection is missing: {connection_path}")
        push_command = [
            sys.executable,
            str(SCRIPT_DIR / "concierge_cloud_sync.py"),
            "--connection",
            str(connection_path),
            "push",
            str(bundle_path),
        ]
        if delivery_run_key:
            push_command.extend(["--run-key", delivery_run_key])
        push_output = run_checked(push_command)
        pushed = True

    telegram_completed = False
    telegram_complete_output = ""
    if telegram_lease and args.push:
        if not connection_path.exists():
            raise ValueError(f"Cloud connection is missing: {connection_path}")
        lease_id, request_ids = telegram_lease
        outcome = "processed" if proposals else "no_change"
        telegram_complete_output = run_checked([
            sys.executable,
            str(SCRIPT_DIR / "concierge_cloud_sync.py"),
            "--connection",
            str(connection_path),
            "complete",
            "--lease-id",
            lease_id,
            *[argument for request_id in request_ids for argument in ("--request-id", request_id)],
            "--run-key",
            delivery_run_key,
            "--proposal-count",
            str(len(proposals)),
            "--outcome",
            outcome,
        ])
        telegram_completed = True
        update_telegram_run_state(
            run_state_path,
            run_state,
            leaseId=None,
            requestIds=[],
            completedAt=now_iso(),
            outcome=outcome,
            proposalCount=len(proposals),
        )

    changes = [
        {
            "id": item.get("id"),
            "entity": item.get("entity"),
            "action": item.get("action"),
            "targetId": item.get("targetId"),
            "valueFields": sorted(item.get("value", {}).keys()) if isinstance(item.get("value"), dict) else [],
        }
        for item in proposals
        if isinstance(item, dict)
    ]
    summary = {
        "schemaVersion": 1,
        "completedAt": now_iso(),
        "mode": run_state.get("mode"),
        "journeyScope": handoff.get("journeyScope"),
        "baseRevision": handoff.get("baseRevision"),
        "sourceCount": len(sources),
        "proposalCount": len(proposals),
        "confidence": {
            value: sum(isinstance(item, dict) and item.get("confidence") == value for item in proposals)
            for value in ("high", "medium", "low")
        },
        "privacy": {
            value: sum(isinstance(item, dict) and item.get("privacy") == value for item in proposals)
            for value in ("private", "shareable")
        },
        "changes": changes,
        "validator": validator_output,
        "coverageAudit": coverage_output,
        "pushed": pushed,
        "pushResult": push_output,
        "telegramCompleted": telegram_completed,
        "telegramResult": telegram_complete_output,
    }
    atomic_write_json(summary_path, summary)

    successful_delivery = telegram_completed if telegram_lease else pushed or not proposals or args.record_success
    if successful_delivery:
        checkpoint = {
            "schemaVersion": 1,
            "lastSuccessfulAt": summary["completedAt"],
            "mode": run_state.get("mode"),
            "journeyScope": run_state.get("journeyScope"),
            "baseRevision": run_state.get("baseRevision"),
            "entityHashes": run_state.get("entityHashes", {}),
            "fileFingerprints": run_state.get("fileFingerprints", {}),
            "scanRoot": run_state.get("scanRoot"),
        }
        atomic_write_json(checkpoint_path, checkpoint)

    delivery = "pushed" if pushed else "no-proposals" if not proposals else "validated-only"
    print(
        f"FINALIZED delivery={delivery} proposals={len(proposals)} sources={len(sources)} "
        f"validator='{validator_output}' coverage='{coverage_output}'"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compact Exchange Concierge run orchestrator")
    subcommands = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subcommands.add_parser("prepare", help="pull state, initialize outputs, and write compact context")
    prepare_parser.add_argument("--mode", choices=("targeted", "full"), default="targeted")
    prepare_parser.add_argument("--intent", default="")
    prepare_parser.add_argument("--keyword", action="append", default=[])
    prepare_parser.add_argument("--affected-surface", action="append", default=[])
    prepare_parser.add_argument("--scan-root")
    prepare_parser.add_argument("--scan-extension", action="append", default=[])
    prepare_parser.add_argument("--no-pull", action="store_true")
    prepare_parser.add_argument("--include-telegram", action="store_true")
    prepare_parser.add_argument("--connection", default=str(DEFAULT_CONNECTION))
    prepare_parser.add_argument("--handoff", default=str(DEFAULT_HANDOFF))
    prepare_parser.add_argument("--context", default=str(DEFAULT_CONTEXT))
    prepare_parser.add_argument("--run-state", default=str(DEFAULT_RUN_STATE))
    prepare_parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    prepare_parser.add_argument("--bundle", default=str(DEFAULT_BUNDLE))
    prepare_parser.add_argument("--coverage", default=str(DEFAULT_COVERAGE))

    inspect_parser = subcommands.add_parser("inspect", help="read exact current entities without loading the full handoff")
    inspect_parser.add_argument("--handoff", default=str(DEFAULT_HANDOFF))
    inspect_parser.add_argument("--surface", required=True, choices=tuple(SURFACE_KEYS))
    inspect_parser.add_argument("--id", dest="entity_id")
    inspect_parser.add_argument("--keyword", action="append", default=[])
    inspect_parser.add_argument("--limit", type=int, default=50)
    inspect_parser.add_argument("--output")

    finalize_parser = subcommands.add_parser("finalize", help="validate, optionally push, summarize, and checkpoint")
    finalize_parser.add_argument("--push", action="store_true")
    finalize_parser.add_argument("--record-success", action="store_true")
    finalize_parser.add_argument("--connection", default=str(DEFAULT_CONNECTION))
    finalize_parser.add_argument("--handoff", default=str(DEFAULT_HANDOFF))
    finalize_parser.add_argument("--run-state", default=str(DEFAULT_RUN_STATE))
    finalize_parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    finalize_parser.add_argument("--bundle", default=str(DEFAULT_BUNDLE))
    finalize_parser.add_argument("--coverage", default=str(DEFAULT_COVERAGE))
    finalize_parser.add_argument("--summary", default=str(DEFAULT_SUMMARY))

    clarify_parser = subcommands.add_parser("clarify", help="ask a Force Reply question for a request in the current Telegram lease")
    clarify_parser.add_argument("--connection", default=str(DEFAULT_CONNECTION))
    clarify_parser.add_argument("--run-state", default=str(DEFAULT_RUN_STATE))
    clarify_parser.add_argument("--request-id")
    clarify_parser.add_argument("--question", required=True)

    fail_parser = subcommands.add_parser("fail", help="record a processing failure for the current Telegram lease")
    fail_parser.add_argument("--connection", default=str(DEFAULT_CONNECTION))
    fail_parser.add_argument("--run-state", default=str(DEFAULT_RUN_STATE))
    fail_parser.add_argument("--error", default="processing_failed")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "prepare":
            prepare(args)
        elif args.command == "inspect":
            inspect_entities(args)
        elif args.command == "finalize":
            finalize(args)
        elif args.command == "clarify":
            clarify_telegram(args)
        else:
            fail_telegram(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
