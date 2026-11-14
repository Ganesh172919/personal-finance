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
