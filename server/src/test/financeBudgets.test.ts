import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const currentPeriodKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

describe("finance budget allocation endpoints", () => {
  const app = createApp();
  let cookie = "";
  let csrfCookie = "";
  let csrfToken = "";
  let orgId = "";
  let userId = "";

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

    const membership = await ensurePersonalOrgForUser(auth.user._id);
    orgId = String((membership as any).orgId);

    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    csrfToken = csrf.body.csrf_token as string;
  });

  it("lists, upserts, and deletes budget allocations with tenant isolation", async () => {
    const period = currentPeriodKey();

    // 1. List initial allocations (empty)
    const listRes1 = await request(app)
      .get(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(200);

    expect(listRes1.body.allocations).toEqual([]);

    // 2. Upsert an allocation: Housing $1500
    const upsertRes1 = await request(app)
      .put(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .send({ category: "Housing", amount: 1500, currency: "USD" })
      .expect(200);

    expect(upsertRes1.body.allocation).toMatchObject({
      category: "Housing",
      amount: 1500,
      currency: "USD",
      period_key: period,
    });
    const allocationId = upsertRes1.body.allocation.id;

    // 3. Upsert a second allocation: Groceries $450
    await request(app)
      .put(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .send({ category: "Groceries", amount: 450, currency: "USD" })
      .expect(200);

    // 4. Verify list has 2 allocations
    const listRes2 = await request(app)
      .get(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(200);

    expect(listRes2.body.allocations).toHaveLength(2);

    // 5. Update Housing to $1600
    const updateRes = await request(app)
      .put(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .send({ category: "Housing", amount: 1600, currency: "USD" })
      .expect(200);

    expect(updateRes.body.allocation.amount).toBe(1600);

    // 6. Delete Housing allocation by ID
    const deleteRes = await request(app)
      .delete(`/api/finance/budgets/${period}/allocations/${allocationId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(200);

    expect(deleteRes.body).toMatchObject({
      message: "Budget allocation deleted",
      deleted_id: allocationId,
      period_key: period,
      category: "Housing",
    });

    // 7. Verify only Groceries remains
    const listRes3 = await request(app)
      .get(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(200);

    expect(listRes3.body.allocations).toHaveLength(1);
    expect(listRes3.body.allocations[0].category).toBe("Groceries");

    // 8. Deleting again returns 404
    await request(app)
      .delete(`/api/finance/budgets/${period}/allocations/${allocationId}`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(404);
  });

  it("validates input formats and rejects unauthorized modifications", async () => {
    const period = currentPeriodKey();

    // Invalid period key
    await request(app)
      .get("/api/finance/budgets/invalid-period/allocations")
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(400);

    // Negative amount rejected
    await request(app)
      .put(`/api/finance/budgets/${period}/allocations`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .send({ category: "Dining", amount: -50 })
      .expect(400);

    // Invalid ObjectId on delete
    await request(app)
      .delete(`/api/finance/budgets/${period}/allocations/invalid-id`)
      .set("Cookie", [cookie, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .set("x-org-id", orgId)
      .expect(400);
  });
});
