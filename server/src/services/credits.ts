import type { Types } from "mongoose";

import CreditGrantModel, { CREDIT_FEATURES, type CreditFeature } from "../models/creditGrantModel";

// Normalizes and truncates an idempotency key string to a safe maximum length.
// Strips superfluous leading and trailing whitespace from the key identifier.
// Prevents storage errors and maintains predictable index size within MongoDB.
const clampIdempotencyKey = (value: string) => value.trim().slice(0, 128);

// Converts a given UTC Date object into a standard YYYY-MM period identifier string.
// Formats calendar months with zero-padding for uniform lexicographical sorting.
// Ensures consistent billing and credit allocation period key generation.
const periodKeyForDate = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

// Generates an array of sequential monthly period keys spanning a future timeframe.
// Restricts month intervals between 1 and 24 to prevent excessive array allocations.
// Facilitates multi-month credit grants and recurring promotional allocations.
export const getPeriodKeysForNextMonths = (params: { months: number; start?: Date }) => {
  const months = Math.max(1, Math.min(24, Math.floor(params.months)));
  const start = params.start ? new Date(params.start) : new Date();

  const keys: string[] = [];
  for (let offset = 0; offset < months; offset += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1, 0, 0, 0));
    keys.push(periodKeyForDate(d));
  }
  return keys;
};

// Aggregates total credit unit grants available across all features for an organization.
// Executes MongoDB aggregation grouping by feature key within a specific period.
// Returns a record mapping every known credit feature to its active grant balance.
export const sumCreditsByFeature = async (params: { orgId: Types.ObjectId; periodKey: string }) => {
  const rows = await CreditGrantModel.aggregate([
    { $match: { orgId: params.orgId, periodKey: params.periodKey } },
    { $group: { _id: "$feature", units: { $sum: "$units" } } },
  ]);

  const credits: Record<CreditFeature, number> = Object.fromEntries(
    CREDIT_FEATURES.map((feature) => [feature, 0])
  ) as Record<CreditFeature, number>;

  for (const row of rows as any[]) {
    const feature = String(row?._id || "") as CreditFeature;
    if (!feature || !(feature in credits)) continue;
    credits[feature] = Math.max(0, Number(row?.units || 0));
  }

  return credits;
};

// Issues idempotent feature credit grants to an organization for a designated period.
// Formulates unique idempotency keys per feature to prevent duplicate award grants.
// Executes atomic upserts to ensure reliable multi-feature credit provisioning.
export const grantCredits = async (params: {
  orgId: Types.ObjectId;
  periodKey: string;
  unitsByFeature: Partial<Record<CreditFeature, number>>;
  sourceType: string;
  sourceId: string;
  createdByUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
}) => {
  const inserts = Object.entries(params.unitsByFeature || {})
    .filter(([feature, units]) => CREDIT_FEATURES.includes(feature as CreditFeature) && Number(units) > 0)
    .map(([feature, units]) => {
      const idempotencyKey = clampIdempotencyKey(
        `credit:${params.sourceType}:${params.sourceId}:${params.periodKey}:${feature}`
      );

      return CreditGrantModel.updateOne(
        { orgId: params.orgId, idempotencyKey },
        {
          $setOnInsert: {
            orgId: params.orgId,
            periodKey: params.periodKey,
            feature,
            units: Math.max(0, Math.floor(Number(units))),
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            idempotencyKey,
            createdByUserId: params.createdByUserId,
            metadata: params.metadata || {},
          },
        },
        { upsert: true }
      );
    });

  if (inserts.length === 0) {
    return { ok: true as const, inserted: 0 };
  }

  await Promise.all(inserts);
  return { ok: true as const, inserted: inserts.length };
};

