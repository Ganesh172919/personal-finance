# FinWise AWS deployment record

Last verified on November 21, 2026.

**Live website** [finwise.3-106-147-122.sslip.io](https://finwise.3-106-147-122.sslip.io/)

**Release source** [`codex/aws-deploy` on GitHub](https://github.com/Ganesh172919/personal-finance/tree/codex/aws-deploy)

**Running release** `b70ef81024b57f328477a2420e8dff4117f553fa`

## Do GitHub changes go live automatically?

**No.** A push updates GitHub. The EC2 instance serves the Docker images from its last successful deployment. Its current source checkout is at `/opt/finwise`. No GitHub Actions workflow, webhook, or polling task deploys changes to it.

| What you change | What happens |
| --- | --- |
| Push to `main` or a feature branch | GitHub updates that branch. Bring the changes into `codex/aws-deploy`, then deploy the resulting commit. |
| Push to `codex/aws-deploy` | GitHub updates the release branch. Run the EC2 release commands below to publish it. |
| Edit a Markdown file | GitHub shows the new document after the push. Documentation-only changes need no application deploy. |
| Update DNS | The hostname changes where it points once the DNS record propagates. DNS has its own workflow. |
| Edit the EC2 CloudFormation template | Review and apply a CloudFormation change set separately. The application release commands update the containers. |

The repository’s GitHub Actions workflows run checks and load tests on their configured branches. They do not control the EC2 release. Automatic deployment would require a separate workflow with AWS permissions.

## What was deployed

| Item | Value |
| --- | --- |
| AWS Region | Asia Pacific (Sydney), `ap-southeast-2` |
| CloudFormation stack | `finwise-ec2` |
| EC2 host | Amazon Linux 2023 on a Free Tier–eligible `m7i-flex.large` |
| Storage | Encrypted 40 GiB `gp3` root EBS volume, retained on instance termination |
| Public IPv4 | `3.106.147.122` (Elastic IP) |
| Host access | AWS Systems Manager Session Manager |
| Public ingress | HTTP and HTTPS on ports 80 and 443. Caddy redirects HTTP to HTTPS and renews its public certificates. |
| Docker Compose project | `finwise`, using `compose.yaml` and `deploy/aws/compose.ec2.yaml` |
| Services | `caddy`, `web` (nginx and React), `server` (Express), `worker`, `ai-core` (Python), `mongo`, `redis` |

Caddy forwards requests to nginx. nginx serves the React app and forwards `/api/` to Express. The gateway talks to AI Core, MongoDB and Redis over the container network. The background worker polls MongoDB for jobs. MongoDB, Redis and Caddy store data in Docker volumes on the EC2 disk. The deployment started with a fresh MongoDB database.

Host provisioning is documented in [FinWise on EC2](EC2.md). The existing [ECS Fargate guide](README.md) covers a separate deployment path.

## Changes made for the release

| Commit | Changes |
| --- | --- |
| `880a192` | Added the EC2 CloudFormation template, Caddy configuration, Compose overlay and EC2 guide. Included the project source and selected application changes already in the workspace. |
| `68acb68` | Selected the Free Tier–eligible `m7i-flex.large` and applied CPU credit settings only to the burstable instance types. |
| `88e07bf` | Installed a checksum-verified Docker Buildx plugin in the EC2 bootstrap. The first build stopped because Compose required Buildx. Installed the plugin on the running instance and rebuilt successfully. |
| `bdd297c`, `a4a5b7d` | Replaced the worker’s inherited API-port probe with a MongoDB ping. The worker has no HTTP listener. Verified that the worker reached healthy status. |
| `37cf716` | Fixed numeric `TRUST_PROXY` values so Express trusts the specified number of proxies. The EC2 overlay sets two hops for Caddy and nginx. Added regression tests for numeric and Boolean settings. |
| `b70ef81` | Added support for an optional Caddy hostname alias. Configured `personalfinanceagent.dpdns.org` on EC2 and added its HTTPS origin to the API allowlist. |

The release also carried the four existing local commits `8e7c6cf`, `1dc2c8a`, `eaaf283` and `282b7e1`, plus selected in-progress work. Those changes covered chat routing, research and document generation, voice and dictation, browser session recovery, Markdown rendering, finance calculations, API logging, and tests. GitHub’s `main` was separate from the release branch. [Compare the application release with main](https://github.com/Ganesh172919/personal-finance/compare/main...b70ef81)

## Host configuration and credentials

- `/opt/finwise/.env` holds the public hostname, its alias and allowed origins, service settings, and server-generated secrets.
- `/opt/finwise/server/.env` holds gateway settings and the configured Gmail SMTP and Gnani credentials.
- `/opt/finwise/server/AI_Core/.env` holds the Groq credential. The release used Groq with `openai/gpt-oss-20b`.
- The production environment files are protected on EC2 and excluded from Git. Provider values were transferred encrypted. Keep credentials on the host or in an authorized secret store.
- The live sign-in screen offers email and password. Google OAuth requires its own registration for the final callback URL.

## Custom hostname and hosting cost

The AWS ingress is ready for `personalfinanceagent.dpdns.org`. The latest authoritative DNS check found no public IPv4 record, so use the working `sslip.io` address for now. The remaining step is signing in to the domain owner’s DigitalPlat account, delegating the domain to an authoritative DNS provider, and creating an apex `A` record (`@`) with value `3.106.147.122`. Caddy can issue the certificate once the DNS record points at the instance. The existing address stays available while the alias is activated. [DigitalPlat nameserver instructions](https://github.com/DigitalPlatDev/FreeDomain/blob/main/documents/tutorial/platform/1.3-connect-nameservers.md)

The current hostname is free. EC2, EBS and the Elastic IP use metered AWS resources covered by eligible Free plan credits. The AWS console shows the remaining credits and plan expiration. [AWS Free Tier terms](https://aws.amazon.com/free/free-tier-faqs/)

## Publish a new GitHub release

1. Finish testing the changes and put the intended commit on GitHub’s `codex/aws-deploy` branch. Changes on `main` need to be brought into that branch first.
2. Open the `finwise-ec2` instance in the AWS console and connect through Session Manager. Run `sudo -i` to access the checkout and Docker.
3. From the instance, record the current commit, fetch the release branch, and deploy the commit you reviewed.

```bash
cd /opt/finwise
git status --short
git diff --quiet && git diff --cached --quiet || {
  echo "Review the local tracked changes before deploying."
  exit 1
}
git rev-parse HEAD
git fetch origin refs/heads/codex/aws-deploy
git log -1 --oneline FETCH_HEAD
```

Copy the first SHA above as your rollback point. Use the full SHA of the release commit you reviewed in the next commands.

```bash
release_sha=YOUR_REVIEWED_COMMIT_SHA
git switch --detach "$release_sha"
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml config --quiet
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml \
  up -d --build --wait --wait-timeout 360
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml ps
git rev-parse HEAD
```

4. Verify the public site and its API after Docker reports the services ready.

```bash
base=https://finwise.3-106-147-122.sslip.io
for path in /login /register /healthz /api/python-health; do
  curl -fsS --max-time 15 -o /dev/null -w "$path %{http_code}\n" "$base$path" || break
done
```

Each endpoint should return HTTP 200. For a feature release, also test the changed flow with a dedicated test account. This single-instance deployment can briefly interrupt requests when a container is replaced.

### Roll back an application release

Switch to the previous SHA you recorded and rerun Compose. Verify the same endpoints.

```bash
cd /opt/finwise
previous_sha=YOUR_PREVIOUS_COMMIT_SHA
git switch --detach "$previous_sha"
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml \
  up -d --build --wait --wait-timeout 360
```

Compose retains the data volumes during these application updates. A code rollback leaves the current database state in place, so check migration compatibility before rolling back. Take a snapshot or application backup before infrastructure replacement or an irreversible data migration. Snapshot scheduling was outside this release.

## Verification performed

- The production images built on EC2. The frontend and registration routes loaded over trusted HTTPS, the JavaScript bundle was served, and protected profile access returned HTTP 401 without a session.
- Express reported MongoDB and Redis connected. AI Core returned a real FinWise answer, Groq returned HTTP 200, Gmail SMTP authenticated, and the background worker reached healthy status.
- All 562 frontend tests and 500 AI Core tests passed. Server type checking and the eight final environment configuration tests passed.
- The EC2 and ECS templates passed local CloudFormation lint checks. Compose and the Caddy configuration were validated. Caddy’s ingress configuration contains both the working hostname and the DigitalPlat alias.
