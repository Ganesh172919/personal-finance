# Chaos drill: lose one API replica and one AI Core replica

Goal (plan SLO): killing a single API replica or a single AI Core replica under
load must not cause an outage, and the killed replica must be serving again in
**under 30 seconds**.

> Status: the scripts below were written and syntax-checked, but have not been
> run against real containers (no Docker in the authoring environment). Run the
> drill once in a scratch stack and adjust before treating a pass/fail as
> evidence.

## Setup

```bash
export JWT_SECRET=...  AI_CORE_INTERNAL_TOKEN=...  WEBHOOK_CREDENTIALS_KEY=$(openssl rand -base64 32)
export SERVER_REPLICAS=2 AI_CORE_REPLICAS=2          # the drill needs >= 2 of each
docker compose -f compose.yaml -f loadtest/compose.loadtest.yaml up -d --wait
```

Start background load in another terminal (a shorter hold is fine):

```bash
k6 run -e K6_VUS=60 -e K6_HOLD=5m loadtest/k6/load.js
```

## Run

```bash
loadtest/k6/chaos.sh              # bash: both services
loadtest/k6/chaos.sh server       # only the API replica
```

```powershell
./loadtest/k6/chaos.ps1                   # both services
./loadtest/k6/chaos.ps1 -Service ai-core  # only AI Core
```

Each service: `docker kill` (SIGKILL, no graceful drain) of one random replica,
then 1 Hz probing of the public edge and of the container's health until the
container is running again and healthy. The script prints seconds to recovery
and the number of failed edge probes and exits non-zero on a miss.

## What to expect

| Event | Expected behaviour |
| --- | --- |
| API replica killed | nginx retries idempotent requests on the surviving replica (`proxy_next_upstream error timeout http_503`, GET/HEAD/PUT/DELETE); in-flight POSTs on the dead replica fail and the client retries with its `Idempotency-Key`. Docker restarts the container (`restart: unless-stopped`). |
| AI Core replica killed | In-flight AI requests on it fail; the gateway circuit breaker may open briefly and AI calls fall back to the deterministic path or return 503 + `Retry-After`; new calls reach the surviving replica via Docker DNS. |
| Recovery | `docker kill` then Docker restart then image start then healthcheck. |

## Reading the result

* `RecoverySecs` is container-level: it includes up to one healthcheck interval
  (15 s in both Dockerfiles) plus start-up. If it is close to 30 s the
  user-visible recovery is probably faster, because the edge already served from
  the other replica. Judge availability by `EdgeProbeFails`, which should be 0
  or a handful (probes that landed on the dead replica before nginx failed over).
* k6 side: `finwise_api_errors` and `finwise_ai_other_failures` will show a
  burst at the kill. Expected: a short blip, then back under the load.js
  thresholds. Failures that persist after recovery are a bug.
* If AI Core recovery is slow, check start-up (`start-period` 60 s in
  `server/AI_Core/Dockerfile`) and Mongo/Redis connectivity.

## Extending the drill

* Kill Redis (`docker compose kill redis`) and compare with the Redis-down
  runbook in `docs/CAPACITY_AND_SLOS.md`.
* Mongo primary loss is only meaningful with a multi-node replica set (the
  compose file is single-node); exercise it in a staging cluster.
* Use `docker compose pause <svc>` instead of `kill` to simulate a hung, not
  dead, replica (timeouts rather than refused connections).
