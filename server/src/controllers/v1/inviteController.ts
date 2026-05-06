/**
 * @fileoverview Invite Controller (v1)
 *
 * Handles organization invite acceptance. The invite creation flow lives
 * in orgController.addOrgMember; this controller only handles token-based
 * acceptance by the invitee.
 *
 * Routes served:
 *   POST /api/v1/invites/accept - acceptInvite
 *
 * Key patterns:
 *   - Invite token passed in request body (not URL) for security
 *   - Validates token, creates org membership, marks invite as accepted
 *   - Audit events recorded for both success and blocked attempts
 *   - Blocked attempts (e.g., seat limit reached) still produce audit trails
 *
 * @module controllers/v1/inviteController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { acceptOrgInvite } from "../../services/orgInvites";
import { recordAuditEvent } from "../../services/auditLog";
import { HttpError } from "../../middleware/httpError";

export const acceptInvite = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const body = req.body as { token: string };

  if (!body?.token || typeof body.token !== "string") {
    throw new HttpError(400, "INVALID_TOKEN", "Invalid invite token");
  }

  // Accept invite; on failure, still record an audit event for blocked attempts
  const result = await acceptOrgInvite({
    token: body.token,
    userId: user._id,
    userEmail: String((user as any).email || ""),
  }).catch(async (error) => {
    const actorOrgId = req.org?.orgId && mongoose.Types.ObjectId.isValid(req.org.orgId)
      ? new mongoose.Types.ObjectId(req.org.orgId)
      : null;
    if (
      actorOrgId &&
      error instanceof HttpError &&
      (error.code === "FEATURE_LIMIT_REACHED" || error.code === "FEATURE_NOT_AVAILABLE")
    ) {
      await recordAuditEvent({
        orgId: actorOrgId,
        actorType: "user",
        actorUserId: user._id,
        action: "org_invite_accept_blocked",
        targetType: "org_invite",
        targetId: "unknown",
        requestId: req.requestId,
        metadata: {
          code: error.code,
          details: error.details,
        },
      }).catch(() => null);
    }
    throw error;
  });

  const orgId = (result.invite as any).orgId;
  if (orgId && mongoose.Types.ObjectId.isValid(String(orgId))) {
    await recordAuditEvent({
      orgId: new mongoose.Types.ObjectId(String(orgId)),
      actorType: "user",
      actorUserId: user._id,
      action: "org_invite_accepted",
      targetType: "org_invite",
      targetId: String((result.invite as any)._id),
      requestId: req.requestId,
      metadata: {
        email: String((result.invite as any).email || ""),
        role: String((result.invite as any).role || ""),
      },
    });
  }

  return res.json({
    invite: {
      id: String((result.invite as any)._id),
      org_id: String((result.invite as any).orgId),
      email: String((result.invite as any).email),
      role: String((result.invite as any).role),
      status: String((result.invite as any).status),
      accepted_at: (result.invite as any).acceptedAt ? new Date((result.invite as any).acceptedAt).toISOString() : undefined,
    },
    member: result.member
      ? {
          id: String((result.member as any)._id),
          org_id: String((result.member as any).orgId),
          user_id: String((result.member as any).userId),
          role: String((result.member as any).role),
          status: String((result.member as any).status),
        }
      : null,
    request_id: req.requestId,
  });
};
