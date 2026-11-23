# Operator command reference

Commands in this guide are examples for authorized operators.
Confirm the account, host, release and Compose file combination before running them.
Some commands require tools or permissions that are not installed on every workstation.
Do not paste credentials or sensitive command output into shared records.

## Public HTTPS check

Run from a trusted workstation:

```bash
curl -fsSI https://finwise.3-106-147-122.sslip.io/login
```

This checks one public request and verifies the certificate by default.
A successful response does not verify authentication or all dependencies.
Use the current canonical hostname if it has changed.

## Public route status checks

```bash
base=https://finwise.3-106-147-122.sslip.io
for path in /login /register /healthz /api/python-health; do
  status=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$base$path")
  printf '%s %s\n' "$path" "$status"
done
```

Compare the results with the expected behavior of the deployed release.
Investigate unexpected responses before accepting a deployment.

## DNS on Linux

```bash
dig +short NS personalfinanceagent.dpdns.org
dig +short A personalfinanceagent.dpdns.org
dig +short AAAA personalfinanceagent.dpdns.org
```

Compare returned nameservers with the intended provider.
Compare the A record with the current Elastic IP.
Investigate an unexpected AAAA record before assuming IPv4 is the only path.

## DNS on Windows

```powershell
Resolve-DnsName personalfinanceagent.dpdns.org -Type NS
Resolve-DnsName personalfinanceagent.dpdns.org -Type A
Resolve-DnsName personalfinanceagent.dpdns.org -Type AAAA
```

Record the check time and resolver when troubleshooting inconsistent answers.
The last recorded DNS check did not return an A record for the requested alias.

## AWS identity

With an authorized AWS CLI profile:

```bash
aws sts get-caller-identity
```

Confirm the account identity before running any AWS administration command.
Do not copy credentials or session tokens into a ticket.

## CloudFormation stack details

```bash
aws cloudformation describe-stacks \
  --region ap-southeast-2 \
  --stack-name finwise-ec2
```

Confirm the region and stack name match the intended environment.
This command inspects stack details; it does not apply a template update.

## EC2 instance details

```bash
aws ec2 describe-instances \
  --region ap-southeast-2 \
  --instance-ids i-06ee1a58a13fdff40
```

The instance ID is a recorded value and can change after replacement.
Check actual instance state and security settings in AWS.

## Elastic IP details

```bash
aws ec2 describe-addresses \
  --region ap-southeast-2 \
  --public-ips 3.106.147.122
```

Confirm the association before changing DNS or recovering a host.
An IP address in an old document is not proof of current association.

## Host source state

After connecting through Session Manager:

```bash
cd /opt/finwise
git rev-parse HEAD
git status --short
```

Record the full SHA and inspect any local changes.
Do not delete uncommitted work merely to satisfy a release check.

## Host tool versions

```bash
docker --version
docker compose version
docker buildx version
command -v flock
```

The release procedure depends on the relevant Docker tooling and `flock`.
Compare installed versions and behavior with the reviewed release requirements.

## Legacy Compose status

```bash
cd /opt/finwise
docker compose -p finwise \
  -f compose.yaml \
  -f deploy/aws/compose.ec2.yaml \
  ps
```

This matches the recorded legacy two-file deployment.
A later tagged release may need the release overlay and corresponding SHA setting.
Use the configuration matching the actual release.

## Legacy Compose logs

```bash
cd /opt/finwise
docker compose -p finwise \
  -f compose.yaml \
  -f deploy/aws/compose.ec2.yaml \
  logs --since 15m --tail 100 caddy web server worker ai-core mongo redis
```

Limit and redact logs before sharing.
Logs can contain private application or operational information.

## Disk inspection

```bash
df -h /
docker system df
```

Identify the actual cause of disk growth before cleanup.
Protect persistent volumes and rollback images.
Do not run volume deletion as a routine release step.

## Local client checks

From the repository root:

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

Use dependencies installed from the repository lockfile.
The inspected workflow uses Node 24.

## Local server checks

```bash
npm --prefix server run test:ci
npm --prefix server run build
```

Use an isolated test environment and test-only credentials.
Some server tests may need a MongoDB test binary.

## Local AI Core checks

```bash
cd server/AI_Core
python -m pytest tests/ -m 'not latency'
python -m evals.runner -m 'not latency'
```

Use the intended Python virtual environment.
The inspected workflow uses Python 3.11.
The Python commands run tests; they do not generate this documentation.

## Release script checks

```bash
bash -n deploy/aws/release-ec2.sh
bash scripts/test-release-ec2.sh
```

The fixture test uses disposable resources and stubs.
Do not substitute a production release command for a local test.

## Commands deliberately omitted

This reference does not provide a one-line volume deletion command.
It does not print complete environment files.
It does not use a database restore command against the live database.
Review the production runbook and the exact target before any recovery action.
