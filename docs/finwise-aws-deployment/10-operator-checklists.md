# Operator checklists

These checklists are proposed operating practices. They do not imply that a monitoring system, backup schedule or on-call rotation is already configured.

## Release checklist

- [ ] Record the actual production SHA and the target SHA.
- [ ] Review the target diff, configuration changes and migrations.
- [ ] Confirm the GitHub Actions result for the exact target.
- [ ] Verify the current backup and the data recovery plan.
- [ ] Confirm that prior release images are available.
- [ ] Confirm disk capacity and service health.
- [ ] Run the reviewed release procedure during an appropriate window.
- [ ] Check public HTTPS and protected endpoint behavior.
- [ ] Test login and the features affected by the change.
- [ ] Review worker and provider errors.
- [ ] Record the outcome and retain rollback material.

## Domain checklist

- [ ] Confirm the registered domain and the account that controls it.
- [ ] Confirm authoritative nameservers and DNS provider.
- [ ] Confirm the A record points to the current Elastic IP.
- [ ] Check public DNS from an external network.
- [ ] Confirm public ports 80 and 443 reach the host.
- [ ] Check the Caddy hostname and certificate.
- [ ] Verify CORS, canonical links and OAuth callbacks if applicable.
- [ ] Test the domain from a fresh browser session.

## Backup checklist

- [ ] Identify all databases, volumes, files and secrets needed for recovery.
- [ ] Confirm backup scope and point-in-time expectations.
- [ ] Confirm encryption and authorized access.
- [ ] Verify the archive is nonempty and checksum-protected.
- [ ] Copy it off the host and verify the copy.
- [ ] Record the recovery point and retention date.
- [ ] Restore in isolation and record the result.

## Monthly review

- [ ] Check AWS charges, credit balance and expiration.
- [ ] Review access to AWS, GitHub, DNS and provider accounts.
- [ ] Review dependency and image vulnerabilities.
- [ ] Check container health, disk space and provider quotas.
- [ ] Inspect failed CI runs and unresolved incidents.
- [ ] Test backup restoration and alert delivery.
- [ ] Update this handbook from verified changes.

## Incident handoff

Record the time and timezone, affected users or features, current SHA, request IDs, recent changes, actions already taken, backup status and next owner. Separate confirmed observations from suspected causes. Keep credentials and customer data out of the record.
