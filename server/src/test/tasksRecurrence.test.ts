import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TaskModel from "../models/taskModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Tasks Recurring Cadence Automation & Auto-Renewal", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await TaskModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  it("creates a recurring task with cadence and auto-renews next cycle on completion", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    const baseDueDate = new Date("2026-11-01T00:00:00.000Z");

    // 1. Create a monthly recurring task
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        title: "Monthly Emergency Fund Transfer",
        why: "Maintain 3-month living expense reserve buffer",
        priority: "high",
        bucket: 30,
        dueDate: baseDueDate,
        recurrence: {
          cadence: "monthly",
        },
      });

    expect(createRes.status).toBe(201);
    const createdTask = createRes.body.task;
    expect(createdTask).toBeDefined();
    expect(createdTask.title).toBe("Monthly Emergency Fund Transfer");
    expect(createdTask.recurrence).toBeDefined();
    expect(createdTask.recurrence.cadence).toBe("monthly");
    expect(createdTask.recurrence.generation).toBe(1);

    // 2. Complete the recurring task
    const completeRes = await request(app)
      .patch(`/api/tasks/${createdTask._id}`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        status: "completed",
        note: "Transferred $250 via automated bank instruction",
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe("completed");
    expect(completeRes.body.task.completedAt).toBeDefined();

    // 3. Verify next_task auto-generated in the series
    const nextTask = completeRes.body.next_task;
    expect(nextTask).toBeDefined();
    expect(nextTask.status).toBe("open");
    expect(nextTask.title).toBe("Monthly Emergency Fund Transfer");
    expect(nextTask.recurrence.generation).toBe(2);
    expect(nextTask.recurrence.cadence).toBe("monthly");
    expect(nextTask.recurrence.parentTaskId).toBe(createdTask._id);

    // Verify next due date is rolled forward by 1 month
    const nextDue = new Date(nextTask.dueDate);
    expect(nextDue.getMonth()).toBe((baseDueDate.getMonth() + 1) % 12);

    // 4. Verify database state: 1 completed, 1 open
    const openTasks = await TaskModel.find({ orgId, status: "open" });
    const completedTasks = await TaskModel.find({ orgId, status: "completed" });
    expect(openTasks).toHaveLength(1);
    expect(completedTasks).toHaveLength(1);
    expect(openTasks[0]._id).toBe(nextTask._id);
    expect(completedTasks[0]._id).toBe(createdTask._id);
  });

  it("completing a non-recurring task does not generate a next task instance", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    // Create standard one-off task
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        title: "Cancel gym membership",
        why: "No longer utilized",
        priority: "low",
        bucket: 7,
      });

    expect(createRes.status).toBe(201);
    const task = createRes.body.task;

    const completeRes = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({ status: "completed" });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe("completed");
    expect(completeRes.body.next_task).toBeNull();

    const totalTasks = await TaskModel.find({ orgId });
    expect(totalTasks).toHaveLength(1);
  });

  it("supports weekly recurrence cadence rolling forward by 7 days", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    const baseDueDate = new Date("2026-11-01T00:00:00.000Z");

    const createRes = await request(app)
      .post("/api/tasks")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        title: "Weekly Grocery Budget Audit",
        why: "Track envelope burn",
        priority: "medium",
        bucket: 7,
        dueDate: baseDueDate,
        recurrence: {
          cadence: "weekly",
        },
      });

    expect(createRes.status).toBe(201);
    const task = createRes.body.task;
    const completeRes = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({ status: "completed" });

    expect(completeRes.status).toBe(200);
    const nextTask = completeRes.body.next_task;
    expect(nextTask).toBeDefined();
    expect(nextTask.recurrence.cadence).toBe("weekly");
    expect(nextTask.recurrence.generation).toBe(2);

    const nextDue = new Date(nextTask.dueDate);
    const diffDays = Math.round((nextDue.getTime() - baseDueDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });
});
