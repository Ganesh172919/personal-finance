---
title: "FinWise — Capacity Model, SLOs and Incident Runbook"
description: "Sizing target, SLOs, Prometheus alerts, and operational failure runbooks"
quadrant: reference
audience: [operator, developer]
owner: "@platform-team"
status: reviewed
last_reviewed: 2026-11-08
review_every_days: 90
---

# FinWise — Capacity Model, SLOs and Incident Runbook

> Sizing target: **~150 concurrent users, ~50 rps nominal (~100 rps at 2x peak), ~75 AI requests/min nominal (~225/min at 3x burst)**.
> Everything in this file is a **model plus a test harness**. Nothing here was measured against a running stack by the author:
> no container, k6, Prometheus, or Grafana was executed while writing it. Treat the numbers as hypotheses to confirm with
> `loadtest/k6` (see [loadtest/k6/README.md](../loadtest/k6/README.md)) before relying on them.

Related: [OBSERVABILITY.md](./OBSERVABILITY.md) (metrics catalogue), [DEPLOYMENT.md](./DEPLOYMENT.md),
[deploy/observability/README.md](../deploy/observability/README.md) (Prometheus rules and Grafana),
[deploy/aws/README.md](../deploy/aws/README.md).

---

## 1. Service level objectives

| SLO | Target | Measured by | Alert |
| :-- | :-- | :-- | :-- |
| Non-LLM API availability | 99.5% (non-5xx / all, excluding AI routes) | `finwise_http_requests_total` | `FinwiseApiAvailability{Fast,Medium,Slow}Burn` |
| Non-LLM API latency | p95 < 300 ms | `finwise_http_request_duration_ms` | `FinwiseApiLatencyP95High` |
| AI success | 98% (a deterministic fallback counts as success) | gateway AI request metrics | `FinwiseAiSuccess{Fast,Medium}Burn` |
| AI deterministic path latency | p95 < 4 s | k6 `finwise_ai_duration{ai_kind:det}` only | none (no server-side split) |
| AI LLM path latency | p95 < 20 s | k6 `finwise_ai_duration{ai_kind:llm}`; server-side combined p95 | `FinwiseAiLatencyP95High` |
| First-token latency | p95 < 2.5 s | **not measured** (core k6 cannot read SSE incrementally) | none |
| AI shed rate | < 0.5% under nominal load | `finwise_ai_gateway_shed_total`, `finwise_ai_core_shed_total` | `FinwiseAiShedRateHigh` |

Burn-rate alerts are multi-window multi-burn-rate (14.4x over 1h+5m, 6x over 6h+30m, 3x over 1d+6h) and are defined in
`deploy/observability/prometheus-rules.yml`. Alert `runbook_url` annotations point at the anchors below.

Known measurement gaps (honest list): the deterministic-vs-LLM split exists only in k6 prompts, not in gateway metrics;
first-token latency has no instrument; the SLI recording rules were never run through `promtool`.

---

## 2. Capacity model

### 2.1 Gateway (Express)

| Resource | Sizing | Why |
| :-- | :-- | :-- |
| Replicas | 3 x 2 vCPU | 100 rps peak is ~33 rps/replica; CPU headroom for JSON, Zod, Mongoose |
| Mongo pool | `MONGO_MAX_POOL_SIZE=30` per replica (**default is 20**) -> 90 total | Check Atlas/DocumentDB connection limits; total = replicas x pool |
| Redis | ~500 ops/s | rate-limit counters, caches, LLM cache; falls back when absent (see [Redis down](#redis-down)) |
| SSE streams | ~225 held (150 users, event stream + AI stream overlap) | nginx `worker_connections 4096`, 3600 s stream timeouts |
| AI admission | `AI_MAX_CONCURRENCY=24` per replica (**default is 8**), `AI_QUEUE_MAX=50`, per-user cap 2 (`AI_CORE_MAX_CONCURRENCY_PER_USER`) | bounded queue sheds with `Retry-After` instead of piling up |

### 2.2 AI Core

By Little's law, in-flight AI requests = arrival rate x time in system. At the 3x burst (225/min = 3.75/s) and a mean of
~6 s that is ~24 in flight; the plan sizes **48 slots** for headroom.

Slots per process = `AI_CORE_MAX_INFLIGHT` (default 6). Total slots = replicas x uvicorn workers x slots per process.

> **Gap to the plan:** `server/AI_Core/Dockerfile` starts a **single** uvicorn process and `compose.yaml` defaults to
> `AI_CORE_REPLICAS=1`, so the shipped default is **6 slots**, not 48. Reach 48 either with 8 replicas, or with
> 2 replicas x 4 workers (needs `--workers 4` in the Dockerfile `CMD`; not changed here because the image is owned by
> another workstream). Remember the LLM token bucket and cache are **per process**, so each worker is its own quota.

### 2.3 LLM quota

Free tier is ~15 RPM per key (`LLM_RPM`, default 15, per process). Not every AI request calls the LLM.

| Scenario | AI requests/min | LLM calls/min (assumed ~60% of AI requests) | Keys needed at 15 RPM |
| :-- | :-- | :-- | :-- |
| Nominal | 75 | ~45 | 3 |
| 3x burst | 225 | ~135 | 9 |

Cache hits and request coalescing reduce this; the deterministic fallback absorbs the rest (it counts as AI success, so
quota exhaustion degrades quality, not availability). Set `LLM_RPM` to `provider RPM / processes sharing the key`.

### 2.4 Capacity estimate in the app

`summaryCapacityService` reports configured ceilings and, once enough samples exist, a measured Little's-law estimate.
Tune with: `CAPACITY_MAX_SESSIONS_REDIS` (350), `CAPACITY_MAX_SESSIONS_LOCAL` (100), `CAPACITY_RPS_REDIS` (120),
`CAPACITY_RPS_LOCAL` (35), `CAPACITY_SATURATED_LATENCY_MS` (3000), `CAPACITY_BENCHMARK_PASS_RPS` (50),
`CAPACITY_MIN_MEASURED_SAMPLES` (20). Invalid or non-positive values fall back to the default.

---

## 3. Verifying the model

| Test | Command | What it proves |
| :-- | :-- | :-- |
| Smoke (CI gate) | `k6 run loadtest/k6/smoke.js` | stack boots, auth + read/write/AI paths work |
| Load | `k6 run loadtest/k6/load.js` | 150 VUs, 2 min ramp, 10 min hold, SLO thresholds |
| Spike | `k6 run loadtest/k6/spike.js` | 3x burst: shed stays bounded, no non-AI failures |
| SSE soak | `k6 run loadtest/k6/soak-sse.js` | ~250 held streams, API probe stays under SLO |
| Chaos | `loadtest/k6/chaos.sh` / `chaos.ps1` | a killed replica is replaced and healthy within 30 s |

Run with the mock LLM override (`docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml up -d --wait`). This
measures the platform, not provider latency. The default k6 AI share is a stress mix; use `K6_MIX=82,15,2,1` to reproduce
the plan's AI rate. One machine running both stack and load generator is pessimistic: only trends are meaningful.
The `Nightly Load` workflow runs the same suites on a schedule.

---

<a id="runbook"></a>
## 4. Incident runbook

First look (60 seconds): Grafana dashboard `FinWise SLO and AI Platform` (uid `finwise-slo`) (`deploy/observability/grafana-dashboard.json`), then
`FinwiseTargetDown`, then the burn-rate alert that fired. Use the request id: nginx logs `rid=`, the gateway echoes
`X-Request-Id`, and AI Core logs the same id and `traceparent`, so one id follows a request edge to LLM.

Quick triage: `GET /api/test` (edge + gateway), `GET /api/python-health` (gateway -> AI Core). Note `/healthz` and `/readyz` are
**not** proxied by nginx; probe the gateway container directly.

<a id="shed"></a>
### 4.1 AI requests are being shed (429/503 with Retry-After)

Alerts: `FinwiseAiShedRateHigh`, `FinwiseAiCoreShedding`.

1. Which layer sheds? `finwise_ai_gateway_shed_total{reason}` (`queue_full`, `queue_timeout`, `user_queue_full`,
   `evicted`) is the gateway; `finwise_ai_core_shed_total` is AI Core's work gate. Both gauges: `finwise_ai_gateway_in_flight`,
   `finwise_ai_core_inflight`.
2. Gateway sheds, AI Core idle: gateway cap too low. Raise `AI_MAX_CONCURRENCY` (default 8, plan 24).
3. AI Core sheds: out of slots. Add replicas/workers (section 2.2), or raise `AI_CORE_MAX_INFLIGHT` if CPU allows. The gateway
   retries a shed once, waiting at most `AI_CORE_RETRY_AFTER_MAX_MS` (5 s).
4. `user_queue_full` for one user: a client loop or a stuck script; per-user caps are working as designed.
5. Slow LLM keeping slots busy: see [LLM quota](#llm-quota). Never use `LLM_PROVIDER=mock` in production as a stopgap (it returns a canned
   reply); shed or reduce load instead.

<a id="breaker-open"></a>
### 4.2 AI circuit breaker is open

Alerts: `FinwiseAiCircuitOpen`, `FinwiseAiCircuitFlapping`. Gauges: `finwise_ai_circuit_state` (0 closed, 1 half-open, 2 open),
`finwise_ai_consecutive_failures`.

The gateway opens after `AI_CORE_CIRCUIT_FAILURE_THRESHOLD` (3) consecutive failures for `AI_CORE_CIRCUIT_OPEN_MS` (30 s),
then half-opens with a probe. While open, users get the deterministic/fallback path, so this is degradation, not an outage.

1. `GET /api/python-health` from the gateway. If AI Core is down: check its container health, OOM (`docker inspect`), and logs.
2. AI Core up but slow: check `finwise_ai_core_request_duration_ms` (select `job="finwise-ai-core"`; the gateway exports the same
   metric name with different labels, select by `job`) and the sections 4.1 / 4.3.
3. Flapping: threshold is too tight for the load, or one replica is unhealthy and half the probes fail. Remove the bad replica first.
4. Do not raise the threshold to silence the alert before finding the failing dependency.

<a id="llm-quota"></a>
### 4.3 LLM provider quota exhausted

Alerts: `FinwiseLlmProviderQuota` (upstream 429, `finwise_ai_core_llm_provider_429_total`), `FinwiseLlmLocalRateLimited`
(own token bucket, `finwise_ai_core_llm_rate_limited_total`).

1. Local limiter firing: demand exceeds `LLM_RPM x processes`. Confirm `LLM_RPM` equals provider RPM divided by processes sharing the key.
2. Provider 429s: add keys to the KeyPool (see [AI_PROVIDERS_AND_FAILOVER.md](./AI_PROVIDERS_AND_FAILOVER.md)) or move to a paid tier.
3. Users keep working: requests fail fast to the deterministic fallback (`finwise_ai_core_fallback_total`), and identical low-temperature
   prompts are served from the LLM cache (`finwise_ai_core_llm_cache_total`). Expect lower answer quality, not errors.
4. Daily quotas (RPD) reset on the provider's schedule; there is no fix other than capacity.

<a id="redis-down"></a>
### 4.4 Redis is down

Alert: `FinwiseRedisDown` (`finwise_redis_up == 0`; the series is absent when `REDIS_URL` is unset).

What happens (from `server/src/config/rateLimitStore.ts`, `redis.ts`, and AI Core `llm_cache.py`):

- **Rate limits** fall back to per-process in-memory counters after a 250 ms command timeout, then retry Redis every 10 s.
  The gateway logs `rate_limit_store_fallback` (alert=true) once, and `rate_limit_store_recovered` on return. Effective limits
  become `limit x replicas` until recovery.
- **Cache helpers** (`cacheGet`/`cacheSet`) turn into misses/no-ops; more reads hit Mongo.
- **AI Core LLM cache** degrades to its in-process LRU and trips a short circuit so a dead Redis adds no latency.
- Requests keep succeeding; expect higher Mongo load and slightly higher latency.

**Caveat (read from the code, not tested):** the gateway Redis client gives up reconnecting after 5 retries
(`retryStrategy` returns `null`; backoff 200+400+600+800+1000 ms is about 3 s in total). After a longer outage the client may stay disconnected even
though Redis is healthy again. If `finwise_redis_up` stays 0 after Redis recovered, **restart the gateway replicas** (rolling).

### 4.5 Gateway errors or latency (non-LLM)

Alerts: `FinwiseApiAvailability*Burn`, `FinwiseApiLatencyP95High`.

1. Split by `path` (normalised; ids become `:id`) and `status` in `finwise_http_requests_total`.
2. Mongo pool pressure (`FinwiseMongoPoolPressure`, `FinwiseMongoCheckoutFailures`): raise `MONGO_MAX_POOL_SIZE`, find slow queries.
   Those pool gauges only report once `attachMongoPoolMetrics` is wired (see [OBSERVABILITY.md](./OBSERVABILITY.md#defined-but-unwired)).
3. nginx 429s: edge `limit_req` zones (`finwise_api` 200 r/s, burst 400; `finwise_auth` 10 r/s, burst 20) in `client/nginx.conf`.
4. nginx 502/504: replica restarting; nginx retries `error timeout http_503` for idempotent requests only (POST/PATCH are not retried
   once sent). Docker DNS is re-resolved every 10 s, so a replaced container is picked up without an nginx reload.

### 4.6 SSE connections near capacity

Alert: `FinwiseSseNearCapacity` (`finwise_sse_connections`). Check nginx `worker_connections` (4096) and file descriptor limits, then
add gateway replicas. Streams are long-lived (3600 s timeouts); a deploy drops them and clients reconnect.

<a id="mongo-failover"></a>
### 4.7 MongoDB primary failover

The stack expects a replica set (`rs0`). During an election (typically seconds) writes fail and the driver retries once; expect a
short burst of 5xx and `FinwiseMongoCheckoutFailures`. Reads on the primary pause too.

1. `rs.status()` on a member: confirm a new PRIMARY exists and all members are healthy.
2. If no primary (lost quorum), restore a majority first; the apps cannot fix this.
3. After recovery the driver reconnects on its own; restart a gateway/worker only if it stays unhealthy.
4. Async jobs are claimed atomically, and the worker sweeps stale `running` jobs at start-up and every 5 minutes (see `server/src/worker/worker.ts`). Check the DLQ
   (`finwise_dlq_size`, once wired) before replaying with the DLQ script in [MEGA_OPERATIONS_RUNBOOK.md](./MEGA_OPERATIONS_RUNBOOK.md).

### 4.8 Rollback

- **Compose:** check out the previous git SHA, `docker compose build`, then `docker compose up -d --no-deps server ai-core web`
  (and `worker`). Compose `restart: unless-stopped` + health checks hold traffic until `/readyz` passes.
- **ECS (deploy/aws):** re-run `deploy.sh` with `IMAGE_TAG=<previous sha>`. Images are immutable per SHA, and the ECS deployment
  circuit breaker rolls back failed deployments automatically.
- **Kubernetes (deploy/k8s, optional):** `kubectl rollout undo deployment/finwise-server` (and `finwise-ai-core`).
- Data: there are no automatic down-migrations; roll code back only to versions compatible with the current schema, and keep a Mongo backup
  from before each release.
- Worker: run **one** worker replica. Job claims are atomic, but the workflow scheduler tick is not leader-elected.

---

## 5. Environment variables referenced here

`MONGO_MAX_POOL_SIZE`, `AI_MAX_CONCURRENCY`, `AI_QUEUE_MAX`, `AI_QUEUE_MAX_PER_USER`, `AI_QUEUE_MAX_WAIT_MS`,
`AI_CORE_MAX_CONCURRENCY_PER_USER`, `AI_CORE_CIRCUIT_FAILURE_THRESHOLD`, `AI_CORE_CIRCUIT_OPEN_MS`, `AI_CORE_RETRY_AFTER_MAX_MS`,
`AI_CORE_MAX_INFLIGHT`, `LLM_RPM`, `LLM_BURST`, `LLM_CACHE_ENABLED`, `LLM_PROVIDER` (`mock` for tests), `LLM_MOCK_LATENCY_MS`,
`METRICS_ENABLED`, `METRICS_TOKEN`, `AI_CORE_METRICS_TOKEN`, `CAPACITY_*` (section 2.4). Full list: [ENV_VARIABLES.md](./ENV_VARIABLES.md).
