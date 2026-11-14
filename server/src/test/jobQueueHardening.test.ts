import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { configurePassport } from "../config/passport";
import DeadLetterJobModel from "../models/deadLetterJobModel";
import ExportJobModel from "../models/exportJobModel";
import IntegrationSyncRunModel from "../models/integrationSyncRunModel";
import LeaderLockModel from "../models/leaderLockModel";
import NewsletterPreferenceModel from "../models/newsletterPreferenceModel";
import OrgMemberModel from "../models/orgMemberModel";
import { computeBackoffMs, claimableQueuedFilter, isRetryableJobError, registerJobFailure } from "../services/jobRetry";
import { tryAcquireLeadership, releaseLeadership, type LeaderRedisLike } from "../services/leaderElection";
import { ensurePersonalOrgForUser } from "../services/orgService";
import { createAuthedUser } from "./authHelpers";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

/** Tiny in-memory stand-in for the two Redis commands leader election uses. */
class FakeRedis implements LeaderRedisLike {
  store = new Map<string, string>();
  async set(key: string, value: string, ...args: any[]) {
    const nx = args.includes("NX");
    if (nx && this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }
  async eval(script: string, _n: number, key: string, holder: string) {
    const owned = this.store.get(key) === holder;
    if (!owned) return 0;
    if (script.includes("'del'")) this.store.delete(key);
    return 1;
  }
}

describe("job retry policy", () => {
  it("backs off exponentially with jitter inside [exp/2, exp] and caps at max", () => {
    const cfg = { baseMs: 1000, maxMs: 10_000 };
    expect(computeBackoffMs(1, cfg, () => 0)).toBe(500);
    expect(computeBackoffMs(1, cfg, () => 1)).toBe(1000);
    expect(computeBackoffMs(3, cfg, () => 1)).toBe(4000);
    expect(computeBackoffMs(10, cfg, () => 1)).toBe(10_000);
    expect(computeBackoffMs(10, cfg, () => 0)).toBe(5000);
  });

  it("treats validation-style failures as permanent", () => {
    expect(isRetryableJobError(new Error("Workflow not found"))).toBe(false);
    expect(isRetryableJobError(Object.assign(new Error("bad"), { statusCode: 400 }))).toBe(false);
    expect(isRetryableJobError(new Error("socket hang up"))).toBe(true);
    expect(isRetryableJobError(Object.assign(new Error("slow"), { statusCode: 429 }))).toBe(true);
  });
});

describe("leader election", () => {
  beforeAll(async () => {
    await startTestDb();
  });
  afterAll(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it("redis: only one holder at a time, holder renews, release hands over", async () => {
    const redis = new FakeRedis();
    expect(await tryAcquireLeadership("job", 1000, { holder: "a", redis })).toBe(true);
    expect(await tryAcquireLeadership("job", 1000, { holder: "b", redis })).toBe(false);
    expect(await tryAcquireLeadership("job", 1000, { holder: "a", redis })).toBe(true); // renew
    await releaseLeadership("job", { holder: "a", redis });
    expect(await tryAcquireLeadership("job", 1000, { holder: "b", redis })).toBe(true);
  });

  it("mongo fallback: atomic claim, renewal, and takeover after expiry", async () => {
    const opts = { disableRedis: true };
    expect(await tryAcquireLeadership("job", 60_000, { ...opts, holder: "a" })).toBe(true);
    expect(await tryAcquireLeadership("job", 60_000, { ...opts, holder: "b" })).toBe(false);
    expect(await tryAcquireLeadership("job", 60_000, { ...opts, holder: "a" })).toBe(true);

    await LeaderLockModel.updateOne({ name: "job" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await tryAcquireLeadership("job", 60_000, { ...opts, holder: "b" })).toBe(true);
    expect(await tryAcquireLeadership("job", 60_000, { ...opts, holder: "a" })).toBe(false);
  });

  it("mongo fallback: concurrent contenders produce exactly one leader", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => tryAcquireLeadership("race", 60_000, { disableRedis: true, holder: `h${i}` }))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("falls back to mongo when redis throws", async () => {
    const broken: LeaderRedisLike = {
      set: async () => {
        throw new Error("down");
      },
      eval: async () => {
        throw new Error("down");
      },
    };
    expect(await tryAcquireLeadership("job", 1000, { holder: "a", redis: broken })).toBe(true);
    expect(await tryAcquireLeadership("job", 1000, { holder: "b", redis: broken })).toBe(false);
  });
});

describe("queued job retries, dead-letter and replay", () => {
  const app = createApp();
  const orgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const config = { maxAttempts: 3, baseMs: 1000, maxMs: 60_000 };

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

  const makeRunningExport = (extra: Record<string, unknown> = {}) =>
    ExportJobModel.create({ orgId, createdByUserId: userId, type: "transactions_csv", status: "running", startedAt: new Date(), ...extra });

  it("requeues with backoff until max attempts, then dead-letters once", async () => {
    const job = await makeRunningExport();
    const err = new Error("connection reset");

    expect(await registerJobFailure("export_job", String(job._id), err, { config })).toBe("requeued");
    let doc: any = await ExportJobModel.findById(job._id).lean();
    expect(doc).toMatchObject({ status: "queued", attempts: 1 });
    expect(doc.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Backing-off jobs are not claimable; elapsed ones are.
    expect(await ExportJobModel.countDocuments(claimableQueuedFilter())).toBe(0);
    expect(await ExportJobModel.countDocuments(claimableQueuedFilter(new Date(Date.now() + 120_000)))).toBe(1);

    await ExportJobModel.updateOne({ _id: job._id }, { $set: { status: "running" } });
    expect(await registerJobFailure("export_job", String(job._id), err, { config })).toBe("requeued");
    await ExportJobModel.updateOne({ _id: job._id }, { $set: { status: "running" } });
    expect(await registerJobFailure("export_job", String(job._id), err, { config })).toBe("dead_lettered");

    doc = await ExportJobModel.findById(job._id).lean();
    expect(doc).toMatchObject({ status: "failed", attempts: 3 });
    const dead = await DeadLetterJobModel.find({}).lean();
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ kind: "export_job", attempts: 3 });

    // A job that is no longer running/failed is left alone.
    expect(await registerJobFailure("export_job", String(job._id), err, { config })).toBe("dead_lettered");
    await ExportJobModel.updateOne({ _id: job._id }, { $set: { status: "succeeded" } });
    expect(await registerJobFailure("export_job", String(job._id), err, { config })).toBe("skipped");
  });

  it("dead-letters immediately on permanent errors and clears the stored quota reservation on retry", async () => {
    const permanent = await makeRunningExport();
    expect(await registerJobFailure("export_job", String(permanent._id), new Error("Unsupported export type"), { config })).toBe("dead_lettered");

    const sync = await IntegrationSyncRunModel.create({
      orgId,
      connectorKey: "bank_stub",
      status: "running",
      startedAt: new Date(),
      metadata: { quota_reservation: { feature: "integration_syncs" }, keep: 1 },
    });
    expect(await registerJobFailure("integration_sync_run", String(sync._id), new Error("timeout"), { config })).toBe("requeued");
    const after: any = await IntegrationSyncRunModel.findById(sync._id).lean();
    expect(after.metadata.quota_reservation).toBeUndefined();
    expect(after.metadata.keep).toBe(1);
  });

  it("admin lists dead letters (cursor paginated) and replays one exactly once", async () => {
    const admin = await createAuthedUser();
    const org = await ensurePersonalOrgForUser(admin.user._id);
    const adminOrgId = new mongoose.Types.ObjectId(String(org.orgId));
    const csrf = await request(app).get("/api/auth/csrf").expect(200);
    const csrfCookie = (csrf.headers["set-cookie"]?.[0] || "").split(";")[0] || "";
    const authed = (req: request.Test, cookie = admin.cookie) =>
      req.set("Cookie", [cookie, csrfCookie]).set("X-CSRF-Token", csrf.body.csrf_token).set("X-Org-Id", String(org.orgId));

    const jobs = [];
    for (let i = 0; i < 3; i += 1) {
      const job = await ExportJobModel.create({
        orgId: adminOrgId,
        createdByUserId: admin.user._id,
        type: "transactions_csv",
        status: "failed",
        attempts: 3,
        error: "boom",
      });
      await DeadLetterJobModel.create({ kind: "export_job", jobId: job._id, orgId: adminOrgId, attempts: 3, error: "boom" });
      jobs.push(job);
    }
    // Another org's dead letter must stay invisible.
    await DeadLetterJobModel.create({ kind: "export_job", jobId: new mongoose.Types.ObjectId(), orgId: new mongoose.Types.ObjectId(), attempts: 3, error: "x" });

    const page1 = await authed(request(app).get("/api/v1/admin/dead-letter-jobs?limit=2")).expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.next_cursor).toBeTruthy();
    const page2 = await authed(request(app).get(`/api/v1/admin/dead-letter-jobs?limit=2&cursor=${page1.body.next_cursor}`)).expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.next_cursor).toBeNull();

    const target = page1.body.items[0];
    const replay = await authed(request(app).post(`/api/v1/admin/dead-letter-jobs/${target.id}/replay`).send({})).expect(200);
    expect(replay.body.outcome).toBe("requeued");
    const requeued: any = await ExportJobModel.findById(target.job_id).lean();
    expect(requeued).toMatchObject({ status: "queued", attempts: 0 });
    expect(requeued.error).toBeUndefined();

    await authed(request(app).post(`/api/v1/admin/dead-letter-jobs/${target.id}/replay`).send({})).expect(409);

    // Members cannot see or replay.
    const member = await createAuthedUser();
    await OrgMemberModel.create({ orgId: adminOrgId, userId: member.user._id, role: "member", status: "active", isDefault: false });
    await authed(request(app).get("/api/v1/admin/dead-letter-jobs"), member.cookie).expect(403);
  });
});

describe("newsletter delivery claim", () => {
  beforeAll(async () => {
    await startTestDb();
  });
  afterAll(async () => {
    await stopTestDb();
  });

  it("compare-and-set on lastSentAt lets exactly one replica claim a day's send", async () => {
    await clearTestDb();
    const pref = await NewsletterPreferenceModel.create({ userId: new mongoose.Types.ObjectId(), orgId: new mongoose.Types.ObjectId(), isSubscribed: true });
    const before = (pref as any).lastSentAt ?? null;
    const claims = await Promise.all(
      Array.from({ length: 6 }, () => NewsletterPreferenceModel.updateOne({ _id: pref._id, lastSentAt: before }, { $set: { lastSentAt: new Date() } }))
    );
    expect(claims.filter((c) => c.modifiedCount === 1)).toHaveLength(1);
  });
});
