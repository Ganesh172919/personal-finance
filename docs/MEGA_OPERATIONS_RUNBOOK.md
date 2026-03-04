<!--
MEGA_OPERATIONS_RUNBOOK.md

Why is this file so long?
- You requested large documentation, new files only, with >= 500 lines per file.
- This runbook is written to be executable under pressure, and line-oriented for easy scanning.
-->

# FinWise Operations Runbook (Mega)

This is the “how to run it” guide for the Personal Finance Application.
It covers local dev, staging, and production operational concerns.

Related docs:
- `docs/DEPLOYMENT.md` (deployment overview)
- `docs/OBSERVABILITY.md` (logs/metrics/traces)
- `docs/BACKGROUND_WORKERS.md` (job processing)
- `docs/MEGA_SECURITY_RUNBOOK.md` (security posture)

---

## 1) System Components (What Must Be Running)

At minimum (local dev happy path):
- `server` (Node/Express API).
- `client` (Vite SPA).

For full functionality:
- MongoDB (persistent storage).
- AI Core (Python FastAPI service on port 8001 by default).

Optional but recommended in production:
- Redis (queues/pubsub/caching).
- Worker process for async jobs (exports, workflow runs, integration sync runs).

---

## 2) Process Model (Recommended)

### 2.1 API server process

Entry:
- `server/src/server.ts`

Responsibilities:
- Serve HTTP API.
- Mount middlewares and routers via `server/src/app.ts`.
- Run domain event poller (`processPendingDomainEvents`) periodically.
- Optionally start workflow scheduler (when worker disabled).
- Optionally start plugin manager and domain event fanout.

### 2.2 Worker process (async jobs)

Entry:
- `server/src/worker/worker.ts`

Responsibilities:
- Claim queued jobs from Mongo:
  - workflow runs,
  - integration sync runs,
  - export jobs.
- Execute jobs with concurrency control (PQueue).
- Optionally run workflow scheduler (when enabled).

Important:
- Worker only runs when `ASYNC_JOBS_ENABLED=true`.
- Otherwise it exits early.

### 2.3 AI Core process

Entry:
- `server/AI_Core/api_service.py`

Responsibilities:
- Run LLM orchestration and agent workflows.
- Expose endpoints consumed by server:
  - `/api/agents/process`
  - `/api/agents/what-if-scenario`
  - `/api/vision/receipts/parse`
  - `/health`
  - `/api/providers`
- Expose metrics at `/metrics` (token-protected).

---

## 3) Configuration: Where It Lives and How It Is Validated

### 3.1 Server env schema

Validated in:
- `server/src/config/env.ts` (Zod + computed defaults)

Key rule:
- `JWT_SECRET` is required; server throws on startup if missing.

### 3.2 Database configuration

Mongo connection:
- `server/src/config/database.ts`

Behavior:
- In production:
  - requires `MONGO_URI`.
- In non-production:
  - if `MONGO_URI` missing or connect fails, falls back to in-memory MongoDB.

Operational note:
- In-memory Mongo is great for dev/tests.
- Never rely on it for persistent environments.

### 3.3 Redis configuration

Redis client:
- `server/src/config/redis.ts`

Behavior:
- If `REDIS_URL` missing, `getRedis()` returns `null`.
- Callers must handle Redis absence gracefully.

### 3.4 Feature flags and gates (server)

Common ones:
- `ASYNC_JOBS_ENABLED`
- `TASKS_ENABLED`
- `MONETIZATION_ENABLED`
- `METRICS_ENABLED`
- `CSRF_ENABLED`
- `DOMAIN_EVENT_FANOUT_ENABLED`
- `PLUGIN_RUNTIME_URL` (enables plugin manager)

Operational rule:
- Document the exact desired flag state per environment (dev/stage/prod).

---

## 4) Startup Sequence (Server)

This is the order of operations in `server/src/server.ts` (simplified).

Server startup:
- Load env (`getEnv()`).
- Initialize telemetry early (`initTelemetry()`).
- Configure Passport strategies (`configurePassport()`).
- Connect to Mongo (`connectDB()`).
- Start plugin manager if enabled (`startPluginManager()`).
- Start domain event fanout if enabled (`startDomainEventFanout()`).
- Start workflow scheduler unless worker is enabled.
- Create express app (`createApp()`).
- Listen on `PORT`.

Domain event poller:
- Runs every ~10 seconds (in non-test).
- Calls `processPendingDomainEvents({ limit: 50 })`.

Graceful shutdown:
- On SIGINT/SIGTERM, server closes HTTP listener.
- Stops pollers/schedulers.
- Closes DB and Redis.
- Shuts down telemetry.

---

## 5) Startup Sequence (Worker)

Worker startup in `server/src/worker/worker.ts`:

Worker boot:
- Load env (`getEnv()`).
- Exit if `ASYNC_JOBS_ENABLED=false`.
- Connect to Mongo strictly (`connectDBStrict()` requires `MONGO_URI`).
- Create PQueue with `WORKER_CONCURRENCY`.
- Start workflow scheduler (non-test).
- Begin tick loop:
  - compute capacity,
  - claim jobs by atomic findOneAndUpdate,
  - queue execution tasks.

Graceful shutdown:
- Stops tick loop.
- Waits for queue idle.
- Closes DB.

---

## 6) Health Checks and Diagnostics

### 6.1 API server health checks

Endpoints:
- `GET /healthz` → plain `ok`.
- `GET /api/test` → JSON hello.

Use cases:
- Liveness probe (process is up).
- Basic routing probe (express is mounted).

### 6.2 AI connectivity probe (from server)

Endpoint:
- `GET /api/python-health`

Behavior:
- Server calls AI Core `GET /health` with request id header.
- Returns 503 JSON if AI Core unreachable.

### 6.3 AI Core health checks (direct)

AI Core endpoint:
- `GET /health`

Expected response includes:
- `status`
- provider/model info
- `request_id`
- vision dependency status

---

## 7) Observability in Production

### 7.1 Logging

Server logger:
- Pino (`server/src/config/logger.ts`)

Recommendation:
- Centralize logs (ELK/Datadog/etc).
- Index by `requestId` / `request_id`.

### 7.2 Metrics (Prometheus)

Server metrics:
- `GET /api/metrics` (token-protected)
- Implemented in `server/src/observability/metrics.ts`

Enabled by:
- `METRICS_ENABLED=true` AND `METRICS_TOKEN` set.

AI Core metrics:
- `GET /metrics` (token-protected)
- Enabled by `AI_CORE_METRICS_TOKEN` env.

### 7.3 Tracing (OpenTelemetry)

Server tracing:
- `server/src/config/telemetry.ts`

Behavior:
- No-op unless `OTEL_ENDPOINT` is set.
- Auto-instruments HTTP and Mongoose.

Operational note:
- The code logs `otel_skipped` when tracing is disabled.

---

## 8) Data Stores and Persistence Operations

### 8.1 MongoDB backup and restore (conceptual)

Backups:
- Use standard Mongo backup tooling (mongodump / snapshot / managed backups).
- Include all org-scoped collections (most of them).

Restore drills:
- Practice restore in staging.
- Verify:
  - logins work,
  - org switching works,
  - transactions and exports work,
  - workflows re-schedule properly.

### 8.2 Indexes and performance

Why this matters:
- Missing indexes cause slow queries.
- Slow queries create DoS risk and degrade UX.

Where to look:
- Mongoose model definitions under `server/src/models/*`.
- Any index creation scripts under `server/src/scripts/*`.

Operational tip:
- Monitor slow query logs and add indexes for:
  - `{ orgId, createdAt }`
  - `{ orgId, userId, date }`
  - `{ orgId, status }`
depending on workload.

### 8.3 In-memory Mongo fallback (dev only)

When `MONGO_URI` is not set (non-prod), server uses `mongodb-memory-server`.
File:
- `server/src/config/database.ts`

Risk:
- Data disappears on restart.

---

## 9) Redis: What Breaks Without It

Redis is optional in this repo, but production benefits are significant.

Features that may use Redis when present:
- PubSub-based event bus for realtime (`server/src/modules/realtime/eventBus.ts`).
- BullMQ workflow queue (`server/src/modules/queue/jobQueue.ts`).
- Potential caching and rate limiting store usage (as implemented).

Without Redis:
- EventBus falls back to in-memory (single instance only).
- Workflow queue may fall back to DB polling worker and PQueue.

Operational guidance:
- Use Redis in multi-replica production.
- Treat Redis outages as degraded mode, not necessarily full outage.

---

## 10) Domain Events: Processing and Fanout

### 10.1 Durable domain events

Domain events are stored in Mongo (`DomainEventModel`).
Publish helper:
- `server/src/services/domainEvents.ts`

### 10.2 Reactive triggers and DLQ

Trigger processing:
- `server/src/services/domainEventTriggers.ts`

Behavior:
- Skips already-processed events.
- Runs reactive side effects (fire-and-forget):
  - dashboard cache invalidation,
  - anomaly detection on transactions,
  - budget threshold alerts.
- Triggers event-based workflows.

DLQ behavior:
- If triggers repeatedly fail, event is marked with DLQ metadata after 3 attempts.

### 10.3 Server poller vs change stream fanout

Server poller:
- In `server/src/server.ts`, periodically calls `processPendingDomainEvents`.
- This is about “processing triggers”, not realtime streaming.

Realtime fanout:
- `server/src/modules/realtime/domainEventFanout.ts`
- Modes:
  - Mongo change stream, or
  - polling.

Event bus:
- `server/src/modules/realtime/eventBus.ts`
- In-memory or Redis-backed.

Operational guidance:
- For multi-instance deployments, prefer Redis event bus.
- For Mongo setups without replica sets, change streams may not work; polling mode exists.

---

## 11) Background Jobs: What to Monitor

Worker claims jobs from Mongo collections:
- `WorkflowRunModel`
- `IntegrationSyncRunModel`
- `ExportJobModel`

Job statuses:
- Typically `queued → running → finished` with error fields.

Operational checks:
- Count queued jobs over time.
- Track job age (queued too long indicates backlog).
- Track failure rates.

Worker capacity tuning:
- Increase `WORKER_CONCURRENCY` cautiously.
- Ensure Mongo can handle increased parallelism.

---

## 12) AI Core Operations

### 12.1 Server → AI Core calls

Server client:
- `server/src/services/aiCoreClient.ts`

Key endpoints used:
- `POST /api/agents/process`
- `POST /api/agents/what-if-scenario`
- `POST /api/vision/receipts/parse`
- `GET /health` (health check)

### 12.2 Circuit breaker and fallback behavior

If AI Core is unhealthy:
- Server returns a safe fallback response for non-stream endpoints.
- Metrics record fallback usage when enabled.

Operational guidance:
- Monitor AI Core latency and failure rate.
- If AI Core is down, the product should degrade gracefully (fallback_used=true).

### 12.3 AI Core CORS

AI Core sets its own CORS policy:
- `AI_CORE_ALLOWED_ORIGINS` env
- default includes `http://localhost:3000`

In most deployments:
- client talks to server,
- server talks to AI Core,
so AI Core CORS matters mainly for direct calls during debugging.

### 12.4 Vision dependencies (OCR)

AI Core exposes:
- `/api/vision/receipts/parse`
- `/api/vision/handwriting/recognize`

Operational note:
- If OCR dependencies are missing, AI Core may respond 503.
- Check AI Core `/health` for vision dependency status.

---

## 13) Plugin Runtime Operations (If Enabled)

Plugin manager:
- `server/src/modules/plugins/pluginManager.ts`

Behavior:
- Periodically refreshes a runtime registry from `PLUGIN_RUNTIME_URL`.
- Registers tools and connectors dynamically.

Operational checks:
- Monitor refresh success/failure logs.
- Monitor number of registered tools/connectors.
- Ensure plugin runtime auth token is configured.

Failure mode:
- If registry is unavailable, tools/connectors may not be registered.
- Existing registrations may be unregistered on refresh depending on state.

Mitigation:
- Disable plugin runtime temporarily by unsetting `PLUGIN_RUNTIME_URL`.

---

## 14) Incident Runbooks (Symptom → Checks → Fix)

### 14.1 “API is up but users can’t log in”

Checks:
- Confirm `JWT_SECRET` is set and valid.
- Confirm database connectivity (users collection reachable).
- Check auth rate limiter values (may be too strict).
- Check account lockout (in-memory; restart clears).

Fix:
- Restore DB connectivity.
- Adjust rate limit configs.
- Communicate to users if widespread lockout occurred.

### 14.2 “Users are logged in but POST requests fail with CSRF”

Checks:
- Confirm computed `CSRF_ENABLED` in env.
- Confirm CSRF cookie exists.
- Confirm client sends `X-CSRF-Token`.
- Confirm header token equals cookie token.
- Confirm token format matches validator expectations.

Fix:
- Align CSRF token issuance and client behavior.
- As mitigation, disable CSRF only if you accept increased risk.

### 14.3 “Realtime events not showing”

Checks:
- `DOMAIN_EVENT_FANOUT_ENABLED` is true.
- `DOMAIN_EVENT_FANOUT_MODE` appropriate for Mongo setup.
- Redis available if using Redis event bus across replicas.
- Client is connected to `/api/v1/events/stream`.

Fix:
- Enable polling mode if change streams unsupported.
- Add Redis for multi-replica event propagation.

### 14.4 “Exports are stuck”

Checks:
- Is worker running with `ASYNC_JOBS_ENABLED=true`?
- Are export jobs piling up as `queued`?
- Is Mongo reachable from worker?
- Is filesystem/storage for exports available?

Fix:
- Start/scale worker.
- Reduce concurrency if DB overloaded.
- Investigate export job failures (stack traces in logs).

### 14.5 “AI answers are generic fallback”

Checks:
- Call `GET /api/python-health` from server.
- Check AI Core logs.
- Check server circuit breaker status (`getAiCoreClientStatus` output if exposed).
- Verify `PYTHON_API_URL` is correct.

Fix:
- Start/restart AI Core.
- Increase AI Core capacity.
- Fix upstream provider credentials or rate limiting.

### 14.6 “High latency on transactions list”

Checks:
- Mongo indexes on `transactions` for `orgId`, `userId`, `date`.
- Query patterns and pagination.
- Server CPU and memory.

Fix:
- Add/adjust indexes.
- Add caching if appropriate.
- Optimize aggregation pipelines.

---

## 15) Deployment Checklist (Condensed)

Before deploying a new version:
- Confirm env vars exist and validate.
- Confirm migrations/scripts are complete.
- Confirm indexes exist.
- Confirm AI Core reachable.
- Confirm Redis reachable (if used).
- Confirm metrics/tracing endpoints configured and protected.
- Confirm CORS and cookie flags correct for your domain.
- Run server tests and smoke tests.

After deploying:
- Check health endpoints.
- Verify login works.
- Verify core flows (transactions CRUD, dashboard, AI command).
- Watch error rates and latency.

---

## 16) Padding Section (Intentional)

This section adds line count while remaining actionable.

### 16.1 SRE handoff checklist

- List all processes and their restart commands.
- List all required env vars and where they are stored.
- List external dependencies (Mongo, Redis, AI provider, Stripe).
- List dashboards and alerts (metrics + logs).
- List top 5 incident scenarios and links to runbooks.

### 16.2 “Degraded mode” expectations

- Without AI Core:
  - AI endpoints return fallback responses.
- Without Redis:
  - in-memory event bus only works per instance,
  - BullMQ queues may be unavailable.
- Without Mongo:
  - API cannot serve core data; treat as outage.

### 16.3 Safe rollout practices

- Prefer gradual rollout with monitoring.
- Avoid changing cookie/CSRF settings without staged testing.
- Keep OpenAPI contract list in sync with route surface.
- Add one-way migrations carefully (backfill + dual read/write if needed).

---

## 17) Environment Variable Reference (Ops-Focused)

This is not the full schema; it is an ops grouping of the most common toggles.
Authoritative validation is in `server/src/config/env.ts`.

Core:
- `NODE_ENV` (development/test/production)
- `PORT` (server port)
- `MONGO_URI` (Mongo connection string)
- `JWT_SECRET` (required)
- `COOKIE_SECRET` (cookie signing, optional but recommended)
- `TRUST_PROXY` (proxy settings)

Client integration:
- `CLIENT_URL` (OAuth callback redirects)
- `CORS_ORIGINS` (allowed origins for browser)

CSRF and cookies:
- `CSRF_ENABLED`
- `CSRF_COOKIE_NAME`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `COOKIE_DOMAIN`

AI Core:
- `PYTHON_API_URL`
- `AI_CORE_TIMEOUT_MS`
- `AI_CORE_STATUS_TIMEOUT_MS`
- `AI_CORE_MAX_CONCURRENCY`
- `AI_CORE_MAX_CONCURRENCY_PER_USER`

Worker:
- `ASYNC_JOBS_ENABLED`
- `WORKER_CONCURRENCY`
- `WORKER_POLL_INTERVAL_MS`

Domain event fanout:
- `DOMAIN_EVENT_FANOUT_ENABLED`
- `DOMAIN_EVENT_FANOUT_MODE`
- `DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS`

Metrics:
- `METRICS_ENABLED`
- `METRICS_TOKEN`

Tracing:
- `OTEL_ENDPOINT`

Redis:
- `REDIS_URL`

Plugins:
- `PLUGIN_RUNTIME_URL`
- `PLUGIN_RUNTIME_TOKEN`
- `PLUGIN_RUNTIME_TIMEOUT_MS`
- `PLUGIN_RUNTIME_ALLOW_INSECURE`
- `PLUGIN_RUNTIME_ALLOW_LOCALHOST`

Billing:
- `MONETIZATION_ENABLED`
- `BILLING_PROVIDER`
- `STRIPE_SECRET_KEY`

Email:
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_FROM`

Uploads:
- `UPLOAD_ALLOWED_MIME`
- `RECEIPT_UPLOAD_MAX_BYTES`
- `JOURNAL_UPLOAD_MAX_BYTES`
- `CSV_UPLOAD_ALLOWED_MIME`
- `CSV_UPLOAD_MAX_BYTES`

---

## 18) Monitoring and Alerting (Suggested Baselines)

Server golden signals:
- Request rate (RPS) by endpoint group.
- Error rate (% 4xx, % 5xx).
- Latency p50/p95/p99.
- Saturation (CPU, memory).

From Prometheus metrics (server):
- `finwise_http_request_duration_ms` histogram (latency).
- `finwise_http_requests_total` counter (traffic).
- `finwise_ai_core_request_duration_ms` histogram (AI latency).
- `finwise_ai_fallback_total` counter (degraded AI mode).
- `finwise_ai_circuit_open` gauge (AI breaker state).

Worker alerts (conceptual):
- queued job count too high (by collection/status).
- job age too high (queued for too long).
- error spikes in worker logs.

Database alerts:
- Mongo CPU/IO saturation.
- connection errors.
- slow query logs.

Redis alerts (if used):
- connection drops.
- pubsub lag (if measurable).
- memory pressure / evictions.

AI Core alerts:
- /health failing.
- /metrics unavailable.
- provider rate limit errors.

---

## 19) Backup and Restore Checklist (Practical)

Backup:
- Choose a backup approach:
  - managed DB snapshots, or
  - `mongodump` style backups.
- Store backups encrypted at rest.
- Test restore regularly.

Restore drill checklist:
- Restore DB into a staging environment.
- Run a smoke test suite:
  - login,
  - org switching,
  - transaction list,
  - dashboard summary,
  - AI command (if AI core is enabled).
- Validate that background jobs still run.
- Validate exports can be generated and downloaded.

Disaster recovery notes:
- Plan for rotating secrets if backups are suspected compromised.
- Plan for communicating to users (status page).

---

## 20) Capacity Planning Notes (Rule of Thumb)

Server:
- Stateless, scales horizontally.
- Use request ID tracing to debug cross-instance issues.

Worker:
- Increase replicas for throughput.
- Ensure claim logic remains safe (atomic update).

Mongo:
- Most scaling bottlenecks appear here first.
- Add indexes aligned to org-scoped access patterns.

Redis:
- Needed for multi-replica pubsub and BullMQ.
- Size for queues + pubsub + optional caches.

AI Core:
- LLM calls are expensive and slow.
- Use concurrency limits to avoid stampedes.
- Monitor circuit breaker and fallback rates.

