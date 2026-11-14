/**
 * @fileoverview Nightly `ai_optimize` worker job: asks AI Core to run its learning optimizer
 * (`POST /api/learning/optimize/run`) once per organization that has not opted out of AI learning.
 *
 * - Runs inside the worker only (never in tests). A leader lease means one replica enqueues.
 * - A per-day claim row (`leader_locks`, name `ai-optimize:YYYY-MM-DD`) prevents a second run on the
 *   same UTC day after restarts or lease hand-over.
 * - AI Core may not implement the endpoint yet: 404/405/501 are tolerated (logged, not retried or dead-lettered).
 * - Other failures are dead-lettered (`dead_letter_jobs`, kind `ai_optimize`, jobId = orgId) so an admin can replay.
 *
 * Env: AI_OPTIMIZE_ENABLED (true), AI_OPTIMIZE_HOUR_UTC (3), AI_OPTIMIZE_CHECK_INTERVAL_MS (600000).
 */
import mongoose from "mongoose";

import { logger } from "../config/logger";
import LeaderLockModel from "../models/leaderLockModel";
import OrganizationModel from "../models/organizationModel";
import { aiCoreRequest } from "./aiCoreClient";
import { tryAcquireLeadership } from "./leaderElection";
import { writeDeadLetter } from "./jobRetry";

// Execution outcome status classifications for organization optimization runs.
// Distinguishes between successful execution, missing endpoints, and job failures.
// Used by nightly schedulers to aggregate execution statistics and trigger alerts.
export type OptimizeOutcome = "ok" | "not_implemented" | "failed";

// Set of HTTP status codes indicating that the optimization endpoint is unsupported.
// Covers 404 Not Found, 405 Method Not Allowed, and 501 Not Implemented.
// Used to cleanly halt repetitive calls if the AI Core build lacks optimizer support.
const NOT_IMPLEMENTED_STATUSES = new Set([404, 405, 501]);

/** Calls AI Core's optimizer for one org. Never throws. */
// Invokes AI Core's offline learning optimizer for a specified organization.
// Sends internal administrative request headers and enforces an extended timeout.
// Catches errors gracefully and returns an outcome status without throwing exceptions.
export const runOptimizeForOrg = async (orgId: string): Promise<{ outcome: OptimizeOutcome; error?: string }> => {
  try {
    await aiCoreRequest({
      method: "post",
      path: "/api/learning/optimize/run",
      data: { scope: "org" },
      headers: { "X-Internal-Org-Id": orgId, "X-Internal-User-Id": "system", "X-Internal-Role": "admin" },
      timeoutMs: 120_000,
      idempotent: false,
    });
    return { outcome: "ok" };
  } catch (error: any) {
    const status = Number(error?.response?.status);
    if (NOT_IMPLEMENTED_STATUSES.has(status)) return { outcome: "not_implemented" };
    return { outcome: "failed", error: String(error?.message ?? error) };
  }
};

// Formats a Date object into a UTC calendar day string in YYYY-MM-DD format.
// Provides a deterministic daily partition key for leader lock registrations.
// Prevents multiple replicas from executing duplicate scheduled runs on the same date.
const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/** Claims "today's run" exactly once across replicas/restarts. */
// Claims exclusive execution rights for today's optimization run using leader locks.
// Relies on database unique constraints on leader lock names to guarantee exclusivity.
// Returns true if the current worker successfully acquired the daily execution lock.
const claimDailyRun = async (now: Date): Promise<boolean> => {
  try {
    await LeaderLockModel.create({ name: `ai-optimize:${dayKey(now)}`, holder: "worker", expiresAt: new Date(now.getTime() + 25 * 60 * 60 * 1000) });
    return true;
  } catch (error: any) {
    if (error?.code === 11000) return false;
    throw error;
  }
};

/** Runs the optimizer for every non-opted-out org. Returns counts. */
// Iterates across all active organizations that have not opted out of AI learning.
// Triggers the optimization pipeline per organization and tracks aggregate outcomes.
// Enqueues dead-letter jobs for failed runs to support administrative replay.
export const runNightlyOptimize = async (): Promise<{ orgs: number; ok: number; notImplemented: number; failed: number }> => {
  const counts = { orgs: 0, ok: 0, notImplemented: 0, failed: 0 };
  const cursor = OrganizationModel.find({ aiLearningOptOut: { $ne: true } }).select({ _id: 1 }).lean().cursor();

  for await (const org of cursor as AsyncIterable<{ _id: mongoose.Types.ObjectId }>) {
    counts.orgs += 1;
    const orgId = String(org._id);
    const result = await runOptimizeForOrg(orgId);
    if (result.outcome === "ok") counts.ok += 1;
    else if (result.outcome === "not_implemented") {
      counts.notImplemented += 1;
      // The endpoint does not exist on this AI Core build: stop hammering it for every org.
      logger.info({ event: "ai_optimize_not_implemented" }, "AI Core optimizer endpoint not available; skipping nightly run");
      break;
    } else {
      counts.failed += 1;
      await writeDeadLetter({ kind: "ai_optimize", jobId: orgId, orgId, attempts: 1, error: result.error ?? "optimize failed" }).catch(() => undefined);
    }
  }
  return counts;
};

// Initializes the background timer polling for nightly AI optimization schedules.
// Verifies leader lease ownership and daily run claims before triggering tasks.
// Returns a controller handle exposing a stop callback to cancel the timer.
export const startAiOptimizeScheduler = (): { stop: () => void } => {
  const enabled = String(process.env.AI_OPTIMIZE_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled || process.env.NODE_ENV === "test") return { stop: () => undefined };

  const hour = Math.min(23, Math.max(0, Number.parseInt(process.env.AI_OPTIMIZE_HOUR_UTC ?? "3", 10) || 0));
  const intervalMs = Math.max(30_000, Number.parseInt(process.env.AI_OPTIMIZE_CHECK_INTERVAL_MS ?? "600000", 10) || 600_000);
  let running = false;

  const tick = async () => {
    if (running) return;
    const now = new Date();
    if (now.getUTCHours() !== hour) return;
    running = true;
    try {
      if (!(await tryAcquireLeadership("ai-optimize", intervalMs * 3))) return;
      if (!(await claimDailyRun(now))) return;
      const counts = await runNightlyOptimize();
      logger.info({ event: "ai_optimize_nightly_done", ...counts }, "Nightly AI optimize finished");
    } catch (error) {
      logger.warn({ err: (error as Error)?.message }, "Nightly AI optimize tick failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  logger.info({ event: "ai_optimize_scheduler_started", hour_utc: hour }, "Nightly AI optimize scheduler started");
  return { stop: () => clearInterval(timer) };
};
