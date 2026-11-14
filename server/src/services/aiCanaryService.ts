/**
 * @fileoverview AI Canary Service - Client & Fallback for Continuous Production Invariant Validation
 *
 * Coordinates continuous verification of mathematical invariants:
 * 1. Number Safety: Candidate Digits \subseteq Reference Digits
 * 2. Zero-Sum Reallocation: \sum \Delta B_i = 0 and B_i \ge 0
 * 3. Balance Sheet Identity: Assets - Liabilities = Net Worth
 * 4. Cash Flow Identity: Income - Expenses = Net Cash Flow
 * 5. Debt Amortization: Principal + Interest = Total Payment
 *
 * Gracefully proxies to the Python FastAPI AI Core service when reachable,
 * with deterministic local fallback math when AI Core is not running.
 *
 * @module services/aiCanaryService
 */

import axios from "axios";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import { aiCoreHeaders } from "./aiCoreTransport";
import { HttpError } from "../middleware/httpError";
import type { CanaryValidateBody } from "../schemas/v1/aiCanarySchemas";

// Interface defining the schema of an individual invariant verification check result.
// Records probe identity, timestamp, invariant classification, execution duration, and detected violations.
export interface CanaryCheckItem {
  probe_id: string;
  timestamp: string;
  invariant: string;
  source: string;
  passed: boolean;
  duration_ms: number;
  details: Record<string, any>;
  violations: string[];
}

// Comprehensive health summary interface consolidating invariant pass rates and historical telemetry.
// Contains aggregate evaluation counts, category breakdowns, and the rolling audit event log.
export interface CanaryHealthSummary {
  status: "healthy" | "warning" | "critical";
  total_evaluations: number;
  passed_evaluations: number;
  failed_evaluations: number;
  pass_rate_pct: number;
  last_evaluated_at: string | null;
  by_invariant: Record<string, { total: number; passed: number; failed: number; pass_rate_pct: number }>;
  by_source: Record<string, { total: number; passed: number; failed: number; pass_rate_pct: number }>;
  recent_events: CanaryCheckItem[];
  fallback_mode?: boolean;
}

// In-memory fallback tracking for node-side canary evaluation. Keep only
// aggregate counters, not another workspace's financial input or violations.
let lastFallbackAt: string | null = null;
// The source aggregates checks across every workspace. Never expose their raw
// values or violations to a different authenticated user.
const publicHealth = (health: CanaryHealthSummary): CanaryHealthSummary => ({
  ...health,
  // AI Core groups by client-supplied `source`; its map keys may themselves
  // contain another tenant's private data. Keep only fixed invariant aggregates.
  by_source: {},
  recent_events: [],
});
let fallbackTotal = 0;
let fallbackPassed = 0;
let fallbackFailed = 0;

// Extracts all currency and numerical tokens from input text using regular expression pattern matching.
// Normalizes matched numbers by stripping currency symbols and punctuation for invariant comparison.
function extractNumbersLocal(text: string): Set<string> {
  const matches = (text || "").match(/(?:(?<!\d)[−-])?(?:[₹$€£¥][−-]?[ \t]*)?\d[\d,]*(?:\.\d+)?%?/g) || [];
  const normalized = new Set<string>();
  for (const match of matches) {
    const cleaned = match.replace(/−/g, "-").replace(/[₹$€£¥, \t]/g, "");
    normalized.add(cleaned);
  }
  return normalized;
}

// Updates aggregate counters and the most recent timestamp without retaining
// financial values or violations from another workspace.
function recordFallbackEvent(event: CanaryCheckItem): void {
  fallbackTotal += 1;
  if (event.passed) fallbackPassed += 1;
  else fallbackFailed += 1;
  lastFallbackAt = event.timestamp;
}

// Compiles the current in-memory invariant health status and pass rates during AI Core downtime.
// Categorizes system health into healthy, warning, or critical based on fallback evaluation pass rate thresholds.
function getLocalFallbackHealth(): CanaryHealthSummary {
  const passRate = fallbackTotal > 0 ? (fallbackPassed / fallbackTotal) * 100 : 0;
  let status: "healthy" | "warning" | "critical" = fallbackTotal > 0 ? "healthy" : "warning";
  if (passRate < 95.0 && fallbackTotal > 0) status = "critical";
  else if (passRate < 99.0 && fallbackTotal > 0) status = "warning";

  return {
    status,
    total_evaluations: fallbackTotal,
    passed_evaluations: fallbackPassed,
    failed_evaluations: fallbackFailed,
    pass_rate_pct: Math.round(passRate * 10) / 10,
    last_evaluated_at: lastFallbackAt,
    by_invariant: {
      number_subset: { total: fallbackTotal, passed: fallbackPassed, failed: fallbackFailed, pass_rate_pct: Math.round(passRate * 10) / 10 },
      zero_sum_reallocation: { total: 0, passed: 0, failed: 0, pass_rate_pct: 0 },
      balance_sheet_conservation: { total: 0, passed: 0, failed: 0, pass_rate_pct: 0 },
      cashflow_conservation: { total: 0, passed: 0, failed: 0, pass_rate_pct: 0 },
      debt_amortization: { total: 0, passed: 0, failed: 0, pass_rate_pct: 0 },
    },
    by_source: {
      node_fallback: { total: fallbackTotal, passed: fallbackPassed, failed: fallbackFailed, pass_rate_pct: Math.round(passRate * 10) / 10 },
    },
    recent_events: [],
    fallback_mode: true,
  };
}

// Fetches live mathematical invariant health status from the Python AI Core service.
// Gracefully degrades to local in-memory fallback health metrics if the AI Core service is offline.
export async function fetchCanaryHealth(requestId?: string): Promise<{
  success: boolean;
  canary: CanaryHealthSummary;
  source: "ai_core" | "node_fallback";
}> {
  const env = getEnv();
  const timeoutMs = env.AI_CORE_STATUS_TIMEOUT_MS || 2500;

  try {
    const res = await axios.get(`${env.PYTHON_API_URL}/api/canary/number-safety`, {
      timeout: timeoutMs,
      headers: aiCoreHeaders({ requestId: requestId || "req-canary-health" }),
    });
    if (res.data?.canary) {
      return {
        success: true,
        canary: publicHealth(res.data.canary),
        source: "ai_core",
      };
    }
  } catch (err: any) {
    logger.debug(`AI Core canary status probe unreachable (${err?.message}); using deterministic fallback.`);
  }

  return {
    success: true,
    canary: getLocalFallbackHealth(),
    source: "node_fallback",
  };
}

// Validates candidate numerical outputs against number safety, budget rebalancing, and conservation invariants.
// Dispatches evaluation to AI Core with automatic failover to deterministic local verification logic.
export async function evaluateCanaryInvariants(
  body: CanaryValidateBody,
  requestId?: string,
): Promise<{
  status: "success";
  all_passed: boolean;
  results: CanaryCheckItem[];
  canary_health: CanaryHealthSummary;
  source: "ai_core" | "node_fallback";
}> {
  const env = getEnv();
  const timeoutMs = env.AI_CORE_STATUS_TIMEOUT_MS || 3000;

  try {
    // Never let caller-provided labels become unbounded global health-map keys.
    const res = await axios.post(`${env.PYTHON_API_URL}/api/canary/number-safety/validate`, { ...body, source: "external_validation" }, {
      timeout: timeoutMs,
      headers: aiCoreHeaders({ requestId: requestId || "req-canary-validate" }),
    });
    if (res.data && res.data.results) {
      return {
        status: "success",
        all_passed: res.data.all_passed,
        results: res.data.results,
        canary_health: res.data.canary_health ? publicHealth(res.data.canary_health) : getLocalFallbackHealth(),
        source: "ai_core",
      };
    }
  } catch (err: any) {
    logger.debug(`AI Core validate endpoint unreachable (${err?.message}); computing deterministic local verification.`);
  }

  // Deterministic local invariant fallback execution
  const results: CanaryCheckItem[] = [];
  const src = "external_validation";

  // 1. Number safety check
  if (body.candidate !== undefined && body.reference !== undefined) {
    const t0 = performance.now();
    const candNums = extractNumbersLocal(body.candidate);
    const refNums = extractNumbersLocal(body.reference);
    const introduced: string[] = [];
    candNums.forEach((num) => {
      if (!refNums.has(num)) introduced.push(num);
    });

    const passed = introduced.length === 0;
    const dur = performance.now() - t0;
    const violations = passed ? [] : [`Hallucinated numeric tokens detected: ${introduced.sort()}`];

    const item: CanaryCheckItem = {
      probe_id: `canary-subset-fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      invariant: "number_subset",
      source: src,
      passed,
      duration_ms: Math.round(dur * 100) / 100,
      details: {
        candidate_numbers: Array.from(candNums).sort(),
        reference_numbers: Array.from(refNums).sort(),
        introduced_numbers: introduced.sort(),
      },
      violations,
    };
    recordFallbackEvent(item);
    results.push(item);
  }

  // 2. Budget rebalance check
  if (body.initial_allocations && body.proposed_allocations) {
    const t0 = performance.now();
    const init = body.initial_allocations;
    const prop = body.proposed_allocations;
    const allCats = Array.from(new Set([...Object.keys(init), ...Object.keys(prop)]));

    const violations: string[] = [];
    const deltas: Record<string, number> = {};
    let sumDeltas = 0;

    for (const cat of allCats) {
      const initVal = init[cat] || 0;
      const propVal = prop[cat] || 0;
      if (propVal < -1e-4) {
        violations.push(`Negative allocation detected for category '${cat}': ${propVal.toFixed(2)}`);
      }
      const delta = propVal - initVal;
      deltas[cat] = Math.round(delta * 10000) / 10000;
      sumDeltas += delta;
    }

    sumDeltas = Math.round(sumDeltas * 10000) / 10000;
    if (Math.abs(sumDeltas) > 1e-4) {
      violations.push(`Budget pool conservation broken: total delta is ${sumDeltas > 0 ? "+" : ""}${sumDeltas.toFixed(2)}`);
    }

    const passed = violations.length === 0;
    const dur = performance.now() - t0;
    const item: CanaryCheckItem = {
      probe_id: `canary-rebalance-fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      invariant: "zero_sum_reallocation",
      source: src,
      passed,
      duration_ms: Math.round(dur * 100) / 100,
      details: { deltas, sum_deltas: sumDeltas },
      violations,
    };
    recordFallbackEvent(item);
    results.push(item);
  }

  // 3. Balance sheet check
  if (body.assets !== undefined && body.liabilities !== undefined && body.net_worth !== undefined) {
    const t0 = performance.now();
    const computed = Math.round((body.assets - body.liabilities) * 100) / 100;
    const provided = Math.round(body.net_worth * 100) / 100;
    const diff = Math.round(Math.abs(computed - provided) * 100) / 100;
    const passed = diff <= 0.05;
    const violations = passed ? [] : [`Balance sheet conservation broken: Assets - Liabilities = ${computed}, but Net Worth is ${provided}`];

    const dur = performance.now() - t0;
    const item: CanaryCheckItem = {
      probe_id: `canary-bs-fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      invariant: "balance_sheet_conservation",
      source: src,
      passed,
      duration_ms: Math.round(dur * 100) / 100,
      details: { assets: body.assets, liabilities: body.liabilities, net_worth: body.net_worth, diff },
      violations,
    };
    recordFallbackEvent(item);
    results.push(item);
  }

  // 4. Cash flow check
  if (body.income !== undefined && body.expenses !== undefined && body.net_cashflow !== undefined) {
    const t0 = performance.now();
    const computed = Math.round((body.income - body.expenses) * 100) / 100;
    const provided = Math.round(body.net_cashflow * 100) / 100;
    const diff = Math.round(Math.abs(computed - provided) * 100) / 100;
    const passed = diff <= 0.05;
    const violations = passed ? [] : [`Cash flow conservation broken: Income - Expenses = ${computed}, but Net Cash Flow is ${provided}`];

    const dur = performance.now() - t0;
    const item: CanaryCheckItem = {
      probe_id: `canary-cf-fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      invariant: "cashflow_conservation",
      source: src,
      passed,
      duration_ms: Math.round(dur * 100) / 100,
      details: { income: body.income, expenses: body.expenses, net_cashflow: body.net_cashflow, diff },
      violations,
    };
    recordFallbackEvent(item);
    results.push(item);
  }

  const allPassed = results.length > 0 && results.every((r) => r.passed);
  return {
    status: "success",
    all_passed: allPassed,
    results,
    canary_health: getLocalFallbackHealth(),
    source: "node_fallback",
  };
}

// Triggers an execution pass of the automated synthetic canary probe suite against invariant rules.
// Proxies execution to AI Core when available or returns a deterministic local test report.
export async function runCanaryProbeSuite(
  sampleSize?: number,
  requestId?: string,
): Promise<{
  status: "success";
  report: any;
  source: "ai_core" | "node_fallback";
}> {
  const env = getEnv();
  const timeoutMs = env.AI_CORE_STATUS_TIMEOUT_MS || 5000;

  try {
    const res = await axios.post(
      `${env.PYTHON_API_URL}/api/canary/number-safety/run-probes`,
      { sample_size: sampleSize },
      {
        timeout: timeoutMs,
        headers: aiCoreHeaders({ requestId: requestId || "req-canary-probes" }),
      },
    );
    if (res.data?.report) {
      return {
        status: "success",
        report: {
          ...res.data.report,
          health_summary: res.data.report.health_summary ? publicHealth(res.data.report.health_summary) : undefined,
        },
        source: "ai_core",
      };
    }
  } catch (err: any) {
    logger.debug(`AI Core run-probes unreachable (${err?.message}); no probe suite was run.`);
  }

  throw new HttpError(503, "CANARY_PROBES_UNAVAILABLE", "Canary probe service unavailable");
}
