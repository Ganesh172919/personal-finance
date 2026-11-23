# Deployment source snapshot

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

This appendix preserves selected version-controlled files from release-branch commit `f1ed41a5fdf5ba354ebfda199c0e69cebda1f369`.
It is a historical reference; compare against the current files before using commands or configuration.
The example environment files contain placeholders and defaults, not the live secret values.

**Scope:** These monitoring and load-test definitions do not prove those optional services are deployed in production.

## `deploy/observability/compose.observability.yaml`

Snapshot SHA-256: `ce48d8fa228c46a8536f106488f498fd05000e5f90ae87542ad675b17a4ad28e`.

```yaml
# Optional overlay: Prometheus + Grafana next to the FinWise stack (local / staging).
#
#   mkdir -p deploy/observability/secrets
#   printf '%s' "$METRICS_TOKEN" > deploy/observability/secrets/server_metrics_token
#   printf '%s' "$METRICS_TOKEN" > deploy/observability/secrets/ai_core_metrics_token
#   METRICS_ENABLED=true AI_CORE_METRICS_TOKEN=$METRICS_TOKEN \
#     docker compose -f compose.yaml -f deploy/observability/compose.observability.yaml up -d --wait
#
# Prometheus: http://127.0.0.1:9090   Grafana: http://127.0.0.1:3001 (admin / GRAFANA_ADMIN_PASSWORD)
# Import deploy/observability/grafana-dashboard.json in Grafana (Dashboards > Import) and
# add the Prometheus data source http://prometheus:9090.
# The secrets directory holds tokens: keep it out of git (see .gitignore note in
# deploy/observability/README.md). Not exercised against real containers by the author.
services:
  prometheus:
    image: prom/prometheus:v2.55.1
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d
    volumes:
      - ./deploy/observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./deploy/observability/prometheus-rules.yml:/etc/prometheus/finwise.rules.yml:ro
      - ./deploy/observability/secrets:/etc/prometheus/secrets:ro
      - prometheus-data:/prometheus
    ports:
      - "127.0.0.1:9090:9090"
    depends_on:
      - server
      - ai-core
    restart: unless-stopped

  grafana:
    image: grafana/grafana:11.3.0
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?Set GRAFANA_ADMIN_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_SERVER_HTTP_PORT: "3001"
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "127.0.0.1:3001:3001"
    depends_on:
      - prometheus
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

## `deploy/observability/prometheus.yml`

Snapshot SHA-256: `1ce1cf79e4dd0f0f0514e763b2a6659ac7d1df94bdb5122274261372c8f91cd0`.

```yaml
# Example Prometheus configuration for FinWise (copy and adapt; not used by compose.yaml).
#
# Scrape the replicas DIRECTLY. The edge (client/nginx.conf) returns 404 for
# /api/metrics on purpose, and each gateway/AI Core replica is its own target.
#
# Requirements on the FinWise side:
#   gateway : METRICS_ENABLED=true and METRICS_TOKEN=<token>      (GET /api/metrics, port 3000)
#   AI Core : AI_CORE_METRICS_TOKEN=<token>                       (GET /metrics,     port 8001)
# Put the tokens in files readable by Prometheus (never inline them in this file).
# compose's overlay (deploy/observability/compose.observability.yaml) shows the wiring.
#
# Service discovery: in docker compose the service name `server` / `ai-core`
# resolves to one A record per replica, so dns_sd_configs sees every replica and
# picks up scale-outs. On Kubernetes use kubernetes_sd_configs (see deploy/k8s/)
# and on ECS use the ECS service-discovery / CloudWatch agent equivalent.

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    system: finwise

rule_files:
  - /etc/prometheus/finwise.rules.yml

scrape_configs:
  - job_name: finwise-server
    metrics_path: /api/metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/server_metrics_token
    dns_sd_configs:
      - names: [server]
        type: A
        port: 3000
        refresh_interval: 15s
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance

  - job_name: finwise-ai-core
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/ai_core_metrics_token
    dns_sd_configs:
      - names: [ai-core]
        type: A
        port: 8001
        refresh_interval: 15s
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance

  # The dedicated worker exposes no HTTP port, so it has no scrape target; its
  # queue health is visible via finwise_dlq_size from the gateway once a DLQ
  # provider is registered (see docs/OBSERVABILITY.md, "Defined but unwired").
```

## `deploy/observability/prometheus-rules.yml`

Snapshot SHA-256: `b9ee2d9084a12e4b663816e6317f137861737753a72ed2ceb2c76a5d17cae5f6`.

```yaml
# FinWise SLO recording rules and alerts. Load with `rule_files:` (prometheus.yml).
# Validate syntax with `promtool check rules deploy/observability/prometheus-rules.yml`
# (promtool was not available when this file was written; it was parsed as YAML only).
#
# SLOs (docs/CAPACITY_AND_SLOS.md):
#   non-LLM API   availability 99.5% (error budget 0.5%), p95 < 300 ms
#   AI success    98% (deterministic fallback counts as success; budget 2%)
#   AI shed       < 0.5% of AI requests under nominal load
#   AI latency    LLM path p95 < 20 s (deterministic p95 < 4 s is checked by k6 only:
#                 the gateway histogram cannot tell the two paths apart)
#
# Burn-rate alerts use the multi-window multi-burn-rate pattern (Google SRE
# workbook): page when both a long and a short window burn the budget fast, ticket
# on a slow burn. A burn rate of N means the budget would be gone in 30d / N.
#
# Path classes (finwise_http_*; the `path` label is the normalised URL, ObjectIds -> :id):
#   AI/streaming paths : /api[/v1]/(process-command|ai/...|scenarios/what-if|
#                        autopilot...|chat/sessions/:id/messages)  and events/stream
#   non-LLM API        : everything else except /api/metrics.
# Status 429 is a client/limiter outcome, not a server error; only 5xx counts as an error.

groups:
  - name: finwise.sli.api
    interval: 30s
    rules:
      - record: finwise:api_nonllm:requests:rate5m
        expr: |
          sum(rate(finwise_http_requests_total{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[5m]))
      - record: finwise:api_nonllm:errors:ratio_rate5m
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..",path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[5m]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[5m])), 1e-9)
      - record: finwise:api_nonllm:errors:ratio_rate30m
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..",path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[30m]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[30m])), 1e-9)
      - record: finwise:api_nonllm:errors:ratio_rate1h
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..",path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[1h]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[1h])), 1e-9)
      - record: finwise:api_nonllm:errors:ratio_rate6h
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..",path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[6h]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[6h])), 1e-9)
      - record: finwise:api_nonllm:errors:ratio_rate1d
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..",path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[1d]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[1d])), 1e-9)
      - record: finwise:api_nonllm:latency_ms:p95_5m
        expr: |
          histogram_quantile(0.95, sum by (le) (rate(finwise_http_request_duration_ms_bucket{path!~"/api(/v1)?/(process-command|ai/.*|scenarios/what-if|autopilot.*|chat/sessions/:id/messages|events/stream|metrics)"}[5m])))

  - name: finwise.sli.ai
    interval: 30s
    rules:
      # AI paths as seen at the gateway. A 503 shed counts as a failure here: the
      # AI success SLO only forgives deterministic FALLBACKS (which return 200).
      - record: finwise:ai:requests:rate5m
        expr: |
          sum(rate(finwise_http_requests_total{path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[5m]))
      - record: finwise:ai:failures:ratio_rate5m
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..|429",path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[5m]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[5m])), 1e-9)
      - record: finwise:ai:failures:ratio_rate30m
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..|429",path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[30m]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[30m])), 1e-9)
      - record: finwise:ai:failures:ratio_rate1h
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..|429",path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[1h]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[1h])), 1e-9)
      - record: finwise:ai:failures:ratio_rate6h
        expr: |
          sum(rate(finwise_http_requests_total{status=~"5..|429",path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[6h]))
          /
          clamp_min(sum(rate(finwise_http_requests_total{path=~"/api(/v1)?/(process-command|ai/process/stream|ai/stream|scenarios/what-if|chat/sessions/:id/messages)"}[6h])), 1e-9)
      # Shed ratio: admission-controller sheds over AI requests. Shed responses are
      # themselves counted in finwise_http_requests_total, so no double counting needed.
      - record: finwise:ai:shed:ratio_rate5m
        expr: |
          sum(rate(finwise_ai_gateway_shed_total[5m]))
          /
          clamp_min(finwise:ai:requests:rate5m, 1e-9)
      - record: finwise:ai:latency_ms:p95_5m
        expr: |
          histogram_quantile(0.95, sum by (le) (rate(finwise_ai_core_request_duration_ms_bucket{job="finwise-server"}[5m])))

  - name: finwise.alerts.slo
    rules:
      # ---- Non-LLM API availability: budget 0.5% -------------------------------
      - alert: FinwiseApiAvailabilityFastBurn
        expr: |
          finwise:api_nonllm:errors:ratio_rate1h > (14.4 * 0.005)
          and finwise:api_nonllm:errors:ratio_rate5m > (14.4 * 0.005)
        for: 2m
        labels: {severity: page, slo: api_availability}
        annotations:
          summary: "API availability SLO burning at >14x (budget gone in ~2 days)"
          description: "5xx ratio is {{ $value | humanizePercentage }} (1h window). Runbook: docs/CAPACITY_AND_SLOS.md#runbook"
      - alert: FinwiseApiAvailabilityMediumBurn
        expr: |
          finwise:api_nonllm:errors:ratio_rate6h > (6 * 0.005)
          and finwise:api_nonllm:errors:ratio_rate30m > (6 * 0.005)
        for: 15m
        labels: {severity: page, slo: api_availability}
        annotations:
          summary: "API availability SLO burning at >6x (budget gone in ~5 days)"
          description: "5xx ratio is {{ $value | humanizePercentage }} (6h window). Runbook: docs/CAPACITY_AND_SLOS.md#runbook"
      - alert: FinwiseApiAvailabilitySlowBurn
        expr: |
          finwise:api_nonllm:errors:ratio_rate1d > (3 * 0.005)
          and finwise:api_nonllm:errors:ratio_rate6h > (3 * 0.005)
        for: 1h
        labels: {severity: ticket, slo: api_availability}
        annotations:
          summary: "API availability SLO burning at >3x (budget gone in ~10 days)"
          description: "5xx ratio is {{ $value | humanizePercentage }} (1d window)."

      # ---- Non-LLM API latency: p95 < 300 ms ------------------------------------
      # The histogram has 250 ms and 500 ms buckets, so the p95 between them is an
      # interpolation; treat the value as indicative near the 300 ms line.
      - alert: FinwiseApiLatencyP95High
        expr: finwise:api_nonllm:latency_ms:p95_5m > 300
        for: 15m
        labels: {severity: page, slo: api_latency}
        annotations:
          summary: "Non-LLM API p95 above 300 ms for 15 minutes"
          description: "p95 = {{ $value | humanize }} ms. Check Mongo pool wait, Redis, CPU throttling."

      # ---- AI success: budget 2% ---------------------------------------------------
      - alert: FinwiseAiSuccessFastBurn
        expr: |
          finwise:ai:failures:ratio_rate1h > (14.4 * 0.02)
          and finwise:ai:failures:ratio_rate5m > (14.4 * 0.02)
        for: 5m
        labels: {severity: page, slo: ai_success}
        annotations:
          summary: "AI success SLO burning at >14x"
          description: "AI failure ratio (5xx + 429) is {{ $value | humanizePercentage }} (1h)."
      - alert: FinwiseAiSuccessMediumBurn
        expr: |
          finwise:ai:failures:ratio_rate6h > (6 * 0.02)
          and finwise:ai:failures:ratio_rate30m > (6 * 0.02)
        for: 15m
        labels: {severity: page, slo: ai_success}
        annotations:
          summary: "AI success SLO burning at >6x"
          description: "AI failure ratio (5xx + 429) is {{ $value | humanizePercentage }} (6h)."

      # ---- AI latency and shed ---------------------------------------------------------
      - alert: FinwiseAiLatencyP95High
        expr: finwise:ai:latency_ms:p95_5m > 20000
        for: 10m
        labels: {severity: page, slo: ai_latency}
        annotations:
          summary: "AI Core p95 above the 20 s LLM-path budget"
          description: "p95 = {{ $value | humanize }} ms measured at the gateway."
      - alert: FinwiseAiShedRateHigh
        expr: finwise:ai:shed:ratio_rate5m > 0.005
        for: 15m
        labels: {severity: ticket, slo: ai_shed}
        annotations:
          summary: "AI shed rate above 0.5% under (assumed) nominal load"
          description: "Shed ratio {{ $value | humanizePercentage }}. A burst above 3x nominal is expected to shed; sustained shed means capacity (docs/CAPACITY_AND_SLOS.md)."

  - name: finwise.alerts.platform
    rules:
      - alert: FinwiseTargetDown
        expr: up{job=~"finwise-.*"} == 0
        for: 2m
        labels: {severity: page}
        annotations:
          summary: "{{ $labels.job }} {{ $labels.instance }} is not scrapeable"
          description: "Replica down, metrics disabled or token mismatch."
      - alert: FinwiseAiCircuitOpen
        expr: max(finwise_ai_circuit_state) == 2
        for: 2m
        labels: {severity: page}
        annotations:
          summary: "Gateway circuit breaker to AI Core is OPEN"
          description: "AI calls fail fast or take the deterministic fallback. Runbook: docs/CAPACITY_AND_SLOS.md#breaker-open"
      - alert: FinwiseAiCircuitFlapping
        expr: changes(finwise_ai_circuit_state[30m]) > 6
        labels: {severity: ticket}
        annotations:
          summary: "Circuit breaker changed state more than 6 times in 30 minutes"
          description: "AI Core is unstable (restarts, overload or provider errors)."
      - alert: FinwiseAiCoreShedding
        expr: sum(rate(finwise_ai_core_shed_total[5m])) > 0
        for: 5m
        labels: {severity: ticket}
        annotations:
          summary: "AI Core work gate is shedding requests (503 + Retry-After)"
          description: "AI_CORE_MAX_INFLIGHT slots are full on at least one replica. Runbook: docs/CAPACITY_AND_SLOS.md#shed"
      - alert: FinwiseLlmProviderQuota
        expr: sum(rate(finwise_ai_core_llm_provider_429_total[5m])) > 0
        for: 10m
        labels: {severity: ticket}
        annotations:
          summary: "LLM provider is returning 429 (quota) for 10 minutes"
          description: "Requests are served by the deterministic fallback. Runbook: docs/CAPACITY_AND_SLOS.md#llm-quota"
      - alert: FinwiseLlmLocalRateLimited
        expr: sum(rate(finwise_ai_core_llm_rate_limited_total[10m])) > 0.5
        for: 15m
        labels: {severity: ticket}
        annotations:
          summary: "AI Core token bucket refuses >0.5 LLM calls/s"
          description: "Demand exceeds LLM_RPM x replicas; the fallback is absorbing the difference."
      - alert: FinwiseRedisDown
        expr: min(finwise_redis_up) == 0
        for: 2m
        labels: {severity: page}
        annotations:
          summary: "A gateway replica cannot reach Redis"
          description: "Rate limits, idempotency and caches degrade. Runbook: docs/CAPACITY_AND_SLOS.md#redis-down"
      - alert: FinwiseMongoPoolPressure
        expr: max(finwise_mongo_pool_wait_queue) > 0
        for: 5m
        labels: {severity: page}
        annotations:
          summary: "Requests are queueing for a Mongo connection (pool exhausted)"
          description: "Pool is 30 per replica. Check slow queries and replica count before raising it. Runbook: docs/CAPACITY_AND_SLOS.md#mongo-failover"
      - alert: FinwiseMongoCheckoutFailures
        expr: sum(increase(finwise_mongo_pool_checkout_failed_total[5m])) > 0
        for: 5m
        labels: {severity: page}
        annotations:
          summary: "Mongo connection checkouts are failing"
          description: "Primary election, network partition or exhausted pool."
      - alert: FinwiseSseNearCapacity
        expr: max by (instance) (finwise_sse_connections) > 200
        for: 10m
        labels: {severity: ticket}
        annotations:
          summary: "{{ $labels.instance }} holds more than 200 SSE streams"
          description: "Plan: about 225 streams across all replicas (roughly 75 per replica at 3). One replica holding most of them means unbalanced load."
      # --- Series below are defined but not wired yet (docs/OBSERVABILITY.md): these
      # --- alerts stay silent until the producers call the recorders.
      - alert: FinwiseDeadLetterQueueGrowing
        expr: max(finwise_dlq_size) > 50
        for: 15m
        labels: {severity: ticket}
        annotations:
          summary: "Dead-letter queue {{ $labels.queue }} holds more than 50 items"
          description: "Currently only the in-memory placeholder provider is registered."
      - alert: FinwiseEventBusLag
        expr: histogram_quantile(0.95, sum by (le) (rate(finwise_event_bus_lag_ms_bucket[10m]))) > 1000
        for: 10m
        labels: {severity: ticket}
        annotations:
          summary: "Event bus delivery lag p95 above 1 s"
          description: "SSE events reach clients late. Not emitted until the Redis event bus calls observeEventBusLag()."
      - alert: FinwiseCanaryRollback
        expr: sum(increase(finwise_ai_canary_events_total{event="rollback"}[1h])) > 0
        labels: {severity: info}
        annotations:
          summary: "A self-improvement canary was rolled back in the last hour"
          description: "Not emitted until the rollout code calls recordCanaryEvent()."
```

## `loadtest/compose.loadtest.yaml`

Snapshot SHA-256: `da09daaf84c43ed264b169e946826a77171581b29d5892aed7e78be473b5c29a`.

```yaml
# Compose override for load/smoke testing. NEVER use for a real deployment.
#
#   docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml up -d --wait
#
# What it changes, and why:
#   * ai-core: LLM_PROVIDER=mock (deterministic canned reply, no network or key)
#     so the run measures the platform, not a provider's quota. Override with
#     LLM_PROVIDER=gemini (and a key in server/AI_Core/.env) for a real-LLM run.
#   * server: NODE_ENV=development so POST /api/auth/register returns `dev_otp`
#     (the k6 helpers use it to verify the throwaway accounts). The security-
#     relevant switches are pinned back explicitly (CSRF on, trust proxy 1).
#   * server: auth / API / per-user AI rate limits raised. One k6 machine looks
#     like one IP, and registering N users would trip AUTH_RATE_LIMIT_MAX (20/min).
#     The limiters are exercised by their own unit tests, not by this load run.
#   * server: METRICS_ENABLED so Prometheus/k6 can scrape /api/metrics from the
#     replicas (token below is a throwaway; the endpoint is not published to the host).
#
# Required in the environment (compose.yaml refuses to start without them):
#   JWT_SECRET, AI_CORE_INTERNAL_TOKEN, WEBHOOK_CREDENTIALS_KEY (base64, 32 bytes).
services:
  server:
    environment:
      NODE_ENV: development
      CSRF_ENABLED: "true"
      TRUST_PROXY: "1"
      AUTH_RATE_LIMIT_MAX: "100000"
      RATE_LIMIT_MAX: "100000"
      AI_USER_RATE_LIMIT_MAX: "100000"
      METRICS_ENABLED: "true"
      METRICS_TOKEN: ${METRICS_TOKEN:-loadtest-metrics-token}
  worker:
    environment:
      NODE_ENV: development
  ai-core:
    environment:
      LLM_PROVIDER: ${LLM_PROVIDER:-mock}
      LLM_MOCK_LATENCY_MS: ${LLM_MOCK_LATENCY_MS:-150}
      AI_CORE_METRICS_TOKEN: ${AI_CORE_METRICS_TOKEN:-loadtest-metrics-token}
```

## `loadtest/k6/smoke.js`

Snapshot SHA-256: `1e27d4b483a7ba433059b54ed44feb357ab21f11f1642b387620f66be859ae70`.

```javascript
// CI gate: a short, low-volume pass through every request class.
//
//   k6 run loadtest/k6/smoke.js
//
// Intended to run against `docker compose up -d --wait` with LLM_PROVIDER=mock,
// so latency thresholds exercise the gateway + AI Core plumbing, not a provider.
// Thresholds are the plan SLOs, loosened only where a cold stack with 2 VUs
// makes a tight percentile meaningless (see comments).

import http from "k6/http";
import { check, sleep } from "k6";
import {
  API,
  SLO,
  aiRequest,
  chatRequest,
  ensureSession,
  provisionUsers,
  readRequest,
  writeRequest,
} from "./lib/common.js";

const USERS = parseInt(__ENV.K6_USERS || "3", 10);

// Configures low-volume constant virtual user smoke tests for CI pipeline gates.
// Asserts strict latency budgets for read operations, writes, and AI responses.
// Enforces zero login errors and high request success thresholds.
export const options = {
  noCookiesReset: true, // ensureSession logs in once per virtual user.
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: Math.min(USERS, 3),
      duration: __ENV.K6_SMOKE_DURATION || "30s",
    },
  },
  setupTimeout: "120s",
  thresholds: {
    checks: ["rate>0.99"],
    "http_req_duration{class:read}": [`p(95)<${SLO.apiP95Ms}`],
    "http_req_duration{class:write}": [`p(95)<${SLO.apiP95Ms}`],
    // Smoke is tiny, so 1 failed request in 200 already breaks 99.5%: use 2%.
    "http_req_failed{class:read}": ["rate<0.02"],
    "http_req_failed{class:write}": ["rate<0.02"],
    finwise_api_errors: ["rate<0.02"],
    // Mock LLM answers instantly; real routing still must meet the deterministic budget.
    "finwise_ai_duration{ai_kind:det}": [`p(95)<${SLO.aiDeterministicP95Ms}`],
    "finwise_ai_duration{ai_kind:llm}": [`p(95)<${SLO.aiLlmP95Ms}`],
    finwise_ai_ok: [`rate>${SLO.aiSuccess}`],
    finwise_ai_shed: [`rate<${SLO.shedRateNominal}`],
    finwise_login_failures: ["count==0"],
  },
};

// Verifies baseline gateway connectivity and provisions smoke test user accounts.
// Executes health check probe against the gateway and asserts HTTP 200 readiness.
// Throws fatal error if gateway services are unreachable before test starts.
export function setup() {
  const health = http.get(`${API}/test`, { tags: { name: "api_test" } });
  check(health, { "gateway reachable": (r) => r.status === 200 });
  if (health.status !== 200) {
    throw new Error(`Gateway not reachable at ${API}/test (status ${health.status})`);
  }
  return provisionUsers(USERS);
}

// Executes single smoke test loop validating read, write, and AI endpoints.
// Verifies session establishment and exercises deterministic and LLM routes.
// Ensures that critical API pathways function correctly under minimal traffic.
export default function () {
  if (!ensureSession()) {
    sleep(1);
    return;
  }
  readRequest();
  readRequest();
  writeRequest();
  // Every AI path once per iteration: the smoke must prove the AI plumbing works.
  aiRequest();
  chatRequest();
  sleep(1);
}
```

## `loadtest/k6/load.js`

Snapshot SHA-256: `c960dfa30d2c27f9aaa4b91b92cb9028597bc0828134de69e5d50532ee6fb8b6`.

```javascript
// Nominal load: ramp to 150 virtual users running the standard mix
// (70% reads / 15% writes / 10% AI commands / 5% chat messages).
//
//   k6 run loadtest/k6/load.js
//   k6 run -e K6_VUS=60 -e K6_HOLD=3m loadtest/k6/load.js
//
// With 2-4 s think time (mean 3 s), 150 VUs generate roughly 50 requests/s,
// the plan's nominal rate. Thresholds are the plan SLOs.
//
// NOTE on AI volume: the default mix sends 10% AI + 5% chat, which at 50 rps is
// ~450 AI-backed requests/min, several times the plan's ~75/min nominal (the
// mix is a stress mix for the mock LLM). To reproduce the plan's AI rate use
//   -e K6_MIX=82,15,2,1
// Use LLM_PROVIDER=mock for platform capacity; use a real provider only in the
// nightly run (free-tier ~15 RPM per key will shed above that).

import { mixedIteration, nominalThresholds, provisionUsers, USER_COUNT } from "./lib/common.js";

const VUS = parseInt(__ENV.K6_VUS || "150", 10);
const HOLD = __ENV.K6_HOLD || "10m";

// Configures ramping virtual user load stages and latency SLO thresholds.
// Ramps concurrency to target user volumes over configurable hold periods.
// Defines percentile tracking statistics across nominal platform operations.
export const options = {
  noCookiesReset: true,
  scenarios: {
    nominal: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: __ENV.K6_RAMP || "2m", target: VUS },
        { duration: HOLD, target: VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      gracefulStop: "60s",
    },
  },
  setupTimeout: "600s",
  thresholds: nominalThresholds(),
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// Prepares and provisions authenticated virtual user accounts for the test run.
// Bounds initialized account totals to available user pools and concurrency caps.
// Supplies provisioned user credentials to individual scenario workers.
export function setup() {
  return provisionUsers(Math.min(USER_COUNT, VUS));
}

// Executes repeated mixed user traffic iterations with random think delays.
// Simulates standard realistic distributions of reads, writes, and AI tasks.
// Evaluates platform stability, cache hit ratios, and API response latencies.
export default function () {
  mixedIteration([2, 4]);
}
```

## `loadtest/k6/spike.js`

Snapshot SHA-256: `cee5ce6955ebab055b0b40ecb212216478fa7f0bd3ed0ad86b2c97c3f80ab360`.

```javascript
// Spike: jump from nominal load to 3x and back, with the standard mix.
//
//   k6 run loadtest/k6/spike.js
//   k6 run -e K6_SPIKE_FACTOR=2 loadtest/k6/spike.js     # the 2x peak case
//
// Nominal = 150 VUs (about 50 rps, see load.js); the spike is 3x = 450 VUs
// (about 150 rps, and about 225 AI requests/min with the plan-rate mix).
//
// What "pass" means here is different from nominal load. Under a spike the
// platform is allowed to shed AI work gracefully (429/503 + Retry-After from
// the admission controls) but must not fall over:
//   - no unexpected 5xx / network errors on non-AI traffic beyond 1%
//   - non-AI p95 stays under 2x the nominal SLO while spiking
//   - AI requests either succeed or are shed with Retry-After; "other"
//     failures (neither success nor graceful shed) stay under 2%
// The shed ceiling (20%) is this suite's own assumption, not a plan SLO:
// tighten it once real spike data exists.

import { SLO, mixedIteration, provisionUsers, USER_COUNT } from "./lib/common.js";

const BASE = parseInt(__ENV.K6_VUS || "150", 10);
const FACTOR = parseFloat(__ENV.K6_SPIKE_FACTOR || "3");
const PEAK = Math.round(BASE * FACTOR);

// Configures sudden concurrency spike scenarios jumping to 3x nominal loads.
// Tests system load shedding, circuit breaking, and subsequent recovery phases.
// Applies relaxed latency ceilings and bounded shedding rate thresholds.
export const options = {
  noCookiesReset: true,
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: BASE }, // warm up to nominal
        { duration: "2m", target: BASE }, // steady nominal
        { duration: "20s", target: PEAK }, // spike
        { duration: __ENV.K6_SPIKE_HOLD || "3m", target: PEAK },
        { duration: "20s", target: BASE }, // back down
        { duration: "3m", target: BASE }, // recovery: SLOs must hold again
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      gracefulStop: "60s",
    },
  },
  setupTimeout: "600s",
  thresholds: {
    "http_req_duration{class:read}": [`p(95)<${SLO.apiP95Ms * 2}`],
    "http_req_duration{class:write}": [`p(95)<${SLO.apiP95Ms * 2}`],
    "http_req_failed{class:read}": ["rate<0.01"],
    "http_req_failed{class:write}": ["rate<0.01"],
    finwise_api_errors: ["rate<0.01"],
    finwise_ai_shed: ["rate<0.2"],
    finwise_ai_other_failures: ["rate<0.02"],
    finwise_login_failures: ["count==0"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// Provisions authenticated test users to service peak virtual user surges.
// Ensures user credential pools are fully populated prior to the spike ramp.
// Returns provisioned user accounts for distribution across virtual workers.
export function setup() {
  return provisionUsers(USER_COUNT);
}

// Executes repeated mixed traffic operations during steady and peak spike stages.
// Verifies graceful work shedding and ensures core read/write pathways survive.
// Injects random think delays to simulate bursty user browsing behavior.
export default function () {
  mixedIteration([2, 4]);
}
```

## `loadtest/k6/soak-sse.js`

Snapshot SHA-256: `198f2558622a72d772bc2729340b753b13fb93816ffa2e53351993b990ae276a`.

```javascript
// SSE soak: hold 250 concurrent server-sent-event connections (the plan sizes
// for ~225 streams) while ordinary API traffic keeps flowing, and check that
// the non-streaming SLO is unaffected.
//
//   k6 run loadtest/k6/soak-sse.js
//   k6 run -e K6_SSE_CONNECTIONS=250 -e K6_SOAK_DURATION=30m loadtest/k6/soak-sse.js
//
// Limitation: core k6 cannot read a response incrementally, so each VU opens
// GET /api/v1/events/stream with a client-side timeout equal to the hold time.
// A request that is still open when the timeout fires means the gateway kept
// the stream alive (heartbeat every 15 s); one that finishes earlier is a
// dropped connection. To also prove the server side agrees, pass
//   -e K6_METRICS_URL=http://<gateway>:3000/api/metrics -e K6_METRICS_TOKEN=...
// (the gateway needs METRICS_ENABLED=true; nginx hides /api/metrics, so point
// at a replica directly) and the `sse_gauge` scenario asserts that the scraped
// replica reports finwise_sse_connections >= K6_SSE_GAUGE_MIN (default: 90% of
// the target; with N gateway replicas set it to about 0.9 * target / N).

import http from "k6/http";
import { check, sleep } from "k6";
import { Gauge } from "k6/metrics";
import {
  API,
  SLO,
  USER_COUNT,
  provisionUsers,
  readRequest,
  ensureSession,
  scrapeGauge,
  sseDropped,
  sseHeld,
} from "./lib/common.js";

const CONNECTIONS = parseInt(__ENV.K6_SSE_CONNECTIONS || "250", 10);
const SOAK = __ENV.K6_SOAK_DURATION || "15m";
const HOLD_MS = parseInt(__ENV.K6_SSE_HOLD_MS || "60000", 10);
const PROBE_VUS = parseInt(__ENV.K6_PROBE_VUS || "20", 10);
const sseGauge = new Gauge("finwise_sse_connections_scraped");
const SCRAPE = Boolean(__ENV.K6_METRICS_URL);
const GAUGE_MIN = parseInt(__ENV.K6_SSE_GAUGE_MIN || String(Math.floor(CONNECTIONS * 0.9)), 10);

const scenarios = {
  sse_hold: {
    executor: "ramping-vus",
    exec: "holdStream",
    stages: [
      { duration: "2m", target: CONNECTIONS },
      { duration: SOAK, target: CONNECTIONS },
      { duration: "30s", target: 0 },
    ],
    gracefulStop: "90s",
  },
  api_probe: {
    executor: "constant-vus",
    exec: "probe",
    vus: PROBE_VUS,
    duration: SOAK,
    startTime: "2m", // after the connections are up
  },
};

if (SCRAPE) {
  scenarios.sse_gauge = {
    executor: "constant-vus",
    exec: "scrape",
    vus: 1,
    duration: SOAK,
    startTime: "3m",
  };
}

const thresholds = {
  // Non-streaming traffic must hold its SLO while 250 streams are open.
  "http_req_duration{class:read}": [`p(95)<${SLO.apiP95Ms}`],
  "http_req_failed{class:read}": [`rate<${1 - SLO.apiAvailability}`],
  finwise_api_errors: [`rate<${1 - SLO.apiAvailability}`],
  // Less than 1% of stream attempts may end early or be refused.
  finwise_sse_dropped: [`count<${Math.max(3, Math.ceil(CONNECTIONS * 0.01))}`],
  finwise_login_failures: ["count==0"],
};
// A Gauge with no samples reads 0, so only gate on it when it is actually scraped.
if (SCRAPE) thresholds.finwise_sse_connections_scraped = [`value>=${GAUGE_MIN}`];

// Configures multi-scenario soak options for concurrent Server-Sent Event testing.
// Evaluates active connection persistence alongside background read probe traffic.
// Applies strict error thresholds to verify connection resilience and API stability.
export const options = { scenarios, thresholds, setupTimeout: "600s", noCookiesReset: true };

// Initializes authenticated test user accounts up to the target connection count.
// Validates account provisioning before establishing concurrent event streams.
// Returns provisioned user credentials for distributed scenario workers.
export function setup() {
  return provisionUsers(Math.min(USER_COUNT, CONNECTIONS));
}

// Opens and maintains a persistent Server-Sent Events stream connection to the API.
// Verifies that stream heartbeats remain active throughout the configured hold window.
// Tracks connection drop metrics and prevents rapid reconnect storms on termination.
export function holdStream() {
  if (!ensureSession()) {
    sleep(5);
    return;
  }
  const res = http.get(`${API}/v1/events/stream`, {
    headers: { Accept: "text/event-stream" },
    timeout: `${HOLD_MS}ms`,
    tags: { name: "sse_events_stream", class: "sse" },
  });
  // Still open at the timeout => k6 reports status 0 / error_code 1050.
  const heldFullTime = res.status === 0 && Number(res.error_code) === 1050;
  check(res, { "stream stayed open": () => heldFullTime });
  if (heldFullTime) sseHeld.add(1);
  else sseDropped.add(1);
  if (!heldFullTime) sleep(2); // avoid a reconnect storm on refusal
}

// Emits regular background read requests to test API availability during SSE soak.
// Injects random think delays between calls to simulate realistic user browsing.
// Asserts that standard request latencies remain unaffected by concurrent streams.
export function probe() {
  if (!ensureSession()) {
    sleep(5);
    return;
  }
  readRequest();
  sleep(1 + Math.random() * 2);
}

// Scrapes real-time gateway Prometheus metrics to monitor active connection gauges.
// Extracts internal server-side connection counts and updates client-side gauges.
// Sleeps between polling intervals to prevent overloading monitoring endpoints.
export function scrape() {
  const total = scrapeGauge('finwise_sse_connections{');
  if (total !== null) sseGauge.add(total);
  sleep(15);
}
```
