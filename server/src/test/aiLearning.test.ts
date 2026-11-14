import mongoose from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import AgentOutputModel from "../models/agentOutputModel";
import AuditEventModel from "../models/auditEventModel";
import OrganizationModel from "../models/organizationModel";
import OrgMemberModel from "../models/orgMemberModel";
import { aiCoreActorHeaders } from "../services/aiCoreTransport";
import {
  __setAiLearningTransportForTests,
  buildSanitizedFeedbackEvent,
  extractLearningMeta,
  forwardFeedbackEvent,
  redactFreeText,
  type AiCoreTransport,
} from "../services/aiLearningClient";
import { __resetLearningOptOutCacheForTests, primeLearningOptOut, setLearningOptOutCached } from "../services/aiLearningOptOut";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("redactFreeText", () => {
  it("strips emails, amounts and long digit runs and caps length", () => {
    const out = redactFreeText(
      "Mail me at jane.doe@example.com, acct 1234 5678 9012, paid $1,250.50 and INR 5000; phone 98765 43210"
    );
    expect(out).not.toMatch(/example\.com/);
    expect(out).not.toMatch(/\d{6}/);
    expect(out).not.toMatch(/1,250/);
    expect(out).toContain("[email]");
    expect(out).toContain("[amount]");
    expect(out).toContain("[number]");
    expect(redactFreeText("x".repeat(900))).toHaveLength(500);
    expect(redactFreeText(undefined)).toBe("");
  });

  it("keeps short numbers like percentages", () => {
    expect(redactFreeText("rate should be 4.5% not 7")).toBe("rate should be 4.5% not 7");
  });
});

describe("forwardFeedbackEvent", () => {
  afterEach(() => __setAiLearningTransportForTests(null));
  const event = { agentOutputId: "a".repeat(24), rating: "down" as const };
  const ctx = { orgId: "b".repeat(24), userId: "c".repeat(24), requestId: "req-1" };

  it("retries network errors and 5xx, then succeeds", async () => {
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ status: 503, data: {} })
      .mockResolvedValueOnce({ status: 202, data: {} });
    __setAiLearningTransportForTests(transport as unknown as AiCoreTransport);
    const result = await forwardFeedbackEvent(event, ctx, { retryDelaysMs: [1, 1] });
    expect(result).toMatchObject({ delivered: true, attempts: 3 });
    const call = transport.mock.calls[0]![0];
    expect(call.path).toBe("/api/learning/feedback");
    expect(call.headers).toMatchObject({ "X-Internal-Org-Id": ctx.orgId, "X-Internal-User-Id": ctx.userId });
  });

  it("stops on 404 and never throws when retries are exhausted", async () => {
    const missing = vi.fn().mockResolvedValue({ status: 404, data: {} });
    __setAiLearningTransportForTests(missing as unknown as AiCoreTransport);
    expect(await forwardFeedbackEvent(event, ctx, { retryDelaysMs: [1, 1] })).toMatchObject({
      delivered: false,
      attempts: 1,
      reason: "endpoint_missing",
    });
    expect(missing).toHaveBeenCalledTimes(1);

    const down = vi.fn().mockRejectedValue(new Error("down"));
    __setAiLearningTransportForTests(down as unknown as AiCoreTransport);
    expect(await forwardFeedbackEvent(event, ctx, { retryDelaysMs: [1, 1] })).toMatchObject({
      delivered: false,
      attempts: 3,
      reason: "exhausted",
    });
  });
});

describe("learning metadata helpers", () => {
  it("builds a sanitised event with no raw note and a redacted correction", () => {
    const evt = buildSanitizedFeedbackEvent(
      { _id: "abc", analysis_type: "budget", promptVersion: "p1", active_model: "m", note: "secret" },
      { rating: "down", reasonCode: "wrong_number", correction: "email me bob@x.io 123456789" }
    );
    expect(evt).toMatchObject({
      agentOutputId: "abc",
      rating: "down",
      route: "budget",
      promptVersion: "p1",
      modelName: "m",
    });
    expect(JSON.stringify(evt)).not.toMatch(/bob@x\.io|123456789|secret/);
  });

  it("extracts attribution when present and tolerates absence", () => {
    expect(
      extractLearningMeta({ agent: "budget", prompt_version: "p2", artifact_versions: { routing: "r3" }, cache_hit: true })
    ).toEqual({ agentName: "budget", promptVersion: "p2", routingVersion: "r3", cacheHit: true });
    expect(extractLearningMeta(null)).toEqual({});
  });

  it("adds the opt-out header only for opted-out orgs", () => {
    const orgId = "a".repeat(24);
    __resetLearningOptOutCacheForTests();
    expect(aiCoreActorHeaders({ org_id: orgId, user_id: "u" })["X-Internal-Learning-Opt-Out"]).toBeUndefined();
    setLearningOptOutCached(orgId, true);
    expect(aiCoreActorHeaders({ org_id: orgId, user_id: "u" })["X-Internal-Learning-Opt-Out"]).toBe("1");
    __resetLearningOptOutCacheForTests();
  });
});

describe("AI learning API", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let userId: any;
  let orgId = "";
  let transport: ReturnType<typeof vi.fn>;

  const authed = (req: request.Test, c = cookie) =>
    req.set("Cookie", [c, csrfCookie]).set("X-CSRF-Token", csrfToken).set("X-Org-Id", orgId);

  const makeOutput = (overrides: Record<string, unknown> = {}, org: string = orgId) =>
    AgentOutputModel.create({
      orgId: org,
      userId,
      sessionId: "s1",
      userInput: "How much did I spend?",
      agentType: "master",
      outputData: { response: "You spent a lot" },
      analysis_type: "budget",
      agents_involved: ["master"],
      timestamp: new Date(),
      ...overrides,
    });

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });
  afterAll(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
    __resetLearningOptOutCacheForTests();
    transport = vi.fn().mockResolvedValue({ status: 202, data: {} });
    __setAiLearningTransportForTests(transport as unknown as AiCoreTransport);
    const auth = await createAuthedUser();
    cookie = auth.cookie;
    userId = auth.user._id;
    orgId = String((await ensurePersonalOrgForUser(auth.user._id)).orgId);
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });
  afterEach(() => __setAiLearningTransportForTests(null));

  describe("feedback", () => {
    it("persists reason + correction, queues for review and forwards a sanitised event", async () => {
      const output = await makeOutput({ promptVersion: "p7", routingVersion: "r2", modelName: "gemini", provider: "google" });
      const res = await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`))
        .send({ rating: "down", reasonCode: "wrong_number", correction: "Rent was 5000 not 6000, mail a@b.co", note: "private note" })
        .expect(200);
      expect(res.body.review_status).toBe("pending");

      const stored: any = await AgentOutputModel.findById(output._id).lean();
      expect(stored.feedback).toMatchObject({ rating: "down", reasonCode: "wrong_number" });
      expect(stored.feedback.correction).toContain("Rent was");
      expect(stored.reviewStatus).toBe("pending");

      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
      const call = transport.mock.calls[0]![0];
      expect(call.path).toBe("/api/learning/feedback");
      expect(call.body).toMatchObject({
        agentOutputId: String(output._id),
        rating: "down",
        reasonCode: "wrong_number",
        route: "budget",
        promptVersion: "p7",
        routingVersion: "r2",
        modelName: "gemini",
        provider: "google",
      });
      expect(JSON.stringify(call.body)).not.toMatch(/a@b\.co|private note/);
    });

    it("never fails the user's request when AI Core is down or lacks the endpoint", async () => {
      const output = await makeOutput();
      transport.mockResolvedValue({ status: 404, data: {} });
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`)).send({ rating: "up" }).expect(200);
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1), { timeout: 10_000 });
      transport.mockRejectedValue(new Error("ECONNREFUSED"));
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`)).send({ rating: "down" }).expect(200);
      // The request returns before background retries complete. Drain them before
      // the next test replaces the shared transport mock.
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(4), { timeout: 10_000 });
    });

    it("thumbs up clears a pending review", async () => {
      const output = await makeOutput();
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`))
        .send({ rating: "down", reasonCode: "unclear" })
        .expect(200);
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`)).send({ rating: "up" }).expect(200);
      const stored: any = await AgentOutputModel.findById(output._id).lean();
      expect(stored.reviewStatus).toBeUndefined();
      expect(stored.feedback.rating).toBe("up");
      // Both feedback requests dispatch asynchronously; keep their work in this
      // test rather than allowing it to reach the next test's transport mock.
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2), { timeout: 10_000 });
    });

    it("rejects invalid reason codes and over-long corrections", async () => {
      const output = await makeOutput();
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`))
        .send({ rating: "down", reasonCode: "nope" })
        .expect(400);
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`))
        .send({ rating: "down", correction: "x".repeat(501) })
        .expect(400);
    });

    it("does not forward when the org opted out, but still records locally", async () => {
      await OrganizationModel.updateOne({ _id: orgId }, { $set: { aiLearningOptOut: true } });
      const output = await makeOutput();
      await authed(request(app).post(`/api/agent-outputs/${output._id}/feedback`)).send({ rating: "down" }).expect(200);
      await new Promise((r) => setTimeout(r, 150));
      expect(transport).not.toHaveBeenCalled();
      const stored: any = await AgentOutputModel.findById(output._id).lean();
      expect(stored.feedback.rating).toBe("down");
    });

    it("marks AI runs opted out when the organization lookup fails", async () => {
      const lookup = vi.spyOn(OrganizationModel, "findById").mockImplementationOnce(() => {
        throw new Error("database lookup failed");
      });
      try {
        const learningOptedOut = await primeLearningOptOut(orgId, { forceRefresh: true, failClosed: true });
        expect(learningOptedOut).toBe(true);
        expect(aiCoreActorHeaders({ org_id: orgId, user_id: String(userId) }, { learningOptedOut })[
          "X-Internal-Learning-Opt-Out"
        ]).toBe("1");
      } finally {
        lookup.mockRestore();
      }
    });

    it("toggles the opt-out through org settings", async () => {
      await authed(request(app).patch(`/api/v1/orgs/${orgId}/settings`)).send({ aiLearningOptOut: true }).expect(200);
      expect(((await OrganizationModel.findById(orgId).lean()) as any)?.aiLearningOptOut).toBe(true);
    });
  });

  describe("review queue", () => {
    it("lists org-scoped pending negative feedback and lets admins decide", async () => {
      const mine = await makeOutput({
        feedback: { rating: "down", reasonCode: "too_long", correction: "shorter pls", createdAt: new Date() },
        reviewStatus: "pending",
      });
      await makeOutput(
        { feedback: { rating: "down", createdAt: new Date() }, reviewStatus: "pending" },
        String(new mongoose.Types.ObjectId())
      );
      await makeOutput({ feedback: { rating: "up", createdAt: new Date() } });

      const list = await authed(request(app).get("/api/v1/agent-outputs/review-queue")).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({
        id: String(mine._id),
        reason_code: "too_long",
        correction: "shorter pls",
        review_status: "pending",
      });
      expect(list.body.pending_count).toBe(1);

      await authed(request(app).post(`/api/v1/agent-outputs/${mine._id}/review`)).send({ decision: "accepted" }).expect(200);
      expect(((await AgentOutputModel.findById(mine._id).lean()) as any).reviewStatus).toBe("accepted");
      const after = await authed(request(app).get("/api/v1/agent-outputs/review-queue")).expect(200);
      expect(after.body.items).toHaveLength(0);
      expect(await AuditEventModel.countDocuments({ orgId, action: "ai_feedback_reviewed" })).toBe(1);
    });

    it("forbids non-admin members", async () => {
      const member = await createAuthedUser();
      await OrgMemberModel.create({ orgId, userId: member.user._id, role: "member", status: "active", isDefault: false });
      await authed(request(app).get("/api/v1/agent-outputs/review-queue"), member.cookie).expect(403);
      await authed(request(app).get("/api/v1/ai/learning/status"), member.cookie).expect(403);
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("AI Core registry proxy", () => {
    it("proxies status with admin actor headers", async () => {
      transport.mockResolvedValue({
        status: 200,
        data: { promotionMode: "human", canary: { active: null, lastDecisions: [] }, reports: [], optimizer: {} },
      });
      const res = await authed(request(app).get("/api/v1/ai/learning/status")).expect(200);
      expect(res.body.promotionMode).toBe("human");
      const call = transport.mock.calls[0]![0];
      expect(call.path).toBe("/api/learning/status");
      expect(call.headers).toMatchObject({
        "X-Internal-Org-Id": orgId,
        "X-Internal-User-Id": String(userId),
        "X-Internal-Role": "admin",
      });
    });

    it("passes artifact filters and report limits and validates them", async () => {
      transport.mockResolvedValue({ status: 200, data: { items: [] } });
      await authed(request(app).get("/api/v1/ai/learning/artifacts?kind=prompt&status=canary")).expect(200);
      expect(transport.mock.calls[0]![0].query).toEqual({ kind: "prompt", status: "canary" });
      await authed(request(app).get("/api/v1/ai/learning/reports?limit=5")).expect(200);
      expect(transport.mock.calls[1]![0].query).toEqual({ limit: 5 });
      await authed(request(app).get("/api/v1/ai/learning/artifacts?status=bogus")).expect(400);
    });

    it("promotes with actor + note and audits the attempt", async () => {
      transport.mockResolvedValue({ status: 200, data: { id: "art-1", status: "active" } });
      const res = await authed(request(app).post("/api/v1/ai/artifacts/art-1/promote")).send({ note: "looks good" }).expect(200);
      expect(res.body).toMatchObject({ id: "art-1", status: "active" });
      expect(transport.mock.calls[0]![0]).toMatchObject({
        method: "POST",
        path: "/api/learning/artifacts/art-1/promote",
        body: { actorUserId: String(userId), note: "looks good" },
      });
      const audit: any = await AuditEventModel.findOne({ orgId, action: "ai_artifact_promote" }).lean();
      expect(audit).toMatchObject({ targetId: "art-1" });
    });

    it.each(["PROMOTION_SUGGEST_ONLY", "GATE_NOT_PASSED"])("maps AI Core 409 %s to a clean 409", async (code) => {
      transport.mockResolvedValue({ status: 409, data: { detail: { code } } });
      const res = await authed(request(app).post("/api/v1/ai/artifacts/art-2/promote")).send({}).expect(409);
      expect(res.body.code).toBe(code);
      const audit: any = await AuditEventModel.findOne({ orgId, action: "ai_artifact_promote", targetId: "art-2" }).lean();
      expect(audit?.metadata?.code).toBe(code);
    });

    it("rolls back, runs the optimizer in org scope and maps outages to 502", async () => {
      transport.mockResolvedValue({ status: 200, data: { id: "art-1", status: "retired" } });
      await authed(request(app).post("/api/v1/ai/artifacts/art-1/rollback")).send({}).expect(200);
      expect(transport.mock.calls[0]![0].path).toBe("/api/learning/artifacts/art-1/rollback");

      transport.mockResolvedValue({ status: 202, data: { jobId: "job-9" } });
      const opt = await authed(request(app).post("/api/v1/ai/learning/optimize")).send({}).expect(202);
      expect(opt.body.jobId).toBe("job-9");
      expect(transport.mock.calls[1]![0]).toMatchObject({ path: "/api/learning/optimize/run", body: { scope: "org" } });

      transport.mockRejectedValue(new Error("ECONNREFUSED"));
      const down = await authed(request(app).get("/api/v1/ai/learning/status")).expect(502);
      expect(down.body.code).toBe("AI_CORE_UNAVAILABLE");
    });
  });
});
