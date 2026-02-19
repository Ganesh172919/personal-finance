import crypto from "crypto";
import mongoose from "mongoose";

import ReferralCodeModel from "../models/referralCodeModel";
import ReferralRedemptionModel from "../models/referralRedemptionModel";
import type { CreditFeature } from "../models/creditGrantModel";
import { HttpError } from "../middleware/httpError";
import UserModel from "../models/userModel";
import { getPeriodKeysForNextMonths, grantCredits } from "./credits";
import { logger } from "../config/logger";

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 10;
export const REFERRAL_REWARD_MONTHS = 3;

export const REFERRAL_REWARD_UNITS: Partial<Record<CreditFeature, number>> = {
  monthly_ai_calls: 120,
  api_requests: 5000,
  workflow_runs: 200,
  marketplace_installs: 1,
};

const normalizeReferralCode = (raw: string) => raw.trim().toUpperCase();

const assertReferralCodeFormat = (code: string) => {
  const normalized = normalizeReferralCode(code);
  if (!/^[A-Z0-9]{6,16}$/.test(normalized)) {
    throw new HttpError(400, "INVALID_REFERRAL_CODE", "Referral code must be 6-16 alphanumeric characters");
  }
  return normalized;
};

const generateReferralCode = () => {
  const bytes = crypto.randomBytes(REFERRAL_CODE_LENGTH);
  const chars: string[] = [];
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    const idx = bytes[i] % REFERRAL_CODE_ALPHABET.length;
    chars.push(REFERRAL_CODE_ALPHABET[idx]);
  }
  return chars.join("");
};

export const getOrCreateReferralCodeForOrg = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}) => {
  const existing = await ReferralCodeModel.findOne({ orgId: params.orgId }).lean();
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = generateReferralCode();
    try {
      const created = await ReferralCodeModel.create({
        orgId: params.orgId,
        code,
        createdByUserId: params.userId,
      });
      return created.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        const raced = await ReferralCodeModel.findOne({ orgId: params.orgId }).lean();
        if (raced) {
          return raced;
        }
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate unique referral code");
};

export const getReferralStatsForOrg = async (params: { orgId: mongoose.Types.ObjectId }) => {
  const [redemptions, referredBy] = await Promise.all([
    ReferralRedemptionModel.countDocuments({ referrerOrgId: params.orgId }),
    ReferralRedemptionModel.findOne({ referredOrgId: params.orgId }).lean(),
  ]);

  return {
    redemptions_count: Math.max(0, Number(redemptions || 0)),
    referred_by: referredBy
      ? {
          referral_code: String((referredBy as any).referralCode || ""),
          redeemed_at: (referredBy as any).redeemedAt || null,
        }
      : null,
  };
};

export const redeemReferralCodeForOrg = async (params: {
  referredOrgId: mongoose.Types.ObjectId;
  referredUserId: mongoose.Types.ObjectId;
  code: string;
  requestId?: string;
}) => {
  const normalizedCode = assertReferralCodeFormat(params.code);

  const referralCode = await ReferralCodeModel.findOne({ code: normalizedCode }).lean();
  if (!referralCode) {
    throw new HttpError(404, "REFERRAL_CODE_NOT_FOUND", "Referral code not found");
  }

  const referrerOrgId = referralCode.orgId as unknown as mongoose.Types.ObjectId;
  if (referrerOrgId.toString() === params.referredOrgId.toString()) {
    throw new HttpError(400, "REFERRAL_SELF", "You cannot redeem your own referral code");
  }

  const existing = await ReferralRedemptionModel.findOne({ referredOrgId: params.referredOrgId }).lean();
  if (existing) {
    return {
      applied: false as const,
      reason: "already_redeemed" as const,
      redemption_id: String((existing as any)._id),
      referrer_org_id: String((existing as any).referrerOrgId),
      referred_org_id: String((existing as any).referredOrgId),
      reward: (existing as any).reward || { periods: [], unitsByFeature: {} },
    };
  }

  const periods = getPeriodKeysForNextMonths({ months: REFERRAL_REWARD_MONTHS });

  const reward = {
    periods,
    unitsByFeature: REFERRAL_REWARD_UNITS,
  };

  const created = await ReferralRedemptionModel.create({
    codeId: (referralCode as any)._id,
    referralCode: String((referralCode as any).code),
    referrerOrgId,
    referrerUserId: referralCode.createdByUserId,
    referredOrgId: params.referredOrgId,
    referredUserId: params.referredUserId,
    redeemedAt: new Date(),
    reward,
  }).catch(async (error: any) => {
    if (error?.code !== 11000) {
      throw error;
    }
    const raced = await ReferralRedemptionModel.findOne({ referredOrgId: params.referredOrgId }).lean();
    if (!raced) {
      throw error;
    }
    return raced;
  });

  const redemptionId = String((created as any)._id);

  const grants = periods.flatMap((periodKey) => [
    grantCredits({
      orgId: referrerOrgId,
      periodKey,
      unitsByFeature: REFERRAL_REWARD_UNITS,
      sourceType: "referral_referrer",
      sourceId: redemptionId,
      createdByUserId: referralCode.createdByUserId as unknown as mongoose.Types.ObjectId,
      metadata: {
        request_id: params.requestId,
        referral_code: normalizedCode,
        role: "referrer",
        referred_org_id: params.referredOrgId.toString(),
      },
    }),
    grantCredits({
      orgId: params.referredOrgId,
      periodKey,
      unitsByFeature: REFERRAL_REWARD_UNITS,
      sourceType: "referral_referred",
      sourceId: redemptionId,
      createdByUserId: params.referredUserId,
      metadata: {
        request_id: params.requestId,
        referral_code: normalizedCode,
        role: "referred",
        referrer_org_id: referrerOrgId.toString(),
      },
    }),
  ]);

  await Promise.all(grants);

  return {
    applied: true as const,
    redemption_id: redemptionId,
    referrer_org_id: referrerOrgId.toString(),
    referred_org_id: params.referredOrgId.toString(),
    reward,
  };
};

export const applyPendingReferralForUser = async (params: {
  userId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  requestId?: string;
}) => {
  const user = await UserModel.findById(params.userId).select({ pendingReferralCode: 1, referralRedeemedAt: 1 }).lean();
  const pending = user?.pendingReferralCode ? String((user as any).pendingReferralCode).trim() : "";
  if (!pending) {
    return { ok: true as const, applied: false as const, reason: "no_pending" as const };
  }

  try {
    const result = await redeemReferralCodeForOrg({
      referredOrgId: params.orgId,
      referredUserId: params.userId,
      code: pending,
      requestId: params.requestId,
    });

    if (result.applied) {
      await UserModel.updateOne(
        { _id: params.userId },
        {
          $unset: { pendingReferralCode: 1 },
          $set: { referralRedeemedAt: new Date() },
        }
      );
    }

    return { ok: true as const, applied: result.applied, reason: result.applied ? "applied" : result.reason };
  } catch (error: any) {
    const code = String(error?.code || "");
    const status = Number(error?.statusCode || 0);

    if (status === 404 || code === "INVALID_REFERRAL_CODE" || code === "REFERRAL_CODE_NOT_FOUND" || code === "REFERRAL_SELF") {
      await UserModel.updateOne({ _id: params.userId }, { $unset: { pendingReferralCode: 1 } }).catch(() => null);
    }

    logger.warn(
      {
        event: "pending_referral_apply_failed",
        user_id: params.userId.toString(),
        org_id: params.orgId.toString(),
        request_id: params.requestId,
        err: error,
      },
      "Failed to apply pending referral code"
    );

    return { ok: false as const, applied: false as const, reason: "failed" as const };
  }
};
