#!/usr/bin/env bash
# Chaos drill (bash twin of chaos.ps1): SIGKILL one API replica and one AI Core
# replica of a running `docker compose` stack and measure recovery.
#
#   SERVER_REPLICAS=2 AI_CORE_REPLICAS=2 docker compose up -d --wait
#   k6 run loadtest/k6/load.js &              # load in flight
#   loadtest/k6/chaos.sh                      # both services
#   loadtest/k6/chaos.sh server               # one service
#
# Env: BASE_URL (default http://127.0.0.1:8080), RECOVERY_SECONDS (30),
#      MAX_WAIT_SECONDS (120), COMPOSE_FILE (compose.yaml next to the repo root).
# Exit code 1 when any service takes longer than RECOVERY_SECONDS to turn healthy.
# Not validated against real containers by the author (no Docker available).
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
RECOVERY_SECONDS="${RECOVERY_SECONDS:-30}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-120}"
COMPOSE_FILE="${COMPOSE_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/compose.yaml}"
TARGET="${1:-all}"

probe_path() { case "$1" in server) echo /api/test ;; ai-core) echo /api/python-health ;; esac; }

edge_ok() { [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' "${BASE_URL%/}$1" || true)" = "200" ]; }

health_of() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo missing
}

started_at() { docker inspect -f '{{.State.StartedAt}}' "$1" 2>/dev/null || echo missing; }

drill() {
  local name="$1" path ids victim start now probes=0 fails=0 secs="" result=FAIL before
  path="$(probe_path "$name")"
  mapfile -t ids < <(docker compose -f "$COMPOSE_FILE" ps -q "$name")
  [ "${#ids[@]}" -ge 1 ] || { echo "No running $name containers; is the stack up?" >&2; return 2; }
  [ "${#ids[@]}" -ge 2 ] || echo "WARN: $name has ${#ids[@]} replica; the drill needs >= 2 for a zero-downtime result." >&2
  victim="${ids[RANDOM % ${#ids[@]}]}"
  before="$(started_at "$victim")"
  echo "[$name] killing ${victim:0:12} at $(date -u +%FT%TZ)"
  docker kill "$victim" >/dev/null
  start=$(date +%s)
  while :; do
    now=$(date +%s)
    [ $((now - start)) -lt "$MAX_WAIT_SECONDS" ] || break
    probes=$((probes + 1))
    edge_ok "$path" || fails=$((fails + 1))
    # A stale "healthy" can linger on a dead container: require a fresh start too.
    if [ "$(started_at "$victim")" != "$before" ] && [ "$(health_of "$victim")" = "healthy" ]; then secs=$(( $(date +%s) - start )); break; fi
    sleep 1
  done
  if [ -n "$secs" ] && [ "$secs" -le "$RECOVERY_SECONDS" ]; then result=PASS; fi
  printf '%-8s killed=%s recovery=%ss edge_probes=%s edge_probe_fails=%s %s\n' \
    "$name" "${victim:0:12}" "${secs:-n/a}" "$probes" "$fails" "$result"
  [ "$result" = PASS ]
}

rc=0
if [ "$TARGET" = all ]; then
  drill server || rc=1
  sleep 15
  drill ai-core || rc=1
else
  drill "$TARGET" || rc=1
fi
exit "$rc"
