#!/usr/bin/env python3
"""Fail when new docs lack front matter, use an unknown quadrant, or are overdue for review."""
import datetime
import pathlib
import re
import sys

REQUIRED = {"title", "description", "quadrant", "owner", "status", "last_reviewed"}
QUADRANTS = {"tutorial", "how-to", "reference", "explanation", "record", "runbook", "policy"}
SKIP_DIRS = {"_meta", "templates"}
FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)


# Parses YAML-style front matter key-value pairs from markdown header blocks.
# Extracts documentation metadata attributes into a structured Python dictionary.
# Trims surrounding quotes and whitespace from parsed configuration values.
def parse(block: str) -> dict:
    data = {}
    for line in block.splitlines():
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if m:
            data[m.group(1)] = m.group(2).strip().strip("\"'")
    return data


# Loads relative file paths of baseline documentation from tracking manifests.
# Extracts paths from fixed manifest columns to identify legacy documents.
# Returns a set of baseline documentation path strings for exemption checks.
def baseline_paths() -> set:
    manifest = pathlib.Path("docs/_meta/baseline-manifest.txt")
    if not manifest.exists():
        return set()
    return {line[66:] for line in manifest.read_text(encoding="utf-8").splitlines() if len(line) > 66}


# Evaluates documentation freshness and compliance against metadata standards.
# Validates required front matter keys, valid quadrants, and review dates.
# Returns non-zero error codes if non-compliant or overdue documents are found.
def main(root: str = "docs") -> int:
    today = datetime.date.today()
    legacy = baseline_paths()
    problems = []
    for path in sorted(pathlib.Path(root).rglob("*.md")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        match = FRONT.match(text)
        if not match:
            if str(path).replace("\\", "/") not in legacy:
                problems.append(f"{path}: missing front matter")
            continue
        fm = parse(match.group(1))
        missing = REQUIRED - fm.keys()
        if missing:
            problems.append(f"{path}: missing keys {sorted(missing)}")
            continue
        if fm["quadrant"] not in QUADRANTS:
            problems.append(f"{path}: unknown quadrant '{fm['quadrant']}'")
        try:
            reviewed = datetime.date.fromisoformat(fm["last_reviewed"])
            every = int(fm.get("review_every_days", "90"))
        except ValueError:
            problems.append(f"{path}: invalid last_reviewed or review_every_days")
            continue
        if (today - reviewed).days > every:
            problems.append(f"{path}: overdue (last_reviewed {reviewed}, every {every} days)")
    for p in problems:
        print(p)
    print(f"{len(problems)} problem(s)")
    return 1 if problems else 0


# Direct script execution entry point for documentation freshness evaluation.
# Passes command-line directory arguments to the verification routine.
# Terminates the runtime with the resulting exit code to gate CI processes.
if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
