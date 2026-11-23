# Service reference

This reference describes the Compose configuration on the release branch. Confirm the source SHA and actual service state when investigating production.

## Caddy

Caddy is the public edge proxy. The EC2 overlay publishes ports 80 and 443 and places Caddy on the edge network with the web service. Its configuration reads the primary and optional alias hostnames from environment settings and forwards requests to `web:80`.

Caddy persists certificate and configuration state in Docker volumes. When changing a bind-mounted Caddyfile, use the reviewed release procedure, which accounts for the file changing during a Git checkout. Test certificate issuance and both hostnames afterward.

## Web

The web image builds the React client and serves it through nginx. nginx proxies API traffic to the server. The base Compose file binds port 8080 on the host loopback interface, while Caddy is the public entry point.

When a page loads but an API call fails, separate static asset, nginx proxy, gateway and backend service errors. Check browser network status and a request ID without sharing session credentials.

## Server

The Express gateway handles authentication, application APIs and AI Core communication. It depends on MongoDB, Redis and AI Core readiness in the Compose configuration. The EC2 overlay sets two trusted proxy hops for Caddy and nginx.

Public metrics access is restricted by the nginx configuration. Review the current configuration and an authorized metrics collection path before enabling or exposing monitoring.

## Worker

The worker runs the server image with a different command and processes background jobs. Its health check pings MongoDB. It has no public HTTP port. A healthy ping confirms database reachability, not successful processing of every queued job.

The repository comments caution against adding worker replicas without verifying scheduler enqueue behavior. Review job idempotency and scheduling before scaling it.

## AI Core

AI Core is a Python service accessed over the internal Compose network. The service reads its own environment file along with Compose-provided configuration. In the recorded setup it uses MongoDB state and a configured model provider.

Provider availability, quotas, model names and credentials can fail independently of container readiness. Test a real request using a designated account after a relevant deployment. Avoid using sensitive personal information in diagnostic prompts.

## MongoDB

The base Compose definition runs MongoDB as a single-member replica set named `rs0`. Its data directory is a named volume. The health check initializes a fresh replica set when appropriate and requires a writable primary.

A one-member replica set is not redundant. Preserve the volume during normal deployments and follow the backup guide before attempting data repairs.

## Redis

Redis runs on the internal network and has persistent append-only storage. It supports caching and coordination in the application. The Compose health check uses `redis-cli ping`.

Investigate disk, memory and Redis logs when it becomes unhealthy. A successful ping does not establish that all dependent application workflows are healthy.
