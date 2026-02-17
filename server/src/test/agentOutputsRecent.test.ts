import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AgentOutputModel from "../models/agentOutputModel";
import TaskModel from "../models/taskModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("recent agent outputs API", () => {
  const app = createApp();
  let cookie = "";
  let userId: any;

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
    userId = auth.user._id;
  });

  it("returns compact recent outputs with linked task ids", async () => {
    const output = await AgentOutputModel.create({
      userId,
      sessionId: "session-1",
      userInput: "Help optimize budget",
      agentType: "master",
      outputData: { response: "Plan ready" },
      analysis_type: "comprehensive",
      agents_involved: ["master"],
      timestamp: new Date(),
    });

    await TaskModel.create({
      _id: "task-linked-001",
      userId,
      source: { agentOutputId: output._id },
      bucket: 7,
      title: "Track expenses",
      why: "Needed for budgeting",
      steps: ["Export statement"],
      priority: "medium",
      expected_impact: "Better visibility",
      kind: "budget",
      status: "open",
    });

    const response = await request(app)
      .get("/api/agent-outputs/recent?limit=10")
      .set("Cookie", [cookie])
      .expect(200);

    expect(response.body.outputs).toHaveLength(1);
    expect(response.body.outputs[0].id).toBe(output._id.toString());
    expect(response.body.outputs[0].linked_task_ids).toContain("task-linked-001");
  });
});
