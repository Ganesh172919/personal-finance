import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
      startedAt: twentyMinsAgo,
    });

    // Stale export job
    const staleExportJob = await ExportJobModel.create({
      orgId,
      createdByUserId: userId,
      type: "transactions_csv",
      status: "running",
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
  });
});
