#!/usr/bin/env bash
# Fails if any documentation file that existed at the baseline commit is missing or,
# in strict mode, has had lines removed.
set -euo pipefail

MANIFEST="docs/_meta/baseline-manifest.txt"
BASE_SHA_FILE="docs/_meta/baseline-sha.txt"
STRICT="${DOCS_STRICT_LINES:-0}"

[[ -f "$MANIFEST" && -f "$BASE_SHA_FILE" ]] || { echo "baseline files missing"; exit 2; }
BASE_SHA="$(cat "$BASE_SHA_FILE")"
status=0

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  path="$(printf '%s' "$line" | cut -c67-)"     # sha256 (64) + two spaces
  if [[ ! -e "$path" ]]; then
    echo "DELETED OR MOVED: $path"
    status=1
    continue
  fi
  if [[ "$STRICT" == "1" ]]; then
    removed="$(git diff --numstat "$BASE_SHA" -- "$path" | awk '{print $2}')"
    if [[ -n "$removed" && "$removed" != "0" && "$removed" != "-" ]]; then
      echo "LINES REMOVED ($removed): $path"
      status=1
    fi
  fi
done < "$MANIFEST"

if [[ $status -eq 0 ]]; then echo "OK: all baseline documentation preserved"; fi
exit $status
