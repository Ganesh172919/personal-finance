import crypto from "crypto";
import type { Request, Response } from "express";
import mongoose from "mongoose";

import OrganizationModel from "../../models/organizationModel";
import OrgMemberModel, { type OrgRole } from "../../models/orgMemberModel";
import UserModel, { type IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { createOrgInvite } from "../../services/orgInvites";
import { getEnv } from "../../config/env";
import { sendEmail } from "../../utils/sendEmail";
import { recordAuditEvent } from "../../services/auditLog";
import { assertSeatAvailable, requireTeamPlan } from "../../services/orgEntitlements";

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const buildUniqueSlug = (base: string) => {
  const normalized = normalizeSlug(base) || "org";
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${normalized}-${suffix}`;
};

const roleRank: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export const listMyOrgs = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;

  const memberships = await OrgMemberModel.find({ userId: user._id, status: "active" })
    .select({ orgId: 1, role: 1, status: 1, isDefault: 1, createdAt: 1 })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  const orgIds = memberships.map((m) => m.orgId as unknown as mongoose.Types.ObjectId);
  const orgs = orgIds.length
    ? await OrganizationModel.find({ _id: { $in: orgIds } })
        .select({ name: 1, slug: 1, type: 1, currency: 1, locale: 1, timezone: 1, createdAt: 1, updatedAt: 1 })
        .lean()
    : [];

  const orgById = new Map(orgs.map((org) => [String((org as any)._id), org]));

  return res.json({
    active_org: req.org
      ? {
          id: req.org.orgId,
          role: req.org.role,
          member_id: req.org.memberId,
        }
      : null,
    orgs: memberships
      .map((membership) => {
        const org = orgById.get(String(membership.orgId));
        if (!org) return null;
        return {
          id: String((org as any)._id),
          name: String((org as any).name),
          slug: String((org as any).slug),
          type: String((org as any).type),
          currency: String((org as any).currency || "USD"),
          locale: String((org as any).locale || "en-US"),
          timezone: String((org as any).timezone || "UTC"),
          role: String((membership as any).role),
          is_default: Boolean((membership as any).isDefault),
        };
      })
      .filter(Boolean),
    request_id: req.requestId,
  });
};

export const createOrg = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const body = req.body as { name: string; slug?: string };
  const activeOrgId = String(req.org?.orgId || "");

  if (!activeOrgId || !mongoose.Types.ObjectId.isValid(activeOrgId)) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }

  await requireTeamPlan({ orgId: new mongoose.Types.ObjectId(activeOrgId), userId: user._id });

  const slug = body.slug ? normalizeSlug(body.slug) : buildUniqueSlug(body.name);
  try {
    const org = await OrganizationModel.create({
      name: body.name,
      slug,
      type: "team",
      createdByUserId: user._id,
    });

    await OrgMemberModel.create({
      orgId: org._id,
      userId: user._id,
      role: "owner",
      status: "active",
      isDefault: false,
    });

    if (!org?._id) {
      throw new Error("Failed to create org");
    }

    return res.status(201).json({
      org: {
        id: String(org._id),
        slug,
        name: body.name,
        type: "team",
        currency: String((org as any).currency || "USD"),
        locale: String((org as any).locale || "en-US"),
        timezone: String((org as any).timezone || "UTC"),
        role: "owner",
      },
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new HttpError(409, "ORG_SLUG_EXISTS", "Organization slug already exists");
    }
    throw error;
  }
};

export const updateOrgSettings = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = String((req as any).params?.orgId || "");
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    throw new HttpError(400, "INVALID_ORG_ID", "Invalid org id");
  }

  const body = req.body as { currency?: string; locale?: string; timezone?: string };

  const myMembership = await OrgMemberModel.findOne({
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
    status: "active",
  }).lean();

  if (!myMembership || roleRank[myMembership.role as OrgRole] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }

  const update: Record<string, unknown> = {};
  if (typeof body.currency === "string" && body.currency.trim()) {
    update.currency = body.currency.trim().toUpperCase();
  }
  if (typeof body.locale === "string" && body.locale.trim()) {
    update.locale = body.locale.trim();
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    update.timezone = body.timezone.trim();
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, "NO_CHANGES", "No settings provided");
  }

  const org = await OrganizationModel.findByIdAndUpdate(orgId, { $set: update }, { new: true })
    .select({ _id: 1, name: 1, slug: 1, type: 1, currency: 1, locale: 1, timezone: 1 })
    .lean();

  if (!org?._id) {
    throw new HttpError(404, "ORG_NOT_FOUND", "Organization not found");
  }

  await recordAuditEvent({
    orgId: new mongoose.Types.ObjectId(orgId),
    actorType: "user",
    actorUserId: user._id,
    action: "org_settings_updated",
    targetType: "organization",
    targetId: String((org as any)._id),
    requestId: req.requestId,
    metadata: update,
  });

  return res.json({
    org: {
      id: String((org as any)._id),
      name: String((org as any).name),
      slug: String((org as any).slug),
      type: String((org as any).type),
      currency: String((org as any).currency || "USD"),
      locale: String((org as any).locale || "en-US"),
      timezone: String((org as any).timezone || "UTC"),
    },
    request_id: req.requestId,
  });
};

export const addOrgMember = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument;
  const orgId = String((req as any).params?.orgId || "");
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    throw new HttpError(400, "INVALID_ORG_ID", "Invalid org id");
  }

  const body = req.body as { email: string; role?: OrgRole };
  const desiredRole: OrgRole = body.role === "owner" || body.role === "admin" || body.role === "member" ? body.role : "member";

  const myMembership = await OrgMemberModel.findOne({
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: user._id,
    status: "active",
  }).lean();

  if (!myMembership || roleRank[myMembership.role as OrgRole] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }

  const org = await OrganizationModel.findById(orgId).select({ _id: 1, name: 1, slug: 1 }).lean();
  if (!org) {
    throw new HttpError(404, "ORG_NOT_FOUND", "Organization not found");
  }

  await requireTeamPlan({ orgId: new mongoose.Types.ObjectId(orgId), userId: user._id });

  const invited = await UserModel.findOne({ email: body.email }).select({ _id: 1 }).lean();
  if (!invited?._id) {
    try {
      await assertSeatAvailable({
        orgId: new mongoose.Types.ObjectId(orgId),
        userId: user._id,
        includePendingInvites: true,
      });
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.code === "FEATURE_LIMIT_REACHED" || error.code === "FEATURE_NOT_AVAILABLE")
      ) {
        await recordAuditEvent({
          orgId: new mongoose.Types.ObjectId(orgId),
          actorType: "user",
          actorUserId: user._id,
          action: "org_member_add_blocked",
          targetType: "organization",
          targetId: String((org as any)._id),
          requestId: req.requestId,
          metadata: {
            email: body.email,
            role: desiredRole,
            code: error.code,
            details: error.details,
          },
        }).catch(() => null);
      }
      throw error;
    }

    const created = await createOrgInvite({
      orgId: new mongoose.Types.ObjectId(orgId),
      invitedByUserId: user._id,
      email: body.email,
      role: desiredRole,
    });

    const env = getEnv();
    const appUrl = (env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
    const acceptLink = `${appUrl}/accept-invite?token=${encodeURIComponent(created.token)}`;

    await sendEmail({
      to: body.email,
      subject: `You're invited to join ${String((org as any).name)} on FinWise`,
      text: [
        `Hi,`,
        "",
        `${String((user as any).name || (user as any).email || "A teammate")} invited you to join ${String((org as any).name)} on FinWise.`,
        "",
        `Accept invite: ${acceptLink}`,
        "",
        `This invite expires at ${new Date((created.invite as any).expiresAt).toISOString()}.`,
        "",
        "— FinWise",
      ].join("\n"),
    });

    await recordAuditEvent({
      orgId: new mongoose.Types.ObjectId(orgId),
      actorType: "user",
      actorUserId: user._id,
      action: "org_invite_created",
      targetType: "org_invite",
      targetId: String((created.invite as any)._id),
      requestId: req.requestId,
      metadata: { email: body.email, role: desiredRole },
    });

    const includeToken = getEnv().NODE_ENV !== "production";

    return res.status(201).json({
      org: { id: String((org as any)._id), name: String((org as any).name), slug: String((org as any).slug) },
      member: null,
      invite: {
        id: String((created.invite as any)._id),
        email: String((created.invite as any).email),
        role: String((created.invite as any).role),
        status: String((created.invite as any).status),
        expires_at: new Date((created.invite as any).expiresAt).toISOString(),
        token_prefix: String((created.invite as any).tokenPrefix),
        token: includeToken ? created.token : undefined,
      },
      request_id: req.requestId,
    });
  }

  const payload: any = {
    orgId: new mongoose.Types.ObjectId(orgId),
    userId: invited._id,
    role: desiredRole,
  };

  try {
    await assertSeatAvailable({ orgId: new mongoose.Types.ObjectId(orgId), userId: user._id });

    const created = await OrgMemberModel.create(payload);

    await recordAuditEvent({
      orgId: new mongoose.Types.ObjectId(orgId),
      actorType: "user",
      actorUserId: user._id,
      action: "org_member_added",
      targetType: "org_member",
      targetId: created._id.toString(),
      requestId: req.requestId,
      metadata: { user_id: String(invited._id), role: desiredRole },
    });

    return res.status(201).json({
      org: { id: String((org as any)._id), name: String((org as any).name), slug: String((org as any).slug) },
      member: {
        id: created._id.toString(),
        user_id: String(invited._id),
        role: created.role,
        status: created.status,
      },
      invite: null,
      request_id: req.requestId,
    });
  } catch (error: any) {
    if (
      error instanceof HttpError &&
      (error.code === "FEATURE_LIMIT_REACHED" || error.code === "FEATURE_NOT_AVAILABLE")
    ) {
      await recordAuditEvent({
        orgId: new mongoose.Types.ObjectId(orgId),
        actorType: "user",
        actorUserId: user._id,
        action: "org_member_add_blocked",
        targetType: "organization",
        targetId: String((org as any)._id),
        requestId: req.requestId,
        metadata: {
          user_id: String(invited._id),
          role: desiredRole,
          code: error.code,
          details: error.details,
        },
      }).catch(() => null);
    }
    if (error?.code === 11000) {
      throw new HttpError(409, "ORG_MEMBER_EXISTS", "Member already exists");
    }
    throw error;
  }
};
