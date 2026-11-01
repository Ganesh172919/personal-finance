import mongoose from "mongoose";

import DunningModel, { type IDunningDocument } from "../models/dunningModel";
import EntitlementModel from "../models/entitlementModel";
import SubscriptionModel from "../models/subscriptionModel";
import InvoiceModel from "../models/invoiceModel";
import { cacheDel } from "../config/redis";
import { recordAuditEvent } from "./auditLog";

export interface DunningStateResult {
  in_dunning: boolean;
  status: "active" | "recovered" | "exhausted" | "none";
  current_attempt: number;
  max_attempts: number;
  grace_period_expires_at: string | null;
  grace_period_days_remaining: number;
  next_retry_at: string | null;
  last_failure_reason: string | null;
  retry_history: Array<{
    attempt: number;
    attempted_at: string;
    status: "failed" | "succeeded";
    failure_reason?: string;
    invoice_number?: string;
  }>;
}

export const getDunningState = async (orgId: mongoose.Types.ObjectId): Promise<DunningStateResult> => {
  const dunning = await DunningModel.findOne({ orgId }).lean();
  const entitlement = await EntitlementModel.findOne({ orgId }).lean();

  const isEntitlementPastDue = entitlement?.status === "past_due";
  const inDunning = dunning?.status === "active" || isEntitlementPastDue;

  const now = Date.now();
  const expiresAt = dunning?.gracePeriodExpiresAt ? new Date(dunning.gracePeriodExpiresAt).getTime() : null;
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))) : 0;

  return {
    in_dunning: Boolean(inDunning),
    status: dunning?.status || (isEntitlementPastDue ? "active" : "none"),
    current_attempt: dunning?.currentAttempt || 1,
    max_attempts: dunning?.maxAttempts || 3,
    grace_period_expires_at: dunning?.gracePeriodExpiresAt ? new Date(dunning.gracePeriodExpiresAt).toISOString() : null,
    grace_period_days_remaining: inDunning ? daysRemaining : 0,
    next_retry_at: dunning?.nextRetryAt ? new Date(dunning.nextRetryAt).toISOString() : null,
    last_failure_reason: dunning?.lastFailureReason || (isEntitlementPastDue ? "card_declined" : null),
    retry_history: (dunning?.retryHistory || []).map((h) => ({
      attempt: h.attempt,
      attempted_at: new Date(h.attemptedAt).toISOString(),
      status: h.status,
      failure_reason: h.failureReason,
      invoice_number: h.invoiceNumber,
    })),
  };
};

export const simulatePaymentFailure = async (
  orgId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  reason: string = "card_declined"
) => {
  const now = new Date();
  const gracePeriodExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day grace period
  const nextRetryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour next retry

  // 1. Mark entitlement past_due
  await EntitlementModel.findOneAndUpdate(
    { orgId },
    { $set: { status: "past_due" } },
    { upsert: false }
  );

  await SubscriptionModel.findOneAndUpdate(
    { orgId },
    { $set: { status: "past_due" } },
    { upsert: false }
  );

  // 2. Upsert dunning case
  let dunning = await DunningModel.findOne({ orgId });
  if (!dunning) {
    dunning = await DunningModel.create({
      orgId,
      userId,
      status: "active",
      currentAttempt: 1,
      maxAttempts: 3,
      firstFailedAt: now,
      gracePeriodExpiresAt,
      nextRetryAt,
      lastFailureReason: reason,
      retryHistory: [
        {
          attempt: 1,
          attemptedAt: now,
          status: "failed",
          failureReason: reason,
        },
      ],
    });
  } else {
    dunning.status = "active";
    dunning.currentAttempt = 1;
    dunning.firstFailedAt = now;
    dunning.gracePeriodExpiresAt = gracePeriodExpiresAt;
    dunning.nextRetryAt = nextRetryAt;
    dunning.lastFailureReason = reason;
    dunning.retryHistory.push({
      attempt: 1,
      attemptedAt: now,
      status: "failed",
      failureReason: reason,
    });
    await dunning.save();
  }

  // 3. Invalidate redis cache
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await cacheDel(`ent:${orgId.toString()}:${periodKey}`);

  await recordAuditEvent({
    orgId,
    actorType: "system",
    action: "billing_payment_failed",
    targetType: "billing",
    targetId: dunning._id.toString(),
    metadata: { reason, grace_period_days: 7 },
  });

  return getDunningState(orgId);
};

export const triggerPaymentRetry = async (
  orgId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
) => {
  const now = new Date();
  let dunning = await DunningModel.findOne({ orgId });

  // 1. Recover Entitlement & Subscription back to active
  await EntitlementModel.findOneAndUpdate(
    { orgId },
    { $set: { status: "active" } },
    { upsert: false }
  );

  await SubscriptionModel.findOneAndUpdate(
    { orgId },
    { $set: { status: "active" } },
    { upsert: false }
  );

  // 2. Generate a paid recovery invoice
  const sub = await SubscriptionModel.findOne({ orgId }).lean();
  const rawPlan = sub?.planTier || "pro";
  const planTier = (rawPlan === "team" ? "team" : rawPlan === "enterprise" ? "enterprise" : "pro") as "pro" | "team" | "enterprise";
  const cycle = (sub?.billingCycle || "monthly") as "monthly" | "annual";
  const amount = planTier === "team" ? (cycle === "annual" ? 468 : 49) : (cycle === "annual" ? 180 : 19);
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-RECOVERED`;

  await InvoiceModel.create({
    orgId,
    userId,
    invoiceNumber,
    planTier,
    billingCycle: cycle,
    amountUsd: amount,
    taxUsd: 0,
    totalUsd: amount,
    status: "paid",
    paymentMethod: "Card ending in 4242",
    periodStart: now,
    periodEnd: new Date(now.getTime() + 30 * 86400000),
    issuedAt: now,
    metadata: { dunning_recovered: true },
  });

  // 3. Mark Dunning as recovered
  if (dunning) {
    dunning.status = "recovered";
    dunning.retryHistory.push({
      attempt: dunning.currentAttempt,
      attemptedAt: now,
      status: "succeeded",
      invoiceNumber,
    });
    await dunning.save();
  }

  // 4. Invalidate Redis cache
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await cacheDel(`ent:${orgId.toString()}:${periodKey}`);

  await recordAuditEvent({
    orgId,
    actorType: "user",
    actorUserId: userId,
    action: "billing_dunning_payment_recovered",
    targetType: "billing",
    targetId: dunning ? dunning._id.toString() : orgId.toString(),
    metadata: { invoice_number: invoiceNumber, plan: planTier },
  });

  return {
    success: true,
    recovered: true,
    invoice_number: invoiceNumber,
    message: "Payment processed successfully. Pro subscription restored.",
    dunning_state: await getDunningState(orgId),
  };
};
