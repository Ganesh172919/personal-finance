# FinWise on Amazon EC2

This deployment runs the React frontend, Express API, background worker, Python AI Core, MongoDB replica set, and Redis on one Amazon Linux EC2 instance. Caddy terminates HTTPS and sends requests to the existing nginx frontend and API proxy on the same hostname.

AWS Free plan credits can cover eligible infrastructure usage until the credits or plan expire. EC2, EBS, and the public IPv4 address are metered. [AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/)

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
docker compose -f compose.yaml -f deploy/aws/compose.ec2.yaml config --quiet
docker compose -f compose.yaml -f deploy/aws/compose.ec2.yaml up -d --build --wait
curl -fSI "https://$FINWISE_HOST/"
curl -fsS "https://$FINWISE_HOST/api/python-health"
```

Verify sign-in, a chat reply, live voice, and a file upload with a test account. MongoDB, Redis, and Caddy persist data in Docker volumes on the encrypted root EBS volume. Snapshot the volume before instance replacement. The stack keeps the root EBS volume after instance termination so data can be recovered.
