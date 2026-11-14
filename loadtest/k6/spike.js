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
