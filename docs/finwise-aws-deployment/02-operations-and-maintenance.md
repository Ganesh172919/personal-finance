# Operations and maintenance

## Important release distinction

A direct push to `codex/aws-deploy` updates GitHub and starts the Tests workflow.
It does not build or restart the live EC2 services. CI success is necessary evidence, not an automatic deployment.
Use the [branch Actions page](https://github.com/Ganesh172919/personal-finance/actions?query=branch%3Acodex%2Faws-deploy) to inspect the exact commit.
The branch was previously observed as unprotected, so a push may land even when subsequent checks fail.
A pull request and branch protection can require review and passing checks before merging.

## Current warning for operators

The last recorded production checkout was a legacy release at `b70ef81`.
The release branch includes a later commit with a candidate `deploy/aws/release-ec2.sh` and SHA-tagged Compose overlay.
That candidate must pass CI and be reviewed before production use. It has not been recorded as deployed to the instance.
The existing local `deploy/aws/PRODUCTION_RUNBOOK.md` describes the candidate procedure, not proof that it has been executed.

## Before a release

1. Record the current production SHA, target full SHA, operator and start time.
2. Confirm the exact target SHA is present on the release branch and that its GitHub Actions run completed successfully.
3. Review database migrations, dependency changes, external integrations and backward compatibility.
4. Verify an encrypted off-host backup exists, its age is acceptable, and restore has been rehearsed.
5. Confirm free disk space, service health, provider quotas and an appropriate change window.
6. Keep the currently running images and prepare a rollback plan appropriate to the running legacy or tagged deployment.
7. Record whether the change needs AWS infrastructure updates; application deployment does not apply CloudFormation changes.

## Connect and inspect

Use AWS Systems Manager Session Manager for the instance in Sydney, then open a privileged shell if necessary.
These read-only commands target the original legacy Compose configuration.

```bash
cd /opt/finwise
sudo -i
cd /opt/finwise
git rev-parse HEAD
git status --short
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml ps
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml logs --since 15m --tail 100 caddy web server worker ai-core mongo redis
df -h /
docker system df
```

Avoid sharing logs containing account, transaction, token or provider data.
If a later release uses an additional Compose overlay, use the files appropriate to that release.

## Release procedure

Use a tested, reviewed release procedure and verify the resulting service health and application behavior.
For the candidate SHA-tagged release implementation, consult `deploy/aws/PRODUCTION_RUNBOOK.md` and `deploy/aws/release-ec2.sh` from the reviewed commit after that commit is published and CI has passed.
That procedure builds before replacement, checks its rollback images, serializes releases, and attempts rollback on failed health checks.
Those safeguards cannot roll back an incompatible database migration or recover deleted data.
Do not run commands for the candidate overlay against the legacy deployment until the candidate and its prerequisites have been verified.

## External verification

```bash
base=https://finwise.3-106-147-122.sslip.io
for path in /login /register /healthz /api/python-health; do
  curl -sS -o /dev/null -w "%{http_code} $path\n" "$base$path"
done
```

Expected 200 responses should be checked against the current release and service behavior.
Use a designated test account to check registration or sign-in, session recovery, a disposable transaction, and an AI response.
Check receipt upload and voice separately when those features are relevant and provisioned.
Test a clean browser session and verify that anonymous access to protected profile data is rejected.

## Backups and recovery

MongoDB data, Redis persistence, Caddy state and other local volumes reside on the host disk.
A MongoDB logical dump covers MongoDB only; it does not back up all Docker volumes or environment files.
Use encrypted off-host copies, restricted access, retention rules and periodic isolated restore tests.
For a consistent root EBS snapshot, plan an outage and stop writes before the snapshot, following AWS guidance.
Track the backup time, encryption, account, region, restore owner, restore result and recovery time.
Restoring production data can discard newer writes; perform a recovery assessment before any destructive restore.
A restored environment must be isolated until it has been checked and is intentionally connected to the production address.

## Routine checks

### Daily or on alert

- Check the public login and health routes and any configured external monitoring.
- Review instance and container health, failed jobs, provider errors and available disk space.
- Verify that the latest scheduled backup completed and that monitoring delivered its alert.

### Weekly

- Review AWS costs, credit balance and forecasts.
- Review security advisories for Node, Python, operating system, images and dependencies.
- Review failed GitHub Actions runs and changes in authentication, DNS and certificates.
- Check provider quotas, worker retry patterns and abnormal resource usage.

### Monthly and after major changes

- Restore a backup in an isolated environment and record the outcome.
- Review access, rotate credentials according to policy, and remove obsolete access.
- Test host recovery and validate the DNS and TLS renewal path.
- Plan and test system patches, container base-image changes and necessary reboots.

## Troubleshooting

### Site unavailable

Check DNS, EC2 instance status, security-group ports 80/443 and Caddy logs.
Check Compose service health and host disk space. Identify whether the fault is at TLS, nginx, the gateway or a dependency.

### Sign-in fails

Check API responses, request IDs, cookie and CSRF settings, configured origins, SMTP delivery and application logs.
Never expose passwords, verification codes or session cookies in incident reports.

### AI requests fail

Check AI Core readiness, gateway-to-AI connectivity, provider configuration, quota and credentials.
Inspect logs with sensitive user content redacted. Test with a non-sensitive request.

### Background tasks stall

Inspect worker health and logs, MongoDB primary state, Redis and job errors.
The worker has no public HTTP listener, so an HTTP port probe is not a suitable worker health check.

### HTTPS fails on the custom hostname

Verify the public A record, domain delegation, inbound ports and Caddy certificate logs.
The DigitalPlat hostname was not resolving to the instance at the last recorded check.

## Secret rotation

JWT secret replacement may invalidate existing sessions. Plan and communicate the impact.
Rotate the shared internal token consistently across the gateway, worker and AI Core.
Preserve the ability to decrypt existing webhook credentials when rotating the encryption key.
Verify each provider-backed feature after credential rotation without logging secret values.
