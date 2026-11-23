# AWS infrastructure and network operations

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

## Recorded deployment

| Property | Last recorded value | Where to verify |
| --- | --- | --- |
| Region | `ap-southeast-2` | AWS console region selector |
| Stack | `finwise-ec2` | CloudFormation stacks |
| Instance | `i-06ee1a58a13fdff40` | EC2 instances |
| Elastic IP | `3.106.147.122` | EC2 Elastic IPs |
| Image | Amazon Linux 2023 | EC2 instance details |
| Root volume | 40 GiB encrypted gp3 | EC2 volumes |
| Administration | Systems Manager Session Manager | Systems Manager managed nodes |
| Host path | `/opt/finwise` | Session Manager shell |

The live service is a single host. Its application, database, cache and ingress share that host's failure domain.
The deployment record says the root volume is retained on termination; confirm the live block-device setting before relying on it.
Retention is not a tested, off-host backup and can continue to generate charges.

## Infrastructure provisioning

The EC2 template is `deploy/aws/ec2.yaml`. It requires a VPC and a public subnet with a working internet route.
The default template instance type is `m7i-flex.large`; the template also permits selected burstable alternatives.
It creates an instance role with Systems Manager managed-instance access, an instance profile, a security group, a launch template, an instance and an Elastic IP.
Instance metadata uses IMDSv2 with a hop limit of one in the template.
The user-data script installs Docker, Git and OpenSSL and installs checksum-verified Compose and Buildx binaries.
Template changes require a separately reviewed CloudFormation change set. A container release does not apply the template.
Review replacements, storage retention, Elastic IP effects and IAM permissions before executing a change set.

## Network path

```text
Browser -> DNS -> Elastic IP -> EC2 security group :80/:443 -> Caddy -> web/nginx -> server -> internal services
```

Caddy serves HTTPS and forwards to `web:80` on an edge network.
The web container serves frontend assets and proxies API traffic to the gateway.
The base Compose configuration also binds web to `127.0.0.1:8080` on the host.
MongoDB, Redis and AI Core use the internal Compose network; do not expose their ports publicly for troubleshooting.
The EC2 overlay configures Express `TRUST_PROXY` as `2`, reflecting Caddy and nginx.
Reassess this setting if a CDN, load balancer or additional proxy is added.
The worker executes background work and does not provide its own HTTP listener.

## Domain activation checklist

1. Confirm access to the DigitalPlat account that owns `personalfinanceagent.dpdns.org`.
2. Choose a DNS provider and configure delegation according to the registrar's instructions.
3. Add an A record for the domain apex pointing to the current Elastic IP.
4. Check the assigned nameservers and compare answers from public DNS resolvers.
5. Allow time for DNS propagation; investigate stale or conflicting records before retrying certificate issuance.
6. Confirm that ports 80 and 443 reach Caddy and review certificate issuance logs.
7. Verify the alias over HTTPS and verify that allowed browser origins include it.
8. If making it canonical, review `CLIENT_URL`, login cookies, email links and OAuth callback registrations.

The domain certificate PDF is evidence of the registered name; it does not create DNS records or deploy a website.
At the last check the DigitalPlat hostname had no A record. The working recorded hostname is `finwise.3-106-147-122.sslip.io`.

## Commands to collect evidence

Run from a trusted workstation with authorized AWS CLI credentials and the correct account selected.
These commands display account and infrastructure metadata; handle identifiers as operational data.

```bash
aws sts get-caller-identity
aws cloudformation describe-stacks --region ap-southeast-2 --stack-name finwise-ec2
aws ec2 describe-instances --region ap-southeast-2 --instance-ids i-06ee1a58a13fdff40
aws ec2 describe-addresses --region ap-southeast-2 --public-ips 3.106.147.122
```

For DNS and HTTPS from a network outside the host:

```bash
dig +short A personalfinanceagent.dpdns.org
dig +short NS personalfinanceagent.dpdns.org
curl -fsSI https://finwise.3-106-147-122.sslip.io/login
```

A successful HTTP response shows that one request reached an application; it does not verify every user's authentication or all application integrations.

## Access and billing

Use named identities and least-privilege AWS access. Prefer Session Manager over opening SSH to the public internet.
Review AWS Billing, budgets, credit balance, public IPv4, EBS and snapshot usage, and provider usage periodically.
The name `sslip.io` is free to use, but the EC2 host, storage, IPv4 and external providers can incur charges.
