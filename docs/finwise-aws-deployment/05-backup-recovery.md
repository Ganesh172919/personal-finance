# Backup and recovery

## Know what must be recovered

The host holds application data, Docker volumes, configuration and locally retained images. The database contains application records and AI state in the recorded Compose configuration. Redis and Caddy have their own persistent volumes. Environment files and provider credentials also need a protected recovery strategy.

A MongoDB logical dump does not include Redis data, Caddy volumes, host files or environment files. An EBS snapshot and a logical dump have different scopes and consistency requirements. Identify the actual storage locations used by the current release before deciding that a backup is complete.

## Define objectives

Agree on an acceptable recovery point, meaning how much recent data can be lost, and an acceptable recovery time. Set backup frequency, retention, encryption, access control, monitoring and an owner accordingly.

The existence of a backup command in a document does not mean backups are scheduled or restorable. Confirm the actual automation and perform restore drills.

## Logical MongoDB backup

The [production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md#back-up-and-restore) contains a `mongodump` procedure using an archive, compression, an oplog and a checksum. Review the target host and Compose configuration before running it.

After creating a dump:

1. Confirm the command completed successfully and the archive is nonempty.
2. Record its creation time and scope.
3. Copy it to an encrypted, access-controlled location outside the host.
4. Verify its checksum after transfer.
5. Confirm the retention policy and monitoring outcome.
6. Periodically restore it in isolation and verify application behavior.

## Host and volume snapshots

The recorded EC2 host stores multiple persistent volumes on its root disk. Follow the AWS EBS documentation and the production runbook for a coordinated, consistent snapshot. A planned write outage may be needed to obtain a consistent view of all host data.

Record the snapshot identifier, region, encryption, completion status and associated release. A retained EBS volume or snapshot can incur charges. Test access to encryption keys and the ability to create a replacement volume.

## Restore drill

1. Select a backup and verify its checksum and recovery point.
2. Create an isolated environment with a separate Compose project and storage.
3. Prevent production email, scheduled jobs, webhooks and external integrations from running in the restored environment.
4. Start an empty writable MongoDB replica set and restore the archive following the runbook.
5. Start the application using test-only credentials.
6. Verify expected collections, a test sign-in, AI state, a file read and a representative workflow.
7. Measure the recovery time, record any missing data or errors and assign follow-up work.
8. Handle the restored financial data according to the applicable retention and access policy.

Never point a restore command at the production database during a drill. A production restore can discard writes made after the selected backup and requires a deliberate recovery decision.

## Host loss

Prepare a replacement environment in the intended AWS region. Retrieve the reviewed release SHA, protected configuration and verified backups. Restore a consistent volume snapshot or build a fresh stack and restore its data. Keep the replacement isolated while verifying the database, application, providers and credentials.

Only after verification should an operator associate the intended Elastic IP or update DNS. Then test Caddy, HTTPS, login and affected user workflows from outside the host. Record the recovery point, interruption and any remaining data loss.

## Application rollback versus data recovery

Rolling back application images leaves the database in its current state. Database restore changes data and can remove newer writes. Decide separately whether the prior application is compatible with current data and whether a data restore is necessary.
