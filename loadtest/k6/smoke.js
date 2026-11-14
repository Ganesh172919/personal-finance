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
