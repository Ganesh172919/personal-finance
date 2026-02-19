import mongoose from "mongoose";

import UsageEventModel from "../models/usageEventModel";
import UsageLedgerModel from "../models/usageLedgerModel";

export const aggregateUsageLedger = async (params: {
  orgId?: mongoose.Types.ObjectId;
  periodKey: string;
}) => {
  const match: Record<string, unknown> = {
    periodKey: params.periodKey,
    orgId: { $type: "objectId" },
  };
  if (params.orgId) {
    match.orgId = params.orgId;
  }

  const rows = await UsageEventModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: { orgId: "$orgId", feature: "$feature", periodKey: "$periodKey" },
        units: { $sum: "$units" },
        tokensIn: { $sum: { $ifNull: ["$tokensIn", 0] } },
        tokensOut: { $sum: { $ifNull: ["$tokensOut", 0] } },
        costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
      },
    },
  ]);

  const ops = rows.map((row: any) => {
    const orgId = row?._id?.orgId;
    const feature = row?._id?.feature;
    const periodKey = row?._id?.periodKey;
    const units = Number(row?.units || 0);
    const tokensIn = Number(row?.tokensIn || 0);
    const tokensOut = Number(row?.tokensOut || 0);
    const costUsd = Number(row?.costUsd || 0);

    return {
      updateOne: {
        filter: { orgId, feature, periodKey },
        update: {
          $set: {
            orgId,
            feature,
            periodKey,
            units,
            tokensIn,
            tokensOut,
            costUsd,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length === 0) {
    return { updated: 0 };
  }

  const result = await UsageLedgerModel.bulkWrite(ops, { ordered: false });
  const updated =
    (result as any).modifiedCount +
    (result as any).upsertedCount +
    (result as any).insertedCount;

  return { updated };
};
