/**
 * @fileoverview Referral Controller (v1)
 *
 * Referral program: get your referral code/share URL, and redeem a referral code
 * to receive rewards (free months, feature units).
 *
 * Routes served:
 *   GET  /api/v1/referrals/my     - getMyReferral
 *   POST /api/v1/referrals/redeem - redeemReferral
 *
 * Key patterns:
 *   - Referral codes are per-org (generated lazily on first access)
 *   - Share URL includes the referral code as a query parameter
 *   - Redemption is idempotent (re-redeeming returns existing result)
 *   - Rewards defined as constants: REFERRAL_REWARD_MONTHS and REFERRAL_REWARD_UNITS
 *   - Both referrer and referred org receive rewards on successful redemption
 *
 * @module controllers/v1/referralController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { getEnv } from "../../config/env";
import {
  REFERRAL_REWARD_MONTHS,
  REFERRAL_REWARD_UNITS,
  getOrCreateReferralCodeForOrg,
  getReferralStatsForOrg,
  redeemReferralCodeForOrg,
} from "../../services/referrals";

// Validates and extracts the active organization identifier from request context.
// Ensures presence of organization metadata and confirms valid ObjectId formatting.
// Returns the resolved organization ID as a typed MongoDB ObjectId instance.
const requireOrg = (req: Request) => {
  if (!req.org?.orgId) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }

  if (!mongoose.Types.ObjectId.isValid(req.org.orgId)) {
    throw new HttpError(400, "INVALID_ORG_ID", "Invalid organization id");
  }

  return new mongoose.Types.ObjectId(req.org.orgId);
};

// Retrieves referral program information, invite links, and statistics for the organization.
// Generates or fetches unique referral codes and formats user registration share links.
// Returns referral stats including redemption counts, referrer history, and reward terms.
export const getMyReferral = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Authentication required");
  }

  const orgId = requireOrg(req);
  const env = getEnv();

  const [codeRow, stats] = await Promise.all([
    getOrCreateReferralCodeForOrg({ orgId, userId: user._id }),
    getReferralStatsForOrg({ orgId }),
  ]);

  const clientUrl = env.CLIENT_URL.replace(/\/$/, "");
  const shareUrl = `${clientUrl}/register?ref=${encodeURIComponent(String((codeRow as any).code))}`;

  return res.json({
    org_id: orgId.toString(),
    referral_code: String((codeRow as any).code),
    share_url: shareUrl,
    redemptions_count: stats.redemptions_count,
    referred_by: stats.referred_by,
    reward: {
      months: REFERRAL_REWARD_MONTHS,
      units: REFERRAL_REWARD_UNITS,
    },
    request_id: req.requestId,
  });
};

// Redeems a referral code to apply promotional rewards to the claimant organization.
// Validates referral code applicability and idempotently credits bonus months or units.
// Returns status indicating whether the redemption was applied along with reward details.
export const redeemReferral = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Authentication required");
  }

  const orgId = requireOrg(req);
  const body = req.body as { code: string };

  const result = await redeemReferralCodeForOrg({
    referredOrgId: orgId,
    referredUserId: user._id,
    code: String(body.code || ""),
    requestId: req.requestId,
  });

  return res.status(result.applied ? 201 : 200).json({
    org_id: orgId.toString(),
    applied: Boolean(result.applied),
    reason: (result as any).reason || (result.applied ? "applied" : "unknown"),
    redemption_id: String(result.redemption_id),
    referrer_org_id: String(result.referrer_org_id),
    reward: result.reward || { periods: [], unitsByFeature: {} },
    request_id: req.requestId,
  });
};
