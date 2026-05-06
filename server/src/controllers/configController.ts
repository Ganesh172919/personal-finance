/**
 * @fileoverview Config Controller
 *
 * Returns runtime configuration and feature flags to the client. This is the
 * "bootstrap" endpoint the frontend calls on app load to determine which
 * features are available and what entitlements the current user/org has.
 *
 * Routes served:
 *   GET /api/config - getMyConfig
 *
 * Key patterns:
 *   - Reads feature flags from environment variables (not a database)
 *   - Conditionally resolves entitlements only when MONETIZATION_ENABLED is true
 *   - Returns org settings (currency, locale, timezone) alongside feature flags
 *   - Lightweight endpoint — no AI calls, no heavy aggregation
 *
 * @module controllers/configController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import { getEnv } from "../config/env";
import type { IUserDocument } from "../models/userModel";
import OrganizationModel from "../models/organizationModel";
import { getResolvedEntitlements } from "../services/entitlements";

export const getMyConfig = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const env = getEnv();

  const googleOauthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  const features = {
    tasks_enabled: Boolean(env.TASKS_ENABLED),
    receipts_ocr_enabled: Boolean(env.RECEIPTS_OCR_ENABLED),
    journal_enabled: Boolean(env.JOURNAL_ENABLED),
    monetization_enabled: Boolean(env.MONETIZATION_ENABLED),
    csrf_enabled: Boolean(env.CSRF_ENABLED),
    google_oauth_enabled: googleOauthEnabled,
  };

  const entitlements = env.MONETIZATION_ENABLED
    ? await getResolvedEntitlements({
        orgId: req.org?.orgId ? new mongoose.Types.ObjectId(req.org.orgId) : undefined,
        userId: user._id,
      }).then(resolved => ({
        plan: resolved.entitlement.plan,
        status: resolved.entitlement.status,
        base_limits: resolved.base_limits,
        credits: resolved.credits,
        limits: resolved.limits,
        usage: resolved.usage,
        remaining: resolved.remaining,
        period_key: resolved.period_key,
      }))
    : null;

  return res.json({
    org: req.org
      ? {
          id: req.org.orgId,
          role: req.org.role,
          member_id: req.org.memberId,
          ...(await OrganizationModel.findById(req.org.orgId)
            .select({ currency: 1, locale: 1, timezone: 1, name: 1, slug: 1, type: 1 })
            .lean()
            .then((org) =>
              org
                ? {
                    name: String((org as any).name),
                    slug: String((org as any).slug),
                    type: String((org as any).type),
                    currency: String((org as any).currency || "USD"),
                    locale: String((org as any).locale || "en-US"),
                    timezone: String((org as any).timezone || "UTC"),
                  }
                : {}
            )),
        }
      : null,
    features,
    entitlements,
    request_id: req.requestId,
  });
};
