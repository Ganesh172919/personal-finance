# Deployment history

This is a historical record from the prior deployment work. Verify current host and GitHub state before acting.

## Initial EC2 release

The application was deployed on an Amazon Linux 2023 EC2 host in Sydney using Docker Compose. Caddy terminates HTTPS, nginx serves the frontend, Express handles API requests, Python AI Core handles AI work, and MongoDB and Redis provide persistent services. The database started fresh; earlier local data was not migrated.

The recorded running checkout after initial deployment was `b70ef81024b57f328477a2420e8dff4117f553fa`. The publicly reachable hostname was `finwise.3-106-147-122.sslip.io`.

## Notable release-branch changes

| Commit | Recorded change |
| --- | --- |
| `880a192` | Added EC2 infrastructure, Compose and Caddy configuration, and selected project changes. |
| `68acb68` | Selected the recorded Free Tier eligible instance type. |
| `88e07bf` | Added Buildx installation for image builds. |
| `a4a5b7d` | Added a worker health check using a MongoDB ping. |
| `37cf716` | Fixed numeric trust-proxy configuration and added regression coverage. |
| `b70ef81` | Added support for an additional Caddy hostname. |
| `c6bca49` | Added release-branch CI checks. |
| `600d509` | Updated load-test session handling and selected Python dependencies. |
| `73a4111` | Added release/rollback tooling and a candidate Linux OCR fix. |

The authoritative history is the Git log. These short notes do not describe every application change included in a commit.

## Verification recorded during deployment

The initial deployment loaded frontend and registration routes over HTTPS and served a JavaScript bundle. Anonymous access to a protected profile endpoint was rejected. MongoDB and Redis connectivity, an AI reply, SMTP authentication and worker health were checked at that time.

The deployment work recorded 562 passing frontend tests, 500 passing AI Core tests, server type checking and targeted server configuration tests. Later CI runs added broader integration, release and smoke checks. These historical results do not establish the state of a later commit or guarantee current provider access.

## Domain status

The requested `personalfinanceagent.dpdns.org` alias was configured in the recorded ingress and origin settings. It did not have a public A record at the last recorded DNS check on 23 November 2026. The working `sslip.io` URL remains the recorded public address until DNS and certificate issuance are verified for the alias.

## Status updates

When a new release is applied, append the full SHA, timestamp and timezone, operator, CI run, feature checks and any rollback or unresolved issue. Do not include credentials or customer data.
