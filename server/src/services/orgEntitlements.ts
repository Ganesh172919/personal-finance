import type { Types } from "mongoose";

import EntitlementModel, { type PlanTier } from "../models/entitlementModel";
import OrgInviteModel from "../models/orgInviteModel";
import OrgMemberModel from "../models/orgMemberModel";
import SubscriptionModel from "../models/subscriptionModel";
import { HttpError } from "../middleware/httpError";

const DEFAULT_TEAM_SEATS = 1;

type ResolvedOrgPlan = {
  plan: PlanTier;
  seats: number;
};

const normalizeSeats = (value: unknown) => {
  const seats = Number(value);
  if (!Number.isFinite(seats) || seats <= 0) {
    return DEFAULT_TEAM_SEATS;
  }
  return Math.max(1, Math.floor(seats));
};

const resolveOrgPlan = async (params: { orgId: Types.ObjectId; userId?: Types.ObjectId }): Promise<ResolvedOrgPlan> => {
  const subscription = await SubscriptionModel.findOne({ orgId: params.orgId })
    .select({ planTier: 1, seats: 1 })
    .lean();

  if (subscription?.planTier) {
    return {
      plan: subscription.planTier as PlanTier,
      seats: normalizeSeats(subscription.seats),
    };
  }

  const entitlement =
    (await EntitlementModel.findOne({ orgId: params.orgId }).select({ plan: 1 }).lean()) ||
    (params.userId
      ? await EntitlementModel.findOne({ orgId: params.orgId, userId: params.userId })
          .select({ plan: 1 })
          .lean()
      : null);

  return {
    plan: (entitlement?.plan as PlanTier | undefined) || "free",
    seats: DEFAULT_TEAM_SEATS,
  };
};

export const requireTeamPlan = async (params: { orgId: Types.ObjectId; userId?: Types.ObjectId }) => {
  const resolved = await resolveOrgPlan(params);
  if (resolved.plan !== "team" && resolved.plan !== "enterprise") {
    throw new HttpError(402, "FEATURE_NOT_AVAILABLE", "Team management is available on Team and Enterprise plans.", {
      feature: "team_members",
      plan: resolved.plan,
    });
  }
  return resolved;
};

export const assertSeatAvailable = async (params: {
  orgId: Types.ObjectId;
  userId?: Types.ObjectId;
  includePendingInvites?: boolean;
}) => {
  const resolved = await requireTeamPlan({ orgId: params.orgId, userId: params.userId });
  const includePendingInvites = Boolean(params.includePendingInvites);
  const now = new Date();

  const [activeMembers, pendingInvites] = await Promise.all([
    OrgMemberModel.countDocuments({ orgId: params.orgId, status: "active" }),
    includePendingInvites
      ? OrgInviteModel.countDocuments({
          orgId: params.orgId,
          status: "pending",
          expiresAt: { $gt: now },
        })
      : Promise.resolve(0),
  ]);

  const used = activeMembers + pendingInvites;
  if (used >= resolved.seats) {
    throw new HttpError(402, "FEATURE_LIMIT_REACHED", "All team seats are in use.", {
      feature: "team_seats",
      limit: resolved.seats,
      used,
      plan: resolved.plan,
    });
  }

  return {
    plan: resolved.plan,
    limit: resolved.seats,
    used,
    active_members: activeMembers,
    pending_invites: pendingInvites,
  };
};
