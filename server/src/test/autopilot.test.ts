import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AutopilotRunModel from "../models/autopilotRunModel";
import EntitlementModel from "../models/entitlementModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("autopilot API", () => {
  const app = createApp();
  let cookie = "";
  let orgId = "";
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
    orgId = String((await ensurePersonalOrgForUser(auth.user._id)).orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    } as any);
  });

  it("creates a plan, simulates, approves, and executes tool calls", async () => {
    const planRes = await request(app)
      .post("/api/v1/autopilot/plan")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ goal: "Create a weekly money check-in workflow", options: { narrative: false } })
      .expect(201);

    expect(planRes.body.ok).toBe(true);
    const runId = String(planRes.body.run?.id || "");
    expect(runId).toMatch(/^[a-f\d]{24}$/i);

    await AutopilotRunModel.updateOne(
      { _id: runId },
      {
        $set: {
          toolCalls: [
            {
              id: "tc_ap_create_workflow",
              title: "Create workflow",
              description: "Create a manual workflow for testing.",
              requires_confirmation: true,
              risk: "low",
              tool: "workflows.create",
              args: {
                name: "Autopilot weekly review",
                enabled: true,
                trigger: { type: "manual" },
                actions: [
                  {
                    type: "create_task",
                    bucket: 7,
                    title: "Weekly money check-in",
                    why: "Test workflow action",
                    steps: ["Step 1"],
                    priority: "medium",
                    expected_impact: "Improves consistency.",
                    kind: "generic",
                    due_days: 7,
                  },
                ],
              },
            },
          ],
        },
      }
    );

    const simRes = await request(app)
      .post("/api/v1/autopilot/simulate")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ run_id: runId })
      .expect(200);

    expect(simRes.body.ok).toBe(true);
    expect(Array.isArray(simRes.body.run?.simulations)).toBe(true);
    expect(simRes.body.run?.simulations?.[0]?.ok).toBe(true);

    const approveRes = await request(app)
      .post("/api/v1/autopilot/approve")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ run_id: runId, approve_all: true })
      .expect(200);

    expect(approveRes.body.ok).toBe(true);
    expect(approveRes.body.run?.status).toBe("approved");

    const execRes = await request(app)
      .post("/api/v1/autopilot/execute")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({ run_id: runId })
      .expect(200);

    expect(execRes.body.ok).toBe(true);
    expect(execRes.body.run?.status).toBe("succeeded");
    expect(Array.isArray(execRes.body.run?.executions)).toBe(true);
    expect(execRes.body.run?.executions?.[0]?.tool).toBe("workflows.create");

    const workflowList = await request(app)
      .get("/api/v1/workflows")
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(Array.isArray(workflowList.body.workflows)).toBe(true);
    expect(workflowList.body.workflows.some((wf: any) => wf.name === "Autopilot weekly review")).toBe(true);

    const getRes = await request(app)
      .get(`/api/v1/autopilot/runs/${runId}`)
      .set("Cookie", [cookie])
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.run?.id).toBe(runId);
  });
});
