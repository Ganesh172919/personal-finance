import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TransactionModel from "../models/transactionModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { collectFinancialData } from "../services/newsletterService";
import { renderNewsletterHtml, type NewsletterTemplateData } from "../services/newsletterTemplate";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Newsletter Service, Personalized Dynamic HTML Charts & API", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let userId: mongoose.Types.ObjectId;
  let orgId: mongoose.Types.ObjectId;

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
    userId = auth.user._id as mongoose.Types.ObjectId;
    const personalOrg = await ensurePersonalOrgForUser(auth.user._id);
    orgId = personalOrg.orgId as mongoose.Types.ObjectId;

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("collects financial data with rolling 7-day velocity trend, category percentages, and health pillars", async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    // Seed transactions
    await TransactionModel.create([
      {
        orgId,
        userId,
        amount: 2500,
        category: "Income",
        description: "Direct Deposit Salary",
        date: now,
        type: "income",
      },
      {
        orgId,
        userId,
        amount: -150,
        category: "Groceries",
        description: "Supermarket supplies",
        date: now,
        type: "expense",
      },
      {
        orgId,
        userId,
        amount: -60,
        category: "Dining Out",
        description: "Dinner with team",
        date: twoDaysAgo,
        type: "expense",
      },
      {
        orgId,
        userId,
        amount: -120,
        category: "Groceries",
        description: "Weekly food essentials",
        date: fourDaysAgo,
        type: "expense",
      },
    ]);

    const data = await collectFinancialData(userId, orgId);

    // 1. Verify 24h spending summary
    expect(data.spendingSummary.totalIncome).toBe(2500);
    expect(data.spendingSummary.totalSpent).toBe(150);
    expect(data.spendingSummary.netCashFlow).toBe(2350);
    expect(data.spendingSummary.topCategories).toHaveLength(1);
    expect(data.spendingSummary.topCategories[0].category).toBe("Groceries");
    expect(data.spendingSummary.topCategories[0].percentage).toBe(100);

    // 2. Verify 7-day velocity trend
    expect(data.spendingSummary.dailyTrend).toBeDefined();
    expect(data.spendingSummary.dailyTrend).toHaveLength(7);
    const trend = data.spendingSummary.dailyTrend!;
    expect(trend[6].isToday).toBe(true);
    expect(trend[6].amount).toBe(150); // Today's grocery expense

    // Day 4 (2 days ago, index 4) should have 60
    expect(trend[4].amount).toBe(60);
    // Day 2 (4 days ago, index 2) should have 120
    expect(trend[2].amount).toBe(120);

    // 3. Verify Health Score & Multi-Pillar Breakdown
    expect(data.healthScore).toBeDefined();
    expect(data.healthScore?.score).toBeGreaterThanOrEqual(70);
    expect(data.healthScore?.pillars).toBeDefined();
    expect(data.healthScore?.pillars).toHaveLength(4);

    const pillarNames = data.healthScore?.pillars?.map((p) => p.name);
    expect(pillarNames).toContain("Cashflow Health");
    expect(pillarNames).toContain("Budget Discipline");
    expect(pillarNames).toContain("Spending Stability");
    expect(pillarNames).toContain("Savings & Reserve");

    const cashflowPillar = data.healthScore?.pillars?.find((p) => p.name === "Cashflow Health");
    expect(cashflowPillar?.status).toBe("good");
    expect(cashflowPillar?.score).toBe(25);
  });

  it("renders personalized dynamic HTML email with 7-day velocity chart, category distribution bars, and health pillar meters", () => {
    const templateData: NewsletterTemplateData = {
      userName: "Alexander",
      date: "Monday, November 2, 2026",
      unsubscribeUrl: "https://app.finwise.dev/unsubscribe",
      appUrl: "https://app.finwise.dev",
      sections: {
        spendingSummary: {
          totalSpent: 420.5,
          totalIncome: 1500,
          netCashFlow: 1079.5,
          transactionCount: 8,
          currency: "USD",
          topCategories: [
            { category: "Housing", amount: 200, percentage: 48 },
            { category: "Groceries", amount: 150, percentage: 36 },
            { category: "Utilities", amount: 70.5, percentage: 16 },
          ],
          dailyTrend: [
            { date: "2026-10-27", day: "Tue", amount: 45, isToday: false },
            { date: "2026-10-28", day: "Wed", amount: 0, isToday: false },
            { date: "2026-10-29", day: "Thu", amount: 80, isToday: false },
            { date: "2026-10-30", day: "Fri", amount: 150, isToday: false },
            { date: "2026-10-31", day: "Sat", amount: 25, isToday: false },
            { date: "2026-11-01", day: "Sun", amount: 10, isToday: false },
            { date: "2026-11-02", day: "Mon", amount: 110.5, isToday: true },
          ],
        },
        healthScore: {
          score: 88,
          label: "Excellent",
          changeFromLastWeek: 4,
          highlights: ["Positive cash flow of $1,079.50 today", "0 budgets exceeded"],
          pillars: [
            { name: "Cashflow Health", score: 25, maxScore: 25, status: "good" },
            { name: "Budget Discipline", score: 25, maxScore: 25, status: "good" },
            { name: "Spending Stability", score: 22, maxScore: 25, status: "good" },
            { name: "Savings & Reserve", score: 16, maxScore: 25, status: "fair" },
          ],
        },
        budgetAlerts: [
          {
            budgetName: "Dining",
            spent: 280,
            limit: 300,
            percentage: 93,
            status: "warning",
          },
        ],
      },
    };

    const html = renderNewsletterHtml(templateData);

    // 1. Verify general greeting and container
    expect(html).toContain("Good morning, <strong>Alexander</strong>!");
    expect(html).toContain("FinWise Daily Newsletter");

    // 2. Verify 7-day spending velocity chart
    expect(html).toContain("7-Day Spending Velocity");
    expect(html).toContain("Peak: $150");
    expect(html).toContain("Tue");
    expect(html).toContain("Wed");
    expect(html).toContain("Thu");
    expect(html).toContain("Fri");
    expect(html).toContain("Sat");
    expect(html).toContain("Sun");
    expect(html).toContain("Mon");
    expect(html).toContain("Today");

    // 3. Verify category distribution bars
    expect(html).toContain("Spending Distribution by Category");
    expect(html).toContain("Housing");
    expect(html).toContain("(48%)");
    expect(html).toContain("Groceries");
    expect(html).toContain("(36%)");
    expect(html).toContain("Utilities");
    expect(html).toContain("(16%)");

    // 4. Verify financial health score & pillar breakdown
    expect(html).toContain("Financial Health Score");
    expect(html).toContain("88");
    expect(html).toContain("Financial Health Pillar Breakdown");
    expect(html).toContain("Cashflow Health");
    expect(html).toContain("25 / 25");
    expect(html).toContain("Strong");
    expect(html).toContain("Savings &amp; Reserve");
    expect(html).toContain("Moderate");
  });

  it("handles GET /api/newsletter/preferences, PUT /preferences, and POST /preview with dynamic chart HTML", async () => {
    // 1. GET preferences
    const getRes = await request(app)
      .get("/api/newsletter/preferences")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-Org-Id", String(orgId))
      .expect(200);

    expect(getRes.body.preference).toBeDefined();
    expect(getRes.body.preference.delivery_time).toBe("07:00");
    expect(getRes.body.preference.timezone).toBe("Asia/Kolkata");

    // 2. PUT preferences
    const putRes = await request(app)
      .put("/api/newsletter/preferences")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .send({
        deliveryTime: "08:30",
        timezone: "America/New_York",
        contentPreferences: {
          spendingSummary: true,
          weeklyHealthScore: true,
        },
      })
      .expect(200);

    expect(putRes.body.preference.delivery_time).toBe("08:30");
    expect(putRes.body.preference.timezone).toBe("America/New_York");

    // 3. Seed sample transaction for preview
    await TransactionModel.create({
      orgId,
      userId,
      amount: -85,
      category: "Software Subscriptions",
      description: "Cloud IDE Subscription",
      date: new Date(),
      type: "expense",
    });

    // 4. POST /preview
    const previewRes = await request(app)
      .post("/api/newsletter/preview")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", String(orgId))
      .expect(200);

    expect(previewRes.body.html).toBeDefined();
    expect(previewRes.body.sections).toBeDefined();
    expect(previewRes.body.html).toContain("Spending Summary");
    expect(previewRes.body.html).toContain("7-Day Spending Velocity");
    expect(previewRes.body.html).toContain("Spending Distribution by Category");
    expect(previewRes.body.html).toContain("Financial Health Pillar Breakdown");
    expect(previewRes.body.sections.spendingSummary.dailyTrend).toHaveLength(7);
  });
});
