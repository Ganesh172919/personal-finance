# Configuration, secrets and integration maintenance

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

## Where configuration lives

| Location | Purpose | Handling |
| --- | --- | --- |
| `/opt/finwise/.env` | Compose interpolation, hostnames, origins, shared secrets | Private and excluded from Git |
| `/opt/finwise/server/.env` | Server settings, email and speech integration | Private and excluded from Git |
| `/opt/finwise/server/AI_Core/.env` | AI provider settings and credentials | Private and excluded from Git |
| `compose.yaml` | Base service definitions | Version controlled |
| `deploy/aws/compose.ec2.yaml` | EC2 ingress and overrides | Version controlled |
| `deploy/aws/compose.release.yaml` | Candidate release image tags | Version controlled in newer release branch |
| `deploy/aws/Caddyfile` | Hostname-driven reverse proxy | Version controlled |

Environment files in the repository ending in `.example` document example values, not a record of the live values.
Compose service `environment` entries can override values from an `env_file`; inspect the actual service definition when diagnosing precedence.
Do not print resolved Compose configuration, environment variables, tokens, passwords, or credentials to public logs.

## Core settings

### Public origins

`FINWISE_HOST` controls the primary Caddy host. `FINWISE_ALIASES` contains optional additional hostnames.
`CLIENT_URL` supplies the canonical application origin for links and related flows.
`CORS_ORIGINS` lists allowed browser origins and must match the intended schemes and hostnames.
A DNS change, Caddy alias and CORS update must be coordinated. Test both primary and alias origins after any change.

### JWT and sessions

`JWT_SECRET` signs authentication tokens. Protect it, back it up securely and keep it stable across replicas.
Changing it can invalidate existing sessions. Plan session disruption and test authentication after rotation.
Use randomly generated secret material appropriate to the application and keep it out of shell history and issue comments.

### Service authentication

`AI_CORE_INTERNAL_TOKEN` is shared between the gateway, worker and AI Core.
Coordinate rotation across all services and confirm that an AI request succeeds afterward.
Internal services should remain isolated on the Compose network even when authentication is configured.

### Saved webhook credentials

`WEBHOOK_CREDENTIALS_KEY` protects stored webhook authorization values.
Changing the key without a migration or access to the old key can make saved credentials unreadable.
Rehearse any key rotation using a restored test copy before applying it to production data.

### AI model provider

The recorded deployment used Groq and `openai/gpt-oss-20b`.
Check that the selected provider, model, key, quota and billing account still permit the feature.
Provider availability or quota can change independently of the container's health check.
Do not interpret a mock-provider CI result as confirmation that the production provider works.

### Email and voice

SMTP is needed for email-dependent sign-in or recovery workflows. Verify delivery using a designated test account.
Gnani credentials enable configured speech features. Check provider-side access and test the relevant speech workflow after rotation.
The deployment record reported successful SMTP authentication at the initial deployment; that is historical evidence only.

## Change and rotation procedure

1. Record the affected service, setting, reason and expected user impact without recording secret values.
2. Confirm a recoverable protected copy of the previous configuration and an authorized operator.
3. Test the proposed change in an isolated environment with non-production credentials.
4. Change the protected host configuration through an authorized session.
5. Recreate the affected services using the Compose files for the running release.
6. Inspect service status and run the appropriate external and application-level checks.
7. Record the result and retain recovery material according to your retention policy.
8. Revoke an old external provider credential only after the new configuration has been verified.

Use separate permissions and storage for production secrets, backups and development credentials.
If a secret is exposed, revoke or rotate it at the issuer, investigate access, and preserve an incident record.

## Observability configuration

Prometheus and Grafana definitions under `deploy/observability` describe optional components.
Their presence in the repository does not establish that they are deployed or collecting metrics in the live stack.
The API metrics endpoint is protected and blocked at the public nginx edge by the supplied configuration.
Review tokens, network access, retention and data sensitivity before enabling a monitoring stack.
