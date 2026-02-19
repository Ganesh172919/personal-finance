import crypto from "crypto";
import mongoose from "mongoose";

import OrganizationModel from "../models/organizationModel";
import OrgMemberModel, { type OrgRole } from "../models/orgMemberModel";
import UserModel from "../models/userModel";
import { applyPendingReferralForUser } from "./referrals";

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

export const ensurePersonalOrgForUser = async (userId: mongoose.Types.ObjectId) => {
  const existing = await OrgMemberModel.findOne({ userId, status: "active" })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();
  if (existing) {
    return existing;
  }

  const user = await UserModel.findById(userId).select({ name: 1, email: 1 }).lean();
  const display = user?.name || user?.email || "Personal";

  const orgName = `${display}'s FinWise`;

  try {
    const org = await OrganizationModel.create({
      name: orgName,
      slug: buildUniqueSlug(orgName),
      type: "personal",
      createdByUserId: userId,
    });

    const member = await OrgMemberModel.create({
      orgId: org._id,
      userId,
      role: "owner",
      status: "active",
      isDefault: true,
    });

    await applyPendingReferralForUser({ userId, orgId: org._id }).catch(() => null);

    return member.toObject();
  } catch (error: any) {
    if (error?.code === 11000) {
      const raced = await OrgMemberModel.findOne({ userId, status: "active" })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
      if (raced) {
        return raced;
      }
    }
    throw error;
  }
};

export const resolveOrgForRequest = async (params: {
  userId: mongoose.Types.ObjectId;
  requestedOrgId?: string;
}): Promise<{
  orgId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  role: OrgRole;
  isDefault: boolean;
}> => {
  const requested = params.requestedOrgId ? String(params.requestedOrgId) : "";
  if (requested) {
    if (!mongoose.Types.ObjectId.isValid(requested)) {
      throw new Error("Invalid org id");
    }
    const member = await OrgMemberModel.findOne({
      orgId: new mongoose.Types.ObjectId(requested),
      userId: params.userId,
      status: "active",
    }).lean();
    if (member) {
      return {
        orgId: member.orgId as unknown as mongoose.Types.ObjectId,
        memberId: member._id as unknown as mongoose.Types.ObjectId,
        role: member.role as OrgRole,
        isDefault: Boolean((member as any).isDefault),
      };
    }
    throw new Error("Org access denied");
  }

  return resolveDefaultOrgForUser(params.userId);
};

export const resolveDefaultOrgForUser = async (
  userId: mongoose.Types.ObjectId
): Promise<{
  orgId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  role: OrgRole;
  isDefault: boolean;
}> => {
  const defaultMember =
    (await OrgMemberModel.findOne({ userId, status: "active", isDefault: true }).lean()) ||
    (await OrgMemberModel.findOne({ userId, status: "active" }).sort({ createdAt: 1 }).lean());

  if (defaultMember) {
    return {
      orgId: defaultMember.orgId as unknown as mongoose.Types.ObjectId,
      memberId: defaultMember._id as unknown as mongoose.Types.ObjectId,
      role: defaultMember.role as OrgRole,
      isDefault: Boolean((defaultMember as any).isDefault),
    };
  }

  const created = await ensurePersonalOrgForUser(userId);
  return {
    orgId: created.orgId as unknown as mongoose.Types.ObjectId,
    memberId: created._id as unknown as mongoose.Types.ObjectId,
    role: created.role as OrgRole,
    isDefault: Boolean((created as any).isDefault),
  };
};
