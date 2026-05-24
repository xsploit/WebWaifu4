from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def run(command: list[str]) -> tuple[int, str]:
    proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def main() -> int:
    checks: list[str] = []
    ok = True

    for name in [
        "README.md",
        "GOAL.md",
        "ROADMAP.md",
        "PROGRESS.md",
        "electron/main.mjs",
        "electron/preload.mjs",
        "src/lib/desktop/runtime.ts",
        "docs/DESKTOP_PORT.md",
    ]:
        exists = (ROOT / name).exists()
        checks.append(f"{name}: {'present' if exists else 'missing'}")
        ok = ok and exists

    desktop_scripts = [
        '"desktop:dev"',
        '"desktop:start"',
        '"desktop:clean"',
        '"desktop:pack"',
    ]
    package_text = (ROOT / "package.json").read_text(encoding="utf-8")
    for script in desktop_scripts:
        present = script in package_text
        checks.append(f"package script {script}: {'present' if present else 'missing'}")
        ok = ok and present

    test_code, test_output = run(
        [
            "npm",
            "run",
            "test",
            "--",
            "src/lib/desktop/runtime.test.ts",
            "src/lib/chat/reply-metadata.test.ts",
            "src/lib/vrm/sequencer.test.ts",
        ]
    )
    tests_passed = test_code == 0
    ok = ok and tests_passed
    checks.append(f"vitest: {'passed' if tests_passed else test_output[:300]}")

    pack_code, pack_output = run(["npm", "run", "desktop:pack"])
    desktop_pack_passed = pack_code == 0
    ok = ok and desktop_pack_passed
    checks.append(f"desktop:pack: {'passed' if desktop_pack_passed else pack_output[:300]}")

    payload = {
        "desktop_pack_passed": desktop_pack_passed,
        "ralph_eval_passed": ok,
        "tests_passed": tests_passed,
        "notes": " | ".join(checks),
    }
    print(json.dumps(payload, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
