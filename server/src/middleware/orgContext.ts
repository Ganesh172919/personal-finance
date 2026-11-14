/**
 * @fileoverview Organization Context Middleware
 *
 * This middleware resolves and attaches organization context to incoming requests.
 * It supports multi-tenancy by allowing users to belong to multiple organizations
 * and switch between them using the X-Org-Id header.
 *
 * ============================================================================
 * MINDMAP FLOW: MULTI-TENANT ORG RESOLUTION & ROLE PRIVILEGE GATING
 * ============================================================================
 * - Multi-Tenancy Organization Context Engine
 *     ├── 1. Authentication Check
 *     │   ├── Evaluates req.user presence
 *     │   └── Skips execution for unauthenticated / public routes (calls next())
 *     ├── 2. Tenant Identifier Ingestion
 *     │   ├── Explicit Header: x-org-id header parsed and sanitized
 *     │   └── Implicit Fallback: resolveDefaultOrgForUser(userId)
 *     ├── 3. Membership & Access Control
 *     │   ├── Organization existence validation (valid ObjectId format)
 *     │   ├── Active membership check across organization members
 *     │   └── Role resolution (owner, admin, member)
 *     ├── 4. Request Context Attachment
 *     │   └── req.org: { orgId, memberId, role, isDefault, defaultOrgId }
 *     └── 5. Error Triaging & Auto-Migration
 *         ├── 400 INVALID_ORG_ID on malformed hexadecimal identifiers
 *         ├── 403 ORG_ACCESS_DENIED on unauthorized tenant access attempts
 *         └── Background legacy org data backfill when ORG_LEGACY_BACKFILL_ENABLED
 *
 * ============================================================================
 * ASCII FLOW: MULTI-TENANT CONTEXT RESOLUTION LIFECYCLE
 * ============================================================================
 *                     [ Inbound Authenticated Request ]
 *                                     |
 *                                     v
 *                     +-------------------------------+
 *                     | Does req.user exist?          |
 *                     +---------------+---------------+
 *                                /          \
 *                         No    /            \ Yes
 *                              v              v
 *                    [ Skip Context ]  +-------------------------------+
 *                    [ Call next()  ]  | Inspect x-org-id HTTP Header  |
 *                                      +---------------+---------------+
 *                                                      |
 *                                      Is x-org-id header provided?
 *                                            /                  \
 *                                     Yes   /                    \ No
 *                                          v                      v
 *                     +-------------------------+  +-------------------------+
 *                     | resolveOrgForRequest()  |  | resolveDefaultOrgForUser|
 *                     | Check membership table  |  | Primary user account org|
 *                     +------------+------------+  +------------+------------+
 *                                  |                            |
 *                         Is user a member?                     |
 *                               /      \                        |
 *                        Yes   /        \ No                    |
 *                             v          v                      |
 *              +--------------------+  +--------------------+   |
 *              | Valid active org   |  | Throw 403          |   |
 *              | context obtained   |  | ORG_ACCESS_DENIED  |   |
 *              +----------+---------+  +--------------------+   |
 *                         |                                     |
 *                         +------------------<------------------+
 *                                            |
 *                                            v
 *                             +-------------------------------+
 *                             | Attach req.org Context:       |
 *                             | { orgId, memberId, role }     |
 *                             +--------------+----------------+
 *                                            |
 *                                            v
 *                             +-------------------------------+
 *                             | Optional: Legacy Backfill     |
 *                             | Proceed to Route Handler      |
 *                             +-------------------------------+
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
import { resolveDefaultOrgForUser } from "../services/orgService"; // Organization service
import { getAuthMemberships, pickDefaultMembership, type CachedMembership } from "../services/authCache"; // Cached memberships
import { backfillLegacyOrgIdForUser } from "../services/orgDataBackfill"; // Legacy data backfill

type ResolvedOrg = {
  orgId: mongoose.Types.ObjectId | string;
  memberId: mongoose.Types.ObjectId | string;
  role: string;
  isDefault: boolean;
};

const toResolvedOrg = (member: CachedMembership): ResolvedOrg => ({
  orgId: member.orgId,
  memberId: member._id,
  role: member.role,
  isDefault: member.isDefault,
});

/**
 * Organization Context Middleware
 *
 * Resolves and attaches organization context to the request.
 *
 * @param {Request} req - Express request object
 * @param {Response} _res - Express response object (unused)
 * @param {NextFunction} next - Express next function
 */
// Resolves tenant organization context and validates membership roles for authenticated users.
// Injects orgId, membership details, and active roles into req.org while enforcing tenant boundaries.
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

      // Authorize against committed membership state on every request. Cached
      // projections on other replicas cannot prove a role or membership is still
      // active after revocation, even when Redis invalidation succeeds.
      const memberships = await getAuthMemberships(userId.toString(), { fresh: true });

      let defaultOrg: ResolvedOrg;
      const defaultMember = pickDefaultMembership(memberships);
      if (defaultMember) {
        defaultOrg = toResolvedOrg(defaultMember);
      } else {
        // First request for a user with no org yet: creates the personal org
        // (OrgMember save hook invalidates the membership cache).
        defaultOrg = await resolveDefaultOrgForUser(userId);
      }

      // Resolve active organization (requested or default)
      let activeOrg = defaultOrg;
      if (requestedOrgId) {
        if (!mongoose.Types.ObjectId.isValid(requestedOrgId)) {
          throw new Error("Invalid org id");
        }
        const requested = memberships.find(member => member.orgId === requestedOrgId.toLowerCase());
        if (!requested) {
          throw new Error("Org access denied");
        }
        activeOrg = toResolvedOrg(requested);
      }

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
        await backfillLegacyOrgIdForUser({ userId, defaultOrgId: new mongoose.Types.ObjectId(String(defaultOrg.orgId)) });
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
