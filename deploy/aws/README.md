# Deploying FinWise to AWS (ECS Fargate, AWS CLI only)

For a single-host deployment with MongoDB, Redis and HTTPS on AWS, see [FinWise on EC2](EC2.md).

`finwise.yaml` creates: ECS cluster, four Fargate services (web, server, worker, ai-core), an ALB
(`/api/*` -> server, everything else -> web), Cloud Map DNS (`ai-core.finwise.local`), ElastiCache
Redis, log group, CPU autoscaling for server and ai-core, and rollback-on-failure deployments.

**Not created:** MongoDB. Use MongoDB Atlas (or another managed Mongo 7) and put its URI in the secret.

> Status: the template and script were linted locally (references resolve, YAML/bash parse) but have
> not been run against a live AWS account. Run the first deploy in a non-production account.

## 1. One-time setup

```bash
aws secretsmanager create-secret --name finwise/prod --secret-string "$(cat <<JSON
{
  "JWT_SECRET": "<32+ random chars>",
  "AI_CORE_INTERNAL_TOKEN": "<32+ random chars>",
  "WEBHOOK_CREDENTIALS_KEY": "<node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\">",
  "MONGO_URI": "mongodb+srv://...",
  "GEMINI_API_KEYS": "key1,key2"
}
JSON
)"
```

The default Gemini deployment requires the five keys shown. For Groq, set `LLM_PROVIDER=groq` and provide `GROQ_API_KEY` in place of `GEMINI_API_KEYS`. Set `LLM_MODEL` to override the selected provider's default.

For Bharat Voice and chat dictation, set `ENABLE_GNANI_SPEECH=true` and add `GNANI_API_KEY` to the same secret. The gateway receives the key when speech is enabled.

### Optional: Google sign-in

Add two more keys to the same secret, then deploy with `ENABLE_GOOGLE_AUTH=true`:

```bash
aws secretsmanager update-secret --secret-id finwise/prod --secret-string "$(...existing JSON plus...)"
#   "GOOGLE_CLIENT_ID": "<id>.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "<secret>"
```

With `EnableGoogleAuth=true` (template parameter, default `false`) the server task receives both secrets and
`GOOGLE_CALLBACK_URL=${PublicUrl}/api/auth/google/callback`. Because ECS fails task start when a referenced secret
key is missing, the keys are only wired in when you opt in. In Google Cloud Console add that exact URL
(`PublicUrl` without a trailing slash, HTTPS) to the OAuth client's **Authorized redirect URIs**.

## 2. Deploy

```bash
export AWS_REGION=ap-south-1 STACK=finwise-prod
export VPC_ID=vpc-... PUBLIC_SUBNETS=subnet-a,subnet-b TASK_SUBNETS=subnet-c,subnet-d
export APP_SECRET_ARN=arn:aws:secretsmanager:...:secret:finwise/prod-XXXX
export PUBLIC_URL=https://app.example.com CERTIFICATE_ARN=arn:aws:acm:...   # certificate optional
export ENABLE_GOOGLE_AUTH=true   # optional, see "Optional: Google sign-in" above
deploy/aws/deploy.sh
```

The script creates ECR repositories and pushes `web`, `server`, and `ai-core` with one release tag. The default tag combines the Git SHA and UTC timestamp. Keep that tag and the provider settings with the release record. Point DNS at the reported `AlbDnsName`.

To redeploy a previous release, run `DEPLOY_EXISTING_IMAGES=true IMAGE_TAG=<previous release tag> deploy/aws/deploy.sh` with its original configuration. The script verifies that all three images exist and deploys those tags without rebuilding or pushing. ECS also rolls back failed task deployments through its deployment circuit breaker.

## 3. Capacity and limits to know about

- **LLM budget is per AI Core task.** The token bucket (`LLM_RPM`) and the LLM cache's local LRU are
  per process; the Redis cache is shared. Keep `AiCoreMaxCount * LlmRpm` within the provider quota.
- **AI Core memory/session/checkpoint state now uses MongoDB** via `AI_CORE_MONGO_URI` (falls back to
  `MONGO_URI`), so replaced or additional AI Core tasks share state.
- Load shedding: each AI Core task admits `AI_CORE_MAX_INFLIGHT` heavy requests and answers `503` +
  `Retry-After` beyond that; the gateway queue and retries absorb the burst.
- Graceful drain: SIGTERM flips `/ready` (AI Core) and `/readyz` (server) to 503, then waits for
  in-flight work (`stopTimeout` 60-70s) before exit.
- Redis is a single node (no failover); it holds only cache, locks and counters, all rebuildable.
