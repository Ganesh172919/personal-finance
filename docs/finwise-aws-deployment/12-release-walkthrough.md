# Release walkthrough

This walkthrough supplements [GitHub changes and releases](03-github-releases.md).
It describes the release tooling on the `codex/aws-deploy` branch as inspected on 23 November 2026.
The last recorded running production commit was `b70ef81024b57f328477a2420e8dff4117f553fa`.
Confirm the actual checkout and running images before changing the host.

## Terms used in this document

- **Source commit:** a specific Git commit identified by its full SHA.
- **Release branch:** the GitHub branch `codex/aws-deploy`.
- **CI run:** the GitHub Actions workflow execution for a particular commit.
- **Current release:** the code and images actually running on the host.
- **Target release:** the reviewed commit selected for deployment.
- **Previous release:** the current release recorded immediately before applying the target.
- **Rollback:** an attempt to restore the previous application release.
- **Data recovery:** a separate operation that restores persistent data from a chosen recovery point.

The branch tip, a passing CI commit and the production checkout may all be different commits.
Record each explicitly when planning a change.

## Step 1: select a change

1. Identify the feature or fix being released.
2. Find the full target SHA on `codex/aws-deploy`.
3. Identify the last recorded production SHA.
4. Confirm the running checkout on EC2 before relying on the recorded SHA.
5. Compare the target with the actual running checkout.
6. Note configuration changes, new dependencies, schema changes and provider changes.
7. Determine whether the deployment also needs a CloudFormation update.
8. Treat the infrastructure update as a separate change with its own review.
9. Identify user-visible changes and any expected interruption.
10. Record who will perform the release and who can help with recovery.

## Step 2: inspect CI

1. Open the repository's Actions tab.
2. Select the Tests workflow for the exact target SHA.
3. Wait for the workflow to finish.
4. Confirm the workflow conclusion is successful.
5. Inspect failed or skipped jobs rather than inferring success from a single job.
6. Review the client, server and AI test results.
7. Review the Docker image build results.
8. Review the release and rollback test result.
9. Review the EC2 HTTPS and k6 smoke result.
10. Review lint and template checks.
11. Record the run URL with the release record.

The workflow uses temporary secrets and test services.
Its mock AI provider does not verify the production provider's key or quota.
The CI runner is not the production EC2 host.

## Step 3: assess the database

1. Determine whether the target changes data formats or indexes.
2. Check whether the previous release can read data written by the target.
3. Review any migration for idempotency and failure handling.
4. Identify whether the migration can be reversed safely.
5. Verify a recent backup and its recovery point.
6. Confirm the backup is available outside the host.
7. Confirm restoration has been tested against an isolated copy.
8. Decide how to handle writes made after the backup if recovery becomes necessary.
9. Schedule a maintenance window when the change warrants it.
10. Do not assume an application rollback reverses database changes.

## Step 4: inspect the host

Connect with AWS Systems Manager Session Manager.
Check the instance ID and region before starting a privileged shell.
Do not copy environment files or secrets into a terminal transcript shared with others.

```bash
cd /opt/finwise
git rev-parse HEAD
git status --short
df -h /
docker system df
docker compose version
docker buildx version
command -v flock
```

Check that the checkout is clean and record its full SHA.
The release script refuses a dirty checkout.
Review local modifications rather than deleting them to make the check pass.
Confirm that the existing release images are available for rollback.
The first tagged release can originate from the legacy Compose image naming scheme.
The release script checks the images corresponding to the current checkout before applying a new release.

## Step 5: run the reviewed release script

Use the full target SHA rather than a branch name or a shortened SHA.
Use the public HTTPS origin that should pass the release smoke checks.
The commands below fetch the branch and copy the script from the selected commit.
Review the script and the target commit before executing it.

```bash
cd /opt/finwise
release_sha=FULL_REVIEWED_COMMIT_SHA
base=https://finwise.3-106-147-122.sslip.io
previous_sha=$(git rev-parse HEAD)
printf 'Previous %s\nTarget %s\n' "$previous_sha" "$release_sha"
git fetch origin refs/heads/codex/aws-deploy
release_script=$(mktemp /tmp/finwise-release.XXXXXX)
git show "$release_sha:deploy/aws/release-ec2.sh" > "$release_script" &&
  bash "$release_script" deploy "$release_sha" "$base"
```

The script serializes releases using `flock`.
It checks that the target belongs to the fetched release branch.
It builds candidate images before replacing the running containers.
It tests the AI image's OCR import before applying the candidate.
It applies the tagged images with the `finwise` Compose project name.
It checks public routes and anonymous profile access after applying.
It attempts to restore the previous application release if application or smoke checks fail.
An automatic rollback can itself fail, and it does not reverse data migrations.

## Step 6: verify from outside AWS

Use the canonical HTTPS origin and a client outside the EC2 host.

```bash
base=https://finwise.3-106-147-122.sslip.io
for path in /login /register /healthz /api/python-health; do
  status=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$base$path")
  printf '%s %s\n' "$path" "$status"
done
```

Confirm that expected routes return the expected status for the chosen release.
Use a designated test account to verify sign-in and session recovery.
Create and remove a disposable transaction if the data workflow changed.
Ask a non-sensitive test question if AI behavior changed.
Test email, voice and receipt upload separately when relevant.
Inspect service status and errors without exposing customer data.

## Step 7: record the release

Record the target SHA and previous SHA.
Record the date, timezone, operator and CI run URL.
Record the backup recovery point and applicable migration decision.
Record public checks and application checks separately.
Record any failed check and its investigation owner.
Keep rollback images for the agreed acceptance period.
Update the deployment record after production is verified.

## Rollback procedure

The production runbook documents the rollback command.
The command uses a previous SHA and retained local images.
Confirm the selected previous release is compatible with the current database state.
If the copied release script is unavailable, retrieve it from a reviewed commit that contains it.
If rollback fails, stop additional changes, preserve logs and begin incident recovery.
Do not restore a database merely because the application rollback failed; assess the expected data loss first.

## Common release failures

### The target is outside the release branch

Verify the full SHA and fetch the intended branch.
Review how the change should be incorporated into the release branch.
Do not bypass ancestry checks without reviewing the release design.

### The checkout is dirty

Inspect `git status --short` and identify the owner and purpose of the changes.
Preserve any uncommitted work.
Resolve the discrepancy before retrying.

### Previous images are missing

Stop and establish a viable recovery path.
The script checks rollback images before applying the candidate.
Rebuilding an old commit may not recreate the exact original image if external dependencies changed.

### OCR smoke fails

Inspect the image build and the OCR smoke output.
Compare the image and dependency versions with the CI-tested commit.
Do not remove the check just to force a release.

### HTTPS smoke fails

Check public DNS, the canonical hostname, Caddy, the certificate and upstream service status.
Identify whether the failure started before or after applying the candidate.
Follow the script output and verify whether rollback succeeded.

### A public page loads but a feature fails

A static page response does not prove authentication, email or the model provider is working.
Inspect the affected service, request ID and relevant provider status.
Use a test account and redact secrets and personal data from incident notes.
