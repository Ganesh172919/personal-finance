# Personal Finance — Observability Runbook

> How to answer "what's slow?" and "what's failing?" within minutes.

---

## Stack

| Layer        | Tool                     | Where                                              |
| ------------ | ------------------------ | -------------------------------------------------- |
| **Logging**  | Pino (structured JSON)   | Stdout / forwarded to log aggregator               |
| **Metrics**  | Prometheus (prom-client) | `GET /api/metrics` (requires `METRICS_TOKEN`)      |
| **Tracing**  | OpenTelemetry            | Auto-instrumented HTTP, Mongo, Redis (OTLP export) |
| **Alerting** | Grafana / PagerDuty      | Built on top of metrics + log queries              |

---

## Quick Start (Local Dev)

### 1. Enable Metrics

```env
# server/.env
METRICS_ENABLED=true
METRICS_TOKEN=my-dev-metrics-token
```

Access metrics:

```bash
curl -H "Authorization: Bearer my-dev-metrics-token" http://localhost:3000/api/metrics
```

### 2. Enable Tracing (optional)

Run a local Jaeger instance:

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

Configure the server:

```env
OTEL_ENDPOINT=http://localhost:4318
```

View traces at: http://localhost:16686

### 3. Health Endpoints

| Endpoint                                  | Purpose                                       |
| ----------------------------------------- | --------------------------------------------- |
| `GET /healthz`                            | Liveness probe (returns `ok`)                 |
| `GET /api/test`                           | Quick connectivity check                      |
| `GET /api/python-health`                  | Python AI Core service health                 |
| `GET /api/metrics`                        | Prometheus metrics (requires `METRICS_TOKEN`) |
| `GET /api/v1/integrations/health-summary` | Connector health summary per org              |

---

## Key Metrics to Monitor

### API Health

| Metric                          | What it tells you                        |
| ------------------------------- | ---------------------------------------- |
| `http_request_duration_seconds` | p50/p95/p99 latency per route            |
| `http_requests_total`           | Request volume + error rates (by status) |
| `http_active_requests`          | Current concurrency                      |

### AI Core

| Metric / Signal                      | What it tells you   |
| ------------------------------------ | ------------------- |
| AI Core circuit breaker open events  | Service degradation |
| `AI_CORE_TIMEOUT_MS` breaches        | Slow AI responses   |
| `AI_CORE_MAX_CONCURRENCY` saturation | Capacity limit hit  |

Circuit breaker config: `AI_CORE_CIRCUIT_FAILURE_THRESHOLD` (default 3), `AI_CORE_CIRCUIT_OPEN_MS` (default 30s), `AI_CORE_HEALTH_CACHE_MS` (default 5s). See [ENV_VARIABLES.md](./ENV_VARIABLES.md) for the full list.

### Business

| Metric                    | What it tells you                 |
| ------------------------- | --------------------------------- |
| `usage_events_total`      | Feature usage volume (by feature) |
| Entitlement 402 responses | Users hitting plan limits         |
| SSE active connections    | Real-time event consumers         |

---

## Dashboard Suggestions (Grafana)

### Row 1: Overview

- **Request Rate** (by status code)
- **p95 Latency** (per endpoint class)
- **Error Rate** (5xx count / total)

### Row 2: AI Core

- **AI Core Health** (circuit breaker state: closed/open/half-open)
- **AI Core Latency** (p50/p95)
- **Concurrent AI Requests**

### Row 3: Background Jobs

- **Queue Depth** (BullMQ waiting + active)
- **Job Completion Rate**
- **Job Failure Rate**

### Row 4: Business

- **SSE Connections** (active)
- **Usage Events** (by feature)
- **402 Responses** (feature limit hits)

---

## Structured Log Queries

### Find errors for a request

```
requestId="<value>" level>=40
```

### Find slow AI calls

```json
{ "msg": "ai_core_request", "duration_ms": { "$gte": 5000 } }
```

### Find quota blocks

```json
{ "code": "FEATURE_LIMIT_REACHED" }
```

---

## Alerting Rules (Example)

| Alert                        | Condition                                | Severity |
| ---------------------------- | ---------------------------------------- | -------- |
| **High Error Rate**          | 5xx rate > 1% of requests over 5 min     | P1       |
| **AI Core Circuit Open**     | Circuit breaker open for > 2 min         | P1       |
| **High Latency**             | p95 > 3s for `/api/v1/chat/*` over 5 min | P2       |
| **Queue Backlog**            | BullMQ waiting jobs > 100 for > 10 min   | P2       |
| **Database Connection Pool** | Connection count > 80% of pool max       | P2       |

---

## Troubleshooting Matrix

| Symptom                    | Check                                                      |
| -------------------------- | ---------------------------------------------------------- |
| All API calls return 503   | AI Core health: `GET /api/python-health`; circuit breaker  |
| Slow transaction listing   | MongoDB index usage (`explain()`); cache invalidation rate |
| SSE drops                  | Connection count vs limit; reverse proxy timeout config    |
| 402 on API key requests    | `GET /api/v1/usage/ledger` — check remaining api_requests  |
| Worker jobs not processing | Redis connectivity; `ASYNC_JOBS_ENABLED=true`; queue name  |
| Metrics endpoint 401       | Verify `METRICS_TOKEN` header matches env var              |

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)
