import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import OrgMemberModel from "../models/orgMemberModel";
import UserModel from "../models/userModel";
import { getAuthMemberships, getAuthUser } from "../services/authCache";
import { resetAuthCacheLocal } from "../services/authCacheStore";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const READ_METHODS = new Set(["find", "findOne", "aggregate", "countDocuments", "findOneAndUpdate", "distinct"]);

const countReads = async (fn: () => Promise<void>) => {
  let reads = 0;
  mongoose.set("debug", (_collection: string, method: string) => {
    if (READ_METHODS.has(method)) reads += 1;
  });
  try {
    await fn();
  } finally {
    mongoose.set("debug", false);
  }
  return reads;
};

describe("request-path auth cache", () => {
  const app = createApp();
  const previousTtl = process.env.AUTH_CACHE_TTL_SECONDS;

  beforeAll(async () => {
    await startTestDb();
    configurePassport();
  });

  afterAll(async () => {
    if (previousTtl === undefined) delete process.env.AUTH_CACHE_TTL_SECONDS;
    else process.env.AUTH_CACHE_TTL_SECONDS = previousTtl;
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    resetAuthCacheLocal();
    process.env.AUTH_CACHE_TTL_SECONDS = "45";
  });

  it("checks both user MFA state and memberships freshly on authenticated requests", async () => {
    const auth = await createAuthedUser();
    await ensurePersonalOrgForUser(auth.user._id);

    // warm the cache
    await request(app).get("/api/auth/profile").set("Cookie", auth.cookie).expect(200);

    const requests = 10;
    const cachedReads = await countReads(async () => {
      for (let i = 0; i < requests; i++) {
        await request(app).get("/api/auth/profile").set("Cookie", auth.cookie).expect(200);
      }
    });
    // User MFA enrollment and org membership must both be fresh across replicas.
    expect(cachedReads / requests).toBeGreaterThanOrEqual(2);
    expect(cachedReads / requests).toBeLessThanOrEqual(2.2);
  });

  it("checks fresh user and memberships for each concurrent request", async () => {
    const auth = await createAuthedUser();
    await ensurePersonalOrgForUser(auth.user._id);
    resetAuthCacheLocal();

    const reads = await countReads(async () => {
      await Promise.all(
        Array.from({ length: 8 }, () => request(app).get("/api/auth/profile").set("Cookie", auth.cookie).expect(200))
      );
    });
    // Neither user MFA state nor memberships may be coalesced across requests.
    expect(reads).toBeGreaterThanOrEqual(16);
    expect(reads).toBeLessThanOrEqual(20);
  });

  it("invalidates cached memberships when a role changes", async () => {
    const auth = await createAuthedUser();
    const member = await ensurePersonalOrgForUser(auth.user._id);
    const userId = auth.user._id.toString();

    const before = await getAuthMemberships(userId);
    expect(before[0].role).toBe("owner");

    await OrgMemberModel.updateOne({ _id: (member as any)._id }, { $set: { role: "member" } });

    const after = await getAuthMemberships(userId);
    expect(after[0].role).toBe("member");
  });

  it("invalidates the cached user on profile/password updates and hydrates a savable document", async () => {
    const auth = await createAuthedUser({ name: "Before" });
    const userId = auth.user._id.toString();

    const first = await getAuthUser(userId);
    expect(first?.name).toBe("Before");
    expect((first as any).password).toBeUndefined();

    await UserModel.updateOne({ _id: auth.user._id }, { $set: { name: "After" } });
    const second = await getAuthUser(userId);
    expect(second?.name).toBe("After");

    // a cached hydrated document can be mutated and saved by handlers
    second!.name = "Saved";
    await second!.save();
    expect((await UserModel.findById(userId).lean())?.name).toBe("Saved");
    expect((await getAuthUser(userId))?.name).toBe("Saved");

    await UserModel.deleteOne({ _id: auth.user._id });
    expect(await getAuthUser(userId)).toBeNull();
  });

  it("denies a member revoked on another replica even with a warm local cache", async () => {
    const auth = await createAuthedUser();
    const member = await ensurePersonalOrgForUser(auth.user._id);
    const orgId = String(member.orgId);
    await getAuthMemberships(auth.user._id.toString()); // warm a stale membership projection
    await request(app).get("/api/auth/profile").set("Cookie", auth.cookie).set("X-Org-Id", orgId).expect(200);

    // Native driver write simulates a second replica: it bypasses the model's
    // process-local invalidation hook and leaves this replica's cache populated.
    await OrgMemberModel.collection.updateOne({ _id: member._id }, { $set: { status: "removed" } });
    const cached = await getAuthMemberships(auth.user._id.toString());
    expect(cached.some((row) => row.orgId === orgId)).toBe(true);
    await request(app).get("/api/auth/profile").set("Cookie", auth.cookie).set("X-Org-Id", orgId).expect(403);
  });

  it("denies admin-only routes after a role downgrade on another replica", async () => {
    const auth = await createAuthedUser();
    const member = await ensurePersonalOrgForUser(auth.user._id);
    const orgId = String(member.orgId);
    await getAuthMemberships(auth.user._id.toString());
    await request(app).get("/api/agent-outputs/review-queue")
      .set("Cookie", auth.cookie).set("X-Org-Id", orgId).expect(200);

    await OrgMemberModel.collection.updateOne({ _id: member._id }, { $set: { role: "member" } });
    expect((await getAuthMemberships(auth.user._id.toString()))[0].role).toBe("owner");
    await request(app).get("/api/agent-outputs/review-queue")
      .set("Cookie", auth.cookie).set("X-Org-Id", orgId).expect(403);
  });

  it("still rejects unknown org ids and non-member orgs", async () => {
    const auth = await createAuthedUser();
    await ensurePersonalOrgForUser(auth.user._id);

    await request(app)
      .get("/api/auth/profile")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", "not-an-id")
      .expect(400);

    await request(app)
      .get("/api/auth/profile")
      .set("Cookie", auth.cookie)
      .set("X-Org-Id", new mongoose.Types.ObjectId().toString())
      .expect(403);
  });
});
