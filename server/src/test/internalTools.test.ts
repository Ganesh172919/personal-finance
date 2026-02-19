import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("internal tools API", () => {
  const app = createApp();
  const token = "internal-tools-token-test-123456";
  const prevToken = process.env.AI_CORE_TOOLS_TOKEN;

  let cookie = "";
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    process.env.AI_CORE_TOOLS_TOKEN = token;
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    process.env.AI_CORE_TOOLS_TOKEN = prevToken;
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    const auth = await createAuthedUser();
    cookie = auth.cookie;
    userId = auth.user._id.toString();
    orgId = String((await ensurePersonalOrgForUser(auth.user._id)).orgId);
  });

  it("requires AI_CORE_TOOLS_TOKEN and bearer token", async () => {
    await request(app).get("/api/internal/tools/catalog").expect(403);

    await request(app)
      .get("/api/internal/tools/catalog")
      .set("Authorization", "Bearer wrong-token")
      .expect(403);

    const ok = await request(app)
      .get("/api/internal/tools/catalog")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(ok.body.tools)).toBe(true);
    expect(ok.body.tools.some((t: any) => t.tool === "workflows.create")).toBe(true);
    expect(ok.body.request_id).toBeTruthy();
  });

  it("simulates and executes a tool call", async () => {
    const toolCall = {
      id: "tc_internal_create_workflow",
      title: "Create workflow",
      description: "Create a manual workflow for testing.",
      requires_confirmation: true,
      risk: "low",
      tool: "workflows.create",
      args: {
        name: "Internal tools workflow",
        enabled: true,
        trigger: { type: "manual" },
        actions: [
          {
            type: "create_task",
            bucket: 7,
            title: "Weekly review",
            why: "Test workflow action",
            steps: ["Step 1"],
            priority: "medium",
            expected_impact: "Improves consistency.",
            kind: "generic",
            due_days: 7,
          },
        ],
      },
    };

    const sim = await request(app)
      .post("/api/internal/tools/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({ org_id: orgId, user_id: userId, tool_call: toolCall })
      .expect(200);

    expect(sim.body.ok).toBe(true);
    expect(sim.body.tool).toBe("workflows.create");
    expect(sim.body.preview?.operation).toBe("create_workflow");

    const exec = await request(app)
      .post("/api/internal/tools/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ org_id: orgId, user_id: userId, tool_call: toolCall, confirm: true })
      .expect(200);

    expect(exec.body.ok).toBe(true);
    expect(exec.body.tool).toBe("workflows.create");
    expect(exec.body.result?.workflow?.id).toMatch(/^[a-f\d]{24}$/i);

    const list = await request(app)
      .get("/api/v1/workflows")
      .set("Cookie", cookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(Array.isArray(list.body.workflows)).toBe(true);
    expect(list.body.workflows.some((wf: any) => wf.name === "Internal tools workflow")).toBe(true);
  });
});

