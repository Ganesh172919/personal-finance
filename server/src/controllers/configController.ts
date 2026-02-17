import type { Request, Response } from "express";

import { getEnv } from "../config/env";
import type { IUserDocument } from "../models/userModel";
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
    ? await getResolvedEntitlements(user._id).then(resolved => ({
        plan: resolved.entitlement.plan,
        status: resolved.entitlement.status,
        limits: resolved.limits,
        usage: resolved.usage,
        remaining: resolved.remaining,
        period_key: resolved.period_key,
      }))
    : null;

  return res.json({
    features,
    entitlements,
    request_id: req.requestId,
  });
};

