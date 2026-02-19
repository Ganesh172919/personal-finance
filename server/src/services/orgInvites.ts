import crypto from "crypto";
import mongoose from "mongoose";

import { getEnv } from "../config/env";
import { HttpError } from "../middleware/httpError";
import OrganizationModel from "../models/organizationModel";
import OrgInviteModel from "../models/orgInviteModel";
import OrgMemberModel, { type OrgRole } from "../models/orgMemberModel";
import UserModel from "../models/userModel";
import { assertSeatAvailable, requireTeamPlan } from "./orgEntitlements";

const hashToken = (token: string) => {
  const env = getEnv();
  return crypto.createHmac("sha256", env.JWT_SECRET).update(token).digest("hex");
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const createOrgInvite = async (params: {
  orgId: mongoose.Types.ObjectId;
  invitedByUserId: mongoose.Types.ObjectId;
  email: string;
  role: OrgRole;
  expiresInDays?: number;
}) => {
  const email = normalizeEmail(params.email);
  const org = await OrganizationModel.findById(params.orgId).select({ _id: 1 }).lean();
  if (!org?._id) {
    throw new HttpError(404, "ORG_NOT_FOUND", "Organization not found");
  }

  await requireTeamPlan({ orgId: params.orgId, userId: params.invitedByUserId });

  const existingMember = await UserModel.findOne({ email })
    .select({ _id: 1 })
    .lean()
    .then(async (user) => {
      if (!user?._id) return null;
      return OrgMemberModel.findOne({ orgId: params.orgId, userId: user._id, status: "active" })
        .select({ _id: 1 })
        .lean();
    });

  if (existingMember?._id) {
    throw new HttpError(409, "ORG_MEMBER_EXISTS", "Member already exists");
  }

  const now = new Date();
  const expiresInDays = Number.isFinite(Number(params.expiresInDays)) ? Number(params.expiresInDays) : 7;
  const expiresAt = new Date(now.getTime() + Math.max(1, Math.min(30, expiresInDays)) * 24 * 60 * 60 * 1000);

  const pendingInvites = await OrgInviteModel.find({
    orgId: params.orgId,
    email,
    status: "pending",
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .limit(5);

  for (const invite of pendingInvites) {
    invite.status = "revoked";
    await invite.save().catch(() => null);
  }

  await assertSeatAvailable({ orgId: params.orgId, userId: params.invitedByUserId, includePendingInvites: true });

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 12);

  const created = await OrgInviteModel.create({
    orgId: params.orgId,
    email,
    role: params.role,
    status: "pending",
    tokenHash,
    tokenPrefix,
    invitedByUserId: params.invitedByUserId,
    expiresAt,
  });

  return {
    invite: created.toObject(),
    token,
  };
};

export const acceptOrgInvite = async (params: {
  token: string;
  userId: mongoose.Types.ObjectId;
  userEmail: string;
}) => {
  const now = new Date();
  const token = params.token.trim();
  const tokenHash = hashToken(token);

  const invite = await OrgInviteModel.findOne({ tokenHash });
  if (!invite) {
    throw new HttpError(404, "INVITE_NOT_FOUND", "Invite not found");
  }

  await requireTeamPlan({ orgId: invite.orgId as mongoose.Types.ObjectId, userId: params.userId });

  if (invite.status !== "pending") {
    throw new HttpError(409, "INVITE_NOT_PENDING", "Invite is no longer valid");
  }

  if (invite.expiresAt.getTime() <= now.getTime()) {
    invite.status = "expired";
    await invite.save().catch(() => null);
    throw new HttpError(410, "INVITE_EXPIRED", "Invite has expired");
  }

  const email = normalizeEmail(params.userEmail || "");
  if (!email || email !== invite.email) {
    throw new HttpError(403, "INVITE_EMAIL_MISMATCH", "Invite email does not match current user");
  }

  const member =
    (await OrgMemberModel.findOne({ orgId: invite.orgId, userId: params.userId }).lean()) ||
    null;

  if (member && member.status === "active") {
    invite.status = "accepted";
    invite.acceptedAt = now;
    invite.acceptedByUserId = params.userId;
    await invite.save().catch(() => null);
    return { invite: invite.toObject(), member };
  }

  await assertSeatAvailable({
    orgId: invite.orgId as mongoose.Types.ObjectId,
    userId: params.userId,
    includePendingInvites: false,
  });

  const updated = await OrgMemberModel.findOneAndUpdate(
    { orgId: invite.orgId, userId: params.userId },
    {
      $set: {
        role: invite.role,
        status: "active",
        invitedEmail: invite.email,
        invitedByUserId: invite.invitedByUserId,
      },
      $setOnInsert: {
        isDefault: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  invite.status = "accepted";
  invite.acceptedAt = now;
  invite.acceptedByUserId = params.userId;
  await invite.save();

  return { invite: invite.toObject(), member: updated.toObject() };
};
