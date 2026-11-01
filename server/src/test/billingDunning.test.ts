import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import InvoiceModel from "../models/invoiceModel";
import EntitlementModel from "../models/entitlementModel";
import SubscriptionModel from "../models/subscriptionModel";
import DunningModel from "../models/dunningModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Multi-Currency Billing & Automated Dunning Retry Workflows", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    await InvoiceModel.init();
    await EntitlementModel.init();
    await SubscriptionModel.init();
    await DunningModel.init();
    configurePassport();
  });

  afterAll(stopTestDb);
  beforeEach(clearTestDb);

  const getCsrf = async () => {
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const csrfToken = csrf.body.csrf_token as string;
    return { csrfCookie, csrfToken };
  };

  it("retrieves clean dunning state when subscription is active", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });

    const res = await request(app)
      .get("/api/billing/dunning")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dunning");
    expect(res.body.dunning.in_dunning).toBe(false);
    expect(res.body.dunning.status).toBe("none");
    expect(res.body.dunning.grace_period_days_remaining).toBe(0);
  });

  it("simulates payment failure, initiates 7-day grace period, and checks dunning status", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "active",
    });

    await SubscriptionModel.create({
      orgId,
      userId: auth.user._id,
      planTier: "pro",
      status: "active",
      billingCycle: "monthly",
    });

    // 1. Trigger payment failure simulation
    const simRes = await request(app)
      .post("/api/billing/dunning/simulate-failure")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({ reason: "insufficient_funds" });

    expect(simRes.status).toBe(200);
    expect(simRes.body.simulated).toBe(true);
    expect(simRes.body.dunning.in_dunning).toBe(true);
    expect(simRes.body.dunning.last_failure_reason).toBe("insufficient_funds");
    expect(simRes.body.dunning.grace_period_days_remaining).toBe(7);

    // 2. Verify Entitlement status transitioned to past_due
    const updatedEnt = await EntitlementModel.findOne({ orgId }).lean();
    expect(updatedEnt?.status).toBe("past_due");

    // 3. GET /api/billing/dunning returns active dunning with 7 days remaining
    const getRes = await request(app)
      .get("/api/billing/dunning")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(getRes.status).toBe(200);
    expect(getRes.body.dunning.in_dunning).toBe(true);
    expect(getRes.body.dunning.status).toBe("active");
    expect(getRes.body.dunning.grace_period_days_remaining).toBe(7);
    expect(getRes.body.dunning.current_attempt).toBe(1);
    expect(getRes.body.dunning.retry_history.length).toBeGreaterThanOrEqual(1);
  });

  it("executes payment retry recovery, restores active subscription, and creates invoice", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);
    const { csrfCookie, csrfToken } = await getCsrf();

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "pro",
      status: "past_due",
    });

    await SubscriptionModel.create({
      orgId,
      userId: auth.user._id,
      planTier: "pro",
      status: "past_due",
      billingCycle: "monthly",
    });

    // Simulate failure first
    await request(app)
      .post("/api/billing/dunning/simulate-failure")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({ reason: "card_declined" });

    // Execute payment retry
    const retryRes = await request(app)
      .post("/api/billing/dunning/retry")
      .set("Cookie", [auth.cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId));

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.success).toBe(true);
    expect(retryRes.body.recovered).toBe(true);
    expect(retryRes.body.invoice_number).toMatch(/^INV-/);

    // Verify Entitlement restored to active
    const restoredEnt = await EntitlementModel.findOne({ orgId }).lean();
    expect(restoredEnt?.status).toBe("active");

    // Verify Dunning document status recovered
    const restoredDunning = await DunningModel.findOne({ orgId }).lean();
    expect(restoredDunning?.status).toBe("recovered");

    // Verify paid recovery invoice created
    const invoice = await InvoiceModel.findOne({ orgId, invoiceNumber: retryRes.body.invoice_number }).lean();
    expect(invoice).toBeDefined();
    expect(invoice?.status).toBe("paid");
    expect(invoice?.amountUsd).toBe(19);
  });

  it("lists invoices with multi-currency localized conversion and formats", async () => {
    const auth = await createAuthedUser();
    const { orgId } = await ensurePersonalOrgForUser(auth.user._id);

    await InvoiceModel.create({
      orgId,
      userId: auth.user._id,
      invoiceNumber: "INV-EUR-TEST-1",
      planTier: "pro",
      billingCycle: "monthly",
      amountUsd: 29,
      taxUsd: 0,
      totalUsd: 29,
      currency: "EUR",
      status: "paid",
      paymentMethod: "Card ending in 4242",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400000),
      issuedAt: new Date(),
    });

    // 1. Query with EUR
    const eurRes = await request(app)
      .get("/api/billing/invoices?currency=EUR")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(eurRes.status).toBe(200);
    expect(eurRes.body.currency).toBe("EUR");
    expect(eurRes.body.invoices.length).toBe(1);
    expect(eurRes.body.invoices[0].formatted_total).toContain("€");
    expect(eurRes.body.invoices[0].currency).toBe("EUR");

    // 2. Query with GBP
    const gbpRes = await request(app)
      .get("/api/billing/invoices?currency=GBP")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(gbpRes.status).toBe(200);
    expect(gbpRes.body.currency).toBe("GBP");
    expect(gbpRes.body.invoices[0].formatted_total).toContain("£");

    // 3. Query with INR
    const inrRes = await request(app)
      .get("/api/billing/invoices?currency=INR")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(inrRes.status).toBe(200);
    expect(inrRes.body.currency).toBe("INR");
    expect(inrRes.body.invoices[0].formatted_total).toContain("₹");

    // 4. Download PDF
    const invId = eurRes.body.invoices[0].id;
    const pdfRes = await request(app)
      .get(`/api/billing/invoices/${invId}/pdf`)
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", String(orgId));

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect(pdfRes.body.length || (pdfRes.text && pdfRes.text.length)).toBeGreaterThan(100);
  });
});
