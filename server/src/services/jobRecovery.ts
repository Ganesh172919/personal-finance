/**
 * @fileoverview Stale & Orphaned Job Recovery Service
 *
 * Automatically detects and recovers background jobs that were left in the
 * `running` status due to worker process crashes, uncaught exceptions,
 * network partitions, or container restarts.
 *
 * Without this mechanism, crashed jobs remain in `status: "running"`
 * indefinitely, causing user interfaces to display infinite spinners and
 * blocking subsequent idempotent runs.
 *
 * @module services/jobRecovery
 */

import ExportJobModel from "../models/exportJobModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import IntegrationConnectionModel from "../models/integrationConnectionModel";
import WorkflowRunModel from "../models/workflowRunModel";
import { logger } from "../config/logger";
import { fireAndForget } from "./deadLetterQueue";

/** Default threshold: jobs running longer than 15 minutes are considered abandoned */
export const DEFAULT_STALE_JOB_THRESHOLD_MS = 15 * 60 * 1000;

export interface StaleJobRecoveryResult {
  workflowsRecovered: number;
  integrationsRecovered: number;
  exportsRecovered: number;
  timestamp: string;
}

/**
 * Sweeps the database for orphaned running jobs and transitions them to "failed".
 *
 * @param {object} [options]
 * @param {number} [options.maxRunningDurationMs] - Max duration before a job is declared stale (default 15m)
 * @returns {Promise<StaleJobRecoveryResult>} Number of recovered jobs per category
 */
export async function recoverStaleJobs(options?: {
  maxRunningDurationMs?: number;
}): Promise<StaleJobRecoveryResult> {
  const thresholdMs = options?.maxRunningDurationMs ?? DEFAULT_STALE_JOB_THRESHOLD_MS;
  const cutoff = new Date(Date.now() - thresholdMs);
  const now = new Date();

  try {
    // 1. Recover stale Workflow Runs
    const wfResult = await WorkflowRunModel.updateMany(
      { status: "running", startedAt: { $lt: cutoff } },
      {
        $set: {
          status: "failed",
          finishedAt: now,
          error: `Execution timed out or worker process terminated unexpectedly (lease exceeded ${Math.round(thresholdMs / 60000)}m)`,
        },
      }
    );

    // 2. Recover stale Integration Sync Runs
    const syncRunsToFail = await IntegrationSyncRunModel.find({
      status: "running",
      startedAt: { $lt: cutoff },
    })
      .select({ _id: 1, orgId: 1, connectorKey: 1 })
      .lean();

    let integrationsRecovered = 0;
    if (syncRunsToFail.length > 0) {
      const syncRunIds = syncRunsToFail.map((r) => r._id);
      const updateSyncRes = await IntegrationSyncRunModel.updateMany(
        { _id: { $in: syncRunIds } },
        {
          $set: {
            status: "failed",
            finishedAt: now,
            error: `Sync timed out or worker restarted during execution (lease exceeded ${Math.round(thresholdMs / 60000)}m)`,
          },
        }
      );
      integrationsRecovered = updateSyncRes.modifiedCount || 0;

      // Also reset any connection that was locked in "syncing"
      const connectorKeys = syncRunsToFail.map((r) => r.connectorKey);
      const orgIds = syncRunsToFail.map((r) => r.orgId);
      await IntegrationConnectionModel.updateMany(
        { orgId: { $in: orgIds }, connectorKey: { $in: connectorKeys }, status: "syncing" },
        {
          $set: {
            status: "error",
            lastError: "Sync worker terminated unexpectedly",
          },
        }
      );
    }

    // 3. Recover stale Export Jobs
    const exportResult = await ExportJobModel.updateMany(
      { status: "running", startedAt: { $lt: cutoff } },
      {
        $set: {
          status: "failed",
          finishedAt: now,
          error: `Export generation timed out or worker restarted (lease exceeded ${Math.round(thresholdMs / 60000)}m)`,
        },
      }
    );

    const workflowsRecovered = wfResult.modifiedCount || 0;
    const exportsRecovered = exportResult.modifiedCount || 0;

    const result: StaleJobRecoveryResult = {
      workflowsRecovered,
      integrationsRecovered,
      exportsRecovered,
      timestamp: now.toISOString(),
    };

    if (workflowsRecovered > 0 || integrationsRecovered > 0 || exportsRecovered > 0) {
      logger.warn(result, "Swept and recovered orphaned stale running jobs");
    }

    return result;
  } catch (err) {
    logger.error({ err }, "Failed while running stale job recovery sweep");
    throw err;
  }
}
