import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("Transaction Splits API", () => {
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
    const authed = await createAuthedUser();
    cookie = authed.cookie;

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("creates a transaction with split categories and retrieves them", async () => {
    const createRes = await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 150,
        category: "Shopping",
        description: "Target Superstore",
        type: "expense",
        splits: [
          { category: "Groceries", amount: 100 },
          { category: "Household Supplies", amount: 50 },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.transaction).toBeDefined();
    expect(createRes.body.transaction.splits).toHaveLength(2);
    expect(createRes.body.transaction.splits[0]).toEqual({
      category: "Groceries",
      amount: 100,
    });
    expect(createRes.body.transaction.splits[1]).toEqual({
      category: "Household Supplies",
      amount: 50,
    });

    const txId = createRes.body.transaction.id;

    // Verify GET list includes splits
    const listRes = await request(app)
      .get("/api/transactions")
      .set("Cookie", [cookie, csrfCookie]);

    expect(listRes.status).toBe(200);
    const found = listRes.body.transactions.find((t: any) => t.id === txId);
    expect(found).toBeDefined();
    expect(found.splits).toHaveLength(2);
  });

  it("updates an existing transaction with new splits via PATCH", async () => {
    // 1. Create a regular single-category transaction
    const createRes = await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 200,
        category: "Uncategorized",
        description: "Costco Wholesale",
        type: "expense",
      });

    expect(createRes.status).toBe(201);
    const txId = createRes.body.transaction.id;

    // 2. Patch with splits
    const patchRes = await request(app)
      .patch(`/api/transactions/${txId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        splits: [
          { category: "Groceries", amount: 120 },
          { category: "Electronics", amount: 80 },
        ],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.transaction.splits).toHaveLength(2);
    expect(patchRes.body.transaction.splits[0].category).toBe("Groceries");
    expect(patchRes.body.transaction.splits[1].category).toBe("Electronics");
  });

  it("rejects invalid split schemas (non-positive amounts)", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 100,
        category: "Shopping",
        description: "Invalid Split",
        type: "expense",
        splits: [
          { category: "Groceries", amount: -50 },
          { category: "Clothing", amount: 150 },
        ],
      });

    expect(res.status).toBe(400);
  });
});
