# Deployment overview

## Recorded resources

| Resource | Last recorded value |
| --- | --- |
| AWS Region | Asia Pacific (Sydney), `ap-southeast-2` |
| CloudFormation stack | `finwise-ec2` |
| EC2 instance | `i-06ee1a58a13fdff40` |
| Elastic IP | `3.106.147.122` |
| Instance type | `m7i-flex.large` |
| Operating system | Amazon Linux 2023 |
| Root disk | Encrypted 40 GiB gp3 EBS volume |
| Source checkout | `/opt/finwise` |
| Compose project | `finwise` |
| Public hostname | `finwise.3-106-147-122.sslip.io` |
| Requested alias | `personalfinanceagent.dpdns.org` |

These are recorded values, not a live inventory. Check the AWS console and host for current state. The EC2 root volume was configured to remain after instance termination, but an independent backup and restore drill are still necessary.

## Request flow

```text
Browser
  -> DNS and Elastic IP
  -> EC2 security group, ports 80 and 443
  -> Caddy HTTPS termination
  -> nginx web container
  -> Express API
  -> MongoDB, Redis and Python AI Core
```

Caddy redirects HTTP to HTTPS and forwards requests to the web container. nginx serves the React application and proxies API requests to Express. AI Core handles Python-based AI features. The worker processes background jobs and has no public HTTP listener.

The EC2 Compose overlay configures Express to trust two proxy hops, corresponding to Caddy and nginx. Review this value if another proxy or load balancer is introduced. The web container is also bound to host loopback on port 8080; the database, Redis and AI Core should remain on internal container networks.

## Data flow and persistence

MongoDB runs as a single-member replica set named `rs0`. The replica-set configuration allows features requiring a replica set, but a single member does not provide database redundancy. Redis is configured with persistent append-only storage. Caddy, MongoDB and Redis use Docker volumes backed by the EC2 host disk.

The initial production deployment used a fresh database. Existing development data was not migrated. A logical MongoDB backup covers database contents, not every Docker volume or host file. See [backup and recovery](05-backup-recovery.md).

## Infrastructure changes

The EC2 CloudFormation template is `deploy/aws/ec2.yaml`. It defines the instance, security group, role, instance profile, launch template and Elastic IP. Applying an application release does not apply a CloudFormation template change. Review the change set, resource replacement behavior, persistent storage and costs before applying an infrastructure change.

The repository also contains ECS and Kubernetes definitions. Their presence does not mean they host the recorded website. The recorded deployment uses Docker Compose on EC2.

## Cost and availability

EC2, storage, public IPv4, snapshots, network transfer and third-party providers can incur charges. AWS credits and expiration are account-specific. Review the current AWS Billing and Free Tier pages instead of assuming permanent free hosting.

This deployment has a single compute host and a single MongoDB primary. Host failure can interrupt the entire application. Define acceptable downtime and data loss, maintain encrypted off-host backups, and rehearse recovery before relying on the service for important financial data.
