import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AgentOutputModel from "../models/agentOutputModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("tasks API", () => {
  const app = createApp();
  let cookie = "";
  let userId = "";
  let csrfCookie = "";
  let csrfToken = "";

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const auth = await createAuthedUser();
    cookie = auth.cookie;
    userId = auth.user._id.toString();

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("creates tasks from a plan idempotently and updates status", async () => {
    const agentOutput = await AgentOutputModel.create({
      userId,
      sessionId: "test-session",
      userInput: "Give me a budget plan",
      agentType: "master",
      outputData: { title: "Test plan output" },
      analysis_type: "plan",
      agents_involved: ["master"],
      request_id: "req-agent-1",
      timestamp: new Date(),
    });

    const plan = {
      executive_summary: "Test plan",
      key_metrics: {},
      actions: {
        next_7_days: [
          {
            title: "Track expenses",
            why: "Visibility improves decisions.",
            steps: ["Export bank statement", "Categorize top spend"],
            priority: "high",
            expected_impact: "Improves budgeting accuracy.",
          },
        ],
        next_30_days: [],
        next_12_months: [],
      },
      assumptions: [],
      data_warnings: [],
    };

    const create1 = await request(app)
      .post("/api/tasks/from-plan")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ source: { requestId: "req-test-1", agentOutputId: agentOutput._id.toString() }, plan })
      .expect(201);

    expect(create1.body.created).toBe(1);
    expect(create1.body.tasks).toHaveLength(1);
    const taskId = create1.body.tasks[0]._id as string;

    const create2 = await request(app)
      .post("/api/tasks/from-plan")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ source: { requestId: "req-test-1" }, plan })
      .expect(201);

    expect(create2.body.created).toBe(0);

    const byId = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(byId.body.task).toMatchObject({ _id: taskId });
    expect(byId.body.source?.agent_output).toMatchObject({
      request_id: "req-agent-1",
      title: "Test plan output",
    });

    const openTasks = await request(app)
      .get("/api/tasks?status=open&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(openTasks.body.tasks).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "completed" })
      .expect(200);

    expect(updated.body.task).toMatchObject({ _id: taskId, status: "completed" });

    const completed = await request(app)
      .get("/api/tasks?status=completed&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(completed.body.tasks).toHaveLength(1);
    expect(completed.body.tasks[0]._id).toBe(taskId);
  });

  it("applies task effects across transactions and profile entities", async () => {
    const plan = {
      executive_summary: "Apply flow",
      key_metrics: {},
      actions: {
        next_7_days: [
          {
            title: "Apply savings task",
            why: "Validate action outcomes.",
            steps: ["Do one action"],
            priority: "medium",
            expected_impact: "Profile updates.",
          },
        ],
        next_30_days: [],
        next_12_months: [],
      },
      assumptions: [],
      data_warnings: [],
    };

    const createRes = await request(app)
      .post("/api/tasks/from-plan")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ source: { requestId: "req-apply-1" }, plan })
      .expect(201);

    const taskId = createRes.body.tasks[0]._id as string;

    const goalRes = await request(app)
      .post("/api/goals")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Emergency Fund",
        target: 100000,
        current: 10000,
        deadline: "2026-12-31",
        priority: 1,
      })
      .expect(201);

    const debtRes = await request(app)
      .post("/api/debts")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Credit Card",
        balance: 20000,
        interest_rate: 30,
        minimum_payment: 2000,
        type: "card",
      })
      .expect(201);

    const goalId = goalRes.body.goal.id as string;
    const debtId = debtRes.body.debt.id as string;

    const applyRes = await request(app)
      .post(`/api/tasks/${taskId}/apply`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        idempotency_key: "task-apply-idempotency-001",
        note: "Applied in test",
        effects: [
          {
            type: "transaction",
            transaction: {
              amount: 1500,
              category: "Utilities",
              description: "Electricity bill",
              tx_type: "expense",
            },
          },
          {
            type: "goal_progress",
            goal_id: goalId,
            amount: 2500,
            mode: "increment",
          },
          {
            type: "debt_payment",
            debt_id: debtId,
            amount: 3000,
          },
          {
            type: "profile_update",
            updates: {
              savings: 75000,
            },
          },
        ],
      })
      .expect(200);

    expect(applyRes.body.applied_effects.transactions.length).toBe(1);
    expect(applyRes.body.applied_effects.goals).toContain(goalId);
    expect(applyRes.body.applied_effects.debts).toContain(debtId);
    expect(applyRes.body.links.action_link_id).toBeTruthy();
    expect(applyRes.body.provenance.origin).toBe("task_completion");

    const replayRes = await request(app)
      .post(`/api/tasks/${taskId}/apply`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        idempotency_key: "task-apply-idempotency-001",
        note: "Applied in test",
      })
      .expect(200);

    expect(replayRes.body.idempotent_replay).toBe(true);
    expect(replayRes.body.applied_effects.transactions.length).toBe(1);
    expect(replayRes.body.links.action_link_id).toBe(applyRes.body.links.action_link_id);
    expect(replayRes.body.links.transaction_ids).toEqual(applyRes.body.links.transaction_ids);
    expect(replayRes.body.links.goal_ids).toEqual(applyRes.body.links.goal_ids);
    expect(replayRes.body.links.debt_ids).toEqual(applyRes.body.links.debt_ids);

    const profileRes = await request(app)
      .get("/api/financial-profiles/me")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const goal = (profileRes.body.goals as Array<any>).find(item => item.id === goalId);
    const debt = (profileRes.body.debts as Array<any>).find(item => item.id === debtId);
    expect(goal.current).toBe(12500);
    expect(debt.balance).toBe(17000);
    expect(profileRes.body.savings).toBe(75000);

    const txRes = await request(app)
      .get("/api/transactions?page=1&limit=10")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(txRes.body.transactions).toHaveLength(1);
    expect(txRes.body.transactions[0]).toMatchObject({
      category: "Utilities",
      description: "Electricity bill",
      type: "expense",
      amount: -1500,
      source: { origin: "task_completion" },
    });
  });
});
