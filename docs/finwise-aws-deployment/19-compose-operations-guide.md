# Docker Compose operations guide

This guide describes the repository's inspected Compose configuration.
Confirm the files and source SHA on the host before running any command.
The recorded Compose project name is `finwise`.
Using a different project name can select different containers and volumes.

## Compose files

`compose.yaml` defines the base services and volumes.
`deploy/aws/compose.ec2.yaml` adds Caddy and EC2-specific overrides.
`deploy/aws/compose.release.yaml` adds SHA-tagged image names for newer releases.
The last recorded production release used the legacy two-file configuration.
Later releases can use the additional release overlay.
Choose the file combination matching the actual running release.

## Why file order matters

Compose combines service definitions and overrides from the selected files.
The EC2 overlay sets `TRUST_PROXY` to two for the recorded Caddy and nginx path.
The release overlay gives web, server and AI Core images commit-specific tags.
The worker uses the same server image in the release overlay.
An incorrect file combination can show or change resources differently from the running deployment.

## Services and health

### mongo

The inspected base file uses MongoDB 7.0.
It starts a replica set named `rs0`.
The health check initializes a new set when appropriate and requires a writable primary.
The named volume stores the MongoDB data directory.
The service has a stop grace period to support shutdown.
The replica set contains one member in this deployment.

### redis

The inspected base file uses Redis 7 Alpine.
It enables append-only persistence.
Its health check runs `redis-cli ping`.
Its data directory uses a named volume.
Memory configuration and eviction behavior should be reviewed before changing limits.

### web

The web service builds from the client directory.
The base configuration binds its port 80 to host loopback port 8080.
The EC2 overlay connects it to both the default and edge networks.
It depends on server health in the base configuration.
Its static page availability does not verify every API workflow.

### server

The server service builds from the server directory.
It runs in production mode in the Compose configuration.
It uses MongoDB, Redis and AI Core through internal service names.
It requires configured shared secrets.
Its startup depends on healthy MongoDB, Redis and AI Core services.
The EC2 overlay sets the proxy hop count to two.

### worker

The worker runs a background-worker command from the server image.
It has no HTTP listener.
Its health check pings MongoDB.
It depends on MongoDB, Redis and AI Core in the base configuration.
The repository cautions against scaling workers without verifying scheduler behavior.

### ai-core

The AI Core service builds from the Python AI directory.
It exposes its service on the internal container network.
Its readiness check calls the local `/ready` endpoint.
The inspected Compose settings use MongoDB for state and Redis for shared cache access.
Provider credentials and model access require separate verification.

### caddy

The EC2 overlay defines the Caddy service.
It publishes host ports 80 and 443.
It reads the primary hostname and optional aliases from configuration.
It mounts the Caddyfile read-only.
It persists Caddy state in named volumes.

## Inspect legacy service status

The following command uses the recorded two-file legacy configuration:

```bash
cd /opt/finwise
docker compose -p finwise \
  -f compose.yaml \
  -f deploy/aws/compose.ec2.yaml \
  ps
```

If the current release uses the tagged overlay, use the matching release configuration instead.
Confirm the environment needed to resolve the tagged image names.
Avoid printing resolved Compose configuration to shared output because it can contain secrets.

## Inspect recent logs

For the legacy configuration:

```bash
cd /opt/finwise
docker compose -p finwise \
  -f compose.yaml \
  -f deploy/aws/compose.ec2.yaml \
  logs --since 15m --tail 100 caddy web server worker ai-core mongo redis
```

Choose the appropriate Compose files for a later release.
Logs may contain sensitive application information.
Redact before sharing and follow the service's retention policy.

## Health check interpretation

A healthy Caddy container does not prove every certificate and application feature works.
A healthy web container does not prove all API requests succeed.
A healthy server does not prove email and every provider are available.
A healthy worker MongoDB ping does not prove jobs are completing.
A healthy AI Core readiness check does not prove every provider request succeeds.
A writable single MongoDB primary is not a redundant database cluster.
A Redis ping does not prove all application cache behaviors are correct.

Use layered checks: container health, public route status and a designated user workflow.
Record which layer was checked and the time of the check.

## Persistent volumes

The base file defines MongoDB, Redis and AI memory volumes.
The EC2 overlay defines Caddy data and configuration volumes.
The inspected AI Core configuration uses MongoDB for state; the AI memory volume is relevant to the alternative SQLite configuration described in the file.
Determine actual storage usage at the deployed release before planning a backup.

Do not use commands that remove named volumes during routine deployment.
Do not change the Compose project name casually, because named resources are associated with the project.
Follow the reviewed release and recovery procedures.

## Image retention

Newer releases can use tags derived from the full commit SHA.
The worker and server share an image in the release overlay.
The release script checks current images before applying a candidate.
Retain the images needed to restore the current and previous release.
Review Docker disk usage before cleaning build cache or unused images.

## Log rotation

The inspected EC2 overlay uses Docker's local logging driver.
It configures a maximum size of 20 MB and three files per container.
This is a local retention setting, not a centralized log archive.
If longer retention is required, design an authorized and access-controlled collection process.
Consider privacy and cost before forwarding logs.

## Service restart decisions

Identify the cause before restarting a failing service repeatedly.
Check dependency health and disk space.
Record the current release and relevant logs.
Understand whether a restart can interrupt in-flight work.
Verify service readiness and a representative workflow after a restart.
For a release, use the reviewed release script rather than ad hoc image replacement.
