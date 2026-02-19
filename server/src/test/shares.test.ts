import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";
import { ensurePersonalOrgForUser } from "../services/orgService";

describe("share links API", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
    app = createApp();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("creates a financial story share link and serves it publicly", async () => {
    const { cookie, user } = await createAuthedUser();
    const personalMembership = await ensurePersonalOrgForUser(user._id);
    const orgId = String(personalMembership.orgId);
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    const goalResp = await request(app)
      .post("/api/v1/goals")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        name: "Vacation",
        target: 1000,
        current: 250,
        deadline: "2026-12-31",
        priority: 5,
      });

    expect(goalResp.status).toBe(201);

    const createShare = await request(app)
      .post("/api/v1/shares/financial-story")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        expires_in_days: 7,
        include_goal_names: false,
        include_goal_deadlines: false,
        include_milestones: false,
      });

    expect(createShare.status).toBe(201);
    expect(typeof createShare.body?.token).toBe("string");
    expect(typeof createShare.body?.share?.share_url).toBe("string");

    const token = String(createShare.body.token);
    const publicResp = await request(app).get(`/api/v1/public/shares/financial-story/${encodeURIComponent(token)}`);
    expect(publicResp.status).toBe(200);

    const payload = publicResp.body?.payload;
    expect(payload?.type).toBe("financial_story");
    expect(Array.isArray(payload?.goals)).toBe(true);
    expect(payload.goals.length).toBe(1);
    expect(payload.goals[0].name).toBe("Goal 1");
    expect(payload.goals[0].deadline).toBeUndefined();
  });

  it("can include goal names when requested", async () => {
    const { cookie, user } = await createAuthedUser();
    const personalMembership = await ensurePersonalOrgForUser(user._id);
    const orgId = String(personalMembership.orgId);
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;

    const goalResp = await request(app)
      .post("/api/v1/goals")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        name: "Emergency Fund",
        target: 5000,
        current: 0,
        deadline: "2027-01-01",
        priority: 1,
      });

    expect(goalResp.status).toBe(201);

    const createShare = await request(app)
      .post("/api/v1/shares/financial-story")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", orgId)
      .send({
        include_goal_names: true,
        include_goal_deadlines: true,
        include_milestones: false,
      });

    expect(createShare.status).toBe(201);
    const token = String(createShare.body.token);
    const publicResp = await request(app).get(`/api/v1/public/shares/financial-story/${encodeURIComponent(token)}`);
    expect(publicResp.status).toBe(200);
    expect(publicResp.body?.payload?.goals?.[0]?.name).toBe("Emergency Fund");
    expect(publicResp.body?.payload?.goals?.[0]?.deadline).toBe("2027-01-01");
  });
});
