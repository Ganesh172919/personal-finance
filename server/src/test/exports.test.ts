import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import EntitlementModel from "../models/entitlementModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const binaryParser = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("exports API", () => {
  const app = createApp();
  let cookie = "";
  let userId = "";
  let orgId = "";
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
    userId = auth.user._id.toString();
    orgId = String((await ensurePersonalOrgForUser(auth.user._id)).orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("blocks exports on free plan", async () => {
    const response = await request(app)
      .post("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ type: "transactions_csv", params: {} })
      .expect(402);

    expect(response.body.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("creates and downloads a transactions CSV export", async () => {
    await EntitlementModel.create({
      orgId,
      userId,
      plan: "pro",
      status: "active",
    });

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 2500,
        category: "Salary",
        description: "Monthly salary",
        date: "2026-02-01",
        type: "income",
      })
      .expect(201);

    const created = await request(app)
      .post("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ type: "transactions_csv", params: {} })
      .expect(201);

    expect(created.body.export.status).toBe("succeeded");
    const exportId = created.body.export.id as string;

    const download = await request(app)
      .get(`/api/v1/exports/${exportId}/download`)
      .set("Cookie", [cookie, csrfCookie])
      .expect(200);

    expect(String(download.headers["content-type"] || "")).toContain("text/csv");
    expect(download.text).toContain("Salary");
    expect(download.text).toContain("Monthly salary");
  });

  it("creates and downloads a monthly summary PDF export", async () => {
    await EntitlementModel.create({
      orgId,
      userId,
      plan: "pro",
      status: "active",
    });

    await request(app)
      .post("/api/transactions")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        amount: 1000,
        category: "Utilities",
        description: "Electricity bill",
        date: "2026-02-03",
        type: "expense",
      })
      .expect(201);

    const created = await request(app)
      .post("/api/v1/exports")
      .set("Cookie", [cookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({ type: "monthly_summary_pdf", params: { period_key: "2026-02" } })
      .expect(201);

    expect(created.body.export.status).toBe("succeeded");
    const exportId = created.body.export.id as string;

    const download = await request(app)
      .get(`/api/v1/exports/${exportId}/download`)
      .set("Cookie", [cookie, csrfCookie])
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(String(download.headers["content-type"] || "")).toContain("application/pdf");
    expect(Buffer.isBuffer(download.body)).toBe(true);
    expect((download.body as Buffer).subarray(0, 4).toString("utf8")).toBe("%PDF");
  });
});

