import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("referrals", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("grants credits to both orgs on redemption (idempotent)", async () => {
    const authA = await createAuthedUser({ email: "referrer@example.com", name: "Referrer" });

    const meA = await request(app).get("/api/v1/referrals/me").set("Cookie", [authA.cookie]).expect(200);
    expect(meA.body.referral_code).toBeTruthy();
    expect(meA.body.share_url).toContain(String(meA.body.referral_code));

    const code = String(meA.body.referral_code);

    const authB = await createAuthedUser({ email: "referred@example.com", name: "Referred" });

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = String(csrf.body.csrf_token || "");

    const redeem = await request(app)
      .post("/api/v1/referrals/redeem")
      .set("Cookie", [authB.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ code })
      .expect(201);
    expect(redeem.body.applied).toBe(true);

    const entB = await request(app).get("/api/v1/entitlements/me").set("Cookie", [authB.cookie]).expect(200);
    expect(entB.body.plan).toBe("free");
    expect(entB.body.limits.monthly_ai_calls).toBe(180);
    expect(entB.body.limits.workflow_runs).toBe(250);
    expect(entB.body.limits.api_requests).toBe(6000);
    expect(entB.body.limits.marketplace_installs).toBe(2);

    const entA = await request(app).get("/api/v1/entitlements/me").set("Cookie", [authA.cookie]).expect(200);
    expect(entA.body.plan).toBe("free");
    expect(entA.body.limits.monthly_ai_calls).toBe(180);
    expect(entA.body.limits.workflow_runs).toBe(250);
    expect(entA.body.limits.api_requests).toBe(6000);
    expect(entA.body.limits.marketplace_installs).toBe(2);

    const redeemAgain = await request(app)
      .post("/api/v1/referrals/redeem")
      .set("Cookie", [authB.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ code })
      .expect(200);
    expect(redeemAgain.body.applied).toBe(false);
    expect(String(redeemAgain.body.reason)).toBe("already_redeemed");
  });
});
