#!/usr/bin/env bash
# Exercises the release script with real Git history and disposable Docker/curl stubs.
set -euo pipefail

script="$(cd "$(dirname "$0")/.." && pwd)/deploy/aws/release-ec2.sh"
tmp="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
sandbox="$(mktemp -d "$tmp/finwise-release.XXXXXX")"
cleanup() {
  case "$sandbox" in "$tmp"/finwise-release.??????) rm -rf -- "$sandbox" ;; esac
}
trap cleanup EXIT

source_repo="$sandbox/source"
mkdir -p "$source_repo/deploy/aws" "$sandbox/bin"
git init -q -b codex/aws-deploy "$source_repo"
git -C "$source_repo" config user.email tests@example.invalid
git -C "$source_repo" config user.name "FinWise tests"
git -C "$source_repo" config core.autocrlf false
printf 'services: {}\n' > "$source_repo/compose.yaml"
cp "$source_repo/compose.yaml" "$source_repo/deploy/aws/compose.ec2.yaml"
git -C "$source_repo" add .
git -C "$source_repo" commit -qm legacy
previous="$(git -C "$source_repo" rev-parse HEAD)"
cp "$source_repo/compose.yaml" "$source_repo/deploy/aws/compose.release.yaml"
printf '# candidate\n' > "$source_repo/deploy/aws/Caddyfile"
mkdir "$source_repo/scripts"
printf '# runtime smoke test\n' > "$source_repo/scripts/smoke-ai-core.py"
git -C "$source_repo" add .
git -C "$source_repo" commit -qm candidate
export TARGET
TARGET="$(git -C "$source_repo" rev-parse HEAD)"
git -C "$source_repo" switch -qc foreign
git -C "$source_repo" commit --allow-empty -qm foreign
foreign="$(git -C "$source_repo" rev-parse HEAD)"

cat > "$sandbox/bin/docker" <<'BASH'
#!/usr/bin/env bash
set -eu
sha="${FINWISE_RELEASE_SHA:-}"
printf 'docker %s %s\n' "$sha" "$*" >> "$COMMANDS"
case " $* " in
  " image inspect finwise-web:$TARGET finwise-server:$TARGET finwise-ai-core:$TARGET ")
    [[ "${CASE:-}" == retry ]] ;;
  " image inspect "*)
    [[ "${CASE:-}" != missing_previous ]] ;;
  *" config --images ")
    if [[ -f deploy/aws/compose.release.yaml ]]; then
      echo "finwise-web:$sha"
    else
      echo 'finwise-web:latest'
    fi ;;
  *" config --quiet ")
    [[ "${CASE:-}" != invalid_config || "$sha" != "$TARGET" ]] ;;
  " run --rm -i --network none "*)
    [[ "${CASE:-}" != native_failed ]] ;;
  *" build web server ai-core ")
    [[ "${CASE:-}" != build_failed ]] ;;
  *" up -d "*)
    [[ "${CASE:-}" != unhealthy || "$sha" != "$TARGET" ]] ;;
esac
BASH

cat > "$sandbox/bin/curl" <<'BASH'
#!/usr/bin/env bash
set -eu
url="${!#}"
printf 'curl %s\n' "$url" >> "$COMMANDS"
case "$url" in
  */auth/profile) printf '401' ;;
  */api/python-health)
    if [[ "${CASE:-}" == smoke_failed && "$(git rev-parse HEAD)" == "$TARGET" ]]; then
      printf '503'
    else
      printf '200'
    fi ;;
  *) printf '200' ;;
esac
BASH
chmod +x "$sandbox/bin/docker" "$sandbox/bin/curl"
# Git Bash on Windows may lack flock. Linux CI also exercises the real lock below.
has_flock=false
if command -v flock >/dev/null; then
  has_flock=true
else
  printf '#!/usr/bin/env bash\n[[ "$1" == -n && "$2" == 9 ]]\n' > "$sandbox/bin/flock"
  chmod +x "$sandbox/bin/flock"
fi
export PATH="$sandbox/bin:$PATH"

setup() {
  printf 'Testing %s\n' "$1"
  export CASE="$1" COMMANDS="$sandbox/$1.commands"
  : > "$COMMANDS"
  git clone -q -b codex/aws-deploy "$source_repo" "$sandbox/$CASE"
  cd "$sandbox/$CASE"
  git switch -q --detach "$previous"
}
release() { bash "$script" "$@" https://finwise.example.com > "$sandbox/$CASE.output" 2>&1; }
check_head() { [[ "$(git rev-parse HEAD)" == "$1" ]]; }
succeeded() { release "$@" || { cat "$sandbox/$CASE.output"; exit 1; }; }
failed() {
  if release "$@"; then
    printf 'Unexpected successful release in %s\n' "$CASE" >&2
    cat "$sandbox/$CASE.output" >&2
    exit 1
  fi
}
assert_log() { grep -F -- "$1" "$COMMANDS" >/dev/null || { cat "$COMMANDS"; exit 1; }; }
refute_log() {
  if grep -F -- "$1" "$COMMANDS"; then
    printf 'Unexpected command in %s\n' "$CASE" >&2
    exit 1
  fi
}

setup deploy
succeeded deploy "$TARGET"
check_head "$TARGET"
assert_log 'build web server ai-core'
assert_log 'run --rm -i --network none'
assert_log 'up -d --no-build --pull missing --wait'
assert_log '--no-deps --force-recreate'
assert_log 'curl https://finwise.example.com/api/v1/auth/profile'

setup retry
succeeded deploy "$TARGET"
check_head "$TARGET"
refute_log ' build web server ai-core'

setup rollback
git switch -q --detach "$TARGET"
succeeded rollback "$previous"
check_head "$previous"
assert_log 'up -d --no-build --pull never --wait'
refute_log ' build web server ai-core'

for scenario in invalid_config build_failed native_failed missing_previous; do
  setup "$scenario"
  failed deploy "$TARGET"
  check_head "$previous"
  refute_log ' up -d '
done

for scenario in unhealthy smoke_failed; do
  setup "$scenario"
  failed deploy "$TARGET"
  check_head "$previous"
  assert_log 'up -d --no-build --pull never --wait'
  grep -F 'Previous release restored and verified.' "$sandbox/$CASE.output"
done

setup dirty
printf '# edits\n' >> compose.yaml
failed deploy "$TARGET"
check_head "$previous"
[[ ! -s "$COMMANDS" ]]

setup foreign
failed deploy "$foreign"
check_head "$previous"
[[ ! -s "$COMMANDS" ]]

setup short_sha
failed deploy "${TARGET:0:7}"
check_head "$previous"
[[ ! -s "$COMMANDS" ]]

if [[ "$has_flock" == true ]]; then
  setup locked
  (
    exec 8>.git/finwise-release.lock
    flock -n 8
    failed deploy "$TARGET"
    grep -F 'Another EC2 release holds' "$sandbox/$CASE.output"
  )
  check_head "$previous"
  [[ ! -s "$COMMANDS" ]]
fi

printf 'EC2 release tests passed.\n'
