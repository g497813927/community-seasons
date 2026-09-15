#!/usr/bin/env python3
"""Standard-library launcher for the real JavaScript game fuzz suites."""

import argparse
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


def arguments(argv):
    parser = argparse.ArgumentParser(
        description="Run the Community Seasons JavaScript/fast-check suites from Python.",
        usage="%(prog)s [quick|full] [runner options] [--duration SECONDS] [--node PATH]",
        allow_abbrev=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Runner options are forwarded unchanged to run.mjs:
  --suite all|engine|economy|renderer|engine-properties|save-properties|typed-generators
  --forever                 Repeat until the first failure or interruption
  --rounds N                Run N rounds (cannot combine with --forever)
  --seed N                  Reproducible unsigned 32-bit master seed
  --renderer-seeds N        Renderer cases per round
  --renderer-offset N       Renderer seed-list offset
  --store-seeds N           Economy seeds per round
  --actions N               Actions per economy seed
  --runs N                  Cases per fast-check property
  --budget-seconds N        Renderer guard per round
  --tui                     Show live dashboard when output is a terminal
  --no-tui                  Use plain progress output

Examples:
  python3 tests/fuzz/fuzz_game.py quick
  python3 tests/fuzz/fuzz_game.py quick --suite engine-properties --runs 20 --seed 123
  python3 tests/fuzz/fuzz_game.py quick --forever --duration 60 --seed 123
  FC_PROPERTY=numeric-dt FC_SEED=123 python3 tests/fuzz/fuzz_game.py quick --suite engine-properties

Exact replay environment variables pass through unchanged. A duration is only
a wall-clock ceiling; it does not enable repetition. The first failed suite
stops subsequent suites and rounds. Ctrl+C requests clean child-process shutdown.

Exit codes: 0 = pass or requested duration end (see summary status),
1 = failed check, Node guard or changed test inputs; 2 = launcher/argument error,
130 = Ctrl+C, 143 = termination request. Duration end is not a full test pass.
Results: results/summary.json (Node), results/python-summary.json (launcher).
Requires Python 3.8+ and Node.js 22.13+. No pip dependencies or data uploads.
""",
    )
    parser.add_argument("--duration", type=float, metavar="SECONDS", help="request stop after this wall time, including installation; cleanup may add up to five seconds")
    parser.add_argument("--node", default="node", metavar="PATH", help="Node executable (default: node on PATH)")
    parsed, forwarded = parser.parse_known_args(argv)
    if parsed.duration is not None and (not math.isfinite(parsed.duration) or parsed.duration <= 0):
        parser.error("--duration must be a finite number greater than zero")
    return parsed, forwarded


def process_groups(root_pid):
    """Remember only groups currently owned by our Node descendant tree."""
    groups = {root_pid}
    if os.name != "posix":
        return groups
    try:
        rows = subprocess.run(
            ["ps", "-eo", "pid=,ppid=,pgid="], capture_output=True,
            text=True, timeout=1, check=True,
        ).stdout.splitlines()
        entries = [tuple(map(int, row.split())) for row in rows if len(row.split()) == 3]
        descendants = {root_pid}
        changed = True
        while changed:
            changed = False
            for pid, parent, group in entries:
                if parent in descendants and pid not in descendants:
                    descendants.add(pid)
                    changed = True
                if pid in descendants:
                    groups.add(group)
    except (OSError, ValueError, subprocess.SubprocessError):
        # The Node runner remains responsible for its children; this inventory
        # is only a fallback if graceful shutdown itself gets stuck.
        pass
    groups.discard(os.getpgrp())
    return groups


def stop_child(child, requested_signal):
    groups = process_groups(child.pid)
    forced = False
    if child.poll() is not None:
        return forced
    if os.name != "posix":
        # Windows has no equivalent to the POSIX SIGTERM handler contract.
        # Stop the owned tree together instead of orphaning detached suites.
        subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, check=False)
        child.wait(timeout=3)
        return True
    try:
        # Signal Node first: its handler terminates its detached active suite.
        child.send_signal(requested_signal)
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        forced = True
        for group in groups:
            try:
                os.killpg(group, signal.SIGKILL)
            except ProcessLookupError:
                pass
        child.wait(timeout=3)
    except ProcessLookupError:
        child.wait(timeout=3)
    return forced


def fresh_runner_summary(root, started_ns):
    filename = root / "results" / "summary.json"
    try:
        info = filename.stat()
        if info.st_mtime_ns < started_ns or info.st_size > 2 * 1024 * 1024:
            return None
        value = json.loads(filename.read_text(encoding="utf-8"))
        if isinstance(value, dict):
            return {key: value.get(key) for key in ("status", "completedRounds", "roundCounts", "requestedRounds", "masterSeed", "totalElapsedSeconds", "latestRound", "stopSignal")}
    except (OSError, ValueError):
        pass
    return None


def main(argv=None):
    options, forwarded = arguments(sys.argv[1:] if argv is None else argv)
    kit = Path(__file__).resolve().parent
    root = kit.parent.parent
    node = shutil.which(options.node)
    if not node:
        print("Node.js was not found. Install Node.js 22.13+ or pass --node PATH.", file=sys.stderr)
        return 2
    runner = kit / "run.mjs"
    if not runner.is_file():
        print("run.mjs is missing. Keep fuzz_game.py inside the complete fuzz test kit.", file=sys.stderr)
        return 2
    started_ns = time.time_ns()
    started = time.monotonic()
    command = [node, str(runner), *forwarded]
    request = {"signal": None}
    previous_handlers = {}
    for signum in (signal.SIGINT, signal.SIGTERM):
        previous_handlers[signum] = signal.getsignal(signum)
        signal.signal(signum, lambda received, _frame: request.update(signal=received))
    child = None
    stopped_by = None
    forced = False
    error = None
    exit_code = 2
    status = "launcher-error"
    try:
        child = subprocess.Popen(
            command, cwd=root, stdin=subprocess.DEVNULL,
            start_new_session=os.name == "posix",
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        while child.poll() is None:
            if request["signal"] is not None:
                stopped_by = "interrupt" if request["signal"] == signal.SIGINT else "termination"
                break
            if options.duration is not None and time.monotonic() - started >= options.duration:
                stopped_by = "duration"
                break
            time.sleep(0.05)
        if stopped_by:
            print(f"\nPython launcher: {stopped_by} requested; stopping Node and its test children…", flush=True)
            forced = stop_child(child, signal.SIGINT if stopped_by == "interrupt" else signal.SIGTERM)
        runner_summary = fresh_runner_summary(root, started_ns)
        latest = (runner_summary or {}).get("latestRound") or {}
        statuses = [(runner_summary or {}).get("status"), latest.get("status")]
        statuses.extend(row.get("status") for row in latest.get("suites", []) if isinstance(row, dict))
        reported_failure = any(value in ("failed", "time-budget", "inputs-changed") for value in statuses)
        child_code = child.returncode
        expected_stop_codes = (0, 130, 143, -signal.SIGINT, -signal.SIGTERM, -getattr(signal, "SIGKILL", 9))
        if reported_failure or (child_code not in expected_stop_codes and not (forced and stopped_by)):
            status, exit_code = "failed", child_code if child_code is not None and 0 < child_code < 126 else 1
            if "inputs-changed" in statuses and not any(value in ("failed", "time-budget") for value in statuses):
                status = "inputs-changed"
        elif stopped_by == "duration":
            status, exit_code = "duration-ended", 0
        elif stopped_by == "interrupt":
            status, exit_code = "interrupted", 130
        elif stopped_by == "termination":
            status, exit_code = "terminated", 143
        elif child_code == 0:
            status, exit_code = "passed", 0
        else:
            status, exit_code = "failed", 1
    except (OSError, subprocess.SubprocessError) as failure:
        error = str(failure)
        if child is not None and child.poll() is None:
            try:
                forced = stop_child(child, signal.SIGTERM)
            except (OSError, subprocess.SubprocessError) as cleanup_error:
                error += f"; cleanup: {cleanup_error}"
    finally:
        for signum, previous in previous_handlers.items():
            signal.signal(signum, previous)
        summary = {
            "version": 1, "status": status, "exitCode": exit_code,
            "durationLimitSeconds": options.duration,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "stoppedBy": stopped_by, "forcedCleanup": forced,
            "childExitCode": child.returncode if child is not None else None,
            "command": command, "runnerSummary": fresh_runner_summary(root, started_ns),
            "error": error,
            "note": "A requested duration end is partial coverage, not a full-pass claim. Replay details and test failures remain in the Node results.",
        }
        try:
            folder = root / "results"
            folder.mkdir(exist_ok=True)
            temporary = folder / f".python-summary-{os.getpid()}.tmp"
            temporary.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
            temporary.replace(folder / "python-summary.json")
        except OSError as report_error:
            print(f"Could not save launcher summary: {report_error}", file=sys.stderr)
            if exit_code == 0:
                exit_code = 2
    print(f"Python launcher: {status}; {summary['elapsedSeconds']:.2f}s. Results: {root / 'results' / 'python-summary.json'}", flush=True)
    if error:
        print(error, file=sys.stderr)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
