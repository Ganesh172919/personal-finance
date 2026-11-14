import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import EntitlementModel from "../models/entitlementModel";
import UsageEventModel from "../models/usageEventModel";
import UsageLedgerModel from "../models/usageLedgerModel";
import {
  getCurrentPeriodKey,
  recordFeatureUsage,
  reserveFeatureUsage,
} from "../services/entitlements";
import { clearTestDb, startTestDb, stopTestDb } from "./testDb";

const newId = () => new mongoose.Types.ObjectId();

const seedOrg = async (limit: number, feature = "monthly_ai_calls") => {
  const orgId = newId();
  const userId = newId();
  await EntitlementModel.create({
    orgId,
    userId,
    plan: "free",
    status: "active",
    limitsOverride: { [feature]: limit },
  });
  return { orgId, userId };
};

const ledgerUnits = async (orgId: mongoose.Types.ObjectId, feature = "monthly_ai_calls") => {
  const row = await UsageLedgerModel.findOne({ orgId, periodKey: getCurrentPeriodKey(), feature }).lean();
  return Number(row?.units ?? 0);
};

describe("atomic quota reservation", () => {
  beforeAll(async () => {
    await startTestDb();
    await Promise.all([UsageLedgerModel.init(), UsageEventModel.init(), EntitlementModel.init()]);
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("20 parallel reservations against a limit of 5 admit exactly 5", async () => {
    const { orgId, userId } = await seedOrg(5);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 1 })
      )
    );

    const admitted = results.filter(r => r.status === "fulfilled");
    const rejected = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
    expect(admitted).toHaveLength(5);
    expect(rejected).toHaveLength(15);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ statusCode: 402, code: "FEATURE_LIMIT_REACHED" });
    }
    expect(await ledgerUnits(orgId)).toBe(5);
  });

  it("20 parallel reserve+record cycles never overshoot and bill only admitted calls", async () => {
    const { orgId, userId } = await seedOrg(7);

    await Promise.allSettled(
      Array.from({ length: 20 }, async () => {
        const reservation = await reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls" });
        try {
          await recordFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 1, reservation });
        } finally {
          await reservation.release();
        }
      })
    );

    expect(await ledgerUnits(orgId)).toBe(7);
    expect(await UsageEventModel.countDocuments({ orgId, feature: "monthly_ai_calls" })).toBe(7);
  });

  it("releases the reservation when the work fails", async () => {
    const { orgId, userId } = await seedOrg(1);

    const failed = await reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls" });
    expect(await ledgerUnits(orgId)).toBe(1);
    await failed.release();
    await failed.release(); // idempotent
    expect(await ledgerUnits(orgId)).toBe(0);

    // the freed quota is usable again
    const retry = await reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls" });
    await recordFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 1, reservation: retry });
    await retry.release(); // no-op after commit
    expect(await ledgerUnits(orgId)).toBe(1);

    await expect(reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls" })).rejects.toMatchObject({
      statusCode: 402,
      code: "FEATURE_LIMIT_REACHED",
    });
  });

  it("an idempotent retry bills once and returns its reservation", async () => {
    const { orgId, userId } = await seedOrg(10);
    const idempotencyKey = "retry-key-0001";

    const first = await reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls" });
    const created = await recordFeatureUsage({
      orgId, userId, feature: "monthly_ai_calls", units: 1, idempotencyKey, reservation: first,
    });
    expect(created).toBeTruthy();

    const second = await reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls" });
    expect(await ledgerUnits(orgId)).toBe(2); // both held until the duplicate is detected
    const duplicate = await recordFeatureUsage({
      orgId, userId, feature: "monthly_ai_calls", units: 1, idempotencyKey, reservation: second,
    });
    expect(duplicate).toBeNull();

    expect(await ledgerUnits(orgId)).toBe(1);
    expect(await UsageEventModel.countDocuments({ orgId, idempotencyKey })).toBe(1);
  });

  it("applies the delta when actual units differ from the reserved units", async () => {
    const { orgId, userId } = await seedOrg(20);
    const reservation = await reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 1 });
    await recordFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 3, reservation });
    expect(await ledgerUnits(orgId)).toBe(3);
  });

  it("rejects requests larger than the whole limit and honours boolean features", async () => {
    const { orgId, userId } = await seedOrg(2);
    await expect(
      reserveFeatureUsage({ orgId, userId, feature: "monthly_ai_calls", units: 3 })
    ).rejects.toMatchObject({ statusCode: 402, code: "FEATURE_LIMIT_REACHED" });

    // free plan has export_access=false
    await expect(reserveFeatureUsage({ orgId, userId, feature: "export_access" })).rejects.toMatchObject({
      statusCode: 402,
      code: "FEATURE_NOT_AVAILABLE",
    });
  });
});
