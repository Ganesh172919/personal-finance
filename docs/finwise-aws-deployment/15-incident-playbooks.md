# Incident playbooks

These playbooks help an authorized operator investigate the recorded EC2 deployment.
They do not replace a current backup, an incident owner or knowledge of the actual production configuration.
Do not paste secrets, access tokens, passwords, one-time codes or customer financial information into incident notes.

## Start an incident

1. Record the detection time and timezone.
2. Identify the affected URL and features.
3. Determine whether all users or a subset are affected.
4. Record the last known working time.
5. Record the current production SHA if the host is available.
6. Identify recent code, DNS, infrastructure and credential changes.
7. Assign one operator to coordinate the response.
8. Preserve relevant logs and request IDs with sensitive details redacted.
9. Avoid unrelated deployments while diagnosing the incident.
10. Record each action and its observed effect.

## Public website unavailable

### Observe

Check whether the hostname resolves.
Check whether a connection can be established.
Distinguish a timeout from a TLS error and an HTTP error.
Check whether the existing `sslip.io` hostname and any alias behave differently.

### Investigate

1. Confirm the DNS A record and current Elastic IP.
2. Check EC2 instance status in the correct AWS region.
3. Check the Elastic IP association.
4. Check the security group for ports 80 and 443.
5. Connect through Session Manager if the instance is reachable.
6. Inspect Caddy, web and server container status.
7. Inspect host disk space and recent logs.
8. Check for recent infrastructure or deployment changes.

### Verify recovery

Load the public login and registration pages over trusted HTTPS.
Check the health route and a designated account's sign-in.
Record the recovery time and remaining symptoms.

## HTTPS certificate fails

### Observe

Record the hostname and browser error category.
Do not disable certificate verification as a substitute for fixing the issue.

### Investigate

1. Confirm the hostname resolves to the intended Elastic IP.
2. Confirm there is no unintended IPv6 destination.
3. Confirm ports 80 and 443 are reachable.
4. Check the Caddy container and certificate logs.
5. Check the configured primary hostname and aliases.
6. Review recent DNS and Caddy changes.
7. Check certificate authority validation errors.

### Verify recovery

Use a normal certificate-verifying HTTPS client.
Check both the working hostname and any configured alias.
Verify the certificate hostname and application response.

## Login or registration fails

### Observe

Record the route, approximate time and redacted request ID.
Determine whether the issue affects all accounts or one test account.
Determine whether the failure occurs before or after email delivery.

### Investigate

1. Check the server container and API response status.
2. Check MongoDB and Redis health.
3. Check the browser origin and configured CORS origins.
4. Check cookie and CSRF behavior.
5. Check the canonical application URL.
6. Check SMTP provider status and delivery for email-dependent flows.
7. Review recent secret rotation or configuration changes.

### Verify recovery

Use a designated test account.
Verify sign-in, session recovery and sign-out as appropriate.
Do not record a password, recovery link, cookie or one-time code.

## AI requests fail

### Observe

Record the request ID, time and whether the failure affects every AI request.
Use a non-sensitive test prompt.

### Investigate

1. Check AI Core readiness and gateway connectivity.
2. Check MongoDB and Redis health.
3. Check provider status and configured model availability.
4. Check provider quota and account billing.
5. Check whether the internal service token was rotated consistently.
6. Compare the running release with recent dependency changes.
7. Review redacted AI Core and gateway logs.

### Verify recovery

Run a designated non-sensitive AI workflow.
Confirm the gateway response and relevant application behavior.
Do not assume a CI mock response verifies the real provider.

## Receipt OCR fails

### Observe

Determine whether the upload is rejected or processing fails after upload.
Record file type and approximate size without collecting the user's receipt.

### Investigate

1. Check configured upload size and MIME restrictions.
2. Check AI Core health and logs.
3. Check the OCR dependency import in the tested runtime image.
4. Compare the running image with the intended release.
5. Check disk and memory pressure.
6. Use an authorized, non-sensitive test image.

### Verify recovery

Upload a designated test image and confirm the expected result.
An OCR import smoke check does not guarantee correct extraction for every image.

## Background jobs stall

### Observe

Record the affected job type and the age of delayed work.
Determine whether jobs fail, retry or are not being claimed.

### Investigate

1. Check the worker container and logs.
2. Check MongoDB primary and Redis health.
3. Check the gateway and AI Core when the job depends on them.
4. Check provider rate limits and quotas.
5. Review recent task configuration changes.
6. Check resource pressure and disk availability.

### Verify recovery

Run a designated test job and confirm completion.
Inspect retry and backlog behavior.
The worker health check pings MongoDB; it does not prove job completion.

## Disk space is low

### Observe

Record filesystem usage, image usage and the time of the alert.
Identify whether growth comes from logs, images, caches, backups or data volumes.

### Investigate

1. Run `df -h /`.
2. Run `docker system df`.
3. Check configured log rotation.
4. Review backup retention and temporary files.
5. Identify current and previous release images.
6. Identify persistent volumes and their owners.

### Recover carefully

Protect MongoDB, Redis and Caddy volumes.
Protect the current and rollback images.
Remove only reviewed, unused material according to retention policy.
Verify service health and free space afterward.

## Close the incident

1. Confirm the affected workflow is working.
2. Record the actual recovery time.
3. Record confirmed cause and remaining uncertainties separately.
4. Record any data impact and backup recovery point.
5. Revoke temporary access if it was granted.
6. Assign follow-up actions with owners.
7. Update the deployment documentation after facts are verified.
