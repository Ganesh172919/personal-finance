# Operations and troubleshooting

## Inspect the recorded host

Use Session Manager to connect to the correct instance in `ap-southeast-2`. Confirm the host and checkout before issuing commands. The following commands are for the legacy two-file Compose setup recorded at initial deployment:

```bash
cd /opt/finwise
git rev-parse HEAD
git status --short
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml ps
docker compose -p finwise -f compose.yaml -f deploy/aws/compose.ec2.yaml logs --since 15m --tail 100 caddy web server worker ai-core mongo redis
df -h /
docker system df
```

Later SHA-tagged releases use an additional Compose overlay. Use the files and image tags corresponding to the release actually running. Logs can include sensitive details; handle them accordingly.

## Website unavailable

1. Check public DNS and the domain's current A record.
2. Check EC2 instance status and Elastic IP association.
3. Check security-group access to ports 80 and 443.
4. Inspect Caddy and nginx status and recent logs.
5. Check disk space, Docker health and resource pressure.
6. Compare the incident start with the last release or infrastructure change.

For TLS errors, inspect the certificate, Caddy logs, public DNS and port reachability. Avoid deleting Caddy data as a first response.

## Login or registration fails

Check the gateway response, request ID, configured origins, cookies, CSRF behavior and server health. For email-dependent flows, check SMTP provider status and test delivery to a designated account. Never share passwords, session cookies, recovery links or one-time codes in incident reports.

## AI replies fail

Check AI Core readiness and gateway-to-AI communication. Review provider status, model availability, quota, configured credentials and rate limits. Inspect logs with user content redacted. Use a non-sensitive test request.

The runtime OCR smoke check validates an import and a compression round trip in CI. It does not prove that every receipt or image can be processed successfully in production.

## Background work stalls

Check worker logs, job failures, MongoDB primary status, Redis and provider limits. The worker has no HTTP listener. Its database ping health check does not prove every background task is completing successfully.

## Database or Redis unhealthy

Check container status, disk space, replica-set state and recent logs before restarting dependent services. Preserve evidence and backups if corruption is suspected. Avoid deleting named volumes to clear an error.

## Disk pressure

Inspect `df -h /` and `docker system df`. Identify log, build-cache, backup and image growth before removal. Protect persistent volumes and the current and previous release images. Schedule cleanup according to the actual cause and retention requirements.

## Incident record

Record the start time and timezone, affected features, deployed SHA, request IDs, observed symptoms, actions, outcome and follow-up owner. State which evidence is confirmed and which cause is still suspected. Avoid including secrets or personal financial data.
