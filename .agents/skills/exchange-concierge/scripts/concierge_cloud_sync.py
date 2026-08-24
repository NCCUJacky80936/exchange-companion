#!/usr/bin/env python3
"""Pull the latest Exchange Companion handoff and submit reviewed proposal bundles."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

DEFAULT_CONNECTION = Path("work/exchange-concierge-connection.json")
DEFAULT_HANDOFF = Path("work/latest-exchange-companion-handoff.json")


def read_object(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Cannot read valid JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise SystemExit(f"Expected a JSON object in {path}")
    return value


def read_connection(path: Path) -> dict:
    connection = read_object(path)
    if connection.get("kind") != "exchange-concierge-connection":
        raise SystemExit("Connection file has the wrong kind. Download a new one from AI 幫我整理.")
    if not isinstance(connection.get("endpoint"), str) or not str(connection["endpoint"]).startswith("https://"):
        raise SystemExit("Connection endpoint must use HTTPS.")
    token = connection.get("token")
    if not isinstance(token, str) or not token.startswith("xc_"):
        raise SystemExit("Connection token is missing or invalid.")
    return connection


def post(connection: dict, payload: dict) -> dict:
    request = urllib.request.Request(
        connection["endpoint"],
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {connection['token']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            value = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            error = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            error = {"error": "request_failed"}
        if exc.code == 409 and error.get("error") == "revision_conflict":
            raise SystemExit("Cloud state changed. Pull again, regenerate proposals, and revalidate before pushing.") from exc
        raise SystemExit(f"Cloud request failed ({exc.code}): {error.get('error', 'request_failed')}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Cloud request failed: {exc}") from exc
    if not isinstance(value, dict):
        raise SystemExit("Cloud returned an invalid response.")
    return value


def pull(connection: dict, output: Path) -> None:
    handoff = post(connection, {"action": "context"})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(handoff, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Pulled revision {handoff.get('baseRevision')} to {output}")


def run_key(bundle: dict) -> str:
    suffixes = []
    for proposal in bundle.get("proposals", []):
        if isinstance(proposal, dict) and isinstance(proposal.get("id"), str):
            marker = proposal["id"].rfind("run-")
            if marker >= 0:
                suffixes.append(proposal["id"][marker:])
    if suffixes and all(item == suffixes[0] for item in suffixes):
        return suffixes[0]
    return datetime.now().astimezone().strftime("run-%Y%m%d-%H%M%S-cli")


def claim(connection: dict) -> dict:
    response = post(connection, {"action": "telegram-claim"})
    batch = response.get("telegramBatch")
    if not isinstance(batch, dict):
        raise SystemExit("Cloud returned an invalid Telegram batch.")
    requests = batch.get("requests")
    lease_id = batch.get("leaseId")
    if not isinstance(requests, list) or (lease_id is not None and not isinstance(lease_id, str)):
        raise SystemExit("Cloud returned an invalid Telegram batch.")
    return batch


def clarify(connection: dict, lease_id: str, request_id: str, question: str) -> dict:
    return post(connection, {
        "action": "telegram-clarify",
        "leaseId": lease_id,
        "requestId": request_id,
        "question": question,
    })


def complete(
    connection: dict,
    lease_id: str,
    request_ids: list[str],
    completion_run_key: str,
    proposal_count: int,
    outcome: str,
) -> dict:
    return post(connection, {
        "action": "telegram-complete",
        "leaseId": lease_id,
        "requestIds": request_ids,
        "runKey": completion_run_key,
        "proposalCount": proposal_count,
        "outcome": outcome,
    })


def fail(connection: dict, lease_id: str, request_ids: list[str], error: str) -> dict:
    return post(connection, {
        "action": "telegram-fail",
        "leaseId": lease_id,
        "requestIds": request_ids,
        "error": error,
    })


def push(connection: dict, bundle_path: Path, run_key_override: str | None = None) -> None:
    bundle = read_object(bundle_path)
    base_revision = bundle.get("baseRevision")
    if not isinstance(base_revision, int) or base_revision < 1:
        raise SystemExit("Bundle is missing a positive baseRevision. Initialize it from the latest cloud handoff.")
    response = post(connection, {
        "action": "proposals",
        "baseRevision": base_revision,
        "runKey": run_key_override or run_key(bundle),
        "bundle": bundle,
    })
    duplicate = " (already submitted)" if response.get("duplicate") else ""
    print(f"Submitted pending proposal run {response.get('runId')}{duplicate}")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Exchange Concierge cloud handoff helper")
    result.add_argument("--connection", type=Path, default=DEFAULT_CONNECTION, help="private connection JSON")
    subcommands = result.add_subparsers(dest="command", required=True)
    pull_parser = subcommands.add_parser("pull", help="download the latest versioned handoff")
    pull_parser.add_argument("--output", type=Path, default=DEFAULT_HANDOFF)
    push_parser = subcommands.add_parser("push", help="submit a validated proposal bundle")
    push_parser.add_argument("bundle", type=Path)
    push_parser.add_argument("--run-key")
    claim_parser = subcommands.add_parser("claim", help="lease the oldest Telegram requests")
    claim_parser.add_argument("--output", type=Path, required=True, help="private JSON destination for the de-identified batch")
    clarify_parser = subcommands.add_parser("clarify", help="ask one Telegram request a Force Reply question")
    clarify_parser.add_argument("--lease-id", required=True)
    clarify_parser.add_argument("--request-id", required=True)
    clarify_parser.add_argument("--question", required=True)
    complete_parser = subcommands.add_parser("complete", help="complete leased Telegram requests after delivery")
    complete_parser.add_argument("--lease-id", required=True)
    complete_parser.add_argument("--request-id", action="append", required=True)
    complete_parser.add_argument("--run-key", required=True)
    complete_parser.add_argument("--proposal-count", type=int, required=True)
    complete_parser.add_argument("--outcome", choices=("processed", "no_change"), required=True)
    fail_parser = subcommands.add_parser("fail", help="release or fail leased Telegram requests")
    fail_parser.add_argument("--lease-id", required=True)
    fail_parser.add_argument("--request-id", action="append", required=True)
    fail_parser.add_argument("--error", default="processing_failed")
    return result


def main() -> None:
    args = parser().parse_args()
    connection = read_connection(args.connection)
    if args.command == "pull":
        pull(connection, args.output)
    elif args.command == "push":
        push(connection, args.bundle, args.run_key)
    elif args.command == "claim":
        batch = claim(connection)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(batch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Claimed {len(batch['requests'])} Telegram request(s) to {args.output}")
    elif args.command == "clarify":
        clarify(connection, args.lease_id, args.request_id, args.question)
        print("Telegram clarification sent")
    elif args.command == "complete":
        response = complete(connection, args.lease_id, args.request_id, args.run_key, args.proposal_count, args.outcome)
        print(f"Completed {response.get('completed', len(args.request_id))} Telegram request(s)")
    else:
        response = fail(connection, args.lease_id, args.request_id, args.error)
        requests = response.get("requests")
        print(f"Recorded failure for {len(requests) if isinstance(requests, list) else len(args.request_id)} Telegram request(s)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
