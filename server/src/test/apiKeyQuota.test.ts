import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import EntitlementModel from "../models/entitlementModel";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createApiKey } from "../services/apiKeys";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

describe("api key quota enforcement", () => {
  const app = createApp();

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("blocks API key requests when api_requests quota is exhausted", async () => {
    const auth = await createAuthedUser();
    const membership = await ensurePersonalOrgForUser(auth.user._id);
    const orgIdRaw = String((membership as any).orgId);
    const orgId = new mongoose.Types.ObjectId(orgIdRaw);

    await EntitlementModel.create({
      orgId,
      userId: auth.user._id,
      plan: "free",
      status: "active",
      limitsOverride: { api_requests: 1 },
    });

    const created = await createApiKey({
      orgId,
      createdByUserId: auth.user._id,
      name: "Quota test key",
      scopes: ["usage:read"],
    });

    await request(app)
      .get("/api/v1/usage/ledger")
      .set("X-Org-Id", orgId.toString())
      .set("X-API-Key", created.secret)
      .expect(200);

    const denied = await request(app)
      .get("/api/v1/usage/ledger")
      .set("X-Org-Id", orgId.toString())
      .set("X-API-Key", created.secret)
      .expect(402);

    expect(denied.body.code).toBe("FEATURE_LIMIT_REACHED");
    expect(denied.body.details.feature).toBe("api_requests");
  });
});

