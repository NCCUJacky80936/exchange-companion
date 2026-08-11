#!/usr/bin/env python3
"""Validate a reviewable Exchange Companion AI import bundle."""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse


SOURCE_KINDS = {"official", "school", "city", "email", "file", "video", "research"}
ENTITIES = {"journey", "task", "resource", "resource-intake", "packing-item", "bag", "flight-allowance", "budget-item", "study-event", "travel-plan"}
CONFIDENCE = {"high", "medium", "low"}
PRIVACY = {"private", "shareable"}
ROOT_FIELDS = {"schemaVersion", "generatedAt", "journeyScope", "baseRevision", "sources", "proposals"}
SOURCE_FIELDS = {"id", "label", "kind", "evidenceType", "url", "capturedAt", "note"}
PROPOSAL_FIELDS = {"id", "title", "summary", "entity", "action", "targetId", "value", "confidence", "privacy", "evidenceIds", "status"}
CHECKLIST_FIELDS = {"id", "label", "done"}
RECORD_FIELDS = {"id", "date", "note"}
ACTIVITY_FIELDS = {"id", "time", "title", "kind", "location", "mapsUrl", "durationMinutes", "cost", "booked", "notes"}
TRAVEL_DAY_FIELDS = {"id", "date", "title", "activities"}
TRAVEL_NOTE_FIELDS = {"id", "title", "details", "category", "important"}
TRAVEL_PACKING_FIELDS = {"id", "name", "category", "quantity", "packed", "notes"}
ENTITY_ARRAYS = {
    "journey": "journey",
    "task": "tasks",
    "resource": "resources",
    "resource-intake": "resourceIntake",
    "packing-item": "packingItems",
    "bag": "bags",
    "flight-allowance": "flightAllowances",
    "budget-item": "budget",
    "study-event": "studyEvents",
    "travel-plan": "travelPlans",
}
REQUIRED_ADD_FIELDS = {
    "journey": set(),
    "task": {"id", "title", "description", "phase", "status", "priority", "predecessorIds", "notes"},
    "resource": {"id", "title", "description", "details", "category", "type", "url", "verifiedAt", "region", "origin", "privacy", "sourceLabel"},
    "resource-intake": {"id", "url", "note", "status", "createdAt"},
    "packing-item": {"id", "name", "category", "decision", "bagId", "quantity", "weightKg", "packed"},
    "bag": {"id", "name", "kind", "limitKg", "limitSource"},
    "flight-allowance": {"id", "label", "airline", "segment", "checkedMode", "checkedPieceCount", "checkedPieceWeightKg", "checkedTotalWeightKg", "carryOnMode", "carryOnPieceCount", "carryOnPieceWeightKg", "personalItemMode", "personalItemPieceCount", "personalItemPieceWeightKg", "provenance", "confirmed", "sourceLabel", "verifiedAt", "notes"},
    "budget-item": {"id", "name", "category", "amount", "currency", "cadence", "basis", "paid", "notes", "sourceLabel", "verifiedAt"},
    "study-event": {"id", "title", "kind", "startDate", "mandatory", "notes"},
    "travel-plan": {"id", "kind", "title", "destinations", "startDate", "endDate", "travelers", "budget", "currency", "notes", "days", "travelNotes", "packingItems", "createdAt", "updatedAt"},
}
ALLOWED_FIELDS = {
    "journey": {"title", "ownerName", "homeCity", "hostCity", "hostSchool", "program", "startDate", "endDate", "orientationDate", "destinations"},
    "task": {"id", "title", "description", "phase", "status", "priority", "dueDate", "predecessorIds", "notes", "sourceLabel", "sourceUrl", "verifiedAt", "templateKind", "scheduledAt", "timeZone", "location", "contactName", "contactInfo", "referenceNumber", "cost", "currency", "checklist", "records", "result"},
    "resource": {"id", "title", "description", "details", "category", "type", "url", "verifiedAt", "region", "origin", "privacy", "sourceLabel"},
    "resource-intake": {"id", "url", "note", "status", "createdAt"},
    "packing-item": {"id", "name", "category", "decision", "bagId", "quantity", "weightKg", "packed", "warning"},
    "bag": {"id", "name", "kind", "limitKg", "limitSource"},
    "flight-allowance": {"id", "label", "airline", "segment", "checkedMode", "checkedPieceCount", "checkedPieceWeightKg", "checkedTotalWeightKg", "carryOnMode", "carryOnPieceCount", "carryOnPieceWeightKg", "personalItemMode", "personalItemPieceCount", "personalItemPieceWeightKg", "provenance", "confirmed", "sourceLabel", "verifiedAt", "notes"},
    "budget-item": {"id", "name", "category", "amount", "currency", "cadence", "basis", "paid", "notes", "sourceLabel", "verifiedAt"},
    "study-event": {"id", "title", "kind", "startDate", "endDate", "startTime", "repeatWeekly", "mandatory", "notes"},
    "travel-plan": {"id", "kind", "title", "destinations", "startDate", "endDate", "travelers", "budget", "currency", "notes", "days", "travelNotes", "packingItems", "createdAt", "updatedAt"},
}
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bsb_secret_[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"(?:file://|/Users/|[A-Za-z]:\\Users\\)"),
)


def fail(message: str) -> None:
    raise ValueError(message)


def nonempty_text(value: object, maximum: int = 1000) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= maximum


def valid_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def valid_timestamp(value: object) -> bool:
    if not isinstance(value, str) or "T" not in value or not re.search(r"(?:Z|[+-]\d{2}:\d{2})$", value):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def valid_http_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def valid_safe_intake_url(value: object) -> bool:
    if not valid_http_url(value):
        return False
    parsed = urlparse(value)
    if parsed.username or parsed.password:
        return False
    sensitive = re.compile(r"(?:^|[_-])(?:access[_-]?token|api[_-]?key|apikey|auth|key|password|secret|signature|token)(?:$|[_-])", re.IGNORECASE)
    return not any(sensitive.search(part.split("=", 1)[0]) for part in parsed.query.split("&") if part)


def valid_clock(value: object) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value))


def valid_local_datetime(value: object) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
        return False
    day, clock = value.split("T")
    return valid_date(day) and valid_clock(clock)


def nonnegative_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0


def only_keys(value: dict[str, object], allowed: set[str]) -> bool:
    return set(value).issubset(allowed)


def unique_ids(value: list[object]) -> bool:
    ids = [item.get("id") if isinstance(item, dict) else None for item in value]
    return all(isinstance(item, str) for item in ids) and len(ids) == len(set(ids))


def valid_travel_activities(value: object) -> bool:
    if not isinstance(value, list):
        return False
    allowed = {"place", "food", "transport", "stay", "note"}
    return unique_ids(value) and all(
        isinstance(item, dict)
        and only_keys(item, ACTIVITY_FIELDS)
        and nonempty_text(item.get("id"), 160)
        and valid_clock(item.get("time"))
        and nonempty_text(item.get("title"), 200)
        and item.get("kind") in allowed
        and isinstance(item.get("location"), str)
        and (item.get("mapsUrl") in {None, ""} or valid_http_url(item.get("mapsUrl")))
        and nonnegative_number(item.get("durationMinutes"))
        and nonnegative_number(item.get("cost"))
        and isinstance(item.get("booked"), bool)
        and isinstance(item.get("notes"), str)
        for item in value
    )


def valid_travel_days(value: object, start_date: str | None = None, end_date: str | None = None) -> bool:
    return isinstance(value, list) and unique_ids(value) and all(
        isinstance(item, dict)
        and only_keys(item, TRAVEL_DAY_FIELDS)
        and nonempty_text(item.get("id"), 160)
        and valid_date(item.get("date"))
        and (start_date is None or item["date"] >= start_date)
        and (end_date is None or item["date"] <= end_date)
        and nonempty_text(item.get("title"), 200)
        and valid_travel_activities(item.get("activities"))
        for item in value
    )


def valid_travel_notes(value: object) -> bool:
    allowed = {"transport", "booking", "safety", "food", "shopping", "general"}
    return isinstance(value, list) and unique_ids(value) and all(
        isinstance(item, dict)
        and only_keys(item, TRAVEL_NOTE_FIELDS)
        and nonempty_text(item.get("id"), 160)
        and nonempty_text(item.get("title"), 200)
        and isinstance(item.get("details"), str)
        and item.get("category") in allowed
        and isinstance(item.get("important"), bool)
        for item in value
    )


def valid_travel_packing(value: object) -> bool:
    return isinstance(value, list) and unique_ids(value) and all(
        isinstance(item, dict)
        and only_keys(item, TRAVEL_PACKING_FIELDS)
        and nonempty_text(item.get("id"), 160)
        and nonempty_text(item.get("name"), 200)
        and nonempty_text(item.get("category"), 100)
        and nonnegative_number(item.get("quantity"))
        and isinstance(item.get("packed"), bool)
        and isinstance(item.get("notes"), str)
        for item in value
    )


def valid_flight_allowance_semantics(value: dict[str, object]) -> bool:
    count = value.get("checkedPieceCount")
    piece_weight = value.get("checkedPieceWeightKg")
    total_weight = value.get("checkedTotalWeightKg")
    if value.get("checkedMode") == "piece":
        checked_valid = isinstance(count, int) and not isinstance(count, bool) and count > 0 and nonnegative_number(piece_weight) and piece_weight > 0 and total_weight == 0
    elif value.get("checkedMode") == "weight":
        checked_valid = count == 0 and piece_weight == 0 and nonnegative_number(total_weight) and total_weight > 0
    else:
        checked_valid = value.get("checkedMode") in {"none", "unknown"} and count == 0 and piece_weight == 0 and total_weight == 0

    def item_rule(mode: object, item_count: object, item_weight: object) -> bool:
        if mode == "piece":
            return isinstance(item_count, int) and not isinstance(item_count, bool) and item_count > 0 and nonnegative_number(item_weight) and item_weight > 0
        return mode in {"none", "unknown"} and item_count == 0 and item_weight == 0

    cabin_valid = item_rule(value.get("carryOnMode"), value.get("carryOnPieceCount"), value.get("carryOnPieceWeightKg"))
    personal_valid = item_rule(value.get("personalItemMode"), value.get("personalItemPieceCount"), value.get("personalItemPieceWeightKg"))
    complete_if_confirmed = value.get("confirmed") is False or all(value.get(key) != "unknown" for key in ("checkedMode", "carryOnMode", "personalItemMode"))
    return checked_valid and cabin_valid and personal_valid and complete_if_confirmed


def valid_budget_semantics(value: dict[str, object], partial: bool = False) -> bool:
    amount_is_changing = "amount" in value
    basis = value.get("basis")
    if partial and not amount_is_changing and basis is None:
        return True
    if amount_is_changing and nonnegative_number(value.get("amount")) and value["amount"] > 0:
        return basis in {"estimate", "confirmed"} and isinstance(value.get("currency"), str) and bool(re.fullmatch(r"[A-Z]{3}", value["currency"])) and nonempty_text(value.get("sourceLabel"), 300) and valid_date(value.get("verifiedAt"))
    if basis in {"estimate", "confirmed"}:
        return nonempty_text(value.get("sourceLabel"), 300) and valid_date(value.get("verifiedAt"))
    return basis in {None, "unset"}


def validate_field(entity: str, key: str, value: object) -> bool:
    if key not in ALLOWED_FIELDS[entity]:
        return False
    if entity == "journey":
        if key in {"title", "ownerName", "homeCity", "hostCity", "hostSchool", "program"}:
            return nonempty_text(value, 300)
        if key in {"startDate", "endDate"}:
            return valid_date(value)
        if key == "orientationDate":
            return value == "" or valid_date(value)
        if key == "destinations":
            return isinstance(value, list) and bool(value) and all(nonempty_text(item, 200) for item in value)
        return False
    if key == "id":
        return nonempty_text(value, 160)
    if entity == "task":
        if key == "title":
            return nonempty_text(value, 200)
        if key in {"description", "notes", "sourceLabel", "timeZone", "location", "contactName", "contactInfo", "referenceNumber", "result"}:
            return isinstance(value, str) and len(value) <= 4000
        if key == "phase":
            return value in {"admission", "visa", "pre-departure", "arrival-72h", "arrival-2w", "semester", "return"}
        if key == "status":
            return value in {"not-started", "in-progress", "waiting", "done", "not-applicable"}
        if key == "priority":
            return value in {"high", "medium", "low"}
        if key == "templateKind":
            return value in {"general", "flight", "course", "visa", "housing", "payment", "school-admin"}
        if key in {"dueDate", "verifiedAt"}:
            return valid_date(value)
        if key == "scheduledAt":
            return valid_local_datetime(value)
        if key == "sourceUrl":
            return valid_http_url(value)
        if key == "predecessorIds":
            return isinstance(value, list) and all(isinstance(item, str) for item in value)
        if key == "cost":
            return nonnegative_number(value)
        if key == "currency":
            return isinstance(value, str) and bool(re.fullmatch(r"[A-Z]{3}", value))
        if key == "checklist":
            return isinstance(value, list) and unique_ids(value) and all(isinstance(item, dict) and only_keys(item, CHECKLIST_FIELDS) and nonempty_text(item.get("id"), 160) and nonempty_text(item.get("label"), 300) and isinstance(item.get("done"), bool) for item in value)
        if key == "records":
            return isinstance(value, list) and unique_ids(value) and all(isinstance(item, dict) and only_keys(item, RECORD_FIELDS) and nonempty_text(item.get("id"), 160) and valid_date(item.get("date")) and nonempty_text(item.get("note"), 2000) for item in value)
    if entity == "resource":
        if key == "title":
            return nonempty_text(value, 200)
        if key in {"description", "details", "category", "region"}:
            return nonempty_text(value, 4000 if key == "description" else 8000 if key == "details" else 200)
        if key == "type":
            return value in {"official", "school", "city", "experience", "personal"}
        if key == "url":
            return value == "" or valid_http_url(value)
        if key == "verifiedAt":
            return valid_date(value)
        if key == "origin":
            return value in {"user-upload", "ai-research", "manual"}
        if key == "privacy":
            return value in PRIVACY
        if key == "sourceLabel":
            return nonempty_text(value, 300)
    if entity == "resource-intake":
        if key == "url":
            return valid_safe_intake_url(value)
        if key == "note":
            return isinstance(value, str) and len(value) <= 1000
        if key == "status":
            return value in {"pending", "processed"}
        if key == "createdAt":
            return valid_timestamp(value)
    if entity == "packing-item":
        if key in {"name", "category"}:
            return nonempty_text(value, 200)
        if key == "decision":
            return value in {"must", "recommend", "buy-there", "skip"}
        if key == "bagId":
            return isinstance(value, str)
        if key in {"quantity", "weightKg"}:
            return nonnegative_number(value)
        if key == "packed":
            return isinstance(value, bool)
        if key == "warning":
            return isinstance(value, str) and len(value) <= 1000
    if entity == "bag":
        if key == "name":
            return nonempty_text(value, 200)
        if key == "kind":
            return value in {"checked", "carry-on", "personal"}
        if key == "limitKg":
            return nonnegative_number(value)
        if key == "limitSource":
            return value in {"unconfirmed", "ticket", "manual"}
    if entity == "flight-allowance":
        if key in {"label", "airline", "segment", "sourceLabel"}:
            return nonempty_text(value, 300)
        if key == "checkedMode":
            return value in {"piece", "weight", "none", "unknown"}
        if key in {"checkedPieceCount", "checkedPieceWeightKg", "checkedTotalWeightKg", "carryOnPieceCount", "carryOnPieceWeightKg", "personalItemPieceCount", "personalItemPieceWeightKg"}:
            return nonnegative_number(value)
        if key in {"carryOnMode", "personalItemMode"}:
            return value in {"piece", "none", "unknown"}
        if key == "provenance":
            return value in {"ticket", "manual"}
        if key == "confirmed":
            return isinstance(value, bool)
        if key == "verifiedAt":
            return valid_date(value)
        if key == "notes":
            return isinstance(value, str) and len(value) <= 4000
    if entity == "budget-item":
        if key == "name":
            return nonempty_text(value, 200)
        if key == "category":
            return value in {"housing", "food", "transport", "arrival", "other"}
        if key == "amount":
            return nonnegative_number(value)
        if key == "currency":
            return isinstance(value, str) and bool(re.fullmatch(r"[A-Z]{3}", value))
        if key == "cadence":
            return value in {"once", "monthly"}
        if key == "basis":
            return value in {"unset", "estimate", "confirmed"}
        if key == "paid":
            return isinstance(value, bool)
        if key == "notes":
            return isinstance(value, str) and len(value) <= 4000
        if key == "sourceLabel":
            return isinstance(value, str) and len(value) <= 300
        if key == "verifiedAt":
            return value == "" or valid_date(value)
    if entity == "study-event":
        if key == "title":
            return nonempty_text(value, 200)
        if key == "kind":
            return value in {"class", "exam", "deadline", "orientation", "personal"}
        if key in {"startDate", "endDate"}:
            return valid_date(value)
        if key == "startTime":
            return valid_clock(value)
        if key in {"repeatWeekly", "mandatory"}:
            return isinstance(value, bool)
        if key == "notes":
            return isinstance(value, str) and len(value) <= 4000
    if entity == "travel-plan":
        if key == "kind":
            return value == "travel"
        if key == "title":
            return nonempty_text(value, 200)
        if key == "destinations":
            return isinstance(value, list) and bool(value) and all(isinstance(item, str) for item in value)
        if key in {"startDate", "endDate"}:
            return valid_date(value)
        if key in {"travelers", "notes"}:
            return isinstance(value, str) and len(value) <= 4000
        if key == "budget":
            return nonnegative_number(value)
        if key == "currency":
            return isinstance(value, str) and bool(re.fullmatch(r"[A-Z]{3}", value))
        if key == "days":
            return valid_travel_days(value)
        if key == "travelNotes":
            return valid_travel_notes(value)
        if key == "packingItems":
            return valid_travel_packing(value)
        if key in {"createdAt", "updatedAt"}:
            return valid_timestamp(value)
    return False


def validate_entity_value(entity: str, action: str, value: dict[str, object], index: int) -> None:
    if not value:
        fail(f"proposals[{index}].value must not be empty")
    if entity == "journey" and action != "update":
        fail(f"proposals[{index}] journey only supports update")
    if action == "update":
        if "id" in value:
            fail(f"proposals[{index}] update value must not replace id")
    elif not REQUIRED_ADD_FIELDS[entity].issubset(value):
        missing = REQUIRED_ADD_FIELDS[entity] - set(value)
        fail(f"proposals[{index}] add value is missing fields: {sorted(missing)}")
    invalid = [key for key, field in value.items() if not validate_field(entity, key, field)]
    if invalid:
        fail(f"proposals[{index}] has invalid or unsupported value fields: {invalid}")
    if entity == "budget-item" and not valid_budget_semantics(value, action == "update"):
        fail(f"proposals[{index}] budget amount needs currency, basis, sourceLabel, and verifiedAt")
    if action == "update":
        if entity == "study-event" and isinstance(value.get("startDate"), str) and isinstance(value.get("endDate"), str) and value["endDate"] < value["startDate"]:
            fail(f"proposals[{index}] study-event endDate precedes startDate")
        return
    if not nonempty_text(value.get("id"), 160):
        fail(f"proposals[{index}].value.id is invalid")
    if entity == "resource":
        if value.get("type") != "personal" and not valid_http_url(value.get("url")):
            fail(f"proposals[{index}] non-personal resource needs an HTTP(S) URL")
        if value.get("type") == "personal" and value.get("privacy") != "private":
            fail(f"proposals[{index}] personal resource must stay private")
    if entity == "flight-allowance" and not valid_flight_allowance_semantics(value):
        fail(f"proposals[{index}] flight-allowance fields conflict with checkedMode")
    if entity == "study-event" and isinstance(value.get("endDate"), str) and value["endDate"] < value["startDate"]:
        fail(f"proposals[{index}] study-event endDate precedes startDate")
    if entity == "travel-plan":
        if value["endDate"] < value["startDate"]:
            fail(f"proposals[{index}] travel-plan endDate precedes startDate")
        if not valid_travel_days(value["days"], value["startDate"], value["endDate"]):
            fail(f"proposals[{index}] travel-plan days are invalid or out of range")


def journey_scope_for_state(state: dict[str, object]) -> str:
    journey = state.get("journey")
    if not isinstance(journey, dict):
        fail("state.journey is required for journeyScope validation")
    journey_id = journey.get("id")
    if not isinstance(journey_id, str) or not journey_id:
        fail("state.journey.id is required for journeyScope")
    return f"exchange:{journey_id}"


def unwrap_state_document(document: object) -> dict[str, object]:
    if not isinstance(document, dict):
        fail("current state must be a JSON object")
    if document.get("kind") != "exchange-companion-handoff":
        return document
    if document.get("schemaVersion") != 1 or not isinstance(document.get("state"), dict):
        fail("handoff schemaVersion/state is invalid")
    state = document["state"]
    expected_scope = journey_scope_for_state(state)
    if document.get("journeyScope") != expected_scope:
        fail("handoff journeyScope does not match handoff.state")
    return state


def validate(path: Path, state_path: Path | None = None) -> dict[str, int]:
    raw = path.read_text(encoding="utf-8")
    if len(raw) > 2_000_000:
        fail("bundle exceeds 2 MB")
    if any(pattern.search(raw) for pattern in SECRET_PATTERNS):
        fail("bundle contains a secret or private local path pattern")
    data = json.loads(raw)
    if not isinstance(data, dict) or not only_keys(data, ROOT_FIELDS):
        fail("bundle root contains unsupported fields")
    if data.get("schemaVersion") != 1:
        fail("schemaVersion must be 1")
    if not valid_timestamp(data.get("generatedAt")) or not nonempty_text(data.get("journeyScope"), 300):
        fail("generatedAt must be ISO 8601 and journeyScope is required")
    if "baseRevision" in data and (not isinstance(data["baseRevision"], int) or isinstance(data["baseRevision"], bool) or data["baseRevision"] < 1):
        fail("baseRevision must be a positive integer")
    sources = data.get("sources")
    proposals = data.get("proposals")
    if not isinstance(sources, list) or not isinstance(proposals, list):
        fail("sources and proposals must be arrays")

    source_ids: set[str] = set()
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            fail(f"sources[{index}] must be an object")
        if not only_keys(source, SOURCE_FIELDS):
            fail(f"sources[{index}] contains unsupported fields")
        if not nonempty_text(source.get("id"), 160) or not source["id"].startswith("source-"):
            fail(f"sources[{index}].id must start with source-")
        if not nonempty_text(source.get("label"), 300) or source.get("kind") not in SOURCE_KINDS or not valid_date(source.get("capturedAt")):
            fail(f"sources[{index}] label/kind/capturedAt is invalid")
        if "evidenceType" in source and source["evidenceType"] not in {"general", "ticket"}:
            fail(f"sources[{index}].evidenceType is invalid")
        if "url" in source and not valid_http_url(source["url"]):
            fail(f"sources[{index}].url must be HTTP(S)")
        if "note" in source and (not isinstance(source["note"], str) or len(source["note"]) > 1000):
            fail(f"sources[{index}].note must be a string of at most 1000 characters")
        if source["id"] in source_ids:
            fail(f"duplicate source id: {source['id']}")
        source_ids.add(source["id"])
    source_by_id = {source["id"]: source for source in sources}

    state = unwrap_state_document(json.loads(state_path.read_text(encoding="utf-8"))) if state_path else None
    state_ids: dict[str, set[str]] = {}
    state_items: dict[str, dict[str, dict[str, object]]] = {}
    existing_source_ids: set[str] = set()
    existing_proposal_ids: set[str] = set()
    if state is not None:
        for entity, key in ENTITY_ARRAYS.items():
            items = [state.get(key)] if entity == "journey" else (state.get(key, []) or [])
            if not isinstance(items, list):
                fail(f"state.{key} must be an array")
            state_ids[entity] = {item["id"] for item in items if isinstance(item, dict) and isinstance(item.get("id"), str)}
            state_items[entity] = {item["id"]: item for item in items if isinstance(item, dict) and isinstance(item.get("id"), str)}
        expected_scope = journey_scope_for_state(state)
        if data["journeyScope"] != expected_scope:
            fail(f"journeyScope mismatch: expected {expected_scope}")
        if isinstance(json.loads(state_path.read_text(encoding="utf-8")), dict):
            state_document = json.loads(state_path.read_text(encoding="utf-8"))
            expected_revision = state_document.get("baseRevision") if state_document.get("kind") == "exchange-companion-handoff" else None
            if expected_revision is not None and data.get("baseRevision") != expected_revision:
                fail(f"baseRevision mismatch: expected {expected_revision}")
        inbox = state.get("aiInbox") or {}
        existing_source_ids = {item["id"] for item in inbox.get("sources", []) if isinstance(item, dict) and isinstance(item.get("id"), str)}
        existing_proposal_ids = {item["id"] for item in inbox.get("proposals", []) if isinstance(item, dict) and isinstance(item.get("id"), str)}
        source_collisions = source_ids & existing_source_ids
        if source_collisions:
            fail(f"source IDs already exist in state.aiInbox: {sorted(source_collisions)}")
    bag_ids = {bag["id"] for bag in (state or {}).get("bags", []) if isinstance(bag, dict) and isinstance(bag.get("id"), str)}

    counts = {"high": 0, "medium": 0, "low": 0, "private": 0, "shareable": 0}
    proposal_ids: set[str] = set()
    added_ids: dict[str, set[str]] = {entity: set() for entity in ENTITIES}
    proposed_task_ids = {
        proposal.get("value", {}).get("id")
        for proposal in proposals
        if isinstance(proposal, dict) and proposal.get("entity") == "task" and proposal.get("action") == "add" and isinstance(proposal.get("value"), dict) and isinstance(proposal["value"].get("id"), str)
    }
    proposed_bag_ids = {
        proposal.get("value", {}).get("id")
        for proposal in proposals
        if isinstance(proposal, dict) and proposal.get("entity") == "bag" and proposal.get("action") == "add" and isinstance(proposal.get("value"), dict) and isinstance(proposal["value"].get("id"), str)
    }
    for index, proposal in enumerate(proposals):
        if not isinstance(proposal, dict):
            fail(f"proposals[{index}] must be an object")
        if not only_keys(proposal, PROPOSAL_FIELDS):
            fail(f"proposals[{index}] contains unsupported fields")
        if not nonempty_text(proposal.get("id"), 180) or not proposal["id"].startswith("proposal-"):
            fail(f"proposals[{index}].id must start with proposal-")
        if proposal["id"] in existing_proposal_ids:
            fail(f"proposals[{index}].id already exists in state.aiInbox")
        for key, maximum in (("title", 200), ("summary", 1000)):
            if not nonempty_text(proposal.get(key), maximum):
                fail(f"proposals[{index}].{key} is required")
        if proposal.get("entity") not in ENTITIES or proposal.get("action") not in {"add", "update"}:
            fail(f"proposals[{index}] has an invalid entity/action")
        if proposal.get("confidence") not in CONFIDENCE or proposal.get("privacy") not in PRIVACY or proposal.get("status") != "pending":
            fail(f"proposals[{index}] has invalid confidence/privacy/status")
        value = proposal.get("value")
        if not isinstance(value, dict):
            fail(f"proposals[{index}].value must be an object")
        validate_entity_value(proposal["entity"], proposal["action"], value, index)
        if proposal["entity"] == "journey" and proposal["privacy"] != "private":
            fail(f"proposals[{index}] journey updates must stay private")
        evidence_ids = proposal.get("evidenceIds")
        if not isinstance(evidence_ids, list) or not evidence_ids or not all(isinstance(item, str) for item in evidence_ids):
            fail(f"proposals[{index}] needs string evidenceIds")
        missing_evidence = [item for item in evidence_ids if item not in source_ids]
        if missing_evidence:
            fail(f"proposals[{index}] references unknown evidence: {missing_evidence}")
        evidence_sources = [source_by_id[item] for item in evidence_ids]
        if proposal["entity"] == "resource-intake" and proposal["privacy"] != "private":
            fail(f"proposals[{index}] resource-intake must stay private")
        if proposal["entity"] == "budget-item" and proposal["privacy"] != "private":
            fail(f"proposals[{index}] budget-item must stay private")
        if proposal["entity"] == "resource":
            if value.get("privacy") != proposal["privacy"]:
                fail(f"proposals[{index}] resource privacy must match proposal privacy")
            if value.get("origin") == "manual":
                fail(f"proposals[{index}] AI resource proposal cannot claim manual origin")
            if value.get("origin") == "user-upload" and (value.get("privacy") != "private" or not any(source.get("kind") in {"file", "email"} for source in evidence_sources)):
                fail(f"proposals[{index}] user-upload resource needs private file/email evidence")
            if value.get("origin") == "ai-research" and not any(source.get("kind") in {"official", "school", "city", "research", "video"} for source in evidence_sources):
                fail(f"proposals[{index}] AI-research resource needs web research evidence")
        if proposal["entity"] == "flight-allowance":
            if value.get("provenance") != "ticket" or not any(source.get("evidenceType") == "ticket" and source.get("kind") in {"file", "email"} for source in evidence_sources):
                fail(f"proposals[{index}] flight allowance needs authorized ticket file/email evidence")
        if proposal["entity"] == "bag" and value.get("limitSource") == "ticket" and not any(source.get("evidenceType") == "ticket" and source.get("kind") in {"file", "email"} for source in evidence_sources):
            fail(f"proposals[{index}] ticket-derived bag limit needs authorized ticket file/email evidence")
        if proposal["action"] == "update":
            if not nonempty_text(proposal.get("targetId"), 160):
                fail(f"proposals[{index}].targetId is required for updates")
            if state is not None and proposal["targetId"] not in state_ids[proposal["entity"]]:
                fail(f"proposals[{index}] target does not exist in state.{ENTITY_ARRAYS[proposal['entity']]}")
        else:
            if "targetId" in proposal:
                fail(f"proposals[{index}] add must not include targetId")
            new_id = value["id"]
            if new_id in added_ids[proposal["entity"]] or (state is not None and new_id in state_ids[proposal["entity"]]):
                fail(f"proposals[{index}] add id already exists: {new_id}")
            added_ids[proposal["entity"]].add(new_id)
        if proposal["entity"] == "packing-item" and state is not None and value.get("bagId") not in {None, "", *bag_ids, *proposed_bag_ids}:
            fail(f"proposals[{index}] packing bagId is not an existing bag or empty")
        prospective = value
        if state is not None and proposal["action"] == "update":
            prospective = {**state_items[proposal["entity"]][proposal["targetId"]], **value}
        if proposal["entity"] == "study-event" and isinstance(prospective.get("startDate"), str) and isinstance(prospective.get("endDate"), str) and prospective["endDate"] < prospective["startDate"]:
            fail(f"proposals[{index}] study-event endDate precedes startDate")
        if proposal["entity"] == "journey" and isinstance(prospective.get("startDate"), str) and isinstance(prospective.get("endDate"), str) and prospective["endDate"] < prospective["startDate"]:
            fail(f"proposals[{index}] journey endDate precedes startDate")
        if proposal["entity"] == "budget-item" and not valid_budget_semantics(prospective):
            fail(f"proposals[{index}] budget amount lacks a confirmed or estimated basis")
        if proposal["entity"] == "travel-plan" and isinstance(prospective.get("startDate"), str) and isinstance(prospective.get("endDate"), str):
            if prospective["endDate"] < prospective["startDate"]:
                fail(f"proposals[{index}] travel-plan endDate precedes startDate")
            if "days" in prospective and not valid_travel_days(prospective["days"], prospective["startDate"], prospective["endDate"]):
                fail(f"proposals[{index}] travel-plan days are invalid or out of range")
        if proposal["entity"] == "flight-allowance" and state is not None and not valid_flight_allowance_semantics(prospective):
            fail(f"proposals[{index}] flight-allowance fields conflict with checkedMode")
        if proposal["entity"] == "task" and isinstance(prospective.get("predecessorIds"), list) and state is not None:
            allowed_predecessors = state_ids["task"] | proposed_task_ids
            missing_predecessors = [item for item in prospective["predecessorIds"] if item not in allowed_predecessors]
            if missing_predecessors:
                fail(f"proposals[{index}] references missing predecessor tasks: {missing_predecessors}")
        if proposal["id"] in proposal_ids:
            fail(f"duplicate proposal id: {proposal['id']}")
        proposal_ids.add(proposal["id"])
        counts[proposal["confidence"]] += 1
        counts[proposal["privacy"]] += 1
    return counts


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        print("usage: validate_import_bundle.py <bundle.json> [current-state.json]", file=sys.stderr)
        return 2
    try:
        counts = validate(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) == 3 else None)
    except (OSError, json.JSONDecodeError, ValueError, TypeError, KeyError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    print("VALID " + " ".join(f"{key}={value}" for key, value in counts.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
