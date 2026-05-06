/**
 * @fileoverview Organization Context Middleware
 *
 * This middleware resolves and attaches organization context to incoming requests.
 * It supports multi-tenancy by allowing users to belong to multiple organizations
 * and switch between them using the X-Org-Id header.
 *
 * KEY FEATURES:
 * - Resolves default organization for authenticated users
 * - Supports organization switching via X-Org-Id header
 * - Attaches organization context (orgId, memberId, role) to request
 * - Handles legacy data backfill for organization IDs
 * - Validates organization membership and access
 *
 * ORGANIZATION CONTEXT:
 * - orgId: Active organization ID
 * - memberId: User's membership ID in the organization
 * - role: User's role in the organization (owner, admin, member)
 * - isDefault: Whether this is the user's default organization
 * - defaultOrgId: User's default organization ID
 *
 * @module middleware/orgContext
 */

import type { RequestHandler } from "express"; // Express types
import mongoose from "mongoose"; // MongoDB ODM

import type { IUserDocument } from "../models/userModel"; // User document type
import { HttpError } from "./httpError"; // Custom HTTP error class
import { getEnv } from "../config/env"; // Environment configuration
import { resolveDefaultOrgForUser, resolveOrgForRequest } from "../services/orgService"; // Organization service
import { backfillLegacyOrgIdForUser } from "../services/orgDataBackfill"; // Legacy data backfill

/**
 * Organization Context Middleware
 *
 * Resolves and attaches organization context to the request.
 *
 * @param {Request} req - Express request object
 * @param {Response} _res - Express response object (unused)
 * @param {NextFunction} next - Express next function
 */
export const orgContext: RequestHandler = async (req, _res, next) => {
  try {
    // Get authenticated user from request
    const user = (req as any).user as IUserDocument | undefined;
    if (!user?._id) {
      // If no user, skip organization context
      return next();
    }

    // Get requested organization ID from header
    const requestedOrgId = String(req.header("x-org-id") || "").trim() || undefined;

    try {
      const userId = new mongoose.Types.ObjectId(user._id);

      // Resolve default organization for user
      const defaultOrg = await resolveDefaultOrgForUser(userId);

      // Resolve active organization (requested or default)
      const activeOrg = requestedOrgId
        ? await resolveOrgForRequest({ userId, requestedOrgId })
        : defaultOrg;

      // Attach organization context to request
      (req as any).org = {
        orgId: activeOrg.orgId.toString(),
        memberId: activeOrg.memberId.toString(),
        role: activeOrg.role,
        isDefault: Boolean(activeOrg.isDefault),
        defaultOrgId: defaultOrg.orgId.toString(),
      };

      // Backfill legacy organization IDs if enabled
      const env = getEnv();
      if (env.ORG_LEGACY_BACKFILL_ENABLED) {
        await backfillLegacyOrgIdForUser({ userId, defaultOrgId: defaultOrg.orgId });
      }
      return next();
    } catch (error: any) {
      // Handle organization resolution errors
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
