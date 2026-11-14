#!/usr/bin/env python3
"""
scripts/docs/check-no-deletions.py
Preservation Guard (Rule R1)
Verifies that every single baseline documentation file is preserved and not deleted.
"""
import os
import sys
import pathlib

MANIFEST = pathlib.Path("docs/_meta/baseline-manifest.txt")

# Verifies that baseline documentation files listed in the manifest exist.
# Detects missing, deleted, or relocated files against baseline tracking records.
# Returns zero on verification success or a non-zero exit code if files are missing.
def main():
    if not MANIFEST.exists():
        print(f"Error: {MANIFEST} does not exist.")
        return 2

    lines = [line.strip() for line in MANIFEST.read_text(encoding="utf-8").splitlines() if line.strip()]
    missing = []
    
    for line in lines:
        parts = line.split(maxsplit=1)
        if len(parts) < 2:
            continue
        filepath = pathlib.Path(parts[1])
        if not filepath.exists():
            missing.append(str(filepath))

    if missing:
        print(f"FAILED: {len(missing)} baseline documentation file(s) missing or deleted:")
        for path in missing:
            print(f"  - DELETED/MOVED: {path}")
        return 1

    print(f"OK: All {len(lines)} baseline documentation files verified and preserved in place.")
    return 0

# Script entry point for baseline documentation preservation verification.
# Executes the preservation audit and returns appropriate process exit status.
# Prevents accidental deletion of critical documentation files during builds.
if __name__ == "__main__":
    sys.exit(main())
