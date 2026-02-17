import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("monetization APIs", () => {
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

  it("returns plan catalog and resolved entitlements", async () => {
    const plans = await request(app).get("/api/plans").set("Cookie", [cookie]).expect(200);
    expect(Array.isArray(plans.body.plans)).toBe(true);
    expect(plans.body.plans.some((plan: any) => plan.id === "free")).toBe(true);

    const entitlements = await request(app)
      .get("/api/entitlements/me")
      .set("Cookie", [cookie])
      .expect(200);
    expect(entitlements.body.plan).toBe("free");
    expect(entitlements.body.limits.monthly_ai_calls).toBeGreaterThan(0);
    expect(entitlements.body.usage.monthly_ai_calls).toBe(0);
  });

  it("ingests internal usage events and updates usage counters", async () => {
    process.env.USAGE_EVENTS_INTERNAL_TOKEN = "internal-usage-token-test";

    await request(app)
      .post("/api/usage-events")
      .set("Cookie", [csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Internal-Usage-Token", "internal-usage-token-test")
      .send({
        user_id: userId,
        feature: "monthly_ai_calls",
        units: 2,
        idempotency_key: "usage-event-test-001",
        context: { source: "test" },
      })
      .expect(202);

    const entitlements = await request(app)
      .get("/api/entitlements/me")
      .set("Cookie", [cookie])
      .expect(200);
    expect(entitlements.body.usage.monthly_ai_calls).toBe(2);
  });
});
