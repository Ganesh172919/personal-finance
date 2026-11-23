# Deployment source snapshot

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

This appendix preserves selected version-controlled files from release-branch commit `f1ed41a5fdf5ba354ebfda199c0e69cebda1f369`.
It is a historical reference; compare against the current files before using commands or configuration.
The example environment files contain placeholders and defaults, not the live secret values.

## `deploy/aws/release-ec2.sh`

Snapshot SHA-256: `32049420814925b56b41168767041de2fc38e2199bdd2c43018e05e45c0235a9`.

```bash
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
```

## `deploy/aws/PRODUCTION_RUNBOOK.md`

Snapshot SHA-256: `37e1f579f0ff23204e7685b6089f117b39ff17c540be944f3c52769ff62cc67f`.

````markdown
# FinWise EC2 deployment and maintenance

## What a direct push does

A successful push to `codex/aws-deploy` updates the GitHub branch and starts the **Tests** workflow for that commit. GitHub reported this branch as unprotected on November 21, 2026, so a contributor with write access can currently push before checks run. A pull request lets reviewers see the checks before merging. EC2 serves the last release applied through Session Manager until an operator deploys a new SHA. [Release branch checks](https://github.com/Ganesh172919/personal-finance/actions?query=branch%3Acodex%2Faws-deploy)

## Provision a host

1. Use the existing [deployment record](DEPLOYMENT_RECORD.md) for the active stack and [EC2 provisioning guide](EC2.md) for the CloudFormation parameters, public subnet and Elastic IP. Review CloudFormation change sets separately from application releases because an infrastructure change can replace the host.
2. Point the primary hostname and any aliases at the Elastic IP. Allow inbound TCP 80 and 443. Use AWS Systems Manager Session Manager for administration. Wait for `cloud-init status --wait` and check `docker compose version`, `docker buildx version` and `command -v flock` before starting the stack. [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
3. Clone the repository to `/opt/finwise`, select a tested SHA, and follow the [environment setup](EC2.md#configure-and-start-finwise). Keep `.env`, `server/.env` and `server/AI_Core/.env` owner-readable only. Configure the real LLM provider and SMTP for production email sign-in. Set `FINWISE_HOST`, `CLIENT_URL` and `CORS_ORIGINS` to the intended hostnames. Keep a separate protected copy of credentials so a replacement host can reconnect to the same services and decrypt existing webhook credentials.
4. On a fresh host, build and start the SHA-tagged stack. Compose keeps the project name `finwise` so subsequent application releases use the same named volumes. The worker and gateway share one server image.

```bash
cd /opt/finwise
export COMPOSE_PROJECT_NAME=finwise
export FINWISE_RELEASE_SHA="$(git rev-parse HEAD)"
export COMPOSE_FILE=compose.yaml:deploy/aws/compose.ec2.yaml:deploy/aws/compose.release.yaml
docker compose config --quiet
docker compose build web server ai-core
docker compose up -d --no-build --pull missing --wait --wait-timeout 360
docker compose ps
```

Allow Caddy to obtain its certificate, then run the [public checks](#verify-from-outside-the-host). The first `up` creates MongoDB, Redis, AI state and Caddy volumes. On an existing host, use the release procedure below.

## Test a change

Install `client` and `server` dependencies with `npm ci --prefix client` and `npm ci --prefix server`. Use Node 24 and npm 11. Create a Python 3.11 virtual environment and install `server/AI_Core/requirements-dev.txt` into it. Use test credentials for all these commands. Server integration tests use MongoDB Memory Server, pin MongoDB to the production major and download the test binary on the first run. They reuse the cached binary afterwards.

| Change | Fast check from the repository root |
| --- | --- |
| Auth, cookies or reverse proxy | `npm --prefix server run test:ci -- src/test/appIngress.test.ts src/test/envConfig.test.ts src/test/csrf.test.ts` |
| Client session recovery | `npm --prefix client test -- src/hooks/useAuth.test.tsx` |
| AI memory and tenants | From `server/AI_Core`, run `python -m pytest tests/test_state_store_parity.py -q` |
| EC2 release steps | `bash scripts/test-release-ec2.sh` on Linux or Git Bash |
| AWS templates | `cfn-lint deploy/aws/ec2.yaml deploy/aws/finwise.yaml` |

Run the wider checks before merging broad changes.

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server run test:ci
npm --prefix server run build
(cd server/AI_Core && python -m pytest tests/ -m 'not latency')
(cd server/AI_Core && python -m evals.runner -m 'not latency')
```

The GitHub workflow also builds all three Linux images, brings up the EC2 Compose stack, and checks TLS and the alias, native OCR imports, real MongoDB state and checkpoints, and authenticated flows with k6 and a mock LLM. Inspect the failing job and download the AI eval report when relevant. Use a dedicated staging account to test real provider behavior and credentials.

## Release an approved commit

1. Record the full SHA and verify the **Tests** run for that SHA on `codex/aws-deploy`. In GitHub CLI, use `gh run list --workflow test.yml --branch codex/aws-deploy --commit "$release_sha"`. Check that the run concluded successfully.
2. Review database changes for backward compatibility. Back up before a release that changes data or indexes, and rehearse irreversible migrations against a restored copy. Budget for a brief interruption when Compose replaces containers.
3. Connect to the EC2 host with Session Manager, run `sudo -i` and use the running release's checkout. Set `release_sha` and `base` to the exact reviewed commit and canonical HTTPS origin.

```bash
cd /opt/finwise
release_sha=FULL_REVIEWED_COMMIT_SHA
base=https://your-finwise-domain.example
previous_sha=$(git rev-parse HEAD)
printf 'Previous %s\nTarget %s\n' "$previous_sha" "$release_sha"
git fetch origin refs/heads/codex/aws-deploy
release_script=$(mktemp /tmp/finwise-release.XXXXXX)
git show "$release_sha:deploy/aws/release-ec2.sh" > "$release_script" &&
  bash "$release_script" deploy "$release_sha" "$base"
```

The script serializes releases in the checkout, checks that the SHA is in the remote release branch, checks local rollback images, builds the candidate and tests its native OCR import before replacing containers, and probes HTTPS, the Python gateway and anonymous profile access. A failed startup or probe triggers an application rollback to the prior local images and leaves a failing exit status. Keep the previous SHA and local images until the release has been accepted. The Linux CI fixtures test these transitions with disposable repositories and service stubs.

### Verify from outside the host

```bash
set -e
for path in /login /register /healthz /api/python-health; do
  status=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$base$path")
  printf '%s %s\n' "$path" "$status"
  test "$status" = 200
done
```

Test sign-in and session recovery, add and delete a test transaction, ask for a chat reply, and try the feature you changed. Check a receipt upload if OCR changed and verify dictation when speech settings changed. Repeat public probes on aliases with verified DNS.

### Roll back and diagnose

```bash
cd /opt/finwise
bash "$release_script" rollback "$previous_sha" "$base"
```

The rollback command uses locally retained images. If the copied script has expired, recreate it with `git show` from the reviewed release that includes the script. A code rollback keeps the current database state. If the prior code cannot read that state, use the agreed data recovery procedure and account for writes made after the backup.

For a tagged release, use the following operator commands on the host. For a legacy release, set `COMPOSE_FILE=compose.yaml:deploy/aws/compose.ec2.yaml`.

```bash
cd /opt/finwise
export COMPOSE_PROJECT_NAME=finwise
export FINWISE_RELEASE_SHA="$(git rev-parse HEAD)"
export COMPOSE_FILE=compose.yaml:deploy/aws/compose.ec2.yaml:deploy/aws/compose.release.yaml
docker compose ps
docker compose logs --since 15m --tail 200 caddy web server worker ai-core mongo redis
docker stats --no-stream
df -h /
docker system df
```

Record the request ID, service, time and release SHA when investigating errors. A certificate failure calls for checking public DNS, ports 80 and 443 and Caddy logs. For upstream errors, inspect MongoDB primary election, Redis connectivity, the gateway and AI Core health. Check worker logs for job recovery failures and provider logs for quota or key errors. Log rotation keeps up to three 20 MB files per Compose container. If you need longer incident history, forward logs to a restricted store.

## Back up and restore

Set a backup schedule, retention, and recovery targets appropriate for the data on the host. Keep encrypted copies off-host and test restoration in an isolated stack. The live single-host deployment depends on its root EBS volume for MongoDB, Redis, Caddy and any locally persisted files.

Create a logical MongoDB backup from the primary. A whole-instance dump captures both application data and AI state. Use the `COMPOSE_FILE` settings above.

```bash
set -euo pipefail
umask 077
install -d -m 700 /var/backups/finwise
archive="/var/backups/finwise/mongo-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
docker compose exec -T mongo mongodump --archive --gzip --oplog > "$archive.tmp"
test -s "$archive.tmp"
mv "$archive.tmp" "$archive"
(cd "$(dirname "$archive")" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
```

Verify the checksum after copying the backup. In an isolated Compose project with a fresh, writable MongoDB replica set, start MongoDB first and restore the archive before starting writers.

```bash
(cd "$(dirname "$archive")" && sha256sum --check "$(basename "$archive").sha256")
docker compose exec -T mongo mongorestore --archive --gzip --oplogReplay --stopOnError < "$archive"
```

Verify collections, AI state, a test sign-in, a file read and a chat reply. Treat a logical MongoDB backup as coverage for MongoDB only. Use coordinated EBS snapshots for Redis, Caddy, Docker volumes and host data. For a consistent root snapshot, schedule a write outage and stop the instance before requesting the snapshot. Record the snapshot ID and check that its status reaches `completed`. Follow the [MongoDB backup guide](https://www.mongodb.com/docs/database-tools/mongodump/) and [AWS EBS snapshot guide](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-snapshot.html).

### Recover from a lost EC2 host

Create a replacement host in the recovery environment and retrieve the reviewed release SHA, protected environment files and last verified backups. Restore the full root volume from the snapshot in the replacement Availability Zone or start a fresh stack and use the logical MongoDB restore. Keep the restored stack isolated from production traffic while checking data and credentials. Confirm MongoDB readiness, validate the application on the replacement host, then associate the intended Elastic IP or update the production DNS record. Verify Caddy, the public probes and the affected user flows before ending the incident. [Restore an EBS volume from a snapshot](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-restoring-volume.html)

## Ongoing maintenance

- Monitor external HTTPS and API health, EBS free space, instance status, container memory, API errors, provider quotas, worker retries and backup age. Route alarms to the person on call and test the delivery.
- Review AWS credits and resource costs. Keep capacity expectations explicit because this stack has a single compute host and MongoDB primary. Rehearse host replacement and time the recovery before relying on it for critical data.
- Check pending Amazon Linux, Docker and image updates regularly. Test dependency and base-image changes in staging and use a maintenance window for a host reboot. On the EC2 host, verify `sysctl vm.overcommit_memory` and set it to `1` on the FinWise host if needed for background persistence. [Redis administration](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/#linux)
- Rotate provider credentials with a test of the corresponding feature. Coordinate the shared `AI_CORE_INTERNAL_TOKEN` across both services. Plan for session invalidation when replacing `JWT_SECRET`. Keep the previous webhook encryption key available until stored credentials have been migrated or re-entered.
- Inspect `docker system df` and prune unused build cache only after confirming disk pressure. Protect the current and previous release tags and named data volumes. A normal deployment uses Compose `up` and preserves these volumes.
````

## `.github/workflows/test.yml`

Snapshot SHA-256: `a8485fdabe8dcd2ee60c9b6fbf4a72ceb6f6cab6439a8e4312351e326f7f08cc`.

```yaml
# ══════════════════════════════════════════════════════════════════════
# FinWise — Test Pipeline
# ══════════════════════════════════════════════════════════════════════
# Checks the application and AWS release branch on pushes and pull requests.
# ══════════════════════════════════════════════════════════════════════

name: Tests

on:
  push:
    branches: [main, develop, features/*, codex/aws-deploy]
  pull_request:
    branches: [main, develop, codex/aws-deploy]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ── Client Tests ────────────────────────────────────────────────────
  client-tests:
    name: Client Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: client

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
          cache-dependency-path: client/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Audit runtime dependencies
        run: npm audit --omit=dev --audit-level=high

      - name: Run tests
        run: npm test
        env:
          CI: true

      - name: Build client
        run: npm run build

  # ── Server Tests ────────────────────────────────────────────────────
  server-tests:
    name: Server Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: server

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
          cache-dependency-path: server/package-lock.json

      - name: Install dependencies
        run: npm ci
        env:
          MONGOMS_DISABLE_POSTINSTALL: "true"

      - name: Audit runtime dependencies
        run: npm audit --omit=dev --audit-level=high

      - name: Cache the MongoDB test binary
        uses: actions/cache@v4
        with:
          path: ~/.cache/mongodb-binaries
          key: ${{ runner.os }}-${{ runner.arch }}-mongoms-${{ hashFiles('server/src/test/setup.ts', 'server/package-lock.json') }}

      - name: Run tests
        run: npm run test:ci
        env:
          CI: true
          NODE_ENV: test
          JWT_SECRET: test-jwt-secret-for-ci
          # Tests own their Mongo instances and rate-limit stores. The Compose
          # job exercises shared Redis and the Mongo replica set.

      - name: Build server and worker
        run: npm run build

  # ── AI Core Tests ───────────────────────────────────────────────────
  ai-core-tests:
    name: AI Core Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: server/AI_Core

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"
          cache-dependency-path: |
            server/AI_Core/requirements.txt
            server/AI_Core/requirements-dev.txt

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements-dev.txt

      - name: Run tests
        run: pytest tests/ -v --tb=short -m "not latency"
        env:
          CI: true
          LLM_PROVIDER: ""

      # The runner emits a baseline-comparable JSON report as well as pytest's
      # JUnit XML for individual cases.
      - name: Run evals
        run: python -m evals.runner -m "not latency" --tb=short --junitxml=eval-report.xml
        env:
          CI: true
          LLM_PROVIDER: ""

      - name: Upload eval report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ai-core-eval-report
          path: |
            server/AI_Core/eval-report.xml
            docs/records/evaluations/*.json
          if-no-files-found: warn
          retention-days: 14

  # ── Docker image builds (build only, no push) ───────────────────────
  # Catches Dockerfile / nginx.conf / lockfile drift before a deploy does.
  docker-build:
    name: Docker Build (${{ matrix.image }})
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        include:
          - image: web
            context: client
          - image: server
            context: server
          - image: ai-core
            context: server/AI_Core
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Build ${{ matrix.image }}
        uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          push: false
          cache-from: type=gha,scope=${{ matrix.image }}
          cache-to: type=gha,mode=max,scope=${{ matrix.image }}

  release-tests:
    name: EC2 Release and Rollback Tests
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - run: bash -n deploy/aws/release-ec2.sh
      - run: bash scripts/test-release-ec2.sh

  # Test production HTTPS ingress, then exercise the same images with k6.
  compose-smoke:
    name: EC2 HTTPS and k6 Smoke
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      COMPOSE_PROJECT_NAME: finwise-ci
      FINWISE_RELEASE_SHA: ${{ github.sha }}
      COMPOSE_FILE: compose.yaml:deploy/aws/compose.ec2.yaml:deploy/aws/compose.release.yaml
      FINWISE_HOST: finwise.localhost
      FINWISE_ALIASES: finwise-alias.localhost
      CLIENT_URL: https://finwise.localhost
      CORS_ORIGINS: https://finwise.localhost,https://finwise-alias.localhost
      LLM_PROVIDER: mock
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Create env files and throwaway secrets
        run: |
          cp server/.env.example server/.env
          cp server/AI_Core/.env.example server/AI_Core/.env
          {
            echo "JWT_SECRET=$(openssl rand -hex 32)"
            echo "AI_CORE_INTERNAL_TOKEN=$(openssl rand -hex 24)"
            echo "WEBHOOK_CREDENTIALS_KEY=$(openssl rand -base64 32)"
          } >> "$GITHUB_ENV"

      - name: Build and start the EC2 stack
        id: ec2-stack
        run: |
          docker compose config --quiet
          docker compose build web server ai-core
          docker compose up -d --no-build --pull missing --wait --wait-timeout 360

      - name: Test the HTTPS edge with Caddy's local CA
        run: |
          printf '127.0.0.1 %s %s\n' "$FINWISE_HOST" "$FINWISE_ALIASES" | sudo tee -a /etc/hosts
          ca_path=/data/caddy/pki/authorities/local/root.crt
          for attempt in {1..15}; do
            if docker compose exec -T caddy test -s "$ca_path"; then break; fi
            sleep 1
          done
          root_ca="$RUNNER_TEMP/finwise-caddy-root.crt"
          docker compose cp "caddy:$ca_path" "$root_ca"
          for host in "$FINWISE_HOST" "$FINWISE_ALIASES"; do
            curl -fsS --cacert "$root_ca" --retry 8 --retry-all-errors --retry-delay 1 \
              --max-time 5 "https://$host/healthz" > /dev/null
          done
          NODE_EXTRA_CA_CERTS="$root_ca" node --test scripts/smoke-ec2.mjs

      - name: Verify OCR imports and compression in the runtime image
        if: ${{ !cancelled() && steps.ec2-stack.outcome == 'success' }}
        run: docker compose exec -T ai-core python - ocr < scripts/smoke-ai-core.py

      - name: Verify Mongo-backed AI state with the runtime image
        if: ${{ !cancelled() && steps.ec2-stack.outcome == 'success' }}
        run: docker compose exec -T ai-core python - state < scripts/smoke-ai-core.py

      - name: Start the load-test configuration with the existing images
        id: load-stack
        if: ${{ !cancelled() && steps.ec2-stack.outcome == 'success' }}
        env:
          COMPOSE_FILE: compose.yaml:deploy/aws/compose.ec2.yaml:deploy/aws/compose.release.yaml:loadtest/compose.loadtest.yaml
          CLIENT_URL: http://127.0.0.1:8080
          CORS_ORIGINS: http://127.0.0.1:8080
        run: docker compose up -d --no-build --wait --wait-timeout 300

      - uses: grafana/setup-k6-action@v1
        id: k6
        if: ${{ !cancelled() && steps.load-stack.outcome == 'success' }}

      - name: k6 smoke
        if: ${{ !cancelled() && steps.k6.outcome == 'success' }}
        run: k6 run loadtest/k6/smoke.js
        env:
          K6_BASE_URL: http://127.0.0.1:8080

      - name: Dump logs on failure
        if: failure()
        run: docker compose logs --no-color --tail=200

      - name: Tear down
        if: always()
        run: docker compose down -v

  # ── Lint ────────────────────────────────────────────────────────────
  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
          cache-dependency-path: client/package-lock.json

      - name: Install client dependencies
        run: cd client && npm ci

      - name: Lint client
        run: cd client && npm run lint

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Lint AI Core and AWS templates
        run: |
          python -m pip install ruff==0.7.4 cfn-lint==1.61.0
          ruff check server/AI_Core scripts/smoke-ai-core.py
          cfn-lint deploy/aws/ec2.yaml deploy/aws/finwise.yaml
```

## `.github/workflows/nightly-load.yml`

Snapshot SHA-256: `1d94f965289bae4a8646b3cb72b2ba898d28a273c8aa2b67cb030f99d8b38c1a`.

```yaml
# ══════════════════════════════════════════════════════════════════════
# FinWise — Nightly Load / Spike / SSE Soak
# ══════════════════════════════════════════════════════════════════════
# Runs the k6 suites in loadtest/k6 against the compose stack on a single
# GitHub-hosted runner (4 vCPU). That machine runs the stack AND the load
# generator, so absolute latencies are pessimistic and only regressions
# between nights are meaningful. It is NOT a capacity proof for production
# sizing (see docs/CAPACITY_AND_SLOS.md).
#
# Default: mock LLM (measures the platform, no provider quota burned).
# Manual run with llm=real needs the repo secret GEMINI_API_KEY (or set
# LLM_PROVIDER/keys the same way AI Core's .env.example documents). Real-LLM
# runs should use K6_MIX=82,15,2,1 so the AI rate matches the plan (~75/min)
# instead of the stress mix, otherwise free-tier quotas are exhausted.
# ══════════════════════════════════════════════════════════════════════

name: Nightly Load

on:
  schedule:
    - cron: "17 2 * * *"
  workflow_dispatch:
    inputs:
      llm:
        description: "LLM backend for AI Core"
        type: choice
        options: [mock, real]
        default: mock
      users:
        description: "Virtual users for the load run"
        type: string
        default: "150"

concurrency:
  group: nightly-load
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  load:
    name: k6 (${{ inputs.llm || 'mock' }} LLM)
    runs-on: ubuntu-latest
    timeout-minutes: 75
    env:
      LLM_MODE: ${{ inputs.llm || 'mock' }}
      K6_USERS: ${{ inputs.users || '150' }}
      K6_BASE_URL: http://127.0.0.1:8080
    steps:
      - uses: actions/checkout@v4

      - name: Create env files and throwaway secrets
        run: |
          cp server/.env.example server/.env
          cp server/AI_Core/.env.example server/AI_Core/.env
          {
            echo "JWT_SECRET=$(openssl rand -hex 32)"
            echo "AI_CORE_INTERNAL_TOKEN=$(openssl rand -hex 24)"
            echo "WEBHOOK_CREDENTIALS_KEY=$(openssl rand -base64 32)"
          } >> "$GITHUB_ENV"
          if [ "$LLM_MODE" = "real" ]; then
            echo "LLM_PROVIDER=gemini" >> "$GITHUB_ENV"
            echo "K6_MIX=82,15,2,1" >> "$GITHUB_ENV"
          else
            echo "LLM_PROVIDER=mock" >> "$GITHUB_ENV"
          fi

      - name: Inject provider key (real LLM only)
        if: ${{ inputs.llm == 'real' }}
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          if [ -z "$GEMINI_API_KEY" ]; then
            echo "::error::llm=real requires the GEMINI_API_KEY repository secret"; exit 1
          fi
          echo "::add-mask::$GEMINI_API_KEY"
          printf '\nGEMINI_API_KEY=%s\n' "$GEMINI_API_KEY" >> server/AI_Core/.env

      - name: Start stack
        run: docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml up -d --build --wait --wait-timeout 300

      - uses: grafana/setup-k6-action@v1

      # Each suite is a separate step with continue-on-error so one failing
      # threshold does not hide the others; the final step fails the job.
      - name: k6 load (ramp + hold)
        id: load
        continue-on-error: true
        run: k6 run --summary-export=load-summary.json loadtest/k6/load.js

      - name: k6 spike
        id: spike
        continue-on-error: true
        run: k6 run --summary-export=spike-summary.json loadtest/k6/spike.js

      - name: k6 SSE soak
        id: soak
        continue-on-error: true
        run: k6 run --summary-export=soak-summary.json loadtest/k6/soak-sse.js

      - name: Upload k6 summaries
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: k6-summaries-${{ env.LLM_MODE }}
          path: "*-summary.json"
          if-no-files-found: warn
          retention-days: 30

      - name: Dump logs on failure
        if: failure() || steps.load.outcome == 'failure' || steps.spike.outcome == 'failure' || steps.soak.outcome == 'failure'
        run: docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml logs --no-color --tail=300

      - name: Tear down
        if: always()
        run: docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml down -v

      - name: Fail if any suite breached its thresholds
        if: steps.load.outcome == 'failure' || steps.spike.outcome == 'failure' || steps.soak.outcome == 'failure'
        run: |
          echo "load=${{ steps.load.outcome }} spike=${{ steps.spike.outcome }} soak=${{ steps.soak.outcome }}"
          exit 1
```

## `scripts/smoke-ec2.mjs`

Snapshot SHA-256: `c463eebc945a5afe573528c76c7805d35e5036e72b50f29812432e5b42b52319`.

```javascript
import assert from "node:assert/strict";
import { test } from "node:test";

// The CI stack uses Caddy's local CA. NODE_EXTRA_CA_CERTS points to its public
// root certificate so the smoke test verifies TLS and both hostnames.
const primary = "https://finwise.localhost";
const alias = "https://finwise-alias.localhost";
const requestId = "ec2-ci-smoke-123";

function get(base, path, options) {
  return fetch(new URL(path, base), {
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
    ...options,
  });
}

for (const origin of [primary, alias]) {
  test(`${origin} redirects HTTP to the same HTTPS hostname`, async () => {
    const response = await get(origin.replace("https:", "http:"), "/login?next=dashboard");
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `${origin}/login?next=dashboard`);
  });

  test(`${origin} permits credentialed CORS preflights`, async () => {
    const response = await get(primary, "/api/v1/auth/profile", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  });
}

for (const [origin, path] of [[primary, "/login"], [primary, "/register"], [alias, "/chat/local"]]) {
  test(`${origin}${path} serves uncached SPA HTML with security headers`, async () => {
    const response = await get(origin, path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    assert.match(response.headers.get("cache-control") ?? "", /\bno-cache\b/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(await response.text(), /id="root"/);
  });
}

test("the emitted JavaScript bundle is served with immutable caching", async () => {
  const page = await get(primary, "/login");
  const entry = (await page.text()).match(/src="(\/assets\/[^"]+\.js)"/);
  assert.ok(entry, "Expected the built HTML to reference its JavaScript bundle");
  const bundle = await get(primary, entry[1], { method: "HEAD" });
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get("content-type") ?? "", /javascript/);
  assert.match(bundle.headers.get("cache-control") ?? "", /\bimmutable\b/);
});

test("a missing asset returns 404 instead of the SPA", async () => {
  const response = await get(primary, "/assets/finwise-ci-missing.js");
  assert.equal(response.status, 404);
});

test("request IDs survive the Caddy and nginx hops", async () => {
  const response = await get(alias, "/api/test", { headers: { "X-Request-Id": requestId } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), requestId);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
});

test("the gateway reaches the Python service", async () => {
  const response = await get(primary, "/api/python-health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).python_service.status, "healthy");
});

test("the authentication endpoint issues a secure CSRF cookie", async () => {
  const response = await get(primary, "/api/v1/auth/csrf");
  assert.equal(response.status, 200);
  assert.match((await response.json()).csrf_token, /^[a-f0-9]{64}$/);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("csrf_token="));
  assert.ok(cookie, "Expected a csrf_token cookie");
  assert.match(cookie, /;\s*Secure(?:;|$)/i);
  assert.match(cookie, /;\s*SameSite=Lax(?:;|$)/i);
});

test("a protected profile request requires authentication", async () => {
  const response = await get(primary, "/api/v1/auth/profile");
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /\bno-store\b/);
});

test("an unlisted origin is denied with a traceable client error", async () => {
  const response = await get(primary, "/api/test", {
    headers: { Origin: "https://example.invalid", "X-Request-Id": requestId },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const body = await response.json();
  assert.equal(body.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(body.request_id, requestId);
});

for (const path of ["/api/metrics", "/api/v1/metrics", "/api/v1/metrics/"]) {
  test(`${path} is blocked by the public edge`, async () => {
    const response = await get(primary, path);
    assert.equal(response.status, 404);
  });
}
```

## `scripts/smoke-ai-core.py`

Snapshot SHA-256: `cd68e19f15e9bc5f1bbc18007c6da767203319152f0bed93a449637185e8c63e`.

```python
"""Exercise the native OCR dependencies and real MongoDB in the CI runtime image."""
import sys
from uuid import uuid4


def check_ocr() -> None:
    from paddleocr import PaddleOCR
    import zlib

    assert callable(PaddleOCR)
    sample = b"FinWise receipt OCR"
    assert zlib.decompress(zlib.compress(sample)) == sample


def check_state() -> None:
    from memory.state_store import MongoStateStore
    from utils.session_manager import CheckpointPhase, SessionManager

    store = MongoStateStore()
    assert store.db.command("hello")["isWritablePrimary"] is True
    index_report = store.ensure_indexes()
    assert index_report["ok"], index_report

    org_id = f"ci-{uuid4().hex}"
    user_id = "ci-user"
    for value in ("draft budget", "updated budget"):
        assert store.upsert_memories(org_id, user_id, [("plan", value, 0.9, "test")]) == 1
    memories = store.list_memories(org_id, user_id, 5)
    assert [(memory["key"], memory["value"]) for memory in memories] == [
        ("plan", "updated budget")
    ]
    assert not store.list_memories("other-org", user_id, 5)
    assert not store.list_memories(org_id, "other-user", 5)

    session = SessionManager(store).create_session(org_id, user_id, original_input="plan a budget")
    # Use a fresh manager to prove sessions survive process-local caches.
    reader = SessionManager(MongoStateStore())
    restored = reader.ensure_session(org_id=org_id, user_id=user_id, session_id=session.id)
    assert restored.id == session.id and restored.original_input == "plan a budget"

    reader.save_checkpoint(session.id, CheckpointPhase.PLANNING)
    assert store.get_session(session.id, org_id="other-org", user_id=user_id) is None
    assert store.list_checkpoints(session.id, org_id=org_id, user_id="other-user") == []
    latest = reader.get_latest_checkpoint(session.id)
    assert latest is not None and latest.phase is CheckpointPhase.PLANNING


if __name__ == "__main__":
    {"ocr": check_ocr, "state": check_state}[sys.argv[1]]()
```

## `scripts/test-release-ec2.sh`

Snapshot SHA-256: `5c4c0e150e437bcd9683ed4b48f3acdc87dd527dc73f34be9ad8e66fcf761e19`.

```bash
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
```
