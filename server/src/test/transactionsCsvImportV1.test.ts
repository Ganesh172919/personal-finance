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

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = String(csrf.body.csrf_token || "");
    expect(csrfToken.length).toBeGreaterThan(10);
  });

  it("imports a CSV file with mapping and dedupes by externalId", async () => {
    const account = await request(app)
      .post("/api/finance/accounts")
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
      .post("/api/integrations/transactions_csv/import")
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
      .post("/api/integrations/transactions_csv/import")
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

  it("returns structured row_errors for rows with invalid amounts or dates", async () => {
    const csvWithErrors = [
      "Amount,Date,Description,Category,Type",
      "100.00,2026-02-01,Valid Item,General,expense",
      "NOT_A_NUMBER,2026-02-02,Broken Amount,Shopping,expense",
      "50.00,INVALID_DATE,Broken Date,Food,expense",
    ].join("\n");

    const res = await request(app)
      .post("/api/integrations/transactions_csv/import")
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
      .field("dry_run", "true")
      .attach("file", Buffer.from(csvWithErrors, "utf8"), {
        filename: "test_with_errors.csv",
        contentType: "text/csv",
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.dry_run).toBe(true);
    expect(res.body.parsed_rows).toBe(3);
    expect(res.body.invalid_rows).toBe(2);
    expect(Array.isArray(res.body.row_errors)).toBe(true);
    expect(res.body.row_errors.length).toBeGreaterThanOrEqual(2);

    const amountError = res.body.row_errors.find((e: any) => e.row === 2);
    expect(amountError).toBeDefined();
    expect(amountError.field).toBe("Amount");
    expect(amountError.message).toContain("Amount could not be parsed");

    const dateError = res.body.row_errors.find((e: any) => e.row === 3);
    expect(dateError).toBeDefined();
    expect(dateError.field).toBe("Date");
    expect(dateError.message).toContain("Date could not be parsed");
  }, 20000);
});

