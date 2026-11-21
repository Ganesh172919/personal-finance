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
