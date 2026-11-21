// Shared k6 helpers for the FinWise load-test suite.
//
// Responsibilities: configuration from env, SLO thresholds (single source of
// truth, mirrors docs/CAPACITY_AND_SLOS.md), test-user provisioning, cookie +
// CSRF handling, Idempotency-Key generation, and the request-class helpers
// used by smoke/load/spike/soak scripts.
//
// Auth model (server/src/controllers/authController.ts):
//   POST /api/auth/register   -> 201 { dev_otp }   (dev_otp only when NODE_ENV != production)
//   POST /api/auth/verify-email {email, otp} -> 200, sets the HTTP-only `jwt` cookie
//   POST /api/auth/login      -> 200, sets the `jwt` cookie
//   GET  /api/auth/csrf       -> 200 { csrf_token }, sets the `csrf_token` cookie
// Mutating calls made with the jwt cookie must echo the token in `x-csrf-token`.
// k6 keeps cookies per VU, so every VU logs in once and reuses its jar.

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

export const BASE_URL = (__ENV.K6_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
export const API = `${BASE_URL}/api`;
export const PASSWORD = __ENV.K6_USER_PASSWORD || "K6-Load-Test-Passw0rd!";
export const USER_PREFIX = __ENV.K6_USER_PREFIX || "k6load";
export const USER_COUNT = Math.max(1, parseInt(__ENV.K6_USERS || "150", 10));
// Mixed-in marker so reruns against the same database reuse the same accounts.
export const RUN_TAG = __ENV.K6_RUN_TAG || "stable";

// ---------------------------------------------------------------------------
// SLOs (docs/CAPACITY_AND_SLOS.md). Change them there first.
// ---------------------------------------------------------------------------
export const SLO = {
  apiP95Ms: 300, // non-LLM API p95
  apiAvailability: 0.995, // 99.5% (error rate < 0.5%)
  aiDeterministicP95Ms: 4000,
  aiLlmP95Ms: 20000,
  firstByteP95Ms: 2500, // time to response headers on the SSE endpoint (proxy for first token)
  aiSuccess: 0.98, // a deterministic fallback counts as success; shed does not
  shedRateNominal: 0.005, // < 0.5% of AI requests shed under nominal load
};

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
export const aiOk = new Rate("finwise_ai_ok"); // 2xx AI response
export const aiShed = new Rate("finwise_ai_shed"); // 429/503 with Retry-After (graceful shed)
export const aiOther = new Rate("finwise_ai_other_failures"); // neither success nor graceful shed
export const apiErrors = new Rate("finwise_api_errors"); // non-AI unexpected failures
export const aiDuration = new Trend("finwise_ai_duration", true);
export const loginFailures = new Counter("finwise_login_failures");
export const sseHeld = new Counter("finwise_sse_held"); // connections that stayed open for the full hold
export const sseDropped = new Counter("finwise_sse_dropped"); // ended early / refused

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
const rnd = () => Math.random().toString(16).slice(2, 10);

/** RFC 4122-shaped random id; good enough for Idempotency-Key (8-128 chars). */
// Generates random RFC 4122 compliant pseudo-unique identifier strings.
// Used for synthesizing unique request headers and payload identifiers.
// Returns a formatted v4 UUID string suitable for idempotency keys.
export const uuid = () =>
  `${rnd()}-${rnd().slice(0, 4)}-4${rnd().slice(0, 3)}-a${rnd().slice(0, 3)}-${rnd()}${rnd().slice(0, 4)}`;

// Produces a compound idempotency key combining label, worker, and iteration.
// Prevents duplicate transactions and state mutations during load tests.
// Returns a unique trace key formatted for x-idempotency-key HTTP headers.
export const idempotencyKey = (label = "k6") => `${label}-${__VU}-${__ITER}-${uuid()}`;

// Selects a random element from a supplied array of items or route paths.
// Distributes mock user actions evenly across multiple sample endpoints.
// Returns a single randomly chosen element from the target collection.
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Formats deterministic virtual user email addresses for test provisioning.
// Incorporates test prefix, run tag, and worker index to prevent collisions.
// Returns a formatted test email string under the loadtest domain namespace.
export const userEmail = (i) => `${USER_PREFIX}+${RUN_TAG}-${i}@loadtest.finwise.test`;

// Formats display names for synthesized virtual test user profile accounts.
// Appends incremental user indices to standard test account title prefixes.
// Returns a formatted full-name string for mock user registration payloads.
export const userName = (i) => `K6 Load User ${i}`;

const jsonHeaders = { "Content-Type": "application/json" };

const bodyJson = (res) => {
  try {
    return res.json();
  } catch (_e) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Provisioning (call from setup())
// ---------------------------------------------------------------------------

/**
 * Registers + verifies `count` users. Idempotent: an existing account (409)
 * is left alone and picked up by the later login. Needs a gateway that returns
 * `dev_otp` (NODE_ENV != production). Against production-mode deployments,
 * pre-create verified users and pass K6_SKIP_PROVISION=true.
 *
 * Runs in batches because bcrypt makes sequential registration slow, and
 * needs AUTH_RATE_LIMIT_MAX raised above the default 20/min/IP (see
 * loadtest/compose.loadtest.yaml).
 */
// Registers and verifies test user accounts in batches prior to load runs.
// Bypasses provisioning when pre-configured production accounts are present.
// Returns summary statistics of newly created, existing, and failed users.
export function provisionUsers(count = USER_COUNT) {
  if (String(__ENV.K6_SKIP_PROVISION || "").toLowerCase() === "true") {
    return { provisioned: 0, skipped: true };
  }
  const batchSize = Math.max(1, parseInt(__ENV.K6_PROVISION_BATCH || "5", 10));
  let created = 0;
  let existing = 0;
  let failed = 0;
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(count, start + batchSize);
    const reqs = [];
    for (let i = start; i < end; i++) {
      reqs.push({
        method: "POST",
        url: `${API}/auth/register`,
        body: JSON.stringify({ name: userName(i), email: userEmail(i), password: PASSWORD }),
        params: { headers: jsonHeaders, tags: { name: "setup_register" } },
      });
    }
    const regs = http.batch(reqs);
    const verifies = [];
    regs.forEach((res, k) => {
      if (res.status === 201) {
        const otp = bodyJson(res) && bodyJson(res).dev_otp;
        if (!otp) {
          failed += 1;
          return;
        }
        verifies.push({
          method: "POST",
          url: `${API}/auth/verify-email`,
          body: JSON.stringify({ email: userEmail(start + k), otp: String(otp) }),
          params: { headers: jsonHeaders, tags: { name: "setup_verify" } },
        });
        created += 1;
      } else if (res.status === 409 || res.status === 400) {
        // Already registered (or already verified): login will tell.
        existing += 1;
      } else {
        failed += 1;
      }
    });
    if (verifies.length) {
      http.batch(verifies).forEach((res) => {
        if (res.status !== 200) failed += 1;
      });
    }
  }
  console.log(`provisionUsers: created=${created} existing=${existing} failed=${failed}`);
  if (created + existing === 0) {
    throw new Error(
      "No test users could be provisioned. Is the gateway reachable at K6_BASE_URL, running with " +
        "NODE_ENV!=production (dev_otp) and a raised AUTH_RATE_LIMIT_MAX? See loadtest/k6/README.md."
    );
  }
  return { provisioned: created, skipped: false };
}

// ---------------------------------------------------------------------------
// Per-VU session
// ---------------------------------------------------------------------------
let session = null; // module state is per VU in k6

/** Logs the current VU in (once) and fetches its CSRF token. Returns the session. */
// Authenticates virtual user threads and caches session cookies and CSRF tokens.
// Executes login flow, extracts tokens, and associates session state with VUs.
// Returns initialized session objects or records failures if login fails.
export function ensureSession() {
  if (session) return session;
  const index = (__VU - 1) % USER_COUNT;
  const email = userEmail(index);
  const res = http.post(`${API}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: jsonHeaders,
    tags: { name: "login", class: "auth" },
  });
  if (res.status !== 200) {
    loginFailures.add(1);
    console.error(`VU ${__VU}: login failed for ${email} -> ${res.status} ${String(res.body).slice(0, 120)}`);
    return null;
  }
  const csrfRes = http.get(`${API}/auth/csrf`, { tags: { name: "csrf", class: "auth" } });
  const csrfToken = bodyJson(csrfRes)?.csrf_token;
  if (csrfRes.status !== 200 || !csrfToken) {
    loginFailures.add(1);
    console.error(`VU ${__VU}: CSRF token request failed -> ${csrfRes.status}`);
    return null;
  }
  session = { index, email, csrfToken, chatSessionId: null };
  return session;
}

/** Headers for a mutating request: CSRF double-submit + optional Idempotency-Key. */
// Constructs standard HTTP mutation headers including CSRF and idempotency keys.
// Ensures double-submit cookie verification and prevents duplicate executions.
// Merges baseline security headers with optional route-specific attributes.
export function mutatingHeaders(extra = {}) {
  const s = ensureSession();
  return {
    "Content-Type": "application/json",
    "x-csrf-token": s ? s.csrfToken : "",
    "Idempotency-Key": idempotencyKey(),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Request classes. Every helper tags `class` so thresholds can select it.
// ---------------------------------------------------------------------------
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const READ_PATHS = [
  ["dashboard_summary", "/dashboard/summary"],
  ["transactions_list", "/transactions?limit=20"],
  ["transactions_recent", "/transactions/recent?limit=10"],
  ["transactions_summary", `/transactions/summary?from=${isoDaysAgo(90)}&to=${isoDaysAgo(0)}`],
  ["budget_health", "/budget-health"],
  ["portfolio_summary", "/portfolio/summary"],
];

// Dispatches randomized read queries across dashboards, portfolios, and summaries.
// Evaluates API response codes against standard HTTP 2xx success criteria.
// Tracks execution errors and request latencies for non-mutating operations.
export function readRequest() {
  const [name, path] = pick(READ_PATHS);
  const res = http.get(`${API}${path}`, { tags: { name, class: "read" } });
  const ok = check(res, { "read 2xx": (r) => r.status >= 200 && r.status < 300 });
  apiErrors.add(!ok);
  return res;
}

// Dispatches transaction creation requests with randomized amounts and categories.
// Attaches required CSRF tokens and idempotency keys to mutation payloads.
// Asserts successful response statuses and updates error rate metrics.
export function writeRequest() {
  const body = {
    amount: Math.round((5 + Math.random() * 95) * 100) / 100,
    category: pick(["Groceries", "Transport", "Dining", "Utilities", "Entertainment"]),
    description: `k6 load test ${uuid().slice(0, 8)}`,
    type: "expense",
  };
  const res = http.post(`${API}/transactions`, JSON.stringify(body), {
    headers: mutatingHeaders(),
    tags: { name: "transactions_create", class: "write" },
  });
  const ok = check(res, { "write 2xx": (r) => r.status >= 200 && r.status < 300 });
  apiErrors.add(!ok);
  return res;
}

// Prompts. The deterministic ones are answered from computed tables; the
// others go through the LLM path. The split is an approximation: the real
// route is decided by AI Core, so treat the per-kind thresholds as indicative.
const DETERMINISTIC_PROMPTS = [
  "What is my total spending this month?",
  "Show my top spending categories",
  "How much have I saved this year?",
];
const LLM_PROMPTS = [
  "Explain how I could reduce my dining expenses and what trade-offs that involves.",
  "Write a short narrative summary of my financial health.",
];

const isShed = (res) =>
  (res.status === 429 || res.status === 503) && Boolean(res.headers["Retry-After"] || res.headers["retry-after"]);

// Issues AI commands to the command processing engine across routes and prompts.
// Distinguishes between deterministic computation tasks and model-backed queries.
// Tracks response times, graceful shedding events, and execution failures.
export function aiRequest() {
  const llm = Math.random() < 0.6; // ~45/min steady LLM demand vs 75/min total
  const kind = llm ? "llm" : "det";
  const res = http.post(
    `${API}/process-command`,
    JSON.stringify({ command: pick(llm ? LLM_PROMPTS : DETERMINISTIC_PROMPTS) }),
    {
      headers: mutatingHeaders(),
      tags: { name: "ai_process_command", class: "ai", ai_kind: kind },
      timeout: "60s",
    }
  );
  const shed = isShed(res);
  const ok = res.status >= 200 && res.status < 300;
  aiShed.add(shed);
  aiOk.add(ok);
  aiOther.add(!ok && !shed);
  if (!shed) aiDuration.add(res.timings.duration, { ai_kind: kind });
  return res;
}

// Simulates conversational assistant interactions by creating and messaging sessions.
// Manages chat session lifetimes and sends financial advice prompts.
// Records response latencies and evaluates against conversation SLO thresholds.
export function chatRequest() {
  const s = ensureSession();
  if (!s) return null;
  if (!s.chatSessionId) {
    const created = http.post(`${API}/chat/sessions`, "{}", {
      headers: mutatingHeaders(),
      tags: { name: "chat_session_create", class: "chat" },
    });
    const body = bodyJson(created) || {};
    s.chatSessionId = (body.session && (body.session._id || body.session.id)) || body._id || body.id || null;
    if (!s.chatSessionId) {
      apiErrors.add(true);
      return created;
    }
  }
  const res = http.post(
    `${API}/chat/sessions/${s.chatSessionId}/messages`,
    JSON.stringify({ content: pick(DETERMINISTIC_PROMPTS) }),
    { headers: mutatingHeaders(), tags: { name: "chat_send", class: "chat" }, timeout: "60s" }
  );
  const shed = isShed(res);
  const ok = res.status >= 200 && res.status < 300;
  aiShed.add(shed);
  aiOk.add(ok);
  aiOther.add(!ok && !shed);
  return res;
}

/**
 * One iteration of the standard mix: 70% reads, 15% writes, 10% AI, 5% chat.
 * Weights can be overridden with K6_MIX="70,15,10,5".
 */
const MIX = (__ENV.K6_MIX || "70,15,10,5").split(",").map((v) => parseFloat(v));
const MIX_TOTAL = MIX.reduce((a, b) => a + b, 0);

// Executes weighted mixed traffic iterations consisting of reads, writes, and AI.
// Weights operations according to realistic user traffic distribution models.
// Pauses between iterations according to configured think-time boundaries.
export function mixedIteration(think = [2, 4]) {
  if (!ensureSession()) {
    sleep(5);
    return;
  }
  let roll = Math.random() * MIX_TOTAL;
  if ((roll -= MIX[0]) < 0) readRequest();
  else if ((roll -= MIX[1]) < 0) writeRequest();
  else if ((roll -= MIX[2]) < 0) aiRequest();
  else chatRequest();
  sleep(think[0] + Math.random() * (think[1] - think[0]));
}

/** Thresholds shared by load and soak runs (nominal load). */
// Returns baseline SLO threshold definitions for nominal platform load testing.
// Enforces duration percentiles and error rate ceilings on read and write routes.
// Specifies expected AI success rates, shedding ceilings, and login thresholds.
export function nominalThresholds() {
  return {
    "http_req_duration{class:read}": [`p(95)<${SLO.apiP95Ms}`],
    "http_req_duration{class:write}": [`p(95)<${SLO.apiP95Ms}`],
    "http_req_failed{class:read}": [`rate<${1 - SLO.apiAvailability}`],
    "http_req_failed{class:write}": [`rate<${1 - SLO.apiAvailability}`],
    finwise_api_errors: [`rate<${1 - SLO.apiAvailability}`],
    "finwise_ai_duration{ai_kind:det}": [`p(95)<${SLO.aiDeterministicP95Ms}`],
    "finwise_ai_duration{ai_kind:llm}": [`p(95)<${SLO.aiLlmP95Ms}`],
    finwise_ai_ok: [`rate>${SLO.aiSuccess}`],
    finwise_ai_shed: [`rate<${SLO.shedRateNominal}`],
    finwise_login_failures: ["count==0"],
  };
}

/** Prometheus scrape helper (needs K6_METRICS_URL + K6_METRICS_TOKEN; direct to the gateway, not via nginx). */
// Scrapes Prometheus gauge metric endpoints directly from internal gateways.
// Parses raw text metric series and aggregates values matching target prefixes.
// Returns parsed numeric totals or null if metrics cannot be accessed.
export function scrapeGauge(seriesPrefix) {
  const url = __ENV.K6_METRICS_URL;
  if (!url) return null;
  const res = http.get(url, {
    headers: { Authorization: `Bearer ${__ENV.K6_METRICS_TOKEN || ""}` },
    tags: { name: "metrics_scrape" },
  });
  if (res.status !== 200) return null;
  let total = 0;
  let seen = false;
  String(res.body)
    .split("\n")
    .forEach((line) => {
      if (line.startsWith(seriesPrefix)) {
        const v = parseFloat(line.split(" ").pop());
        if (!isNaN(v)) {
          total += v;
          seen = true;
        }
      }
    });
  return seen ? total : null;
}
