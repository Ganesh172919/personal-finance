# Security operations guide

This guide describes operational practices for the recorded deployment.
It does not certify that the application is free of vulnerabilities or that every control is configured.
Use the current source, AWS configuration and provider settings when assessing security.

## Account inventory

Identify the AWS account that owns the instance and storage.
Identify the GitHub repository owners and contributors with write access.
Identify the DigitalPlat account that owns the requested hostname.
Identify the DNS provider that controls the authoritative records.
Identify model, email and speech provider accounts.
Identify the authorized backup and recovery destination.
Record ownership and recovery contacts in an appropriate private system.
Do not place passwords or recovery codes in this repository.

## AWS access

Use named identities for operators where practical.
Grant only the permissions needed for each role.
Review who can start Session Manager sessions.
Review who can modify the security group, IAM role, stack and Elastic IP.
Review who can create, copy and restore snapshots.
Review access to encryption keys used for recovery.
Remove access that is no longer required.
Test that a designated recovery operator can use the approved process.

## GitHub access

Review repository owners and collaborators.
Review who can push to `codex/aws-deploy`.
Review branch protection and required checks.
Review workflow permissions and any repository secrets.
Review changes to deployment scripts and workflow definitions carefully.
Avoid storing production environment files in the repository.
Investigate unexpected pushes or changes to Actions settings.

## Network exposure

The recorded public entry points are TCP ports 80 and 443.
The public path runs through Caddy and nginx.
MongoDB, Redis and AI Core should remain on internal container networks.
Review security groups and routes after infrastructure changes.
Review the trusted-proxy setting when the ingress chain changes.
Avoid opening an internal service to the internet for ad hoc debugging.

## Secret inventory

The root environment file includes shared secrets and service settings.
The server environment file can include email and speech credentials.
The AI Core environment file can include provider credentials.
Backups may also contain encrypted or sensitive data.
Record where secrets are managed and who can rotate them.
Do not record their values in a Markdown file.

## JWT secret rotation

1. Identify the deployed application and token behavior.
2. Determine the expected effect on active sessions.
3. Plan the rotation and user impact.
4. Preserve authorized recovery material according to policy.
5. Update the protected configuration.
6. Recreate affected services using the correct Compose configuration.
7. Verify sign-in and session behavior with a test account.
8. Record the rotation event without the secret.

## Internal token rotation

1. Identify every service using `AI_CORE_INTERNAL_TOKEN`.
2. Prepare the new secret through an authorized channel.
3. Coordinate the gateway, worker and AI Core configuration.
4. Apply the change using a reviewed service procedure.
5. Check service readiness.
6. Run a non-sensitive AI request.
7. Check background work that calls AI Core if applicable.
8. Record the outcome without exposing either token.

## Webhook encryption key

The configured key protects saved webhook authorization values.
Existing encrypted values may depend on the current key.
Review the application migration path before replacing it.
Preserve authorized access to old key material until migration or re-entry is complete.
Test the procedure against an isolated restored copy.
Verify a designated test webhook without publishing credentials.

## Provider credential rotation

1. Identify the provider account and feature.
2. Check whether a new credential can be tested before the old one is revoked.
3. Update the protected service configuration.
4. Recreate the affected service according to the running release.
5. Test the feature with designated non-sensitive data.
6. Inspect redacted provider and service errors.
7. Revoke the old credential when appropriate.
8. Record the time, operator and result.

For an exposed credential, immediate revocation may take precedence over a smooth transition.
Investigate logs and provider activity according to the incident process.

## Dependencies and images

Review JavaScript runtime dependency audits for the relevant lockfiles.
Review Python dependency advisories for the installed environment.
Review operating-system and container base-image updates.
Assess whether a finding affects the deployed version and reachable behavior.
Test upgrades in isolation before releasing them.
Run the relevant suites and the full release-branch CI workflow.
Re-run the audit after a change.
Record unresolved findings and an owner.

Earlier Python audits found remaining advisories after partial updates.
That is a historical observation, not a current vulnerability count.
A passing test suite does not prove the absence of security issues.

## Backup protection

Treat database dumps and restored copies as sensitive.
Encrypt backups and restrict retrieval and restore permissions.
Separate backup access from ordinary application access where appropriate.
Verify checksum, retention and recovery-key availability.
Test restoration in an isolated environment.
Dispose of temporary restored copies according to the data policy.

## Logs and incident evidence

Collect the minimum information needed to investigate.
Use request IDs and timestamps to correlate services.
Redact tokens, cookies, passwords and personal financial data.
Restrict access to logs and define retention.
Preserve evidence before destructive repair when data corruption is suspected.
Record who performed the action and when.

## Monitoring and alerts

The repository contains optional observability definitions.
Their presence does not prove that monitoring or alert delivery is enabled.
Decide which health, security and billing events need alerts.
Route alerts to an owner and test delivery.
Protect metrics endpoints and monitoring credentials.
Review retention and costs before enabling additional collection.

## Security review checklist

- [ ] Confirm authorized account owners and recovery contacts.
- [ ] Review AWS and GitHub permissions.
- [ ] Review public ingress and internal service exposure.
- [ ] Review domain ownership and DNS provider access.
- [ ] Review secret locations and rotation dates.
- [ ] Review dependency and image advisories.
- [ ] Verify a recent isolated backup restore.
- [ ] Test alert delivery and incident response contacts.
- [ ] Record unresolved findings and follow-up owners.
