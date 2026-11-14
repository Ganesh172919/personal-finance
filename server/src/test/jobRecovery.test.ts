import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import DeadLetterJobModel from "../models/deadLetterJobModel";
import ExportJobModel from "../models/exportJobModel";
import IntegrationConnectionModel from "../models/integrationConnectionModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import WorkflowModel from "../models/workflowModel";
import WorkflowRunModel from "../models/workflowRunModel";
import { recoverStaleJobs } from "../services/jobRecovery";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Job Recovery Service", () => {
  const orgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("recovers orphaned running jobs older than the threshold", async () => {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);

    // Stale workflow run
    const workflow = await WorkflowModel.create({
      orgId,
      name: "Stale test workflow",
      createdByUserId: userId,
      trigger: { type: "manual" },
      actions: [{ type: "create_task", task_title: "Test" }],
      enabled: true,
    });

    const staleWfRun = await WorkflowRunModel.create({
      orgId,
      workflowId: workflow._id,
      triggeredByUserId: userId,
      status: "running",
      attempts: 2, // last allowed attempt (default max 3) -> dead-lettered instead of requeued
      startedAt: twentyMinsAgo,
    });

    // Fresh workflow run (should NOT be failed)
    const freshWfRun = await WorkflowRunModel.create({
      orgId,
      workflowId: workflow._id,
      triggeredByUserId: userId,
      status: "running",
      startedAt: twoMinsAgo,
    });

    // Stale integration sync run + connection
    await IntegrationConnectionModel.create({
      orgId,
      connectorKey: "bank_stub",
      status: "syncing",
    });

    const staleSyncRun = await IntegrationSyncRunModel.create({
      orgId,
      connectorKey: "bank_stub",
      status: "running",
      attempts: 2,
      startedAt: twentyMinsAgo,
    });

    // Stale export job
    const staleExportJob = await ExportJobModel.create({
      orgId,
      createdByUserId: userId,
      type: "transactions_csv",
      status: "running",
      attempts: 2,
      startedAt: twentyMinsAgo,
    });

    // Fresh export job
    const freshExportJob = await ExportJobModel.create({
      orgId,
      createdByUserId: userId,
      type: "transactions_csv",
      status: "running",
      startedAt: twoMinsAgo,
    });

    // Run recovery with default 15 min threshold
    const result = await recoverStaleJobs({ maxRunningDurationMs: 15 * 60 * 1000 });

    expect(result.workflowsRecovered).toBe(1);
    expect(result.integrationsRecovered).toBe(1);
    expect(result.exportsRecovered).toBe(1);

    // Verify stale jobs are now failed with explanatory error
    const updatedStaleWf = await WorkflowRunModel.findById(staleWfRun._id);
    expect(updatedStaleWf?.status).toBe("failed");
    expect(updatedStaleWf?.error).toContain("timed out or worker process terminated");

    const updatedStaleSync = await IntegrationSyncRunModel.findById(staleSyncRun._id);
    expect(updatedStaleSync?.status).toBe("failed");
    expect(updatedStaleSync?.error).toContain("timed out");

    const updatedConn = await IntegrationConnectionModel.findOne({ orgId, connectorKey: "bank_stub" });
    expect(updatedConn?.status).toBe("error");

    const updatedStaleExport = await ExportJobModel.findById(staleExportJob._id);
    expect(updatedStaleExport?.status).toBe("failed");

    // Verify fresh jobs were NOT affected
    const updatedFreshWf = await WorkflowRunModel.findById(freshWfRun._id);
    expect(updatedFreshWf?.status).toBe("running");

    const updatedFreshExport = await ExportJobModel.findById(freshExportJob._id);
    expect(updatedFreshExport?.status).toBe("running");

    expect(result.deadLettered).toBe(3);
    expect(await DeadLetterJobModel.countDocuments({})).toBe(3);
  });

  it("requeues a stale job with backoff while attempts remain (visibility timeout)", async () => {
    const stale = await ExportJobModel.create({
      orgId,
      createdByUserId: userId,
      type: "transactions_csv",
      status: "running",
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const result = await recoverStaleJobs({ maxRunningDurationMs: 15 * 60 * 1000 });
    expect(result.requeued).toBe(1);
    expect(result.deadLettered).toBe(0);

    const after: any = await ExportJobModel.findById(stale._id).lean();
    expect(after.status).toBe("queued");
    expect(after.attempts).toBe(1);
    expect(new Date(after.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
    expect(after.startedAt).toBeUndefined();
    expect(await DeadLetterJobModel.countDocuments({})).toBe(0);
  });
});
