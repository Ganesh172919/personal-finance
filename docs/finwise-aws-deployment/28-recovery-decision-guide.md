# Recovery decision guide

This guide helps an operator choose a recovery path after a deployment or infrastructure failure.
It is not a substitute for an incident owner, an actual backup or current knowledge of the production state.
Use the reviewed production runbook for executable release and restore procedures.

## First establish the facts

1. Record the current time and timezone.
2. Identify the affected hostname and features.
3. Confirm whether the EC2 instance is reachable.
4. Confirm whether public HTTPS responds.
5. Determine whether the database is available.
6. Determine whether users can write new data.
7. Identify the last known working release.
8. Identify the latest verified backup and its recovery point.
9. Identify recent application, infrastructure, DNS and credential changes.
10. Assign an operator to coordinate recovery.

Preserve logs and request IDs with sensitive details redacted.
Do not copy customer financial data or credentials into the incident record.

## Decision: investigate or roll back

If a recent application release coincides with a failure, compare the target and previous release.
Check whether the failure is isolated to an external provider or a hostname.
Check whether the previous images are available.
Check whether the previous application can read the current database state.
Use the reviewed rollback procedure when that is the appropriate response.
Record whether rollback completed and whether the original symptom changed.

If the problem is unrelated to the new application image, rollback may not fix it.
Examples include a DNS error, expired provider credential, host outage or full disk.
Use the relevant incident playbook to identify the failing layer.

## Decision: application rollback or database restore

Application rollback changes code and images.
It normally leaves persistent database contents in their current state.
Database restore changes data and can lose writes made after the backup.
Treat these as separate decisions with separate evidence.

Before restoring data, identify the recovery point.
Estimate the impact of losing later writes.
Confirm the backup's integrity and scope.
Confirm the intended restore target.
Prevent accidental restoration into an unrelated environment.
Coordinate the recovery with the service owner.

## Failure before containers are replaced

The release script builds candidate images and checks OCR before applying them.
If a build or pre-apply check fails, inspect the script output.
Confirm whether the checkout was restored to the previous release.
Confirm the previously running containers still serve the expected application.
Do not assume the target was deployed just because the build started.
Preserve the failure evidence and fix the target before retrying.

## Failure after containers are replaced

The release script attempts to restore the previous application release after an apply or smoke failure.
Inspect the script's final output and exit status.
Confirm the running containers and checkout after the attempt.
Check public HTTPS and a representative authenticated workflow.
If automatic rollback failed, stop further releases and begin incident recovery.
Avoid repeatedly applying different commits without recording their effects.

## Failure caused by a migration

Determine which data or indexes changed.
Determine whether the previous code can read the changed data.
Identify any irreversible operation.
Preserve the current data and relevant logs before attempting repair.
Test the proposed recovery on an isolated copy where possible.
Choose whether to move forward with a fix, roll back code, restore data or combine actions.
Record the expected and actual data loss.

## Failure caused by configuration

Identify the affected setting and its precedence.
Check whether the configuration change was applied to all dependent services.
For a shared internal token, check that the gateway, worker and AI Core are coordinated.
For a hostname, check Caddy, DNS, canonical URL and allowed origins.
For a provider key, check provider status and quota.
Restore a protected previous configuration only through an authorized process.
Never put old or new secret values in the incident notes.

## Failure caused by DNS

Check the authoritative nameservers.
Check the current A record and its intended Elastic IP.
Check whether an unintended IPv6 record exists.
Check caching and propagation before making repeated changes.
Confirm that the host itself is healthy through an authorized path.
Verify trusted HTTPS after DNS is corrected.

## Failure caused by TLS

Confirm the exact hostname and certificate error.
Check public DNS and port 80/443 reachability.
Inspect Caddy status and certificate logs.
Check the configured hostname and aliases.
Do not use disabled certificate verification as the final acceptance check.
Avoid deleting Caddy data without understanding the consequences.

## Failure caused by a provider

Check the provider's current status and account quota.
Check the configured model or endpoint.
Check whether a credential was revoked or rotated.
Use a non-sensitive test request.
Distinguish a provider failure from AI Core or gateway unavailability.
Record the provider incident and user impact without sharing credentials.

## Host unavailable

Confirm the AWS account, region and instance ID.
Check EC2 instance status and recent AWS events.
Check whether Session Manager can connect.
Check the Elastic IP association and security group.
Identify the latest verified backup and snapshot.
Decide whether to recover the existing host or prepare a replacement.
Do not terminate or replace resources before understanding data retention and recovery effects.

## Replace a host

1. Select an isolated recovery environment.
2. Retrieve the reviewed release SHA and protected configuration.
3. Retrieve the selected backup and required encryption keys.
4. Restore the root volume or prepare a fresh host and logical restore.
5. Keep the recovered environment isolated from production traffic.
6. Prevent unintended outbound emails, webhooks and scheduled jobs during testing.
7. Verify MongoDB, Redis, AI Core, server, worker, web and Caddy.
8. Verify a designated account and representative workflow.
9. Confirm the intended DNS and Elastic IP cutover plan.
10. Move traffic only after the recovery environment is ready.
11. Verify external HTTPS and authentication.
12. Record downtime, recovery point and remaining data impact.

## Failure caused by disk pressure

Check filesystem and Docker disk usage.
Identify whether growth comes from data, images, logs, backups or temporary files.
Preserve the current and previous release images.
Preserve named MongoDB, Redis and Caddy volumes.
Review retention before deleting any material.
Verify health and free space after a reviewed cleanup.

## Failure caused by a missing backup

Record the latest known recovery point and the gap.
Do not claim that a later restore is possible without evidence.
Protect the current data while creating an appropriate recovery plan.
Investigate why backup monitoring or the backup process did not detect the gap.
Assign an owner to test future backups and restore procedures.

## Communication record

Record what is confirmed.
Record what remains unknown.
Record user impact and the start time.
Record the current operator and next review time.
Record the actions already taken and their results.
Record any data recovery point and expected data loss.
Exclude credentials, private prompts, receipts and customer financial data.

## Recovery completion

1. Confirm the application serves the intended release.
2. Confirm trusted HTTPS on the intended hostnames.
3. Confirm sign-in with a designated test account.
4. Confirm the affected feature works.
5. Confirm background work and dependencies are healthy.
6. Confirm backups and monitoring are operating as intended.
7. Record the verified recovery time and remaining issues.
8. Remove temporary access according to policy.
9. Assign follow-up actions with owners.
10. Update the deployment record after facts are verified.
