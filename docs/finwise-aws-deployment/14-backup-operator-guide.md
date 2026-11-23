# Backup and recovery operator guide

This guide expands [Backup and recovery](05-backup-recovery.md).
It is a procedure for designing and verifying a backup process.
It does not assert that scheduled backups already exist.
The authoritative backup commands for the release are in [the production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md#back-up-and-restore).

## Establish recovery requirements

1. Identify the users and data supported by the deployment.
2. Determine the maximum acceptable loss of recent writes.
3. Determine the maximum acceptable service interruption.
4. Assign an owner for backups.
5. Assign an owner for restore drills.
6. Select an encrypted destination outside the EC2 host.
7. Define retention and access rules.
8. Define how failed backups and failed restores are reported.
9. Record dependencies required to decrypt and restore data.
10. Review the design when the application changes storage locations.

The recovery point objective and recovery time objective depend on actual operational requirements.
They cannot be inferred from the presence of a database dump command.

## Inventory the data

### MongoDB

The Compose configuration uses a named volume for MongoDB data.
The replica set is named `rs0`.
Application records and AI state use MongoDB in the recorded Compose configuration.
A whole-instance logical dump can capture the databases included in the dump scope.
Confirm the actual database scope and permissions before relying on it.

### Redis

Redis uses a separate named volume and append-only persistence in the Compose configuration.
A MongoDB dump does not include Redis data.
Determine the consequences of losing Redis state and include it in the recovery plan where required.

### Caddy

Caddy has data and configuration volumes.
These volumes are separate from MongoDB.
Certificates can potentially be reissued, but issuance depends on valid DNS, network access and certificate authority limits.
Plan recovery of Caddy state rather than assuming immediate reissuance.

### Environment files

The root, server and AI Core environment files contain configuration and credentials.
They are not part of a MongoDB dump.
Keep encrypted copies or use an authorized secret store.
Protect the encryption keys and restrict access to recovery operators.

### Files and external systems

Confirm where uploaded files and any other persisted artifacts are stored for the deployed release.
Check whether external providers or integrations contain state required for recovery.
Record those dependencies without copying personal data into the runbook.

## Prepare a logical MongoDB backup

1. Confirm the correct AWS account and EC2 instance.
2. Confirm the running Compose project and file combination.
3. Verify MongoDB is healthy and has a writable primary.
4. Review the runbook's `mongodump` command and intended archive path.
5. Ensure adequate disk capacity for the temporary archive.
6. Use restrictive file permissions for the output directory and archive.
7. Run the reviewed dump command.
8. Check the exit status.
9. Check that the archive exists and is nonempty.
10. Create a checksum as documented in the runbook.
11. Transfer the archive and checksum to encrypted off-host storage.
12. Verify the checksum at the destination.
13. Record the source, timestamp, scope and destination.
14. Monitor the job and handle failures promptly.

The dump can include sensitive financial data.
Do not attach it to GitHub issues or send it through ordinary chat.

## Prepare a coordinated host snapshot

An EBS snapshot can cover host-level files and Docker volumes on the selected volume.
Its consistency depends on the state of the application and filesystems when it is taken.
Follow the production runbook and current AWS instructions.

1. Identify the exact EBS volume and AWS region.
2. Confirm the volume's encryption and recovery key access.
3. Plan the interruption needed to stop writes consistently.
4. Record the running application SHA and configuration version.
5. Stop writes and follow the chosen consistency procedure.
6. Request the snapshot.
7. Record the snapshot ID and creation time.
8. Wait for the snapshot status to reach completed.
9. Check retention and destination account access.
10. Restart service if it was stopped and verify application health.
11. Test restoring the snapshot in an isolated environment.

Snapshots, retained volumes and copies may incur AWS charges.
Stopping writes without a documented restart and verification procedure can prolong an outage.

## Verify an off-host copy

1. Confirm the destination is separate from the source EC2 host.
2. Confirm encryption at rest and in transit as appropriate.
3. Confirm the destination identity has only necessary access.
4. Verify the transferred archive against its checksum.
5. Confirm the retention policy matches the recovery requirements.
6. Confirm an authorized recovery operator can retrieve the backup.
7. Confirm the encryption key will remain available for the retention period.
8. Record the verification outcome.

## Run a logical restore drill

1. Choose a backup and record its timestamp.
2. Create an isolated environment with separate networks and volumes.
3. Prevent the restored application from contacting production integrations.
4. Disable outbound email, scheduled tasks and webhooks as appropriate.
5. Use test credentials and a test hostname.
6. Verify the archive checksum.
7. Start an empty writable MongoDB replica set.
8. Review the runbook's `mongorestore` command and its target.
9. Restore the archive only into the isolated database.
10. Confirm the restore completed without errors.
11. Start the remaining test services.
12. Check database collections and expected records using authorized test access.
13. Verify a test sign-in.
14. Verify an AI session or state lookup where applicable.
15. Verify a representative application workflow.
16. Check any separately restored files.
17. Measure the elapsed recovery time.
18. Record missing data, errors and follow-up owners.
19. Dispose of the restored copy according to the data-retention policy.

Never point the drill at the production database.
Do not send restored customer data to providers as part of an uncontrolled test.

## Recover from host loss

1. Establish the time of the last trustworthy recovery point.
2. Identify the current and previous application releases.
3. Determine whether the root volume or its snapshot is recoverable.
4. Create a replacement host in the appropriate AWS environment.
5. Restore the volume or create a fresh stack and restore logical data.
6. Restore protected configuration and keys using authorized access.
7. Keep the replacement isolated from production traffic.
8. Verify MongoDB, Redis, AI Core, server, worker, web and Caddy.
9. Check that production integrations will behave as intended after cutover.
10. Validate a designated test account and representative workflow.
11. Associate the intended Elastic IP or update DNS when ready.
12. Check external HTTPS and authentication.
13. Record the recovery point, outage duration and data impact.
14. Create follow-up actions for any recovery gaps.

## Application rollback and data restore

An application rollback uses a previously retained code and image release.
It leaves the current persistent data in place.
A data restore changes the data state and can discard newer writes.
Assess compatibility and data loss separately before choosing either action.

## Backup review record

Record the source account and region.
Record the volume or database scope.
Record the creation time and timezone.
Record the backup type and location.
Record checksum verification and encryption status.
Record the last successful restore drill.
Record the recovery time observed during that drill.
Record any missing dependencies or unresolved errors.
Do not include the backup contents or credentials in the review record.
