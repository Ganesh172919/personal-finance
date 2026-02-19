import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { createFinancialStoryShareLink, resolveShareLinkPayload } from "../../services/shares";

const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

export const createFinancialStoryShare = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgId(req);
  const body = (req.body || {}) as any;

  const result = await createFinancialStoryShareLink({
    orgId,
    userId: user._id,
    options: {
      expires_in_days: body.expires_in_days,
      include_goal_names: body.include_goal_names,
      include_goal_deadlines: body.include_goal_deadlines,
      include_milestones: body.include_milestones,
      max_milestones: body.max_milestones,
    },
  });

  return res.status(201).json({
    share: result.share,
    token: result.token,
    request_id: req.requestId,
  });
};

export const getPublicFinancialStoryShare = async (req: Request, res: Response) => {
  const token = String((req as any).params?.token || "");
  const resolved = await resolveShareLinkPayload({ type: "financial_story", token });

  return res.json({
    share_id: resolved.share_id,
    type: resolved.type,
    expires_at: resolved.expires_at,
    payload: resolved.payload,
    request_id: req.requestId,
  });
};

