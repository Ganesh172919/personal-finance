# Backup, recovery and incident response

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

## Recovery objectives

Define a recovery point objective (acceptable data loss) and recovery time objective (acceptable outage) for the application's actual users.
A single EC2 host and a single MongoDB primary do not provide automatic high availability.
Do not claim a backup exists, is current, or is restorable until its creation and isolated restore have been verified.

## Data inventory

| Item | Location or dependency | Recovery consideration |
| --- | --- | --- |
| Application data | MongoDB volume | Logical backup and tested restore |
| AI sessions and state | MongoDB for this Compose configuration | Included only if the correct databases are captured |
| Redis state | Redis volume | Snapshot or separate persistence strategy |
| Caddy certificates and state | Caddy volumes | Include in host recovery strategy; certificates can also be reissued subject to DNS and CA limits |
| Environment files | Host filesystem and approved secret store | Encrypted off-host recovery copy with limited access |
| Docker images | Host image store or reproducible builds | Retain current and prior release images |
| Source and templates | GitHub release branch | Record exact commit and verify availability |
| Uploaded or other local files | Confirm actual storage paths | Include all configured storage locations in the backup scope |

## Backup workflow

1. Review the authoritative [backup procedure](../../deploy/aws/PRODUCTION_RUNBOOK.md#back-up-and-restore).
2. Verify that MongoDB is healthy and determine the scope of the dump.
3. Create a protected logical backup using the documented `mongodump` command and confirm it is nonempty.
4. Calculate a checksum and copy the encrypted backup to a separate authorized location.
5. Check copy integrity, retention policy, access controls and monitoring.
6. Record backup timestamp, source, destination, checksum status and operator.
7. Cover Redis, Caddy, host files and other required volumes separately using a consistent snapshot strategy.
8. Restore periodically in an isolated environment and record the observed recovery time and verification results.

A database dump and an EBS snapshot have different scopes and consistency requirements.
For a coordinated root snapshot, schedule a write outage and follow the cited AWS snapshot procedure.
Do not publish dumps, customer files, tokens, or encryption keys in GitHub or incident reports.

## Restore drill

1. Select a recovery point and confirm permission to use a test copy.
2. Create an isolated recovery environment with a separate network, project name and storage.
3. Disable email delivery, webhooks, scheduled jobs and production provider connections.
4. Verify the archive checksum and restore into an empty, writable MongoDB replica set.
5. Start the remaining test services using non-production credentials.
6. Check collection availability, a test login, relevant files, AI state and an application workflow.
7. Record data coverage, timing, errors and remaining gaps.
8. Remove the isolated test environment according to your data-retention policy.

The recovery guide's restore command must only target the intended isolated database until a production recovery has been authorized and planned.
A database restore can overwrite or exclude more recent writes. Assess loss and communicate the recovery point.

## Incident triage

### First response

Record the time, user impact, current release and recent changes. Establish an operator and incident channel.
Preserve logs with request IDs, timestamps and service names, while redacting personal and secret data.
Stop unrelated deployments until the cause and recovery plan are understood.

### Website does not load

Check public DNS, EC2 instance status, the Elastic IP association, security group ports, Caddy and nginx.
Review `docker compose ps`, current logs, disk space and container resource use.
Check certificate expiry or issuance errors when TLS fails.

### Gateway or database unhealthy

Check MongoDB primary election, Redis health and dependencies before repeatedly restarting consumers.
Compare resource pressure and errors with the most recent deployment or configuration change.
If data corruption is suspected, preserve evidence and backups before attempting repair.

### Authentication or email fails

Check API error IDs, allowed origins, cookie flags, server health and SMTP provider status.
Do not include passwords, authentication links, cookies or one-time codes in tickets.

### AI or OCR fails

Check gateway-to-AI connectivity, AI Core readiness, OCR import errors, provider quota and provider credentials.
Compare the running image and Python dependencies with the intended release.
The successful CI smoke verifies import and compression in a temporary Linux runtime, not every real receipt.

### Worker backlog

Check worker logs, MongoDB, Redis, available resources, job retry patterns and provider limits.
The worker health check verifies a database ping; it does not prove every job is completing successfully.

## After the incident

Record the cause, timeline, mitigation, missing alerts, data impact and follow-up owner.
Verify restoration of normal service and close temporary access or diagnostic resources.
Rehearse any changed recovery procedure before relying on it for a future incident.
