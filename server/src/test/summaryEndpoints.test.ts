import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("summary endpoints", () => {
  const app = createApp();
  let cookie = "";
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

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("returns dashboard and portfolio aggregates from live data", async () => {
    await request(app)
      .post("/api/goals")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Emergency Fund",
        target: 150000,
        current: 20000,
        deadline: "2026-12-31",
        priority: 1,
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 50000,
        category: "Salary",
        description: "Salary",
        type: "income",
        date: "2026-02-01",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 8000,
        category: "Rent",
        description: "Rent",
        type: "expense",
        date: "2026-02-02",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 3000,
        category: "Index Fund",
        description: "Nifty SIP",
        type: "investment",
        date: "2026-02-03",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 2000,
        category: "Crypto",
        description: "Bitcoin Holding",
        type: "investment",
        date: "2026-02-04",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 150,
        category: "Investments",
        description: "Nifty SIP Dividend Payout",
        type: "income",
        date: "2026-02-05",
      })
      .expect(201);

    const dashboard = await request(app)
      .get("/api/dashboard/summary")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(dashboard.body.cash_flow).toBeDefined();
    expect(dashboard.body.spending.current_month_total).toBeGreaterThanOrEqual(0);
    expect(dashboard.body.goals.total_count).toBe(1);
    expect(dashboard.body.tasks.open).toBeGreaterThanOrEqual(0);

    const portfolio = await request(app)
      .get("/api/portfolio/summary?months=6")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(portfolio.body.summary.total_invested).toBe(5000);
    expect(portfolio.body.allocations.length).toBeGreaterThan(0);
    const cryptoAlloc = portfolio.body.allocations.find((a: any) => a.name === "Crypto");
    expect(cryptoAlloc).toBeDefined();
    expect(cryptoAlloc.amount).toBe(2000);
    expect(portfolio.body.performance.length).toBe(6);
    expect(portfolio.body.summary.returns_basis).toContain("market");

    // Dividend metrics assertions
    expect(portfolio.body.dividends).toBeDefined();
    expect(portfolio.body.dividends.total_received).toBe(150);
    expect(portfolio.body.dividends.portfolio_yield_pct).toBeGreaterThan(0);
    expect(portfolio.body.dividends.payouts_by_holding.length).toBe(1);
    expect(portfolio.body.dividends.payouts_by_holding[0].holding_name).toBe("Nifty SIP");
    expect(portfolio.body.dividends.payouts_by_holding[0].total_amount).toBe(150);
    expect(portfolio.body.dividends.monthly_progression.length).toBe(6);
  });
});
