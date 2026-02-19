import type { Types } from "mongoose";

import CreditGrantModel, { CREDIT_FEATURES, type CreditFeature } from "../models/creditGrantModel";

const clampIdempotencyKey = (value: string) => value.trim().slice(0, 128);

const periodKeyForDate = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

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

