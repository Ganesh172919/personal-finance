import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { ensurePersonalOrgForUser } from "../services/orgService";
import InvoiceModel from "../models/invoiceModel";
import { createCheckout, setOrgPlan } from "../services/billing";
import { getResolvedEntitlements, reserveFeatureUsage, PLAN_CATALOG } from "../services/entitlements";
import EntitlementModel from "../models/entitlementModel";
import { triggerPaymentRetry } from "../services/dunningService";
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

  it("never grants a credit pack without a verified payment", async () => {
    await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));

    const res = await request(app)
      .post("/api/billing/credits")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ pack_id: "ai_pack_250" })
      .expect(503);

    expect(res.body.code).toBe("CREDIT_PACKS_UNAVAILABLE");

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
    expect(entitlements.body.limits.monthly_ai_calls).toBeLessThan(310);
  });

  it("keeps an empty invoice list read-only even for an active paid-tier subscription", async () => {
    const org = await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));
    const first = await request(app).get("/api/billing/invoices").set("Cookie", [cookie]).expect(200);
    const second = await request(app).get("/api/billing/invoices").set("Cookie", [cookie]).expect(200);
    expect(first.body.invoices).toEqual([]);
    expect(second.body.invoices).toEqual([]);
    expect(await InvoiceModel.countDocuments({ orgId: org.orgId })).toBe(0);
  });

  it("blocks stub checkout and simulated payment recovery in production", async () => {
    const org = await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));
    const savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      AI_CORE_INTERNAL_TOKEN: process.env.AI_CORE_INTERNAL_TOKEN,
      BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    };
    process.env.NODE_ENV = "production";
    process.env.AI_CORE_INTERNAL_TOKEN = "production-test-internal-token";
    process.env.BILLING_PROVIDER = "stub";
    try {
      await expect(createCheckout({ orgId: org.orgId, userId: new mongoose.Types.ObjectId(userId), planTier: "pro" }))
        .rejects.toMatchObject({ code: "PAYMENT_PROVIDER_REQUIRED" });
      await expect(triggerPaymentRetry(org.orgId, new mongoose.Types.ObjectId(userId)))
        .rejects.toMatchObject({ code: "PAYMENT_RETRY_UNAVAILABLE" });
      expect(await InvoiceModel.countDocuments({ orgId: org.orgId })).toBe(0);
    } finally {
      for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("revokes paid quotas for canceled and past-due plans without waiting for the cache TTL", async () => {
    const org = await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));
    const actor = new mongoose.Types.ObjectId(userId);
    await setOrgPlan({ orgId: org.orgId, userId: actor, provider: "stripe", planTier: "pro", status: "active" });
    const paid = await getResolvedEntitlements({ orgId: org.orgId, userId: actor });
    expect(paid.limits.export_access).toBe(true);
    expect(paid.limits.monthly_ai_calls).toBe(PLAN_CATALOG.pro.limits.monthly_ai_calls);

    await EntitlementModel.updateOne({ orgId: org.orgId }, { $set: { limitsOverride: { export_access: true, monthly_ai_calls: 9999 } } });
    for (const status of ["canceled", "past_due"] as const) {
      await setOrgPlan({ orgId: org.orgId, userId: actor, provider: "stripe", planTier: "pro", status });
      const resolved = await getResolvedEntitlements({ orgId: org.orgId, userId: actor });
      expect(resolved.entitlement.status).toBe(status);
      expect(resolved.limits.export_access).toBe(false);
      expect(resolved.limits.monthly_ai_calls).toBe(PLAN_CATALOG.free.limits.monthly_ai_calls);
      await expect(reserveFeatureUsage({ orgId: org.orgId, userId: actor, feature: "export_access" }))
        .rejects.toMatchObject({ statusCode: 402, code: "FEATURE_NOT_AVAILABLE" });
    }
  });

  it("refuses annual Stripe checkout instead of billing the monthly recurring price", async () => {
    const org = await ensurePersonalOrgForUser(new mongoose.Types.ObjectId(userId));
    const savedEnv = {
      BILLING_PROVIDER: process.env.BILLING_PROVIDER,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
    };
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_not_used";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_monthly_test";
    try {
      await expect(createCheckout({ orgId: org.orgId, userId: new mongoose.Types.ObjectId(userId), planTier: "pro", billingCycle: "annual" }))
        .rejects.toMatchObject({ statusCode: 503, code: "ANNUAL_CHECKOUT_UNAVAILABLE" });
      expect(await InvoiceModel.countDocuments({ orgId: org.orgId })).toBe(0);
    } finally {
      for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("creates a development-only stub checkout record without claiming a verified payment", async () => {
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
    expect(invoice.status).toBe("void");

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
