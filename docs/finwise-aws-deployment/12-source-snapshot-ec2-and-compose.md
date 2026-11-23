# Deployment source snapshot

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

This appendix preserves selected version-controlled files from release-branch commit `f1ed41a5fdf5ba354ebfda199c0e69cebda1f369`.
It is a historical reference; compare against the current files before using commands or configuration.
The example environment files contain placeholders and defaults, not the live secret values.

## `compose.yaml`

Snapshot SHA-256: `2a8444137c7a65791235cb07f673e9fb888194b49c6eedeb77bba90d5916fa1a`.

```yaml
# Secrets: every secret below is REQUIRED via `${VAR:?...}` and has no default, so compose
# refuses to start without them. The apps read plain env vars only; the Docker-secrets
# `*_FILE` convention (JWT_SECRET_FILE, ...) is NOT supported by server/src/config/env.ts
# or AI Core. Compose `secrets:` would therefore mount files nothing reads. Pass secrets via
# the root .env (git-ignored) or your orchestrator's env injection (ECS secrets, k8s Secret
# env), see deploy/aws/README.md and deploy/k8s/.
# Overrides: SERVER_REPLICAS, AI_CORE_REPLICAS, AI_CORE_MAX_INFLIGHT, METRICS_ENABLED,
# METRICS_TOKEN, LLM_PROVIDER (mock for CI), LLM_MODEL, LLM_MOCK_LATENCY_MS.
services:
  mongo:
    image: mongo:7.0
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    environment:
      MONGO_INITDB_DATABASE: finwise
    volumes:
      - mongo-data:/data/db
    healthcheck:
      # Initialize a new replica set, then require an elected writable primary.
      test:
        - CMD
        - mongosh
        - --quiet
        - --eval
        - >-
          try { rs.status(); } catch (error) {
            if (error.code !== 94) throw error;
            assert.commandWorked(rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}));
          }
          quit(db.adminCommand({hello: 1}).isWritablePrimary === true ? 0 : 1);
      interval: 10s
      timeout: 10s
      retries: 12
      start_period: 15s
    stop_grace_period: 30s
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "256mb", "--maxmemory-policy", "volatile-lru"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped

  web:
    build: ./client
    ports:
      - "127.0.0.1:8080:80"
    depends_on:
      server:
        condition: service_healthy
    deploy:
      resources:
        limits: {cpus: "0.5", memory: 128M}
    restart: unless-stopped

  server:
    build: ./server
    env_file: ./server/.env
    environment:
      NODE_ENV: production
      PORT: "3000"
      JWT_SECRET: ${JWT_SECRET:?Set a production JWT_SECRET in the root .env}
      CLIENT_URL: ${CLIENT_URL:-http://localhost:8080}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:8080,http://127.0.0.1:8080}
      MONGO_URI: mongodb://mongo:27017/finwise?replicaSet=rs0
      REDIS_URL: redis://redis:6379
      PYTHON_API_URL: http://ai-core:8001
      AI_CORE_INTERNAL_TOKEN: ${AI_CORE_INTERNAL_TOKEN:?Set a shared AI_CORE_INTERNAL_TOKEN in the root .env}
      WEBHOOK_CREDENTIALS_KEY: ${WEBHOOK_CREDENTIALS_KEY:?Set a base64-encoded 32-byte WEBHOOK_CREDENTIALS_KEY in the root .env}
      TRUST_PROXY: "1"
      ASYNC_JOBS_ENABLED: "true"
      # Prometheus scrape (GET /api/metrics, Bearer METRICS_TOKEN). nginx blocks the path at the
      # edge, so scrape the replicas directly (deploy/observability/prometheus.yml).
      # METRICS_ENABLED=true requires METRICS_TOKEN or the gateway refuses to boot.
      METRICS_ENABLED: ${METRICS_ENABLED:-false}
      METRICS_TOKEN: ${METRICS_TOKEN:-}
      # Optional Google sign-in (empty = disabled). Callback default: CLIENT_URL/api/auth/google/callback.
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      GOOGLE_CALLBACK_URL: ${GOOGLE_CALLBACK_URL:-}
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
      ai-core:
        condition: service_healthy
    deploy:
      replicas: ${SERVER_REPLICAS:-2}
      resources:
        limits: {cpus: "1.0", memory: 768M}
    # Longer than the gateway drain window so in-flight requests finish.
    stop_grace_period: 70s
    restart: unless-stopped

  # Dedicated job processor. Job claims (workflow runs, integration syncs, exports,
  # scheduled exports) use an atomic findOneAndUpdate, so extra replicas do not double-run a
  # claimed job. There is NO leader election, though: the workflow scheduler tick runs in every
  # worker process, so keep a single worker replica (the default) unless you have verified
  # scheduler enqueue idempotency for your workflows. API replicas never run jobs inline here
  # because ASYNC_JOBS_ENABLED=true.
  worker:
    build: ./server
    command: ["node", "dist/worker/worker.js"]
    healthcheck:
      # The worker polls MongoDB and has no HTTP listener.
      test:
        - CMD
        - node
        - -e
        - >-
          const { MongoClient } = require('mongoose').mongo;
          const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2500 });
          client.db().command({ ping: 1 }).then(() => client.close()).catch(() => process.exit(1));
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    env_file: ./server/.env
    environment:
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET:?Set a production JWT_SECRET in the root .env}
      MONGO_URI: mongodb://mongo:27017/finwise?replicaSet=rs0
      REDIS_URL: redis://redis:6379
      PYTHON_API_URL: http://ai-core:8001
      AI_CORE_INTERNAL_TOKEN: ${AI_CORE_INTERNAL_TOKEN:?Set a shared AI_CORE_INTERNAL_TOKEN in the root .env}
      WEBHOOK_CREDENTIALS_KEY: ${WEBHOOK_CREDENTIALS_KEY:?Set a base64-encoded 32-byte WEBHOOK_CREDENTIALS_KEY in the root .env}
      ASYNC_JOBS_ENABLED: "true"
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
      ai-core:
        condition: service_healthy
    deploy:
      resources:
        limits: {cpus: "0.5", memory: 512M}
    stop_grace_period: 70s
    restart: unless-stopped

  ai-core:
    build: ./server/AI_Core
    env_file: ./server/AI_Core/.env
    environment:
      NODE_ENV: production
      AI_CORE_INTERNAL_TOKEN: ${AI_CORE_INTERNAL_TOKEN:?Set a shared AI_CORE_INTERNAL_TOKEN in the root .env}
      # LLM_PROVIDER=mock serves a deterministic canned reply with no network call or key
      # (CI smoke test, load tests). LLM_MOCK_LATENCY_MS simulates provider latency.
      LLM_PROVIDER: ${LLM_PROVIDER:-gemini}
      LLM_MODEL: ${LLM_MODEL:-}
      LLM_MOCK_LATENCY_MS: ${LLM_MOCK_LATENCY_MS:-0}
      # Optional Bearer token for GET /metrics on AI Core (unset = endpoint stays closed).
      AI_CORE_METRICS_TOKEN: ${AI_CORE_METRICS_TOKEN:-}
      # AI Core state (sessions, checkpoints, memories) lives in MongoDB; the sqlite
      # path + ai-memory volume are only used when AI_CORE_STATE_BACKEND=sqlite (dev).
      AI_CORE_STATE_BACKEND: mongo
      AI_CORE_READY_REQUIRES_STATE: "true"
      AI_CORE_MONGO_URI: mongodb://mongo:27017/?replicaSet=rs0
      FINWISE_MEMORY_DB_PATH: /app/data/memory.sqlite3
      REDIS_URL: redis://redis:6379
      AI_CORE_MAX_INFLIGHT: ${AI_CORE_MAX_INFLIGHT:-6}
      LLM_CACHE_ENABLED: "1"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/ready', timeout=3)"]
      interval: 15s
      timeout: 4s
      start_period: 60s
      retries: 5
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ai-memory:/app/data
    deploy:
      # The work gate, token bucket and LLM cache are per process; the free-tier
      # budget (LLM_RPM) is therefore per replica. Keep replicas * LLM_RPM within
      # the provider quota. Replicas share the Redis LLM cache.
      replicas: ${AI_CORE_REPLICAS:-1}
      resources:
        limits: {cpus: "2.0", memory: 2G}
    stop_grace_period: 70s
    restart: unless-stopped

volumes:
  mongo-data:
  redis-data:
  ai-memory:
```

## `compose.env.example`

Snapshot SHA-256: `5b15be614b0f0760e5f1fc9a8e3fcedaebd944355f62308915d1c9b384e86961`.

```text
# Copy this file to .env before running `docker compose up --build`.
# Generate a long random value; it must match for the Node and AI Core services.
AI_CORE_INTERNAL_TOKEN=replace-with-a-random-32-character-or-longer-secret
JWT_SECRET=replace-with-a-different-random-32-character-or-longer-secret
# Create with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
WEBHOOK_CREDENTIALS_KEY=replace-with-a-base64-encoded-32-byte-key
# Change these when serving the web container at a non-local host.
CLIENT_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
# Set the provider here and its credential in server/AI_Core/.env.
LLM_PROVIDER=gemini
# Leave empty to use the selected provider's default model.
LLM_MODEL=
# Optional Google sign-in (leave empty to disable). Authorized redirect URI in Google Cloud Console:
#   ${CLIENT_URL}/api/auth/google/callback   (or set GOOGLE_CALLBACK_URL to override)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=
```

## `deploy/aws/ec2.yaml`

Snapshot SHA-256: `1f16e824dad5addf6a9e25334bb0f8188b38bb49816083386e343c7630e9f725`.

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Single EC2 host for the FinWise Docker Compose deployment

Parameters:
  VpcId:
    Type: AWS::EC2::VPC::Id
  PublicSubnetId:
    Type: AWS::EC2::Subnet::Id
    Description: Subnet in the selected VPC with a route to an internet gateway
  InstanceType:
    Type: String
    Default: m7i-flex.large
    AllowedValues: [m7i-flex.large, t3.large, t3.xlarge, t3a.large, t3a.xlarge]
  AmiId:
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64

Conditions:
  IsBurstable: !Not [!Equals [!Ref InstanceType, m7i-flex.large]]

Resources:
  InstanceRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { Service: ec2.amazonaws.com }
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - !Sub arn:${AWS::Partition}:iam::aws:policy/AmazonSSMManagedInstanceCore

  InstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      Roles: [!Ref InstanceRole]

  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Public HTTP and HTTPS for FinWise
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - { IpProtocol: tcp, FromPort: 80, ToPort: 80, CidrIp: 0.0.0.0/0 }
        - { IpProtocol: tcp, FromPort: 443, ToPort: 443, CidrIp: 0.0.0.0/0 }

  HostLaunchTemplate:
    Type: AWS::EC2::LaunchTemplate
    Properties:
      LaunchTemplateData:
        MetadataOptions:
          HttpTokens: required
          HttpPutResponseHopLimit: 1
        CreditSpecification: !If
          - IsBurstable
          - { CpuCredits: standard }
          - !Ref AWS::NoValue
        BlockDeviceMappings:
          - DeviceName: /dev/xvda
            Ebs:
              VolumeType: gp3
              VolumeSize: 40
              Encrypted: true
              DeleteOnTermination: false
        UserData:
          Fn::Base64: |
            #!/bin/bash
            set -euo pipefail
            dnf install -y docker git openssl
            install -d /usr/local/lib/docker/cli-plugins
            tmp="$(mktemp)"
            trap 'rm -f "$tmp"' EXIT
            curl --fail --silent --show-error --location --retry 3 \
              https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64 -o "$tmp"
            echo "dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372  $tmp" | sha256sum --check
            install -m 755 "$tmp" /usr/local/lib/docker/cli-plugins/docker-compose
            curl --fail --silent --show-error --location --retry 3 \
              https://github.com/docker/buildx/releases/download/v0.23.0/buildx-v0.23.0.linux-amd64 -o "$tmp"
            echo "55838fdd095084e158e06a63635a07fe8a8bc6cb4db507f203394dc1ffa7fb8b  $tmp" | sha256sum --check
            install -m 755 "$tmp" /usr/local/lib/docker/cli-plugins/docker-buildx
            systemctl enable --now docker
            docker compose version
            docker buildx version

  AppHost:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !Ref InstanceType
      ImageId: !Ref AmiId
      IamInstanceProfile: !Ref InstanceProfile
      LaunchTemplate:
        LaunchTemplateId: !Ref HostLaunchTemplate
        Version: !GetAtt HostLaunchTemplate.LatestVersionNumber
      NetworkInterfaces:
        - AssociatePublicIpAddress: true
          DeviceIndex: "0"
          GroupSet: [!Ref WebSecurityGroup]
          SubnetId: !Ref PublicSubnetId
      Tags:
        - Key: Name
          Value: !Ref AWS::StackName

  PublicAddress:
    Type: AWS::EC2::EIP
    Properties:
      Domain: vpc
      InstanceId: !Ref AppHost

Outputs:
  InstanceId:
    Value: !Ref AppHost
  PublicIp:
    Value: !Ref PublicAddress
```

## `deploy/aws/compose.ec2.yaml`

Snapshot SHA-256: `e9120f61ae219cae720acb0042405f86225c03954fc229346b89400400b2fd86`.

```yaml
x-finwise-logging: &finwise-logging
  driver: local
  options:
    max-size: "20m"
    max-file: "3"

services:
  mongo:
    logging: *finwise-logging
  redis:
    logging: *finwise-logging
  web:
    logging: *finwise-logging
    networks: [default, edge]
  server:
    logging: *finwise-logging
    environment:
      TRUST_PROXY: "2" # Caddy and nginx are the two ingress proxies.

  worker:
    logging: *finwise-logging
  ai-core:
    logging: *finwise-logging
  caddy:
    logging: *finwise-logging
    image: caddy:2.11.9-alpine
    environment:
      FINWISE_HOST: ${FINWISE_HOST:?Set FINWISE_HOST in the root .env}
      FINWISE_ALIASES: ${FINWISE_ALIASES:-}
    ports:
      - "80:80"
      - "443:443"
    networks: [edge]
    volumes:
      - ./deploy/aws/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      web:
        condition: service_started
    restart: unless-stopped

networks:
  edge:

volumes:
  caddy-data:
  caddy-config:
```

## `deploy/aws/compose.release.yaml`

Snapshot SHA-256: `ad75576a87ac1c8fe1967cc0b0a731916644e88aeafd836e7318946014b3cfbc`.

```yaml
# Overlay for reviewed EC2 releases. The worker uses the exact server image.
services:
  web:
    image: ${COMPOSE_PROJECT_NAME:-finwise}-web:${FINWISE_RELEASE_SHA:?Set FINWISE_RELEASE_SHA}
  server:
    image: ${COMPOSE_PROJECT_NAME:-finwise}-server:${FINWISE_RELEASE_SHA:?Set FINWISE_RELEASE_SHA}
  worker:
    image: ${COMPOSE_PROJECT_NAME:-finwise}-server:${FINWISE_RELEASE_SHA:?Set FINWISE_RELEASE_SHA}
    build: !reset null
  ai-core:
    image: ${COMPOSE_PROJECT_NAME:-finwise}-ai-core:${FINWISE_RELEASE_SHA:?Set FINWISE_RELEASE_SHA}
```

## `deploy/aws/Caddyfile`

Snapshot SHA-256: `dd2452ca9a46aee97397f4d1907c2ab4813bf1344f1bde9de683a2a96c119818`.

```text
{$FINWISE_HOST} {$FINWISE_ALIASES} {
	reverse_proxy web:80
}
```

## `deploy/aws/EC2.md`

Snapshot SHA-256: `fdaff44b173a77d2a61f9f8eb58b23feb1b9373f3b8f0db18c9863526ffa9b6d`.

````markdown
# FinWise on Amazon EC2

This deployment runs the React frontend, Express API, background worker, Python AI Core, MongoDB replica set, and Redis on one Amazon Linux EC2 instance. Caddy terminates HTTPS and sends requests to the existing nginx frontend and API proxy on the same hostname.

AWS Free plan credits can cover eligible infrastructure usage until the credits or plan expire. EC2, EBS, and the public IPv4 address are metered. [AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/)

Use the [production runbook](PRODUCTION_RUNBOOK.md) for release, backup, recovery and maintenance procedures.

## Provision the host

Use the AWS Region assigned to your project. Set `VPC_ID` and `PUBLIC_SUBNET_ID` to a VPC and a subnet with an internet gateway route. A default VPC subnet can be used if one is available. Choose an Availability Zone that offers `m7i-flex.large`, the Free Tier–eligible default for new accounts. [EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html)

```bash
aws sts get-caller-identity
aws cloudformation deploy \
  --stack-name finwise-ec2 \
  --template-file deploy/aws/ec2.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides VpcId="$VPC_ID" PublicSubnetId="$PUBLIC_SUBNET_ID"
aws cloudformation describe-stacks --stack-name finwise-ec2 \
  --query 'Stacks[0].Outputs' --output table
```

The stack outputs `InstanceId` and `PublicIp`. For a free hostname without registration, replace dots in `PublicIp` with hyphens and use `finwise.<dashed-ip>.sslip.io`. A DuckDNS subdomain or an A record for a domain you manage can also point to that IPv4 address. The hostname must resolve to the instance before Caddy can obtain a public certificate. [sslip.io](https://sslip.io/) · [DuckDNS](https://www.duckdns.org/) · [GitHub Student Developer Pack .TECH offer](https://education.github.com/pack) · [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

To serve a second hostname on the same instance, add it to `FINWISE_ALIASES` in the root `.env` and add its HTTPS origin to the comma-separated `CORS_ORIGINS` list. Point the hostname's A record at `PublicIp`. Keep `CLIENT_URL` as the canonical origin for email links and OAuth redirects. Recreate the affected services with the same Compose command below.

## Configure and start FinWise

Open a Session Manager session to the instance from the AWS console. Open a root shell with `sudo -i`, wait for provisioning with `cloud-init status --wait`, and confirm `docker compose version` and `docker buildx version` succeed.

From a fresh checkout of this deployment branch on the instance, create protected environment files. Replace the example hostname in the command with the chosen DNS name.

```bash
export FINWISE_HOST=your-finwise-name.duckdns.org
umask 077
(
  set -e -o noclobber
  cat > .env <<EOF
FINWISE_HOST=$FINWISE_HOST
CLIENT_URL=https://$FINWISE_HOST
CORS_ORIGINS=https://$FINWISE_HOST
JWT_SECRET=$(openssl rand -hex 32)
AI_CORE_INTERNAL_TOKEN=$(openssl rand -hex 32)
WEBHOOK_CREDENTIALS_KEY=$(openssl rand -base64 32)
SERVER_REPLICAS=1
AI_CORE_REPLICAS=1
AI_CORE_MAX_INFLIGHT=2
LLM_PROVIDER=gemini
EOF
  printf 'TASKS_ENABLED=true\n' > server/.env
  touch server/AI_Core/.env
)
```

Supply a Gemini key as `GEMINI_API_KEY` in `server/AI_Core/.env`, or configure the chosen provider there and set `LLM_PROVIDER` in the root `.env`. Add `GNANI_API_KEY` to `server/.env` for live speech. For email registration and password reset, configure the documented SMTP settings in `server/.env` with a verified sender. Alternatively, configure Google OAuth in the root `.env` and authorize `https://<hostname>/api/auth/google/callback` in Google Cloud. Keep third-party provider keys in the protected environment files.

```bash
export COMPOSE_PROJECT_NAME=finwise
export FINWISE_RELEASE_SHA="$(git rev-parse HEAD)"
export COMPOSE_FILE=compose.yaml:deploy/aws/compose.ec2.yaml:deploy/aws/compose.release.yaml
docker compose config --quiet
docker compose build web server ai-core
docker compose up -d --no-build --pull missing --wait --wait-timeout 360
curl -fSI "https://$FINWISE_HOST/"
curl -fsS "https://$FINWISE_HOST/api/python-health"
```

Verify sign-in, a chat reply, live voice, and a file upload with a test account. MongoDB, Redis, and Caddy persist data in Docker volumes on the encrypted root EBS volume. Snapshot the volume before instance replacement. The stack keeps the root EBS volume after instance termination so data can be recovered.
````
