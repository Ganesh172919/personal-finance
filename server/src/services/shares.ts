import crypto from "crypto";
import mongoose from "mongoose";

import AgentOutputModel from "../models/agentOutputModel";
import ShareLinkModel, { type ShareLinkType } from "../models/shareLinkModel";
import { HttpError } from "../middleware/httpError";
import { getEnv } from "../config/env";
import { ensureProfile } from "./profileService";
import OrganizationModel from "../models/organizationModel";

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const randomToken = () => crypto.randomBytes(24).toString("base64url");

const clampDays = (value: unknown, fallback: number, max: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const whole = Math.floor(num);
  return Math.max(1, Math.min(max, whole));
};

type FinancialStoryShareOptions = {
  expires_in_days?: number;
  include_goal_names?: boolean;
  include_goal_deadlines?: boolean;
  include_milestones?: boolean;
  max_milestones?: number;
};

const toSafeGoalName = (name: string, index: number, includeNames: boolean) => {
  if (includeNames) return name;
  const safeIndex = index + 1;
  return `Goal ${safeIndex}`;
};

const buildFinancialStorySnapshot = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  options: FinancialStoryShareOptions;
}) => {
  const [profile, milestones] = await Promise.all([
    ensureProfile({ orgId: params.orgId, userId: params.userId }).then((doc) => doc.toObject()),
    params.options.include_milestones === false
      ? Promise.resolve([])
      : AgentOutputModel.find({ orgId: params.orgId, userId: params.userId })
          .sort({ timestamp: -1 })
          .limit(Math.max(1, Math.min(100, Number(params.options.max_milestones || 30))))
          .select({
            agentType: 1,
            outputData: 1,
            timestamp: 1,
          })
          .lean(),
  ]);

  if (!profile) {
    throw new HttpError(503, "PROFILE_UNAVAILABLE", "Unable to resolve financial profile");
  }

  const org = await OrganizationModel.findById(params.orgId)
    .select({ currency: 1, locale: 1, timezone: 1 })
    .lean();

  const goals = Array.isArray((profile as any).goals) ? ((profile as any).goals as any[]) : [];
  const includeGoalNames = Boolean(params.options.include_goal_names);
  const includeDeadlines = Boolean(params.options.include_goal_deadlines);

  const goalsPayload = goals.map((goal, idx) => ({
    name: toSafeGoalName(String(goal?.name || ""), idx, includeGoalNames),
    target: Number(goal?.target || 0),
    current: Number(goal?.current || 0),
    deadline: includeDeadlines ? String(goal?.deadline || "") : undefined,
    priority: Number(goal?.priority || 1),
  }));

  const totals = goalsPayload.reduce(
    (acc, goal) => {
      acc.totalTarget += Number(goal.target || 0);
      acc.totalCurrent += Number(goal.current || 0);
      return acc;
    },
    { totalTarget: 0, totalCurrent: 0 }
  );

  const savings = Number((profile as any).savings || 0);
  const totalAssets = savings + totals.totalCurrent;
  const healthPct = totals.totalTarget > 0 ? Math.round((totals.totalCurrent / totals.totalTarget) * 100) : 0;

  const milestonesPayload = Array.isArray(milestones)
    ? milestones.map((row: any) => ({
        agent_type: String(row?.agentType || "master"),
        title: String(row?.outputData?.title || "AI insight"),
        description: String(row?.outputData?.description || ""),
        timestamp: row?.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
      }))
    : [];

  return {
    type: "financial_story",
    generated_at: new Date().toISOString(),
    currency: org?.currency ? String((org as any).currency) : undefined,
    locale: org?.locale ? String((org as any).locale) : undefined,
    timezone: org?.timezone ? String((org as any).timezone) : undefined,
    summary: {
      health_percentage: healthPct,
      total_assets: totalAssets,
      savings_balance: savings,
      goals_active: goalsPayload.length,
      milestones_count: milestonesPayload.length,
    },
    goals: goalsPayload.map((goal) => ({
      name: goal.name,
      target: goal.target,
      current: goal.current,
      deadline: includeDeadlines ? goal.deadline : undefined,
      priority: goal.priority,
    })),
    milestones: milestonesPayload,
    profile_updated_at: (profile as any).updatedAt ? new Date((profile as any).updatedAt).toISOString() : undefined,
  };
};

export const createFinancialStoryShareLink = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  options?: FinancialStoryShareOptions;
}) => {
  const env = getEnv();
  const options = params.options || {};

  const expiresInDays = clampDays(options.expires_in_days, 7, 365);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const payload = await buildFinancialStorySnapshot({ orgId: params.orgId, userId: params.userId, options });

  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const tokenPrefix = token.slice(0, 8);

  const created = await ShareLinkModel.create({
    orgId: params.orgId,
    createdByUserId: params.userId,
    type: "financial_story" satisfies ShareLinkType,
    tokenHash,
    tokenPrefix,
    status: "active",
    expiresAt,
    payload,
  }).catch(async (error: any) => {
    // Extremely unlikely collision; retry once.
    if (error?.code !== 11000) {
      throw error;
    }
    const token2 = randomToken();
    const created2 = await ShareLinkModel.create({
      orgId: params.orgId,
      createdByUserId: params.userId,
      type: "financial_story" satisfies ShareLinkType,
      tokenHash: sha256Hex(token2),
      tokenPrefix: token2.slice(0, 8),
      status: "active",
      expiresAt,
      payload,
    });
    return { created: created2, token: token2 };
  });

  const tokenFinal = (created as any)?.token ? String((created as any).token) : token;
  const doc = (created as any)?.created ? (created as any).created : created;

  const clientUrl = env.CLIENT_URL.replace(/\/$/, "");
  const shareUrl = `${clientUrl}/share/financial-story/${encodeURIComponent(tokenFinal)}`;

  return {
    share: {
      id: String(doc._id),
      type: String(doc.type),
      token_prefix: String(doc.tokenPrefix),
      expires_at: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : expiresAt.toISOString(),
      share_url: shareUrl,
    },
    token: tokenFinal,
  };
};

export const resolveShareLinkPayload = async (params: { type: ShareLinkType; token: string }) => {
  const token = String(params.token || "").trim();
  if (!token) {
    throw new HttpError(404, "NOT_FOUND", "Share link not found");
  }

  const tokenHash = sha256Hex(token);
  const row = await ShareLinkModel.findOne({ tokenHash, type: params.type, status: "active" }).lean();
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Share link not found");
  }

  const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new HttpError(404, "NOT_FOUND", "Share link not found");
  }

  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  return {
    share_id: String((row as any)._id),
    type: String(row.type),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    payload,
  };
};
