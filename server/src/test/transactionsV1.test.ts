import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("transactions v1 API", () => {
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

  it("supports create/list/summary/dashboard on /api/v1 with request context", async () => {
    const created = await request(app)
      .post("/api/v1/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 4321,
        category: "Food",
        description: "v1 create",
        type: "expense",
        date: "2026-02-19",
      })
      .expect(201);

    expect(created.body.transaction.description).toBe("v1 create");
    expect(created.body.request_id).toBeTruthy();
    expect(created.body.org_id).toBeTruthy();

    const listed = await request(app)
      .get("/api/v1/transactions?page=1&limit=10")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(Array.isArray(listed.body.transactions)).toBe(true);
    expect(listed.body.transactions).toHaveLength(1);
    expect(listed.body.pagination.total).toBe(1);
    expect(listed.body.request_id).toBeTruthy();
    expect(listed.body.org_id).toBeTruthy();

    const summary = await request(app)
      .get("/api/v1/transactions/summary?from=2026-02-01&to=2026-02-28&groupBy=month")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(Array.isArray(summary.body.monthly)).toBe(true);
    expect(summary.body.request_id).toBeTruthy();
    expect(summary.body.org_id).toBeTruthy();

    const dashboard = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(dashboard.body.spending).toBeTruthy();
    expect(dashboard.body.request_id).toBeTruthy();
    expect(dashboard.body.org_id).toBeTruthy();
  }, 15000);
});
