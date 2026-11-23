# Deployment glossary

This glossary explains terms used in the FinWise AWS deployment guides.
Descriptions refer to the recorded single-host EC2 architecture unless stated otherwise.
Consult the current source and infrastructure state for exact implementation details.

## A record

An A record maps a DNS hostname to an IPv4 address.
The requested DigitalPlat hostname needs an A record pointing to the intended Elastic IP.
Its last recorded public DNS check did not return such a record.

## AAAA record

An AAAA record maps a hostname to an IPv6 address.
An incorrect IPv6 record can direct some clients away from the working IPv4 host.
Only configure it when the deployment is intended and verified to serve IPv6.

## Alias hostname

An alias hostname is an additional name served by the application.
The recorded Caddy configuration supports an optional alias setting.
Each public alias needs correct DNS, HTTPS and application origin configuration.

## Amazon Linux 2023

Amazon Linux 2023 is the operating system recorded for the EC2 host.
The host runs Docker and deployment tooling.
Operating-system updates and reboots require their own maintenance plan.

## API gateway

In these guides, the gateway refers to the Express server handling application API requests.
It communicates with MongoDB, Redis and AI Core over internal networks.
It is distinct from a separately managed AWS API Gateway service.

## Availability Zone

An Availability Zone is an AWS location within a region.
An EBS volume is associated with an Availability Zone.
Recovery planning must consider where a replacement host and restored volume can be attached.

## Backup

A backup is a recoverable copy of data or configuration.
Its scope, consistency, encryption and retention must be defined.
A backup should be verified by restoring it in an isolated environment.

## Branch

A Git branch is a movable reference to a line of commits.
The recorded AWS release branch is `codex/aws-deploy`.
The branch tip may differ from the production checkout.

## Buildx

Buildx is a Docker build component used by the recorded deployment tooling.
The EC2 bootstrap installs a checksum-verified Buildx plugin.
Check its version and compatibility before a release build.

## Caddy

Caddy is the recorded public HTTPS proxy.
It handles TLS for configured hostnames and forwards requests to the web service.
Its persistent data and configuration use Docker volumes.

## Canonical URL

The canonical URL is the primary application origin used for links and related flows.
The inspected configuration uses `CLIENT_URL` for that purpose.
A change can affect email links, browser origins and OAuth callbacks.

## Certificate authority

A certificate authority issues certificates after its validation requirements are satisfied.
Caddy can obtain certificates for correctly configured public hostnames.
DNS, network reachability and CA limits can affect issuance.

## Change set

A CloudFormation change set previews proposed infrastructure changes.
Review resource replacement, deletion, IAM, storage and network effects before applying it.
A Git push does not apply a change set.

## CI

Continuous integration runs configured checks for a commit.
The Tests workflow includes application tests, image builds, lint and smoke checks.
A passing CI run does not automatically deploy the commit to EC2.

## CloudFormation

CloudFormation manages AWS resources defined by an applied template.
The recorded EC2 stack is `finwise-ec2`.
The template source is `deploy/aws/ec2.yaml` on the release branch.

## Compose overlay

A Compose overlay adds or changes service configuration from a base Compose file.
The EC2 overlay adds Caddy and EC2-specific settings.
The release overlay adds SHA-tagged image names for newer releases.

## Compose project name

The Compose project name groups related containers, networks and volumes.
The recorded production project is `finwise`.
Using a different project name can select or create different resources.

## Container

A container is a running instance of an image with configured networking, storage and environment.
The deployment has containers for Caddy, web, server, worker, AI Core, MongoDB and Redis.
Container health is only one layer of application verification.

## CORS

Cross-origin resource sharing controls which browser origins may access certain responses.
The server's allowed origins are configured through `CORS_ORIGINS`.
Test intended hostnames and credentialed requests after origin changes.

## CSRF

Cross-site request forgery protection helps defend certain authenticated browser actions.
Authentication and origin changes can affect the CSRF flow.
Use designated test accounts and avoid sharing CSRF tokens.

## DNS

The domain name system maps names to records such as IP addresses and nameservers.
The registrar, authoritative DNS provider and recursive resolvers have distinct roles.
Cached answers can delay the visibility of a change.

## Docker image

A Docker image contains the filesystem and metadata used to start a container.
The release overlay uses commit-specific tags for application images.
Retain images needed for the current and previous release.

## Docker volume

A Docker volume stores persistent data separately from a container's writable layer.
MongoDB, Redis and Caddy use named volumes in the inspected configuration.
Removing a volume can remove data and is not routine deployment cleanup.

## EBS

Elastic Block Store provides block storage for EC2.
The recorded host uses an encrypted 40 GiB gp3 root volume.
An EBS volume or snapshot needs its own retention and recovery plan.

## EC2

Amazon EC2 provides the virtual machine hosting the recorded deployment.
The recorded instance type is `m7i-flex.large`.
The application is concentrated on one EC2 host.

## Elastic IP

An Elastic IP is an AWS public IPv4 address that can be associated with an instance.
The last recorded address is `3.106.147.122`.
Confirm its current association before changing DNS or performing recovery.

## Environment file

An environment file contains configuration supplied to services or Compose.
The recorded production files are protected and Git-ignored.
They can contain secrets and must not be published.

## Git commit

A Git commit identifies a snapshot of source and its history.
The release script accepts a full commit SHA.
The production checkout should be recorded independently from the branch tip.

## Health check

A health check tests a defined condition for a service.
For example, the worker check pings MongoDB.
A passing health check does not prove all user workflows are functioning.

## HTTPS

HTTPS protects HTTP communication using TLS.
The client should verify the certificate and hostname.
The recorded deployment terminates HTTPS at Caddy.

## IAM role

An AWS IAM role supplies permissions to an AWS principal or service.
The EC2 template defines an instance role with Systems Manager managed-instance access.
Review actual permissions and operator access in the deployed account.

## Image tag

An image tag is a name assigned to a Docker image.
The newer release overlay uses the commit SHA in application image tags.
Check which image is actually running before declaring a deployment successful.

## Liveness

Liveness indicates whether a process is responding to a basic health check.
It may not include every dependency.
Read the service's actual health endpoint implementation and deployment settings.

## MongoDB replica set

A replica set is MongoDB's replication and primary-election configuration.
The recorded setup uses a single member named in `rs0`.
One member does not provide a redundant database copy.

## nginx

nginx is the web server inside the frontend container.
It serves the React application and proxies API requests to Express.
Caddy sits in front of it in the recorded EC2 architecture.

## Origin

An origin combines scheme, hostname and port.
Browser access rules can distinguish two hostnames that reach the same server.
Review CORS and authentication behavior when adding a hostname.

## Provider quota

A provider quota limits use of an external service.
The limit can depend on account, model, rate and billing plan.
A healthy container does not prove provider quota is available.

## Readiness

Readiness indicates whether a service is prepared to receive work under its configured checks.
The inspected AI Core Compose configuration checks `/ready`.
Readiness is not proof that every provider-backed request will succeed.

## Recovery point

The recovery point is the time to which data can be restored.
Writes after that point may be lost in a restore.
Record the selected recovery point before production data recovery.

## Recovery time

Recovery time is the time required to restore service.
Measure it during an isolated restore or host replacement drill.
Compare the observed time with the service's requirements.

## Redis

Redis is an internal cache and coordination service in the inspected stack.
It has its own persistent volume and health check.
A MongoDB-only backup does not include Redis data.

## Release SHA

The release SHA identifies the exact Git commit chosen for deployment.
It should correspond to a reviewed and tested target.
Record it with the deployed image and verification results.

## Rollback

Rollback attempts to restore a previous application release.
It depends on the previous code and images being available.
It does not automatically reverse persistent data changes.

## Security group

An AWS security group controls network traffic for attached resources.
The recorded template permits public inbound HTTP and HTTPS.
Review actual rules before and after infrastructure changes.

## Session Manager

AWS Systems Manager Session Manager provides the recorded host administration path.
The operator and instance need suitable permissions and connectivity.
Confirm the account, region and instance ID before opening a session.

## Snapshot

An EBS snapshot is a point-in-time backup of an EBS volume.
Its consistency depends on the state of writes and filesystems.
Follow a coordinated procedure and test recovery.

## Trust proxy

Express uses proxy trust settings to interpret forwarded request information.
The EC2 overlay sets two trusted hops for Caddy and nginx.
Review this setting when the ingress topology changes.

## Worker

The worker is a process that handles background jobs.
It does not expose an HTTP listener in the inspected configuration.
Its health check confirms MongoDB reachability, not the success of every job.
