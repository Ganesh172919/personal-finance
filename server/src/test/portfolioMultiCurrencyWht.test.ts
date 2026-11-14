import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("portfolio multi-currency FX and dividend WHT localization", () => {
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

  it("normalizes portfolio totals and applies 15% DTAA dividend withholding tax in EUR", async () => {
    // 1. Seed investment transactions ($10,000 in Apple Equity, $5,000 in S&P 500 Index)
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 10000,
        category: "Equity",
        description: "Apple Inc (AAPL)",
        type: "investment",
        date: "2026-01-15",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 5000,
        category: "Index Fund",
        description: "Vanguard S&P 500 ETF (VOO)",
        type: "investment",
        date: "2026-02-01",
      })
      .expect(201);

    // 2. Seed dividend payout transactions ($300 from Apple, $100 from VOO)
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 300,
        category: "Investments",
        description: "Apple Inc (AAPL) Dividend",
        type: "income",
        date: "2026-02-15",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 100,
        category: "Investments",
        description: "Vanguard S&P 500 ETF (VOO) Dividend",
        type: "income",
        date: "2026-02-20",
      })
      .expect(201);

    // 3. Query portfolio summary in EUR with 15% DTAA withholding tax
    const res = await request(app)
      .get("/api/portfolio/summary?months=12&currency=EUR&wht_rate=15&treaty_country=Germany")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(res.body.currency).toBe("EUR");
    expect(res.body.fx_rate).toBe(0.92);
    expect(res.body.currency_symbol).toBe("€");

    // $15,000 USD total invested * 0.92 = 13,800 EUR
    expect(res.body.summary.total_invested).toBe(13800);

    // Dividends section verification
    const div = res.body.dividends;
    expect(div).toBeDefined();
    expect(div.currency).toBe("EUR");
    expect(div.fx_rate).toBe(0.92);
    expect(div.currency_symbol).toBe("€");
    expect(div.wht_rate_pct).toBe(15);
    expect(div.treaty_country).toBe("Germany");

    // Total gross dividends = $400 USD * 0.92 = 368 EUR
    expect(div.gross_received).toBe(368);
    expect(div.total_received).toBe(368);

    // WHT deducted = 368 * 0.15 = 55.20 EUR
    expect(div.wht_deducted).toBe(55.2);
    // Net received = 368 - 55.20 = 312.80 EUR
    expect(div.net_received).toBe(312.8);
    // Foreign Tax Credit (FTC) relief estimate equals WHT deducted
    expect(div.ftc_relief_estimate).toBe(55.2);

    // Holdings yield verification
    expect(div.payouts_by_holding.length).toBe(2);
    const applePayout = div.payouts_by_holding.find((p: any) => p.holding_name.includes("Apple"));
    expect(applePayout).toBeDefined();
    // $300 * 0.92 = 276 EUR gross
    expect(applePayout.gross_amount).toBe(276);
    // 276 * 0.15 = 41.4 EUR WHT
    expect(applePayout.wht_deducted).toBe(41.4);
    // 276 - 41.4 = 234.6 EUR net
    expect(applePayout.net_amount).toBe(234.6);
    expect(applePayout.yield_on_cost_pct).toBeGreaterThan(0);
    expect(applePayout.net_yield_on_cost_pct).toBeGreaterThan(0);
    expect(applePayout.net_yield_on_cost_pct).toBeLessThan(applePayout.yield_on_cost_pct);

    // Recent payouts have net & gross breakdowns
    expect(div.recent_payouts.length).toBe(2);
    expect(div.recent_payouts[0].gross_amount).toBeDefined();
    expect(div.recent_payouts[0].wht_deducted).toBeDefined();
    expect(div.recent_payouts[0].net_amount).toBeDefined();
  });

  it("normalizes portfolio totals to JPY with integer rounding and 30% statutory withholding", async () => {
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 1000,
        category: "Equity",
        description: "Global Tech Fund",
        type: "investment",
        date: "2026-02-01",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 50,
        category: "Investments",
        description: "Global Tech Fund Dividend",
        type: "income",
        date: "2026-02-10",
      })
      .expect(201);

    const res = await request(app)
      .get("/api/portfolio/summary?months=12&currency=JPY&wht_rate=30&treaty_country=Non-Treaty")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(res.body.currency).toBe("JPY");
    expect(res.body.fx_rate).toBe(155);
    expect(res.body.currency_symbol).toBe("¥");

    // $1,000 USD * 155 = 155,000 JPY (integer)
    expect(res.body.summary.total_invested).toBe(155000);
    expect(Number.isInteger(res.body.summary.total_invested)).toBe(true);

    const div = res.body.dividends;
    expect(div.currency).toBe("JPY");
    expect(div.wht_rate_pct).toBe(30);
    // $50 * 155 = 7,750 JPY
    expect(div.gross_received).toBe(7750);
    // 7,750 * 0.30 = 2,325 JPY
    expect(div.wht_deducted).toBe(2325);
    // 7,750 - 2,325 = 5,425 JPY
    expect(div.net_received).toBe(5425);
    expect(Number.isInteger(div.net_received)).toBe(true);
  });

  it("validates currency and wht_rate input bounds strictly", async () => {
    // Unsupported currency should return 400
    await request(app)
      .get("/api/portfolio/summary?currency=XYZ")
      .set("Cookie", [cookie, csrfCookie])
      .expect(400);

    // Negative withholding tax rate should return 400
    await request(app)
      .get("/api/portfolio/summary?wht_rate=-5")
      .set("Cookie", [cookie, csrfCookie])
      .expect(400);

    // WHT rate over 100 should return 400
    await request(app)
      .get("/api/portfolio/summary?wht_rate=120")
      .set("Cookie", [cookie, csrfCookie])
      .expect(400);
  });

  it("ensures strict organization tenant isolation for portfolio analytics", async () => {
    // 1. User 1 seeds an investment
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 8888,
        category: "Equity",
        description: "User 1 Secret Fund",
        type: "investment",
        date: "2026-02-01",
      })
      .expect(201);

    // 2. User 2 logs in
    const user2 = await createAuthedUser();
    const user2Csrf = await request(app).get("/api/auth/csrf").expect(200);
    const user2CsrfCookie = (user2Csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const user2CsrfToken = user2Csrf.body.csrf_token as string;

    // 3. User 2 requests portfolio summary
    const user2Summary = await request(app)
      .get("/api/portfolio/summary?currency=GBP")
      .set("Cookie", [user2.cookie, user2CsrfCookie])
      .expect(200);

    // User 2 must see 0 invested capital and no holdings from User 1
    expect(user2Summary.body.summary.total_invested).toBe(0);
    expect(user2Summary.body.holdings.length).toBe(0);
  });
});
