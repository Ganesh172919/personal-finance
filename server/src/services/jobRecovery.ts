/**
 * @fileoverview Stale & Orphaned Job Recovery (visibility timeout)
 *
 * Jobs left in `running` past the lease (worker crash, OOM, container restart) are NOT simply
 * failed. Each one counts as a failed attempt via `registerJobFailure`:
 *   - attempts remaining  -> requeued (`status: queued`, exponential backoff + jitter)
 *   - attempts exhausted  -> `failed` + a persistent `dead_letter_jobs` row (admin replay)
 *
 * Lease length: `maxRunningDurationMs` option, else `WORKER_JOB_VISIBILITY_TIMEOUT_MS`, else 15 minutes.
 *
 * @module services/jobRecovery
 */

import type { Model } from "mongoose";

import ExportJobModel from "../models/exportJobModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import IntegrationConnectionModel from "../models/integrationConnectionModel";
import WorkflowRunModel from "../models/workflowRunModel";
import { logger } from "../config/logger";
import { registerJobFailure, type RetryableJobKind } from "./jobRetry";

/** Default threshold: jobs running longer than 15 minutes are considered abandoned */
// Default duration threshold in milliseconds before running jobs are marked stale.
// Sets standard fifteen-minute visibility timeout for asynchronous worker tasks.
// Used as fallback when custom environment timeout configurations are omitted.
export const DEFAULT_STALE_JOB_THRESHOLD_MS = 15 * 60 * 1000;

// Derives the active timeout threshold after which running jobs are deemed abandoned.
// Reads configured environment variables with safety limits and fallback defaults.
// Guarantees consistent lease durations across background worker sweepers.
export const staleJobThresholdMs = (): number => {
  const parsed = Number.parseInt(String(process.env.WORKER_JOB_VISIBILITY_TIMEOUT_MS ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_STALE_JOB_THRESHOLD_MS;
};

// Metrics summary returned following completion of a stale job recovery sweep.
// Details counts of recovered workflows, integrations, exports, and dead letters.
// Provides operational visibility into asynchronous job resiliency actions.
export interface StaleJobRecoveryResult {
  /** Stale workflow runs handled (requeued + dead-lettered). */
  workflowsRecovered: number;
  integrationsRecovered: number;
  exportsRecovered: number;
  requeued: number;
  deadLettered: number;
  timestamp: string;
}

// Informational error descriptors mapped across distinct retryable job types.
// Applied when registered jobs exceed visibility lease duration limits.
// Facilitates clear administrative diagnostics within dead-letter records.
const LEASE_MESSAGES: Record<RetryableJobKind, string> = {
  workflow_run: "Execution timed out or worker process terminated unexpectedly",
  integration_sync_run: "Sync timed out or worker restarted during execution",
  export_job: "Export generation timed out or worker restarted",
};

/**
 * Sweeps the database for orphaned running jobs; requeues them or dead-letters them after max attempts.
 */
// Sweeps the database for orphaned background tasks running past their visibility lease.
// Requeues retryable jobs with backoff or relegates exhausted jobs to dead-letter queues.
// Updates corresponding connector statuses and logs consolidated recovery metrics.
export async function recoverStaleJobs(options?: { maxRunningDurationMs?: number }): Promise<StaleJobRecoveryResult> {
  const thresholdMs = options?.maxRunningDurationMs ?? staleJobThresholdMs();
  const cutoff = new Date(Date.now() - thresholdMs);
  const now = new Date();
  const leaseLabel = `lease exceeded ${Math.round(thresholdMs / 60000)}m`;

  try {
    let requeued = 0;
    let deadLettered = 0;

    const sweep = async (kind: RetryableJobKind, model: Model<any>, extraSelect: Record<string, 1> = {}) => {
      const stale: any[] = await model
        .find({ status: "running", startedAt: { $lt: cutoff } })
        .select({ _id: 1, orgId: 1, ...extraSelect })
        .lean();
      let handled = 0;
      const dead: any[] = [];
      for (const job of stale) {
        const outcome = await registerJobFailure(kind, String(job._id), new Error(`${LEASE_MESSAGES[kind]} (${leaseLabel})`), { retryable: true });
        if (outcome === "requeued") requeued += 1;
        if (outcome === "dead_lettered") {
          deadLettered += 1;
          dead.push(job);
        }
        if (outcome !== "skipped") handled += 1;
      }
      return { handled, dead };
    };

    const workflows = await sweep("workflow_run", WorkflowRunModel as unknown as Model<any>);
    const syncs = await sweep("integration_sync_run", IntegrationSyncRunModel as unknown as Model<any>, { connectorKey: 1 });
    const exportsSweep = await sweep("export_job", ExportJobModel as unknown as Model<any>);

    if (syncs.dead.length > 0) {
      await IntegrationConnectionModel.updateMany(
        {
          orgId: { $in: syncs.dead.map((r) => r.orgId) },
          connectorKey: { $in: syncs.dead.map((r) => r.connectorKey) },
          status: "syncing",
        },
        { $set: { status: "error", lastError: "Sync worker terminated unexpectedly" } }
      );
    }

    const result: StaleJobRecoveryResult = {
      workflowsRecovered: workflows.handled,
      integrationsRecovered: syncs.handled,
      exportsRecovered: exportsSweep.handled,
      requeued,
      deadLettered,
      timestamp: now.toISOString(),
    };

    if (workflows.handled > 0 || syncs.handled > 0 || exportsSweep.handled > 0) {
      logger.warn(result, "Swept orphaned stale running jobs (requeued or dead-lettered)");
    }

    return result;
  } catch (err) {
    logger.error({ err }, "Failed while running stale job recovery sweep");
    throw err;
  }
}
