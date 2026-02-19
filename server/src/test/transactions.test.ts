import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("transactions API", () => {
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

  it("creates, lists, updates, deletes, and paginates transactions", async () => {
    // CSRF is required for state-changing requests (POST/PATCH/DELETE)
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .send({
        amount: 1000,
        category: "Food",
        description: "CSRF missing header should fail",
        type: "expense",
        date: "2026-02-01",
      })
      .expect(403);

    const create1 = await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 1000,
        category: "Food",
        description: "Lunch",
        type: "expense",
        date: "2026-02-01",
      })
      .expect(201);

    expect(create1.body.transaction).toMatchObject({
      category: "Food",
      description: "Lunch",
      type: "expense",
      amount: -1000,
      source: { origin: "manual" },
    });

    const id = create1.body.transaction.id as string;

    await request(app)
      .patch(`/api/transactions/${id}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ amount: 2000 })
      .expect(200);

    const list1 = await request(app)
      .get("/api/transactions?page=1&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(list1.body.pagination.total).toBe(1);
    expect(list1.body.transactions[0].amount).toBe(-2000);

    // Create two more with later dates to validate pagination + ordering
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 10,
        category: "Food",
        description: "Snack",
        type: "expense",
        date: "2026-02-03",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 5000,
        category: "Salary",
        description: "Salary",
        type: "income",
        date: "2026-02-02",
      })
      .expect(201);

    const page1 = await request(app)
      .get("/api/transactions?page=1&limit=2")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(page1.body.transactions).toHaveLength(2);
    expect(new Date(page1.body.transactions[0].date).getTime()).toBeGreaterThanOrEqual(
      new Date(page1.body.transactions[1].date).getTime()
    );

    const page2 = await request(app)
      .get("/api/transactions?page=2&limit=2")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(page2.body.transactions).toHaveLength(1);

    await request(app)
      .delete(`/api/transactions/${id}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .expect(200);

    const listAfterDelete = await request(app)
      .get("/api/transactions?page=1&limit=50")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(listAfterDelete.body.pagination.total).toBe(2);
  }, 15000);

  it("returns monthly summaries, caches responses, and invalidates cache when transactions change", async () => {
    // Jan expense
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 100,
        category: "Food",
        description: "Groceries",
        type: "expense",
        date: "2026-01-10",
      })
      .expect(201);

    // Feb income + expenses
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 2000,
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
        amount: 500,
        category: "Rent",
        description: "Rent",
        type: "expense",
        date: "2026-02-05",
      })
      .expect(201);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 50,
        category: "Food",
        description: "Snacks",
        type: "expense",
        date: "2026-02-07",
      })
      .expect(201);

    const summary1 = await request(app)
      .get("/api/transactions/summary?from=2026-01-01&to=2026-02-15&groupBy=month&topCategories=6")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(summary1.body.cache_hit).toBe(false);
    expect(summary1.body.period).toMatchObject({ groupBy: "month" });
    expect(summary1.body.top_categories_month).toBe("2026-02");

    const monthly = summary1.body.monthly as Array<any>;
    const jan = monthly.find(row => row.month === "2026-01");
    const feb = monthly.find(row => row.month === "2026-02");

    expect(jan).toMatchObject({ income: 0, expense: 100, net: -100 });
    expect(feb).toMatchObject({ income: 2000, expense: 550, net: 1450 });

    const summary2 = await request(app)
      .get("/api/transactions/summary?from=2026-01-01&to=2026-02-15&groupBy=month&topCategories=6")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(summary2.body.cache_hit).toBe(true);

    // Change transactions → should invalidate cache key (transactionsUpdatedAt changes)
    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 25,
        category: "Food",
        description: "Coffee",
        type: "expense",
        date: "2026-02-08",
      })
      .expect(201);

    const summary3 = await request(app)
      .get("/api/transactions/summary?from=2026-01-01&to=2026-02-15&groupBy=month&topCategories=6")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(summary3.body.cache_hit).toBe(false);
  }, 15000);
});
