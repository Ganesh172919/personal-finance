#!/usr/bin/env python3
"""Fail when an environment variable found in code or .env.example is not documented."""
import os
import pathlib
import re
import sys

TARGET_DIRS = ["server", "client", "packages"]
EXCLUDE_BASENAMES = {
    "node_modules", ".git", ".venv", "venv", "dist", "build", ".next",
    "__pycache__", "site-packages", "coverage", ".turbo", "output"
}
CODE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
CODE_PATTERNS = [
    r"os\.getenv\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]",
    r"os\.environ\.get\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]",
    r"os\.environ\[\s*['\"]([A-Z][A-Z0-9_]+)['\"]\s*\]",
    r"process\.env\.([A-Z][A-Z0-9_]+)",
    r"process\.env\[\s*['\"]([A-Z][A-Z0-9_]+)['\"]\s*\]",
    r"import\.meta\.env\.([A-Z][A-Z0-9_]+)",
]
ENV_FILE = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=", re.M)
DOC = pathlib.Path("docs/ENV_VARIABLES.md")
IGNORE = pathlib.Path("docs/_meta/config-ignore.txt")


# Scans project directories to identify environment variables referenced in code.
# Inspects environment files, JavaScript, TypeScript, and Python source files.
# Returns a dictionary mapping detected variable names to their source paths.
def scan() -> dict:
    found = {}
    for target in TARGET_DIRS:
        if not os.path.isdir(target):
            continue
        for dirpath, dirnames, filenames in os.walk(target):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_BASENAMES and not d.startswith(".")]
            for fname in filenames:
                ext = pathlib.Path(fname).suffix
                is_env = fname.startswith(".env") and ("example" in fname or "sample" in fname)
                if not is_env and ext not in CODE_EXT:
                    continue
                fpath = os.path.join(dirpath, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                except OSError:
                    continue
                if is_env:
                    for m in ENV_FILE.finditer(text):
                        found.setdefault(m.group(1), set()).add(fpath)
                elif ext in CODE_EXT:
                    for pattern in CODE_PATTERNS:
                        for m in re.finditer(pattern, text):
                            found.setdefault(m.group(1), set()).add(fpath)
    return found


# Validates environment variable coverage against documentation files.
# Reads documentation, checks for ignored tokens, and flags undocumented variables.
# Returns non-zero exit code if undocumented configuration variables are detected.
def main() -> int:
    if not DOC.exists():
        print(f"{DOC} does not exist")
        return 1
    doc_text = DOC.read_text(encoding="utf-8")
    ignored = set()
    if IGNORE.exists():
        ignored = {l.split("#")[0].strip() for l in IGNORE.read_text().splitlines() if l.split("#")[0].strip()}
    found = scan()
    missing = sorted(n for n in found if n not in ignored and f"`{n}`" not in doc_text and n not in doc_text)
    for n in missing:
        print(f"UNDOCUMENTED: {n}  (used in {', '.join(sorted(found[n]))})")
    print(f"{len(missing)} undocumented variable(s) of {len(found)} found")
    return 1 if missing else 0


# Direct script execution entry point for environment variable coverage checks.
# Invokes the main verification procedure and exits with the returned exit status.
# Facilitates execution within continuous integration pipelines and terminal checks.
if __name__ == "__main__":
    sys.exit(main())
