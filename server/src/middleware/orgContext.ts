import type { RequestHandler } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../models/userModel";
import { HttpError } from "./httpError";
import { getEnv } from "../config/env";
import { resolveDefaultOrgForUser, resolveOrgForRequest } from "../services/orgService";
import { backfillLegacyOrgIdForUser } from "../services/orgDataBackfill";

export const orgContext: RequestHandler = async (req, _res, next) => {
  try {
    const user = (req as any).user as IUserDocument | undefined;
    if (!user?._id) {
      return next();
    }

    const requestedOrgId = String(req.header("x-org-id") || "").trim() || undefined;

    try {
      const userId = new mongoose.Types.ObjectId(user._id);

      const defaultOrg = await resolveDefaultOrgForUser(userId);
      const activeOrg = requestedOrgId
        ? await resolveOrgForRequest({ userId, requestedOrgId })
        : defaultOrg;

      (req as any).org = {
        orgId: activeOrg.orgId.toString(),
        memberId: activeOrg.memberId.toString(),
        role: activeOrg.role,
        isDefault: Boolean(activeOrg.isDefault),
        defaultOrgId: defaultOrg.orgId.toString(),
      };

      const env = getEnv();
      if (env.ORG_LEGACY_BACKFILL_ENABLED) {
        await backfillLegacyOrgIdForUser({ userId, defaultOrgId: defaultOrg.orgId });
      }
      return next();
    } catch (error: any) {
      const message = String(error?.message || "Unable to resolve organization context");
      if (/invalid org id/i.test(message)) {
        return next(new HttpError(400, "INVALID_ORG_ID", message));
      }
      if (requestedOrgId) {
        return next(new HttpError(403, "ORG_ACCESS_DENIED", "Not a member of requested organization"));
      }
      return next(error);
    }
  } catch (error) {
    return next(error);
  }
};
