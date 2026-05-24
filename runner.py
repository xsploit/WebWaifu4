from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
RALPH_DIR = ROOT / ".ralph"
PROMPT_PATH = RALPH_DIR / "prompt.md"
RESULT_SCHEMA_PATH = RALPH_DIR / "schemas" / "ralph-result.schema.json"
LAST_RESULT_PATH = RALPH_DIR / "last-result.json"
LOG_DIR = RALPH_DIR / "logs"
STATE_DIR = RALPH_DIR / "state"
EVAL_PATH = ROOT / "scripts" / "ralph_eval.py"

SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache"}
SKIP_SUFFIXES = {".pyc", ".log"}


@dataclass
class CommandResult:
    exit_code: int
    stdout: str
    stderr: str


def run_command(command: list[str], *, input_text: str | None = None, log_path: Path | None = None) -> CommandResult:
    proc = subprocess.run(
        command,
        cwd=ROOT,
        input=input_text,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(proc.stdout + "\n\n--- STDERR ---\n\n" + proc.stderr, encoding="utf-8")
    return CommandResult(proc.returncode, proc.stdout, proc.stderr)


def hash_repo_state() -> str:
    digest = hashlib.sha256()
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix in SKIP_SUFFIXES:
            continue
        if path.is_relative_to(RALPH_DIR / "logs"):
            continue
        files.append(path)

    for path in sorted(files):
        rel = path.relative_to(ROOT).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\n")
    return digest.hexdigest()


def codex_binary() -> list[str]:
    if os.name != "nt":
        return ["codex"]
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidate = Path(appdata) / "npm" / "codex.cmd"
        if candidate.exists():
            return [str(candidate)]
    return ["codex"]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def offline_result() -> dict[str, Any]:
    return {
        "status": "no_change",
        "selected_task": "offline evaluator checkpoint",
        "summary": "Ran the evaluator without invoking Codex.",
        "files_changed": [],
        "commands_run": [],
        "verification": {"pytest_passed": False, "ralph_eval_passed": False, "notes": "offline mode"},
        "next_task": "Run live Codex mode after evaluator is project-specific.",
        "blockers": [],
        "completion_signal": "continue",
    }


def run_codex(iteration: int, run_id: str, offline: bool) -> CommandResult:
    if offline:
        LAST_RESULT_PATH.write_text(json.dumps(offline_result(), indent=2), encoding="utf-8")
        return CommandResult(0, "offline result written", "")

    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    command = codex_binary() + [
        "exec",
        "--json",
        "--sandbox",
        "workspace-write",
        "--output-schema",
        str(RESULT_SCHEMA_PATH),
        "--output-last-message",
        str(LAST_RESULT_PATH),
        prompt,
    ]
    return run_command(command, log_path=LOG_DIR / f"{run_id}-codex-{iteration:03d}.jsonl")


def run_eval(iteration: int, run_id: str) -> CommandResult:
    if not EVAL_PATH.exists():
        return CommandResult(1, "", "scripts/ralph_eval.py is missing")
    return run_command([sys.executable, str(EVAL_PATH)], log_path=LOG_DIR / f"{run_id}-eval-{iteration:03d}.log")


def parse_signal(result: dict[str, Any] | None) -> str:
    if not result:
        return "continue"
    signal = str(result.get("completion_signal", "continue")).strip().lower()
    return signal if signal in {"continue", "work_complete", "work_stuck"} else "continue"


def save_state(iteration: int, before_hash: str, after_hash: str, codex_result: CommandResult, eval_result: CommandResult, result: dict[str, Any] | None) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    signal = parse_signal(result)
    payload = {
        "iteration": iteration,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "before_hash": before_hash,
        "after_hash": after_hash,
        "changed": before_hash != after_hash,
        "codex_exit_code": codex_result.exit_code,
        "eval_exit_code": eval_result.exit_code,
        "result": result or {},
        "status": str((result or {}).get("status", "")),
        "completion_signal": signal,
    }
    (STATE_DIR / f"iteration-{iteration:03d}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (STATE_DIR / "state.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def validate_setup() -> None:
    missing = [str(path.relative_to(ROOT)) for path in [PROMPT_PATH, RESULT_SCHEMA_PATH, EVAL_PATH] if not path.exists()]
    if missing:
        raise SystemExit("Missing Ralph files:\n- " + "\n- ".join(missing))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a bounded Ralph fixed-point loop.")
    parser.add_argument("--max-iterations", type=int, default=3)
    parser.add_argument("--stable-limit", type=int, default=1)
    parser.add_argument("--run-id", default=datetime.now().strftime("%Y%m%d-%H%M%S"))
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    validate_setup()
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stable_count = 0
    previous_hash = ""

    for iteration in range(1, args.max_iterations + 1):
        before_hash = hash_repo_state()
        codex_result = run_codex(iteration, args.run_id, args.offline)
        after_hash = hash_repo_state()
        eval_result = run_eval(iteration, args.run_id)

        result: dict[str, Any] | None = None
        if LAST_RESULT_PATH.exists():
            try:
                result = load_json(LAST_RESULT_PATH)
            except Exception:
                result = None

        save_state(iteration, before_hash, after_hash, codex_result, eval_result, result)
        signal = parse_signal(result)

        if after_hash == previous_hash:
            stable_count += 1
        else:
            stable_count = 0
        previous_hash = after_hash

        print(json.dumps({"iteration": iteration, "signal": signal, "eval_exit_code": eval_result.exit_code, "changed": before_hash != after_hash}))

        if signal == "work_complete" and eval_result.exit_code == 0:
            print("Ralph fixed-point complete: structured completion + evaluator passed.")
            return 0
        if signal == "work_stuck":
            print("Ralph reported work_stuck.")
            return 2
        if stable_count >= args.stable_limit and eval_result.exit_code != 0:
            print("Ralph stabilized while evaluator still fails.")
            return 3

    print("Ralph hit max iterations without verified completion.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
