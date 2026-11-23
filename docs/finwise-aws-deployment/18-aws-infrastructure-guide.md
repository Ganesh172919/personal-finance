# AWS infrastructure guide

This guide describes the recorded single-host AWS deployment and its infrastructure template.
The last recorded region was `ap-southeast-2`.
The last recorded stack name was `finwise-ec2`.
The last recorded instance ID was `i-06ee1a58a13fdff40`.
The last recorded Elastic IP was `3.106.147.122`.
Confirm all of these values in AWS before acting.

## Deployment boundaries

CloudFormation manages the infrastructure described by its applied template.
Git stores the infrastructure source and application source.
Docker Compose manages containers on the EC2 host.
The domain's DNS provider manages DNS records.
External providers manage their own credentials and quotas.
These systems have separate state and separate change procedures.

Pushing a CloudFormation template to Git does not apply it.
Running a container release does not apply the template.
Changing DNS does not rebuild or deploy application images.
Restarting an instance does not by itself merge a Git branch.

## Recorded architecture

The EC2 instance runs Amazon Linux 2023.
The instance runs Docker and Docker Compose.
Caddy receives public HTTP and HTTPS traffic.
The web container serves the frontend and proxies API requests.
The server, worker, AI Core, MongoDB and Redis run on internal container networks.
Persistent Docker volumes reside on the host storage in the recorded setup.

This architecture concentrates compute, database and cache on one machine.
A host or storage failure can affect the entire application.
The single MongoDB member does not provide database redundancy.
Plan and rehearse recovery according to the actual service requirements.

## CloudFormation template

The EC2 template is `deploy/aws/ec2.yaml`.
Read the template at the target commit before reviewing a change set.
The template accepts a VPC and a public subnet.
The subnet must have the appropriate internet route for the public deployment.
The inspected template uses an Amazon Linux 2023 AMI parameter.
It defines a selection of permitted EC2 instance types.
The default recorded instance type is `m7i-flex.large`.

## Instance role and profile

The template defines an IAM role for the EC2 instance.
The role includes the Systems Manager managed-instance policy.
An instance profile attaches the role to the host.
Review the current IAM policy and account configuration before relying on access.
Avoid granting additional permissions solely for convenience.

## Security group

The inspected template allows public inbound TCP 80 and 443.
These ports support the public HTTP and HTTPS entry points.
The template does not need public inbound database ports for the documented architecture.
MongoDB, Redis and AI Core should remain on internal container networks.
Use authorized host access to diagnose internal services.

## Instance metadata

The inspected launch template requires IMDSv2 tokens.
It sets the metadata response hop limit to one.
Review the effect on legitimate host processes before changing metadata settings.
Do not expose instance credentials or metadata responses in incident logs.

## Storage

The template defines an encrypted gp3 root EBS volume.
The recorded size was 40 GiB.
The template sets the root volume to remain after instance termination.
Confirm the actual deployed block-device configuration in AWS.
Retention protects against a particular deletion event; it is not a complete backup strategy.
Retained volumes can incur charges.

## Elastic IP

The template associates an Elastic IP with the host.
The last recorded address was `3.106.147.122`.
The current address and association should be confirmed in EC2 before DNS changes.
Public IPv4 addresses can incur AWS charges.
If a replacement host is used, plan the address association and DNS verification.

## Bootstrap

The inspected user-data script installs Docker, Git and OpenSSL.
It installs Docker Compose and Buildx plugins using downloads with recorded checksums.
It enables Docker and checks the installed plugin versions.
Provisioning can fail because of network, package, checksum or platform issues.
Inspect cloud-init and service logs when bootstrap fails.
Do not disable checksum verification merely to bypass a failed installation.

## Host access

The recorded access method is AWS Systems Manager Session Manager.
The operator must have appropriate account permissions.
The instance must be a managed node and have required connectivity.
Confirm the account, region and instance ID before starting a session.
Use privileged access only for the reviewed maintenance action.
Keep credentials and personal data out of shared terminal transcripts.

## Inspect a host without changing it

After connecting to the intended instance:

```bash
cd /opt/finwise
git rev-parse HEAD
git status --short
docker compose version
docker buildx version
docker ps
df -h /
docker system df
```

These commands help establish source, tool and resource state.
They do not verify all application workflows.
Use the Compose files corresponding to the running release when inspecting service status.

## CloudFormation change-set review

1. Identify the current stack and region.
2. Identify the reviewed template commit.
3. Review parameter values and intended changes.
4. Create a change set using authorized AWS access.
5. Inspect every proposed resource change.
6. Identify replacements, deletions and permission changes.
7. Review volume retention and Elastic IP effects.
8. Review security-group and IAM changes.
9. Estimate service interruption and costs.
10. Confirm backup and recovery readiness.
11. Apply the reviewed change set during an appropriate window.
12. Verify resource status and application behavior.
13. Record the change-set outcome and any drift or follow-up.

Do not assume a successful template lint predicts runtime capacity or cost.
Do not assume an EC2 replacement preserves every host file or configuration.

## Operating-system maintenance

Review Amazon Linux updates and their applicability.
Check Docker, Compose and Buildx compatibility with the release tooling.
Test changes in an isolated environment when possible.
Plan a maintenance window when a restart is required.
Confirm backups and recovery before changing the host.
After a reboot, verify containers, persistent volumes, HTTPS, login and representative workflows.

## Storage maintenance

Monitor filesystem usage and Docker disk usage.
Track application logs, build cache, retained images, backups and persistent data separately.
Review log rotation and retention.
Protect the current and previous release images required for rollback.
Never remove named data volumes as routine cache cleanup.
Confirm the cause of disk pressure before deleting material.

## Billing review

Check current EC2 compute charges.
Check EBS volume and snapshot charges.
Check public IPv4 and network charges.
Check AWS credit balance and plan expiration.
Check provider and model usage separately.
Review budget and alert delivery.
Free DNS does not make the other services permanently free.

## Recovery review

Record the latest verified backup and its location.
Record the last isolated restore drill and observed duration.
Confirm access to encryption keys and environment recovery material.
Confirm how a replacement host receives the production address.
Confirm who can access the AWS account and domain provider during an incident.
Record unresolved recovery gaps with an owner.
