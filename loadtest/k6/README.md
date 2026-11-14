# FinWise k6 load tests

Scripts that check the plan SLOs (`docs/CAPACITY_AND_SLOS.md`) against a running stack.

| Script | Purpose | Runtime | Gate |
| --- | --- | --- | --- |
| `smoke.js` | Every request class once, 3 VUs. | about 1 min | CI (`test.yml`, compose smoke job) |
| `load.js` | Ramp to 150 VUs, standard mix, 10 min hold. | about 13 min | nightly |
| `spike.js` | Nominal then 3x (450 VUs) then recovery. | about 14 min | nightly |
| `soak-sse.js` | 250 SSE connections + API probe traffic. | about 18 min | nightly |
| `chaos.sh` / `chaos.ps1` | Kill one API and one AI Core replica. See `chaos.md`. | about 2 min | manual drill |

Nothing here has been executed against real containers by the author (no Docker,
k6 or network in the authoring environment): the scripts are syntax-checked
(`node --check`) and the YAML is parsed, nothing more. The first CI run is the
first real test, so expect to fix small things (response shapes, thresholds).

## Install k6

macOS `brew install k6`, Windows `winget install k6`, Linux/CI use
`grafana/setup-k6-action` or the packages from https://grafana.com/docs/k6/latest/set-up/install-k6/.

## Start a stack to test

The load-test override mocks the LLM, raises the rate limits that a single k6
machine would trip, and runs the gateway with `NODE_ENV=development` so the
registration endpoint returns `dev_otp` (the helpers verify throwaway users with
it). **Never use it for a real deployment.**

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export AI_CORE_INTERNAL_TOKEN=$(openssl rand -hex 32)
export WEBHOOK_CREDENTIALS_KEY=$(openssl rand -base64 32)
docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml up -d --build --wait
```

(`compose.yaml` also reads `server/.env` and `server/AI_Core/.env`; copy the
`.env.example` files if they do not exist.)

### Mock LLM mode

`LLM_PROVIDER=mock` makes AI Core return a canned, deterministic reply without any
provider call or API key (`server/AI_Core/utils/llm_wrapper.py`). The route
snapshot reports `active_provider=mock`, `mock=true`. Related knobs:

* `LLM_MOCK_LATENCY_MS` (default 0 in compose, 150 in the load-test override):
  simulated provider latency, clamped to 0-30000.
* Deterministic number-safety tables, caches, admission control and the
  gateway queue still run, so the mock exercises the platform, not the model.

Use it for CI and capacity runs. Use a real provider only for the nightly
real-LLM job (`LLM_PROVIDER=gemini` plus keys); the free tier (about 15 RPM per
key) will shed anything above the plan's AI rate.

## Run

```bash
# CI gate (about 1 min)
k6 run loadtest/k6/smoke.js

# Nominal load: 150 VUs, 2 min ramp, 10 min hold
k6 run loadtest/k6/load.js

# Spike to 3x, or the 2x peak case
k6 run loadtest/k6/spike.js
k6 run -e K6_SPIKE_FACTOR=2 loadtest/k6/spike.js

# 250 SSE connections for 15 min (longer: -e K6_SOAK_DURATION=60m)
k6 run loadtest/k6/soak-sse.js

# Export results for later comparison
k6 run --summary-export=load-summary.json loadtest/k6/load.js
```

Target another environment with `-e K6_BASE_URL=https://staging.example.com`.
The target must satisfy the requirements under "Test users" below.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `K6_BASE_URL` | `http://127.0.0.1:8080` | Edge URL (nginx / `web` service). `/api` is appended. |
| `K6_USERS` | 150 (smoke: 3) | Throwaway users provisioned. VUs share them modulo this count. |
| `K6_VUS` | 150 | Nominal VUs (`load.js`, `spike.js`). |
| `K6_RAMP`, `K6_HOLD` | `2m`, `10m` | Ramp and hold durations (`load.js`). |
| `K6_SPIKE_FACTOR`, `K6_SPIKE_HOLD` | `3`, `3m` | Spike multiplier and duration. |
| `K6_MIX` | `70,15,10,5` | Read, write, AI, chat weights. |
| `K6_SSE_CONNECTIONS`, `K6_SOAK_DURATION`, `K6_SSE_HOLD_MS` | 250, `15m`, 60000 | SSE soak shape. |
| `K6_METRICS_URL`, `K6_METRICS_TOKEN` | unset | Scrape a replica's `/api/metrics` during the soak and assert the SSE gauge. |
| `K6_SSE_GAUGE_MIN` | 90% of connections | Per-replica floor for that assertion (divide by replica count). |
| `K6_USER_PREFIX`, `K6_RUN_TAG`, `K6_USER_PASSWORD` | `k6load`, `stable`, built-in | Test-account identity. Change `K6_RUN_TAG` for fresh accounts. |
| `K6_SKIP_PROVISION` | unset | `true` = users already exist (production-mode targets). |

### Test users

`setup()` registers `K6_USERS` accounts and verifies each with the `dev_otp`
the register endpoint returns when `NODE_ENV != production`; existing accounts are
reused (rerun-safe). Each VU then logs in once, fetches `GET /api/auth/csrf`, and
sends `x-csrf-token` plus a fresh `Idempotency-Key` on every mutating call. For
a target that does not return `dev_otp` (production mode), pre-create verified
users named `k6load+stable-<i>@loadtest.finwise.test` with the shared password and
run with `-e K6_SKIP_PROVISION=true`. Registration needs `AUTH_RATE_LIMIT_MAX`
(default 20/min/IP) raised, as the override file does.

## Traffic mix

The default mix is 70% reads, 15% writes (`POST /api/transactions`), 10% AI
(`POST /api/process-command`), 5% chat (`POST /api/chat/sessions/:id/messages`),
with 2-4 s think time, so 150 VUs generate about 50 requests/s (the plan's
nominal rate). **The default AI share is a stress mix**: 15% of 50 rps is far
above the plan's about 75 AI requests/min, which is fine for the mock LLM but
would shed against a real free-tier provider. Reproduce the plan's AI rate with
`-e K6_MIX=82,15,2,1`.

## Thresholds (= plan SLOs)

| Metric | Threshold | Source |
| --- | --- | --- |
| `http_req_duration{class:read\|write}` | p95 < 300 ms | non-LLM API p95 |
| `http_req_failed{class:read\|write}`, `finwise_api_errors` | < 0.5% | 99.5% availability |
| `finwise_ai_duration{ai_kind:det}` | p95 < 4 s | AI deterministic p95 |
| `finwise_ai_duration{ai_kind:llm}` | p95 < 20 s | AI LLM path p95 |
| `finwise_ai_ok` | > 98% | AI success (deterministic fallback = 200 = success) |
| `finwise_ai_shed` | < 0.5% | shed rate under nominal load |

`spike.js` relaxes these on purpose (graceful shed allowed, non-AI p95 < 600 ms);
its limits are this suite's assumptions, not plan SLOs. Honest limits of the
measurement:

* The `det` vs `llm` split is decided by the prompt text; AI Core makes the real
  routing decision, so the per-kind latencies are indicative.
* "First-token p95 < 2.5 s" is not measured: k6 cannot read SSE incrementally.
  `http_req_waiting` on the stream endpoints is only time to first header byte. Use
  `finwise_ai_first_token_seconds`-style gateway metrics if available, or the
  browser, for true first token.
* `soak-sse.js` proves connections stay open (client side) and, with
  `K6_METRICS_URL`, that the server gauge agrees. It does not read events.
* All load comes from one IP. nginx's per-IP `limit_req` (200 r/s) is sized above
  the plan's peak; a bigger run needs several k6 machines or a raised limit.

## Layout

```
loadtest/
  compose.loadtest.yaml   override: mock LLM, relaxed limiters, dev_otp
  k6/
    lib/common.js         config, SLO table, provisioning, session/CSRF, request classes
    smoke.js load.js spike.js soak-sse.js
    chaos.md chaos.sh chaos.ps1
```
