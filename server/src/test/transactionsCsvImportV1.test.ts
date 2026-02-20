import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import TransactionModel from "../models/transactionModel";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("transactions CSV import v1 API", () => {
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

    const csrf = await request(app).get("/api/v1/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token || "");
    expect(csrfToken.length).toBeGreaterThan(10);
  });

  it("imports a CSV file with mapping and dedupes by externalId", async () => {
    const account = await request(app)
      .post("/api/v1/finance/accounts")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Main checking",
        type: "checking",
        currency: "USD",
      })
      .expect(201);

    const accountId = String(account.body.account?.id || "");
    expect(accountId).toMatch(/^[a-f\d]{24}$/i);

    const csv = [
      "Amount,Date,Description,Category,Type",
      "12.34,2026-02-01,Coffee,Food,expense",
      "1000,2026-02-02,Salary,Income,income",
    ].join("\n");

    const first = await request(app)
      .post("/api/v1/integrations/transactions_csv/import")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .field(
        "mapping",
        JSON.stringify({
          amount: "Amount",
          date: "Date",
          description: "Description",
          category: "Category",
          type: "Type",
        })
      )
      .field("account_id", accountId)
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "transactions.csv",
        contentType: "text/csv",
      })
      .expect(201);

    expect(first.body.ok).toBe(true);
    expect(first.body.inserted).toBe(2);
    expect(first.body.duplicates).toBe(0);

    const second = await request(app)
      .post("/api/v1/integrations/transactions_csv/import")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .field(
        "mapping",
        JSON.stringify({
          amount: "Amount",
          date: "Date",
          description: "Description",
          category: "Category",
          type: "Type",
        })
      )
      .field("account_id", accountId)
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "transactions.csv",
        contentType: "text/csv",
      })
      .expect(201);

    expect(second.body.ok).toBe(true);
    expect(second.body.inserted).toBe(0);
    expect(second.body.duplicates).toBe(2);

    const count = await TransactionModel.countDocuments({});
    expect(count).toBe(2);
  }, 20000);
});

