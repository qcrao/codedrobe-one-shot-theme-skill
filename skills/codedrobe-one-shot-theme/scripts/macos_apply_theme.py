#!/usr/bin/env python3
"""Apply a CodeDrobe theme through one detached macOS watcher.

This script orchestrates the published @codedrobe/core CLI. It does not inject
CSS, modify app bundles, or implement CodeDrobe runtime behavior.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import sys
import time


def core_runner() -> list[str]:
    global_cli = shutil.which("codedrobe")
    if global_cli:
        return [global_cli]
    npx = shutil.which("npx")
    if not npx:
        raise SystemExit("Neither codedrobe nor npx is available on PATH.")
    return [npx, "--yes", "@codedrobe/core@latest"]


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=check, text=True, capture_output=True)


def parse_json_output(output: str) -> dict:
    start = output.find("{")
    if start < 0:
        raise ValueError("Core did not return JSON output")
    return json.loads(output[start:])


def safe_label(theme_id: str) -> str:
    suffix = re.sub(r"[^a-z0-9-]+", "-", theme_id.lower()).strip("-")
    return f"com.codedrobe.one-shot.{suffix or 'theme'}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--theme", required=True, type=Path)
    parser.add_argument("--app", default="codex")
    parser.add_argument("--port", type=int, default=9335)
    parser.add_argument(
        "--restart-existing",
        action="store_true",
        help="Allow Core to close and restart the running app when required.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if platform.system() != "Darwin":
        raise SystemExit("macos_apply_theme.py supports macOS only.")

    theme = args.theme.expanduser().resolve()
    if not theme.is_file():
        raise SystemExit(f"Theme package does not exist: {theme}")

    core = core_runner()
    inspect_cmd = [*core, "theme", "inspect", str(theme)]
    detect_cmd = [*core, "detect", "--app", args.app, "--json"]

    if args.dry_run:
        inspect_data = {"theme": {"id": theme.stem}}
        detect_data = {"installed": True, "running": True}
    else:
        inspect_result = run(inspect_cmd)
        inspect_data = parse_json_output(inspect_result.stdout)
        detect_result = run(detect_cmd)
        detect_data = parse_json_output(detect_result.stdout)
        if not detect_data.get("installed"):
            raise SystemExit(f"Target app is not installed: {args.app}")
        if not args.restart_existing:
            probe_cmd = [
                *core,
                "probe",
                "--app",
                args.app,
                "--port",
                str(args.port),
                "--timeout-ms",
                "5000",
                "--theme",
                str(theme),
            ]
            probe_result = run(probe_cmd, check=False)
            if probe_result.returncode != 0:
                raise SystemExit(
                    "Codex is not reachable on the selected CDP port. "
                    "Rerun with --restart-existing after the user authorizes restart."
                )

    theme_id = inspect_data.get("theme", {}).get("id") or theme.stem
    label = safe_label(str(theme_id))
    log_dir = Path.home() / "Library" / "Logs" / "CodeDrobe"
    log_dir.mkdir(parents=True, exist_ok=True)
    stdout_log = log_dir / f"{theme_id}-watch.log"
    stderr_log = log_dir / f"{theme_id}-watch.err.log"

    apply_cmd = [
        *core,
        "apply",
        "--app",
        args.app,
        "--port",
        str(args.port),
        "--theme",
        str(theme),
        "--watch",
    ]
    if args.restart_existing:
        apply_cmd.append("--restart-existing")
    else:
        apply_cmd.append("--no-launch")

    plan = {
        "theme": str(theme),
        "themeId": theme_id,
        "app": args.app,
        "port": args.port,
        "restartExisting": args.restart_existing,
        "jobLabel": label,
        "stdoutLog": str(stdout_log),
        "stderrLog": str(stderr_log),
        "command": shlex.join(apply_cmd),
        "detected": detect_data,
    }

    if args.dry_run:
        print(json.dumps({"action": "dry-run", **plan}, indent=2))
        return 0

    # Replace only the watcher owned by this theme workflow.
    subprocess.run(["launchctl", "remove", label], capture_output=True, text=True)
    submit_cmd = [
        "launchctl",
        "submit",
        "-l",
        label,
        "-o",
        str(stdout_log),
        "-e",
        str(stderr_log),
        "--",
        "/bin/zsh",
        "-lc",
        shlex.join(apply_cmd),
    ]
    run(submit_cmd)

    # With no restart, verify the watcher took ownership before returning.
    verified = False
    if not args.restart_existing:
        verify_cmd = [
            *core,
            "verify",
            "--app",
            args.app,
            "--port",
            str(args.port),
            "--theme",
            str(theme),
        ]
        for _ in range(12):
            time.sleep(1)
            result = run(verify_cmd, check=False)
            if result.returncode == 0:
                verified = True
                break

    payload = {
        "action": "submitted",
        "verifiedBeforeReturn": verified,
        "verificationPendingAfterRestart": args.restart_existing,
        **plan,
    }
    print(json.dumps(payload, indent=2))
    if not args.restart_existing and not verified:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
