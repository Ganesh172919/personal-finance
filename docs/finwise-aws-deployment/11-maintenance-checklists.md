# Maintenance schedules and review checklists

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

These are proposed operating practices, not a claim that an automation, alert or backup schedule already exists.
Choose intervals and owners for the actual service requirements.

## Each release

- [ ] Identify the full candidate SHA and its passing CI run.
- [ ] Compare it with the actual running production SHA.
- [ ] Review migration compatibility and configuration changes.
- [ ] Verify backup freshness and recovery procedure.
- [ ] Confirm available storage, prior images and deployment window.
- [ ] Apply using the reviewed release procedure.
- [ ] Test HTTPS, sign-in, session, affected feature and worker health.
- [ ] Record result and retain the previous release for rollback.

## Daily or when an alert fires

- [ ] Check external reachability and HTTPS certificate health.
- [ ] Inspect instance status and resource alarms.
- [ ] Review failing jobs and provider errors.
- [ ] Confirm backup and alert delivery status.
- [ ] Escalate unexpected account or billing activity.

## Weekly

- [ ] Review AWS spend, plan credit balance, quota and expiration.
- [ ] Review provider errors, usage, rate limits and costs.
- [ ] Review failed GitHub Actions runs and dependency alerts.
- [ ] Check EC2 disk use, Docker image growth and log rotation.
- [ ] Review the status of pending domain and DNS changes.

## Monthly

- [ ] Restore a recent backup in isolation and document the result.
- [ ] Review access to AWS, GitHub, domain, providers and secret stores.
- [ ] Check certificate renewal and DNS ownership.
- [ ] Evaluate operating-system, Docker, image and dependency updates.
- [ ] Verify monitoring coverage and alert delivery with a controlled test.
- [ ] Reassess single-host capacity, recovery objectives and budget.

## Quarterly or after a major architecture change

- [ ] Rehearse loss of the host and restoration to a separate environment.
- [ ] Review data retention, privacy, access and backup encryption.
- [ ] Review security-group ingress and internal service exposure.
- [ ] Review rollback strategy for database migrations.
- [ ] Update this documentation from verified production configuration.

## Review record template

```text
Date and timezone:
Operator:
Current production SHA:
Release branch SHA:
GitHub Actions run:
Site and health check result:
Backup date and restore-drill result:
Disk and resource status:
Billing and credit status:
Provider status:
Open risks and follow-up owner:
Next review date:
```

Avoid copying any secret, session token or customer financial data into this record.

## Known follow-ups at this snapshot

- The DigitalPlat domain had no public A record at the last recorded check.
- The last recorded live release is older than the release branch.
- Python dependency advisories previously remained after partial upgrades; run a current audit and assess each affected dependency.
- Production deployment is single-host and depends on a verified backup and recovery process.
- Automatic deployment is not configured; direct Git pushes run CI and require a separate release to reach AWS.
