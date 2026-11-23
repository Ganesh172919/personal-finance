# Routine maintenance guide

This is a proposed operating schedule for the recorded deployment.
It does not assert that monitoring, backups or staffing are already configured.
Assign actual intervals and owners based on service requirements.

## At the start of a review

1. Confirm the AWS account and region.
2. Confirm the instance and Elastic IP.
3. Record the current production checkout SHA.
4. Record the current release branch SHA.
5. Identify any in-progress incidents or changes.
6. Confirm who owns the review and its follow-up actions.

Do not assume the branch tip is the running application.
Do not publish secret values while gathering evidence.

## Daily availability review

1. Check the public HTTPS login page.
2. Check the appropriate health endpoint.
3. Review instance status.
4. Review container health and restart patterns.
5. Check the age and outcome of the most recent backup.
6. Review failed jobs and repeated provider errors.
7. Verify that any alert has reached its intended owner.
8. Record exceptions with an owner and next action.

A public page response is a limited availability signal.
Use designated account tests for critical authenticated workflows.

## Weekly service review

### EC2 and disk

Check filesystem usage and trends.
Check Docker image and build-cache usage.
Check whether logs are rotating as expected.
Check that current and previous release images remain available.
Review repeated container restarts.
Investigate abnormal resource consumption before changing limits.

### Application behavior

Review gateway errors and request IDs.
Review worker backlog, retries and failed jobs.
Review AI Core errors and provider quota responses.
Review receipt or speech errors if those features are in use.
Use redacted logs and test data.

### Source and CI

Review the release branch's recent commits.
Review failed or canceled Tests runs.
Confirm the production SHA is recorded.
Identify dependency updates and migration changes awaiting review.
Check whether branch protection still matches the team's policy.

### DNS and certificates

Check the public hostname and certificate.
Check any active alias separately.
Review changes to nameservers, A records and canonical origin settings.
The DigitalPlat alias requires independent DNS verification before it can be considered active.

### Costs and quotas

Review AWS compute and storage charges.
Review public IPv4 and snapshot charges.
Review account credit balance and plan expiration.
Review model, email and speech provider usage.
Check budget alerts and intended recipients.

## Monthly recovery review

1. Select a recent backup.
2. Verify its integrity and access controls.
3. Restore it into an isolated environment.
4. Prevent outbound production integrations during the drill.
5. Check the database and relevant persisted files.
6. Test a designated account and representative application workflow.
7. Measure recovery time.
8. Record missing data or failed steps.
9. Assign and track corrections.
10. Handle the restored copy under the data-retention policy.

Do not infer restore success from a backup job's success message.
Do not restore a drill into the production database.

## Monthly access review

Review AWS operators and privileged roles.
Review Systems Manager access.
Review GitHub repository collaborators and branch rules.
Review domain registrar and DNS provider access.
Review model, email and speech provider access.
Review backup destination and encryption-key access.
Remove access that is no longer required.
Record the review date without storing credentials.

## Monthly security review

Run current dependency audits in an isolated environment.
Review applicable Node, Python, operating-system and container-image findings.
Check public security-group ingress.
Check that internal services remain private.
Review secret rotation events and outstanding exposure incidents.
Review monitoring and alert delivery.
Track unresolved findings with an owner.

## Patch planning

1. Identify the operating-system, Docker, image or dependency update.
2. Review its compatibility and release notes from the appropriate vendor.
3. Test the change in an isolated environment where possible.
4. Confirm backup and rollback readiness.
5. Select a maintenance window.
6. Apply the reviewed change using authorized access.
7. Reboot only when required and planned.
8. Verify containers, HTTPS, login and affected features.
9. Review logs and provider access.
10. Record the result and any remaining work.

An image update can affect behavior even when application source is unchanged.
An OS update can require a reboot and temporarily interrupt the single-host service.

## Quarterly recovery exercise

Review the documented recovery objectives.
Rehearse host replacement in an isolated environment.
Confirm access to backups, encryption keys and protected configuration.
Confirm the process for associating the intended Elastic IP or updating DNS.
Verify public HTTPS only after the recovery environment is ready for cutover.
Record actual recovery time and gaps.

## After a production release

Check the full deployed SHA.
Check public HTTPS and application routes.
Test a designated account and features touched by the change.
Check the worker and service logs.
Confirm the backup plan still covers new data locations.
Keep previous images for the acceptance period.
Update the deployment record with verified results.

## Maintenance record template

```text
Review date and timezone:
Operator:
AWS account and region:
EC2 instance:
Production SHA:
Release branch SHA:
Latest relevant CI run:
HTTPS and login result:
Backup recovery point:
Last restore drill result:
Disk and container status:
Provider and quota status:
Billing and credit status:
Access review result:
Open issues and owners:
Next review date:
```

Store the record in an access-appropriate location.
Do not include secrets, private customer records or recovery codes.
