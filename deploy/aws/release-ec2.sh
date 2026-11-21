#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }

if [[ $# != 3 || ! "$1" =~ ^(deploy|rollback)$ || ! "$2" =~ ^[a-f0-9]{40}$ || ! "$3" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
  fail "Usage: bash deploy/aws/release-ec2.sh {deploy|rollback} FULL_COMMIT_SHA https://finwise.example.com"
fi

mode="$1"
target="$2"
origin="$3"
cd "$(git rev-parse --show-toplevel)"
lock="$(git rev-parse --absolute-git-dir)/finwise-release.lock"

# Serialize releases in this checkout. The kernel releases the lock on exit.
command -v flock >/dev/null || fail "Install flock (util-linux) on the release host."
exec 9>"$lock"
flock -n 9 || fail "Another EC2 release holds $lock"
[[ -z "$(git status --porcelain)" ]] || fail "Review the checkout's local changes before releasing."

previous="$(git rev-parse HEAD)"
if [[ "$mode" == deploy ]]; then
  git fetch origin refs/heads/codex/aws-deploy
  git merge-base --is-ancestor "$target" FETCH_HEAD ||
    fail "The requested commit is outside origin/codex/aws-deploy."
  git cat-file -e "$target:deploy/aws/compose.release.yaml" ||
    fail "The requested commit predates the release overlay. Use rollback for a retained legacy release."
fi

compose() {
  local sha="$1"
  shift
  local files=(-f compose.yaml -f deploy/aws/compose.ec2.yaml)
  if [[ -f deploy/aws/compose.release.yaml ]]; then
    files+=(-f deploy/aws/compose.release.yaml)
  fi
  COMPOSE_PROJECT_NAME=finwise FINWISE_RELEASE_SHA="$sha" \
    docker compose -p finwise "${files[@]}" "$@"
}

local_images_available() {
  local images
  images="$(compose "$1" config --images)" || return 1
  local -a names
  mapfile -t names <<< "$images"
  docker image inspect "${names[@]}" >/dev/null
}

smoke() {
  local path status
  for path in /login /register /healthz /api/python-health; do
    status="$(curl --silent --show-error --retry 4 --retry-delay 2 --max-time 10 \
      --output /dev/null --write-out '%{http_code}' "$origin$path")" || return 1
    [[ "$status" == 200 ]] || { printf '%s returned HTTP %s\n' "$path" "$status" >&2; return 1; }
  done
  status="$(curl --silent --show-error --max-time 10 \
    --output /dev/null --write-out '%{http_code}' "$origin/api/v1/auth/profile")" || return 1
  [[ "$status" == 401 ]] || { printf 'Anonymous profile returned HTTP %s\n' "$status" >&2; return 1; }
}

apply_release() {
  local sha="$1" from="$2" pull="$3"
  compose "$sha" up -d --no-build --pull "$pull" --wait --wait-timeout 360 || return 1
  # Git can replace the bind-mounted Caddyfile's inode. Recreate Caddy when it changes.
  if ! git diff --quiet "$from" "$sha" -- deploy/aws/Caddyfile; then
    compose "$sha" up -d --no-build --pull "$pull" --no-deps --force-recreate \
      --wait --wait-timeout 60 caddy || return 1
  fi
  smoke
}

# Verify rollback images up front. The legacy checkout uses the Compose default
# image names, which the SHA-tagged build never overwrites.
local_images_available "$previous" ||
  fail "The current checkout's images are missing. Restore the running release's checkout and images first."

printf 'Current release %s. Requested %s.\n' "$previous" "$target"
apply_started=false
recover() {
  local status="$?"
  trap - EXIT
  if (( status == 0 )); then return; fi
  printf 'Release failed. Restoring the checkout to %s.\n' "$previous" >&2
  if ! git switch --detach "$previous"; then
    printf 'Checkout recovery failed. Restore %s manually.\n' "$previous" >&2
  elif [[ "$apply_started" == true ]]; then
    if apply_release "$previous" "$target" never; then
      printf 'Previous release restored and verified.\n' >&2
    else
      printf 'Automatic rollback failed. Check Compose status and logs immediately.\n' >&2
    fi
  fi
  exit "$status"
}
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git switch --detach "$target"
compose "$target" config --quiet
if [[ "$mode" == deploy ]]; then
  # Build without replacing any containers. When all release images already
  # exist, reuse them so a retry deploys the same artifacts.
  if ! docker image inspect "finwise-web:$target" "finwise-server:$target" "finwise-ai-core:$target" >/dev/null 2>&1; then
    compose "$target" build web server ai-core
  fi
  docker run --rm -i --network none --entrypoint python "finwise-ai-core:$target" \
    - ocr < scripts/smoke-ai-core.py
else
  local_images_available "$target" || fail "Rollback images for $target are missing."
fi

apply_started=true
pull_policy=missing
if [[ "$mode" == rollback ]]; then pull_policy=never; fi
apply_release "$target" "$previous" "$pull_policy"
trap - EXIT INT TERM
compose "$target" ps || :
printf 'Verified release %s. Previous release %s.\n' "$target" "$previous"
