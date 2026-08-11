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


def push(connection: dict, bundle_path: Path) -> None:
    bundle = read_object(bundle_path)
    base_revision = bundle.get("baseRevision")
    if not isinstance(base_revision, int) or base_revision < 1:
        raise SystemExit("Bundle is missing a positive baseRevision. Initialize it from the latest cloud handoff.")
    response = post(connection, {
        "action": "proposals",
        "baseRevision": base_revision,
        "runKey": run_key(bundle),
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
    return result


def main() -> None:
    args = parser().parse_args()
    connection = read_connection(args.connection)
    if args.command == "pull":
        pull(connection, args.output)
    else:
        push(connection, args.bundle)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
