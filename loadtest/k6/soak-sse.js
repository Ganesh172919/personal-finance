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
export const options = { scenarios, thresholds, setupTimeout: "600s" };

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
