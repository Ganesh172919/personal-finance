/**
 * @fileoverview Share Controller (v1)
 *
 * Creates and resolves shareable links for financial stories. Share links
 * allow users to publicly share a read-only view of their financial progress.
 *
 * Routes served:
 *   POST /api/v1/shares/financial-story          - createFinancialStoryShare (auth required)
 *   GET  /api/v1/shares/financial-story/:token   - getPublicFinancialStoryShare (public)
 *
 * Key patterns:
 *   - Creation requires authentication; resolution is public (token-based)
 *   - Share links have configurable expiration (default in service layer)
 *   - Options control what data is included (goal names, deadlines, milestones)
 *   - Token is a secure random string; resolved payload is a snapshot (not live data)
 *
 * @module controllers/v1/shareController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { createFinancialStoryShareLink, resolveShareLinkPayload } from "../../services/shares";

// Validates that organization context is attached to the request session.
// Throws a 401 unauthorized error if the organization context is omitted or invalid.
// Returns the resolved organization ID parsed into a MongoDB ObjectId instance.
const requireOrgId = (req: Request) => {
  const orgIdRaw = String((req as any).org?.orgId || "");
  if (!orgIdRaw || !mongoose.Types.ObjectId.isValid(orgIdRaw)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(orgIdRaw);
};

// Creates a public or semi-private shareable token for a financial story report.
// Applies customizable visibility settings for goals, deadlines, and milestone counts.
// Persists the snapshot payload in the database and returns the access token.
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

// Resolves a public financial story share link using its secure unique token string.
// Verifies token expiration and loads the stored read-only financial summary payload.
// Returns the snapshot story details without requiring active user authentication.
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

