# FinWise deployment and maintenance summary

**Snapshot:** 23 November 2026. The infrastructure and release details below are recorded observations. Verify the current AWS account, host, GitHub commit and provider settings before making changes.

## Website and source

- **Website:** [https://finwise.3-106-147-122.sslip.io/](https://finwise.3-106-147-122.sslip.io/). The `/login` page returned HTTP 200 when checked on 23 November 2026.
- **Repository:** [Ganesh172919/personal-finance](https://github.com/Ganesh172919/personal-finance).
- **Release branch:** [`codex/aws-deploy`](https://github.com/Ganesh172919/personal-finance/tree/codex/aws-deploy).
- **Last recorded production checkout:** `b70ef81024b57f328477a2420e8dff4117f553fa`. Confirm the live value with `git rev-parse HEAD` on the instance before releasing.
- **Requested additional domain:** `personalfinanceagent.dpdns.org`. No public A record was returned by the DNS check on 23 November 2026, so it is not yet a verified public website address.

The original production deployment started with a fresh database. Existing development data was not migrated.

## What a GitHub push does

Pushing to `codex/aws-deploy` updates the GitHub branch and starts the **Tests** workflow. It does **not** automatically pull the code, rebuild containers or deploy changes on EC2. The website continues using its last applied release until an operator performs the release procedure. A documentation-only change normally does not require restarting the application.

Pushing to `main` or a different branch does not update the release branch until those changes are incorporated into it. Check the [branch's Actions runs](https://github.com/Ganesh172919/personal-finance/actions?query=branch%3Acodex%2Faws-deploy) for the exact commit you plan to deploy. A successful CI run is evidence for that commit; it is not a production deployment.

## AWS infrastructure

| Item | Last recorded configuration |
| --- | --- |
| Region | Asia Pacific (Sydney), `ap-southeast-2` |
| CloudFormation stack | `finwise-ec2` |
| EC2 instance | `i-06ee1a58a13fdff40` |
| Instance type and OS | `m7i-flex.large`, Amazon Linux 2023 |
| Public IP | `3.106.147.122`, associated Elastic IP |
| Storage | 40 GiB encrypted gp3 root EBS volume, configured for retention after instance termination |
| Host access | AWS Systems Manager Session Manager |
| Checkout | `/opt/finwise` |
| Docker Compose project | `finwise` |
| Public ports | 80 and 443 |

The EC2 CloudFormation template is `deploy/aws/ec2.yaml`. Infrastructure updates require a separate CloudFormation change-set review and application. A container release does not update the stack. Resource identifiers, billing and storage settings can change; check AWS before relying on this snapshot.

## How the application is connected

```text
Browser -> DNS -> Elastic IP -> Caddy HTTPS -> nginx / React -> Express API
                                                               |-> AI Core
                                                               |-> MongoDB
                                                               |-> Redis
                                                               `-> background worker
```

Caddy handles HTTPS and forwards requests to the web container. nginx serves the frontend and proxies API requests to Express. AI Core runs the Python AI service. MongoDB and Redis are internal services with persistent Docker volumes. The worker handles background jobs and does not expose a public HTTP listener. Express is configured to trust two proxy hops in the EC2 overlay, corresponding to Caddy and nginx.

MongoDB is a single-member replica set named `rs0`. The one EC2 host and one MongoDB primary are single points of failure; this is not a high-availability setup. The repository also contains ECS and Kubernetes definitions, but the recorded live deployment is the EC2 Compose stack.

## Activate the requested domain

The domain certificate identifies `personalfinanceagent.dpdns.org`; it does not create DNS records or make the application reachable. The recorded Caddy configuration already included the hostname as an alias and the API configuration included its HTTPS origin. The DNS record still needs to be configured.

1. Sign in to the DigitalPlat account that owns the registration.
2. Delegate the domain to an authoritative DNS provider as required by the registrar and provider.
3. Create an apex A record for `personalfinanceagent.dpdns.org` pointing to the current Elastic IP, last recorded as `3.106.147.122`.
4. Confirm public DNS resolution and inbound access on ports 80 and 443.
5. Check Caddy logs and confirm that it obtains a trusted certificate.
6. Open the alias over HTTPS and test sign-in and browser API requests.
7. If changing the canonical address, review `CLIENT_URL`, `CORS_ORIGINS`, email links and any Google OAuth callback registration.

See [DigitalPlat's nameserver instructions](https://github.com/DigitalPlatDev/FreeDomain/blob/main/documents/tutorial/platform/1.3-connect-nameservers.md). Keep using the working `sslip.io` address until the new hostname is verified.

## Configuration and secrets

The recorded production configuration is kept in protected, Git-ignored files on the instance:

| File | Purpose |
| --- | --- |
| `/opt/finwise/.env` | Hostnames, origins, Compose settings and shared secrets |
| `/opt/finwise/server/.env` | Gateway, email and speech-provider configuration |
| `/opt/finwise/server/AI_Core/.env` | AI provider configuration and credentials |

Do not commit these files or publish resolved environment variables, passwords, tokens, database dumps or customer data. Keep encrypted recovery copies with restricted access. Repository `.env.example` files are examples and are not the live configuration.

The initial deployment used Groq with model `openai/gpt-oss-20b`; SMTP and Gnani credentials were also configured. Provider availability, credentials, quotas and charges can change. Google sign-in requires separate OAuth registration and the correct callback URL.

Rotating `JWT_SECRET` can invalidate sessions. Coordinate `AI_CORE_INTERNAL_TOKEN` across services. Preserve the ability to decrypt existing webhook credentials when changing `WEBHOOK_CREDENTIALS_KEY`. Test affected features after credential changes.

## Releasing a reviewed commit

1. Record the full current production SHA and target SHA.
2. Review the code and configuration diff, especially database migrations and backward compatibility.
3. Verify that GitHub Actions passed for the exact target SHA on `codex/aws-deploy`.
4. Confirm a recent recoverable backup, sufficient disk space and retained previous release images.
5. Connect to the EC2 instance using Session Manager and follow the reviewed release procedure below.
6. Verify service health, public routes, sign-in and the features affected by the change. Record the result.

The release script exists in newer branch commits and was tested in CI. Confirm the selected target commit contains it and that the previous production images are available before proceeding. The script verifies branch ancestry and the checkout, builds or reuses SHA-tagged images, checks OCR imports, applies the release, probes key endpoints and attempts an application rollback if an apply or probe fails.

From a privileged shell on the instance, after setting the **reviewed full SHA**:

```bash
cd /opt/finwise
release_sha=FULL_REVIEWED_COMMIT_SHA
base=https://finwise.3-106-147-122.sslip.io
previous_sha=$(git rev-parse HEAD)
printf 'Previous %s\nTarget %s\n' "$previous_sha" "$release_sha"
git fetch origin refs/heads/codex/aws-deploy
release_script=$(mktemp /tmp/finwise-release.XXXXXX)
git show "$release_sha:deploy/aws/release-ec2.sh" > "$release_script" &&
  bash "$release_script" deploy "$release_sha" "$base"
```

Review the script and the full [production runbook](deploy/aws/PRODUCTION_RUNBOOK.md) before using it. Keep the previous SHA and local images until acceptance. A code rollback keeps the current database state; it does not undo an incompatible migration or restore deleted data.

## Testing and verification

The [Tests run for commit `41798f7`](https://github.com/Ganesh172919/personal-finance/actions/runs/45132649356) passed client, server and AI tests, lint, Docker builds, release/rollback fixtures, and the EC2 HTTPS and k6 smoke job. A previous run failed an OCR import check; a later runtime change passed the subsequent CI run. A newer documentation-branch run was in progress at this snapshot. Check the current Actions page for its final outcome.

For local verification, with isolated test data and dependencies installed:

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server run test:ci
npm --prefix server run build
(cd server/AI_Core && python -m pytest tests/ -m 'not latency')
(cd server/AI_Core && python -m evals.runner -m 'not latency')
bash scripts/test-release-ec2.sh
```

The CI environment uses test credentials and a mock AI provider. A passing run does not confirm real provider access, email delivery, every receipt, or backup recovery. After a production release, test HTTPS, sign-in, session recovery, a disposable transaction, an AI reply and any features touched by the change.

## Backups and recovery

MongoDB application data and AI state, Redis persistence, Caddy state, host files and protected environment files have different recovery needs. A MongoDB logical dump does not cover all Docker volumes or host configuration. Keep encrypted backups off the host, restrict access, define retention and regularly restore into an isolated environment.

The [production runbook](deploy/aws/PRODUCTION_RUNBOOK.md#back-up-and-restore) documents a MongoDB archive and checksum procedure, an isolated restore, EBS snapshots and host recovery. Verify backup completion and checksum, and test a restore before relying on it. A backup command in a document does not prove an automated backup schedule exists.

Restoring a database can discard writes made after the backup. During a restore drill, isolate the environment and prevent production emails, scheduled jobs and webhooks from running. Test data access, a test sign-in and a representative workflow.

## Routine maintenance and troubleshooting

- **After each release:** verify the actual running SHA, public HTTPS, login, affected features, containers and worker errors. Keep the prior images for the rollback period.
- **Regularly:** review EC2 health, disk usage, failed jobs, backup age, provider quotas, AWS costs, credits and GitHub Actions failures.
- **Periodically:** restore a backup in isolation, review AWS and provider access, test alerts, review security advisories and plan OS and image updates.
- **Site unavailable:** check DNS, the Elastic IP, EC2 status, ports 80 and 443, Caddy, nginx and host disk space.
- **Login fails:** check API errors and request IDs, CORS, cookies, CSRF and email delivery; do not share passwords or session cookies.
- **AI or OCR fails:** check AI Core readiness, internal connectivity, provider quota, credentials, model availability and redacted logs.
- **Jobs stall:** inspect worker logs, MongoDB, Redis and provider limits. A worker database ping does not prove every job completes.

The recorded setup uses a single host. Decide recovery-time and data-loss objectives suitable for the users and rehearse host replacement. Earlier Python audits identified remaining dependency advisories after partial upgrades; run a current audit and assess compatible updates.

## Cost and access

The `sslip.io` hostname is free to use, but AWS compute, storage, public IPv4, snapshots, traffic and external providers may incur charges. AWS Free plan credits and expiry are account-specific. Check AWS Billing and budgets directly.

Use named, authorized identities and least-privilege access for AWS, GitHub, DNS and providers. Session Manager was the recorded host access method. Do not expose MongoDB, Redis or AI Core publicly for routine troubleshooting.

## Change record

The release branch contains EC2 configuration, worker and proxy fixes, CI checks, selected dependency updates, and release/rollback tooling. The manually written deployment guides are under `docs/finwise-aws-deployment/`. Update this summary after a verified infrastructure or production release, recording the date, SHA, checks and outstanding issues without including secrets.
