import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import TaskModel from "../models/taskModel";
import WorkflowModel from "../models/workflowModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { tickCronWorkflows } from "../services/workflowScheduler";
import { createWorkflow } from "../services/workflows";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("workflow scheduler", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("executes cron workflows and advances nextRunAt", async () => {
    const auth = await createAuthedUser();
    const membership = await ensurePersonalOrgForUser(auth.user._id);
    const orgId = (membership as any).orgId;

    const workflow = await createWorkflow({
      orgId,
      userId: auth.user._id,
      name: "Scheduler test",
      enabled: true,
      trigger: { type: "cron", cron: "* * * * *" },
      actions: [
        {
          type: "create_task",
          bucket: 7,
          title: "Cron task",
          why: "Verify scheduler",
          steps: ["Step 1"],
          priority: "medium",
          expected_impact: "Ensures workflows run on schedule",
          kind: "generic",
          due_days: 7,
        },
      ],
    });

    const dueAt = new Date("2026-02-20T10:00:00.000Z");
    await WorkflowModel.updateOne(
      { _id: workflow._id },
      { $set: { nextRunAt: dueAt, scheduleTimezone: "UTC" }, $unset: { lastRunAt: "", lastError: "" } }
    );

    const result = await tickCronWorkflows({ now: dueAt, limit: 10 });
    expect(result.triggered).toBe(1);
    expect(result.errors).toBe(0);

    const tasks = await TaskModel.find({ orgId, userId: auth.user._id }).lean();
    expect(tasks).toHaveLength(1);
    expect(String((tasks as any)[0]?.title || "")).toBe("Cron task");

    const updated = await WorkflowModel.findById(workflow._id).lean();
    expect(updated?.lastRunAt?.toISOString()).toBe(dueAt.toISOString());
    expect(updated?.nextRunAt?.getTime()).toBeGreaterThan(dueAt.getTime());

    const second = await tickCronWorkflows({ now: dueAt, limit: 10 });
    expect(second.triggered).toBe(0);

    const tasksAfter = await TaskModel.find({ orgId, userId: auth.user._id }).lean();
    expect(tasksAfter).toHaveLength(1);
  });
});

