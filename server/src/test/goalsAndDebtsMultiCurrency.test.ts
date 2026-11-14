import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("goals & debts multi-currency FX localization", () => {
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

  it("normalizes goals and debts into EUR with 0.92 FX conversion and euro currency metadata", async () => {
    // 1. Create a Goal: $10,000 target, $2,500 current
    await request(app)
      .post("/api/goals")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Europe Dream Trip",
        target: 10000,
        current: 2500,
        deadline: "2027-06-01",
        priority: 2,
      })
      .expect(201);

    // 2. Create a Debt: $5,000 balance, 18% APR, $200 minimum payment
    await request(app)
      .post("/api/debts")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Prime Visa",
        balance: 5000,
        interest_rate: 18,
        minimum_payment: 200,
        type: "Credit Card",
      })
      .expect(201);

    // 3. Query financial profile in EUR
    const res = await request(app)
      .get("/api/financial-profiles/me?currency=EUR")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(res.body.currency).toBe("EUR");
    expect(res.body.fx_rate).toBe(0.92);
    expect(res.body.currency_symbol).toBe("€");

    // Goals in EUR: target = $10,000 * 0.92 = 9,200 EUR, current = $2,500 * 0.92 = 2,300 EUR
    expect(res.body.goals.length).toBe(1);
    expect(res.body.goals[0].name).toBe("Europe Dream Trip");
    expect(res.body.goals[0].target).toBe(9200);
    expect(res.body.goals[0].current).toBe(2300);
    expect(res.body.goals[0].raw_target).toBe(10000);
    expect(res.body.goals[0].raw_current).toBe(2500);

    // Debts in EUR: balance = $5,000 * 0.92 = 4,600 EUR, min_payment = $200 * 0.92 = 184 EUR
    expect(res.body.debts.length).toBe(1);
    expect(res.body.debts[0].name).toBe("Prime Visa");
    expect(res.body.debts[0].balance).toBe(4600);
    expect(res.body.debts[0].minimum_payment).toBe(184);
    expect(res.body.debts[0].raw_balance).toBe(5000);
    expect(res.body.debts[0].raw_minimum_payment).toBe(200);
  });

  it("normalizes goals and debts into JPY with integer rounding", async () => {
    await request(app)
      .post("/api/goals")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Tokyo Relocation",
        target: 1250.5,
        current: 500.25,
        deadline: "2027-12-31",
        priority: 1,
      })
      .expect(201);

    const res = await request(app)
      .get("/api/financial-profiles/me?currency=JPY")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(res.body.currency).toBe("JPY");
    expect(res.body.fx_rate).toBe(155);
    expect(res.body.currency_symbol).toBe("¥");

    expect(res.body.goals.length).toBe(1);
    // 1250.5 * 155 = 193,827.5 -> rounded to 193,828
    expect(res.body.goals[0].target).toBe(193828);
    expect(Number.isInteger(res.body.goals[0].target)).toBe(true);
    // 500.25 * 155 = 77,538.75 -> rounded to 77,539
    expect(res.body.goals[0].current).toBe(77539);
    expect(Number.isInteger(res.body.goals[0].current)).toBe(true);
  });

  it("strictly validates currency query bounds", async () => {
    // Unsupported currency should return 400
    await request(app)
      .get("/api/financial-profiles/me?currency=XYZ")
      .set("Cookie", [cookie, csrfCookie])
      .expect(400);
  });
});
