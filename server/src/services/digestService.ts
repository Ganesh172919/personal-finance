import mongoose from "mongoose";
import PQueue from "p-queue";

import { getEnv } from "../config/env";
import { logger } from "../config/logger";
import OrganizationModel from "../models/organizationModel";
import OrgMemberModel from "../models/orgMemberModel";
import TaskModel from "../models/taskModel";
import TransactionModel from "../models/transactionModel";
import UsageLedgerModel from "../models/usageLedgerModel";
import UserModel from "../models/userModel";
import { sendEmail } from "../utils/sendEmail";
import { getCurrentPeriodKey } from "./entitlements";
import { QUEUE_NAMES, getQueue } from "../worker/queues";

const toDayKey = (value: Date) => value.toISOString().slice(0, 10);

const clampDaysBack = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(31, Math.floor(parsed)));
};

const formatUsd = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export const enqueueDigestJobsForAllOrgs = async (params?: {
  asOf?: Date;
  daysBack?: number;
  periodKey?: string;
}) => {
  const env = getEnv();
  const asOf = params?.asOf ?? new Date();
  const dayKey = toDayKey(asOf);
  const periodKey = params?.periodKey || getCurrentPeriodKey(asOf);
  const daysBack = clampDaysBack(params?.daysBack, env.DIGEST_EMAIL_DAYS_BACK);

  const queue = getQueue(QUEUE_NAMES.digestEmail);
  const cursor = OrganizationModel.find().select({ _id: 1 }).lean().cursor();

  let enqueued = 0;
  for await (const org of cursor) {
    const orgId = String((org as any)?._id || "");
    if (!orgId) continue;

    await queue.add(
      "digest-org",
      { orgId, asOf: asOf.toISOString(), periodKey, daysBack },
      {
        jobId: `digest-org:${orgId}:${dayKey}`,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    enqueued += 1;
  }

  logger.info(
    {
      event: "digest_scan_enqueued",
      enqueued,
      day_key: dayKey,
      period_key: periodKey,
      days_back: daysBack,
    },
    "digest scan enqueued org jobs"
  );

  return { enqueued, day_key: dayKey, period_key: periodKey, days_back: daysBack };
};

export const sendOrgDigestEmails = async (params: {
  orgId: mongoose.Types.ObjectId;
  asOf?: Date;
  daysBack?: number;
  periodKey?: string;
}) => {
  const env = getEnv();
  const asOf = params.asOf ?? new Date();
  const dayKey = toDayKey(asOf);
  const periodKey = params.periodKey || getCurrentPeriodKey(asOf);
  const daysBack = clampDaysBack(params.daysBack, env.DIGEST_EMAIL_DAYS_BACK);

  const org = await OrganizationModel.findById(params.orgId).select({ _id: 1, name: 1 }).lean();
  if (!org?._id) {
    return { ok: false, reason: "org_not_found" };
  }

  const memberships = await OrgMemberModel.find({ orgId: params.orgId, status: "active" })
    .select({ userId: 1, role: 1 })
    .lean();

  const userIds = memberships
    .map((m) => m.userId as unknown as mongoose.Types.ObjectId)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

  if (userIds.length === 0) {
    return { ok: true, org_id: params.orgId.toString(), recipients: 0 };
  }

  const users = await UserModel.find({ _id: { $in: userIds } })
    .select({ _id: 1, email: 1, name: 1, isEmailVerified: 1 })
    .lean();

  const userById = new Map(users.map((u) => [String((u as any)._id), u]));

  const rangeEnd = asOf;
  const rangeStart = new Date(rangeEnd.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const dueSoon = new Date(rangeEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const txRows = await TransactionModel.aggregate([
    {
      $match: {
        orgId: params.orgId,
        userId: { $in: userIds },
        date: { $gte: rangeStart, $lt: rangeEnd },
      },
    },
    {
      $group: {
        _id: "$userId",
        net: { $sum: "$amount" },
        income: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
        expense: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const txByUser = new Map(
    txRows.map((row: any) => [
      String(row?._id),
      {
        net: Number(row?.net || 0),
        income: Number(row?.income || 0),
        expense: Number(row?.expense || 0),
        count: Number(row?.count || 0),
      },
    ])
  );

  const taskRows = await TaskModel.aggregate([
    {
      $match: {
        orgId: params.orgId,
        userId: { $in: userIds },
        status: "open",
      },
    },
    {
      $group: {
        _id: "$userId",
        open: { $sum: 1 },
        dueSoon: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ["$dueDate", null] }, { $lte: ["$dueDate", dueSoon] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  const tasksByUser = new Map(
    taskRows.map((row: any) => [
      String(row?._id),
      {
        open: Number(row?.open || 0),
        dueSoon: Number(row?.dueSoon || 0),
      },
    ])
  );

  const usageRow = await UsageLedgerModel.findOne({
    orgId: params.orgId,
    periodKey,
    feature: "monthly_ai_calls",
  })
    .select({ units: 1, tokensIn: 1, tokensOut: 1, costUsd: 1 })
    .lean();

  const orgUsage = {
    calls: Number((usageRow as any)?.units || 0),
    tokens_in: Number((usageRow as any)?.tokensIn || 0),
    tokens_out: Number((usageRow as any)?.tokensOut || 0),
    cost_usd: Number((usageRow as any)?.costUsd || 0),
  };

  const recipients = memberships
    .map((membership) => {
      const user = userById.get(String(membership.userId));
      if (!user) return null;

      const email = String((user as any).email || "").trim();
      if (!email) return null;

      const isVerified = Boolean((user as any).isEmailVerified);
      if (env.NODE_ENV === "production" && !isVerified) {
        return null;
      }

      return {
        user,
        email,
        name: String((user as any).name || "there").trim() || "there",
      };
    })
    .filter(Boolean) as Array<{ user: any; email: string; name: string }>;

  const subject = `FinWise Digest — ${String((org as any).name)} — ${dayKey}`;
  const appLink = env.CLIENT_URL || "http://localhost:5173";
  const rangeStartKey = toDayKey(rangeStart);
  const rangeEndKey = toDayKey(rangeEnd);

  const sendQueue = new PQueue({ concurrency: 5 });
  const sendResults: Array<{ email: string; mode: "smtp" | "console" }> = [];

  for (const recipient of recipients) {
    const userId = String((recipient.user as any)._id);
    const tx = txByUser.get(userId) || { net: 0, income: 0, expense: 0, count: 0 };
    const tasks = tasksByUser.get(userId) || { open: 0, dueSoon: 0 };

    const text = [
      `Hi ${recipient.name},`,
      "",
      `Here’s your FinWise digest for ${rangeStartKey} → ${rangeEndKey}:`,
      "",
      `- Open tasks: ${tasks.open} (due in next 7 days: ${tasks.dueSoon})`,
      `- Transactions: ${tx.count}`,
      `- Cash flow: income ${formatUsd(tx.income)}, expenses ${formatUsd(tx.expense)}, net ${formatUsd(tx.net)}`,
      "",
      `Org AI usage (${periodKey}): ${orgUsage.calls} calls, ${orgUsage.tokens_in} in / ${orgUsage.tokens_out} out tokens, est. cost ${formatUsd(orgUsage.cost_usd)}`,
      "",
      `Open FinWise: ${appLink}`,
      "",
      "— FinWise",
    ].join("\n");

    sendQueue.add(async () => {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        text,
      });
      sendResults.push({ email: recipient.email, mode: result.mode });
    });
  }

  await sendQueue.onIdle();

  logger.info(
    {
      event: "digest_org_sent",
      org_id: params.orgId.toString(),
      day_key: dayKey,
      recipients: sendResults.length,
    },
    "digest org emails sent"
  );

  return {
    ok: true,
    org_id: params.orgId.toString(),
    day_key: dayKey,
    recipients: sendResults.length,
    modes: sendResults.reduce(
      (acc, item) => {
        acc[item.mode] += 1;
        return acc;
      },
      { smtp: 0, console: 0 } as { smtp: number; console: number }
    ),
  };
};

export const enqueueUsageAggregation = async (params?: { periodKey?: string }) => {
  const periodKey = params?.periodKey?.trim() ? params.periodKey.trim() : getCurrentPeriodKey();
  const queue = getQueue(QUEUE_NAMES.usageAggregation);
  const jobId = `usage-aggregation:${periodKey}`;

  await queue.add(
    "usage-aggregation",
    { periodKey },
    {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  return { queued: true, job_id: jobId, period_key: periodKey };
};
