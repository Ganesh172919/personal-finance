# Configuration and security

## Configuration locations

| Location | Recorded purpose |
| --- | --- |
| `/opt/finwise/.env` | Compose settings, hostnames, origins and shared secrets |
| `/opt/finwise/server/.env` | Gateway configuration, SMTP and speech credentials |
| `/opt/finwise/server/AI_Core/.env` | AI provider credentials and settings |
| `compose.yaml` | Base services and internal dependencies |
| `deploy/aws/compose.ec2.yaml` | EC2 ingress and service overrides |
| `deploy/aws/compose.release.yaml` | SHA-tagged images for newer releases |
| `deploy/aws/Caddyfile` | Hostname-based HTTPS proxy |

The production environment files are excluded from Git. Keep them readable only by authorized operators and preserve encrypted recovery copies. The repository's `.env.example` files describe examples and defaults, not the current production values.

Compose `environment` entries can override values from `env_file`. Check the relevant service definition and configuration precedence when debugging. Avoid publishing resolved `docker compose config` output because it can contain secrets.

## Important settings

`FINWISE_HOST` selects Caddy's primary hostname. `FINWISE_ALIASES` adds optional hostnames. `CLIENT_URL` is the canonical application URL. `CORS_ORIGINS` controls which browser origins can make allowed cross-origin requests.

`JWT_SECRET` protects authentication tokens. Rotating it can invalidate existing sessions. Plan the change and verify sign-in afterward.

`AI_CORE_INTERNAL_TOKEN` authenticates communication with AI Core. Keep the gateway, worker and AI Core values coordinated during rotation. Internal authentication does not make it appropriate to expose the internal service ports publicly.

`WEBHOOK_CREDENTIALS_KEY` protects saved webhook authorization values. Replacing it without preserving access to old encrypted values or migrating them can make stored credentials unreadable. Rehearse key changes against a restored test copy.

## Providers

The initial deployment recorded Groq with model `openai/gpt-oss-20b`. Provider keys, model availability, quota and charges can change. A mock provider in CI does not verify the real provider.

SMTP was configured and authenticated during initial deployment. Check actual delivery when email-based registration or recovery is important. Gnani credentials were configured for speech; test the feature separately after credential or provider changes.

Google sign-in requires its own OAuth application, credentials and authorized callback for the intended canonical URL. Do not assume it is enabled merely because the code supports it.

## Rotation procedure

1. Identify the affected service, expected user impact and recovery procedure.
2. Verify that authorized operators can recover the previous protected configuration.
3. Test the replacement credential in an isolated environment where possible.
4. Update the protected production configuration through an authorized session.
5. Recreate the affected containers using the Compose files for the actual running release.
6. Test the relevant feature and inspect redacted logs.
7. Revoke the old credential after confirming the new credential works, unless incident response requires immediate revocation.
8. Record the time, operator and outcome without recording the credential.

## Access and logging

Use named AWS and GitHub identities with the minimum permissions required. Session Manager was used for host access. Review instance role permissions, account access and security-group rules periodically.

Application logs can contain personal or operational information. Restrict access, define retention and redact sensitive content before sharing. Never paste environment files, bearer tokens, passwords, verification codes or customer financial data into issues or documentation.

Optional monitoring definitions exist under `deploy/observability`. Their presence in the repository does not establish that monitoring is installed or alerting in the live environment.
