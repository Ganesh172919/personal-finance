# Deployment and architecture

## Deployment identity

| Item | Last recorded value |
| --- | --- |
| Region | Asia Pacific (Sydney), `ap-southeast-2` |
| CloudFormation stack | `finwise-ec2` |
| EC2 instance | `i-06ee1a58a13fdff40` |
| Instance type | `m7i-flex.large` |
| Operating system | Amazon Linux 2023 |
| Elastic IP | `3.106.147.122` |
| Disk | 40 GiB encrypted gp3 root EBS volume, retained on termination |
| Host checkout | `/opt/finwise` |
| Compose project | `finwise` |
| Live hostname | `finwise.3-106-147-122.sslip.io` |
| Additional requested hostname | `personalfinanceagent.dpdns.org` |
| Last recorded running commit | `b70ef81024b57f328477a2420e8dff4117f553fa` |

These values are a historical record. Confirm in the AWS console before changing resources.
The original deployment used a fresh MongoDB database. Previous local data was not migrated.

## Request path

1. A browser resolves the hostname and opens HTTPS on port 443.
2. The EC2 security group permits inbound public ports 80 and 443.
3. Caddy terminates TLS and proxies traffic to the `web` container.
4. nginx serves the React frontend and forwards API traffic to the Express gateway.
5. Express uses MongoDB and Redis, and forwards AI requests to AI Core.
6. The worker handles background work using the shared services.
7. AI Core uses MongoDB for state, Redis, and the configured model provider.

Caddy listens on ports 80 and 443. Web also binds its port 8080 to host loopback.
MongoDB, Redis and AI Core should stay on internal container networks.
Express is configured to trust two reverse proxy hops in the EC2 overlay.
Review that setting if the proxy chain changes.

## Services

| Container | Role | Persistent dependency |
| --- | --- | --- |
| `caddy` | HTTPS and reverse proxy | Caddy data and configuration volumes |
| `web` | nginx and static React build | Built image |
| `server` | Express API | MongoDB, Redis, provider access |
| `worker` | Background job processing | MongoDB, Redis, AI Core |
| `ai-core` | Python AI service | MongoDB state, Redis, provider access |
| `mongo` | MongoDB replica set `rs0` | `mongo-data` volume |
| `redis` | Cache and coordination | `redis-data` volume |

The single MongoDB replica set member permits replica-set features but is not redundant.
A single EC2 host is a single point of failure. This is not a high-availability deployment.

## Configuration and secrets

- `/opt/finwise/.env` stores the hostnames, origins, service settings and generated secrets.
- `/opt/finwise/server/.env` stores gateway settings, SMTP configuration and provider credentials.
- `/opt/finwise/server/AI_Core/.env` stores AI provider credentials.
- These files are excluded from Git. Limit host permissions and keep encrypted recovery copies.
- Do not publish `docker compose config` output with secrets resolved.
- The last recorded provider was Groq using `openai/gpt-oss-20b`.
- SMTP and voice credentials were configured at initial deployment; revalidate their current status before relying on them.
- Google sign-in requires separate OAuth registration for the chosen callback URL.

## DNS and HTTPS

The free `sslip.io` hostname resolves from the encoded public IP.
The requested `personalfinanceagent.dpdns.org` was present in the ingress alias configuration.
On 23 November the hostname had no A record; the certificate document alone does not configure DNS or prove the site is live at that name.
The owner needs access to the DigitalPlat registration and a DNS provider, delegated as required by DigitalPlat.
Create an apex A record pointing to `3.106.147.122`, then wait for public resolution.
Confirm ports 80 and 443 reach Caddy and check its logs while it issues a certificate.
Keep `CLIENT_URL` as the intended canonical URL and include allowed HTTPS origins in `CORS_ORIGINS`.
Changing the canonical URL can affect email links, OAuth callbacks and browser origin behavior.
See [DigitalPlat nameserver instructions](https://github.com/DigitalPlatDev/FreeDomain/blob/main/documents/tutorial/platform/1.3-connect-nameservers.md).

## Charges and lifecycle

AWS computes cost from current resource usage, public IPv4, storage, backups and applicable plan credits.
The original account had an AWS Free plan with a limited credit balance and expiration; confirm current status in Billing.
Free DNS does not make EC2, EBS, snapshots or provider APIs permanently free.
Review billing alarms, budgets, quotas and plan expiry directly in the AWS console.
Retaining an EBS root volume after termination protects against immediate deletion but can continue to incur charges.
