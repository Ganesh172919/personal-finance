# Recovery drill checklist

Use this checklist for a planned, isolated recovery exercise.
It is a template, not evidence that a backup or drill has already occurred.
Choose an authorized environment and an operator before starting.

## Drill planning

- [ ] Identify the system and environment covered by the drill.
- [ ] Choose a backup or snapshot with a known timestamp.
- [ ] Record the intended recovery point.
- [ ] Identify the source AWS account and region.
- [ ] Identify the isolated recovery account or network.
- [ ] Assign the operator and observer.
- [ ] Define the expected completion criteria.
- [ ] Define how results and failures will be recorded.
- [ ] Confirm the exercise will not alter production.
- [ ] Confirm how the restored copy will be protected and removed.

## Access preparation

- [ ] Confirm the operator can access the backup destination.
- [ ] Confirm access to the required encryption keys.
- [ ] Confirm access to the reviewed application source.
- [ ] Confirm access to test-only provider settings.
- [ ] Confirm access to the isolated AWS environment if used.
- [ ] Avoid sharing passwords or session tokens in the drill record.

## Backup verification

- [ ] Record the backup type.
- [ ] Record the creation time and timezone.
- [ ] Record which databases or volumes are covered.
- [ ] Verify the backup is complete and nonempty.
- [ ] Verify the checksum where applicable.
- [ ] Confirm encryption and retention settings.
- [ ] Identify any data that the backup does not cover.
- [ ] Record the last successful restoration of this backup type.

## Isolate the test environment

- [ ] Use separate networks and storage.
- [ ] Use a distinct Compose project name for the drill.
- [ ] Prevent traffic from reaching the production domain.
- [ ] Disable production email delivery.
- [ ] Disable or redirect webhooks.
- [ ] Disable scheduled production tasks.
- [ ] Use test provider credentials or a mock provider.
- [ ] Limit operator access to the restored data.
- [ ] Record the controls used for isolation.

## MongoDB restore preparation

- [ ] Review the exact `mongorestore` procedure in the production runbook.
- [ ] Confirm the command targets the isolated database.
- [ ] Start an empty writable replica set in the drill environment.
- [ ] Verify the backup archive checksum.
- [ ] Confirm adequate storage for restored data.
- [ ] Confirm the expected database scope.
- [ ] Record the start time.

## MongoDB restore execution

- [ ] Run the reviewed restore command against the isolated target.
- [ ] Check the command's exit status.
- [ ] Review restore errors without exposing private records.
- [ ] Confirm the expected databases and collections exist.
- [ ] Confirm representative records are accessible to authorized test users.
- [ ] Confirm AI state is present when included in the backup scope.
- [ ] Record the completion time and outcome.

## Other persistent data

- [ ] Verify Redis recovery requirements.
- [ ] Verify Caddy state or the planned certificate reissuance process.
- [ ] Verify required uploaded files and other persisted artifacts.
- [ ] Verify protected configuration and recovery keys.
- [ ] Record which data sources were not included in the drill.
- [ ] Assign an owner for any missing recovery coverage.

## Application startup

- [ ] Select the reviewed application SHA.
- [ ] Confirm the source and image availability.
- [ ] Start dependencies in the isolated environment.
- [ ] Confirm MongoDB writable-primary status.
- [ ] Confirm Redis health.
- [ ] Confirm AI Core readiness.
- [ ] Confirm server and worker status.
- [ ] Confirm web and Caddy status where applicable.
- [ ] Review redacted logs for startup errors.

## Functional verification

- [ ] Open the test login page.
- [ ] Sign in with a designated test account.
- [ ] Check the intended test account's data access.
- [ ] Verify a representative transaction workflow.
- [ ] Verify AI session or state access when applicable.
- [ ] Verify a non-sensitive AI request with the test provider.
- [ ] Verify a representative file read when covered.
- [ ] Verify a designated background job.
- [ ] Record failed or skipped checks and the reason.
- [ ] Avoid copying restored customer data into the report.

## Host snapshot drill

- [ ] Confirm the snapshot ID and completion status.
- [ ] Confirm the snapshot encryption key is accessible.
- [ ] Restore to an isolated volume in an appropriate Availability Zone.
- [ ] Attach the restored volume only to the intended test host.
- [ ] Confirm filesystem and application startup behavior.
- [ ] Check that the restored host cannot send production traffic unintentionally.
- [ ] Verify data and configuration scope.
- [ ] Record recovery time and errors.
- [ ] Remove temporary resources according to policy.

## Timing and results

- [ ] Record the drill start time.
- [ ] Record the backup retrieval time.
- [ ] Record the restore completion time.
- [ ] Record the application verification time.
- [ ] Calculate the observed recovery duration.
- [ ] Compare the result with the agreed recovery objective.
- [ ] Record the recovery point and potential data loss window.
- [ ] Record missing credentials, tools or permissions.
- [ ] Record any unexpected cost or capacity constraints.
- [ ] Assign owners and dates for corrections.

## Close the drill

- [ ] Confirm temporary integrations remain disabled.
- [ ] Remove or retain restored data according to policy.
- [ ] Remove temporary access that is no longer needed.
- [ ] Record the final result and reviewer.
- [ ] Update recovery documentation from verified findings.
- [ ] Schedule the next drill according to the operating plan.

## Production recovery differences

Production recovery needs an explicit decision about writes after the selected backup.
It may require user communication and a planned traffic cutover.
It may require associating the production Elastic IP or changing DNS.
It must use the authorized production access and recovery process.
Never assume an isolated drill's test credentials or hostnames are production-ready.
