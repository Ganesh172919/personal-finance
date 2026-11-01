import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { ensurePersonalOrgForUser } from "../services/orgService";
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

  it("purchases on-demand credit pack and boosts entitlement limits", async () => {
    await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));

    const res = await request(app)
      .post("/api/billing/credits")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ pack_id: "ai_pack_250" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.pack.id).toBe("ai_pack_250");
    expect(res.body.pack.credits.monthly_ai_calls).toBe(250);

    // Reject unknown pack_id
    await request(app)
      .post("/api/billing/credits")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ pack_id: "invalid_pack" })
      .expect(400);

    const entitlements = await request(app)
      .get("/api/entitlements/me")
      .set("Cookie", [cookie])
      .expect(200);
    expect(entitlements.body.limits.monthly_ai_calls).toBeGreaterThanOrEqual(310);
  });

  it("creates annual checkout session, persists annual billing cycle, generates invoice, and downloads PDF receipt", async () => {
    await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));

    // 1. Create annual checkout
    const checkoutRes = await request(app)
      .post("/api/billing/checkout")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        plan_tier: "pro",
        billing_cycle: "annual",
      })
      .expect(200);

    expect(checkoutRes.body.activated).toBe(true);

    // 2. Fetch invoices list
    const invoicesRes = await request(app)
      .get("/api/billing/invoices")
      .set("Cookie", [cookie])
      .expect(200);

    expect(invoicesRes.body.invoices.length).toBeGreaterThanOrEqual(1);
    const invoice = invoicesRes.body.invoices[0];
    expect(invoice.plan_tier).toBe("pro");
    expect(invoice.billing_cycle).toBe("annual");
    expect(invoice.amount_usd).toBe(180);
    expect(invoice.status).toBe("paid");

    // 3. Download invoice PDF
    const pdfRes = await request(app)
      .get(`/api/billing/invoices/${invoice.id}/pdf`)
      .set("Cookie", [cookie])
      .expect(200);

    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect(pdfRes.headers["content-disposition"]).toContain(invoice.invoice_number);
    expect(pdfRes.body.length).toBeGreaterThan(100);
  });
});
