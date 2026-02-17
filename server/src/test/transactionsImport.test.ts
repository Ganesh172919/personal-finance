import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("transactions import API", () => {
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

  it("imports transactions in bulk and returns accurate monthly summary", async () => {
    const rows = [
      {
        amount: 1000,
        category: "Salary",
        description: "Salary",
        type: "income",
        date: "2026-01-05",
      },
      {
        amount: 200,
        category: "Food",
        description: "Groceries",
        type: "expense",
        date: "2026-01-06",
      },
      {
        amount: 300,
        category: "Rent",
        description: "Rent",
        type: "expense",
        date: "2026-02-01",
      },
    ];

    const importResult = await request(app)
      .post("/api/transactions/import")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ rows })
      .expect(201);

    expect(importResult.body.inserted).toBe(3);

    const summary = await request(app)
      .get("/api/transactions/summary?from=2026-01-01&to=2026-02-28&groupBy=month&topCategories=6")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    const monthly = summary.body.monthly as Array<any>;
    const jan = monthly.find(row => row.month === "2026-01");
    const feb = monthly.find(row => row.month === "2026-02");

    expect(jan).toMatchObject({ income: 1000, expense: 200, net: 800 });
    expect(feb).toMatchObject({ income: 0, expense: 300, net: -300 });
  });
});

