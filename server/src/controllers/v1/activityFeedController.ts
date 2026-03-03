import type { Request, Response } from "express";
import mongoose from "mongoose";

import DomainEventModel from "../../models/domainEventModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

// ─── Helpers ────────────────────────────────────────────

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }
  return {
    orgId: new mongoose.Types.ObjectId(req.org.orgId),
    userId: user._id,
  };
};

// ─── Human-readable event descriptions ──────────────────

const EVENT_DESCRIPTIONS: Record<string, (payload: any) => string> = {
  "transaction.created": (p) => `added a transaction "${p.description || "Untitled"}" for ${p.amount ? `$${Math.abs(p.amount)}` : "an amount"}`,
  "transaction.updated": (p) => `updated transaction "${p.description || p.transactionId || "?"}"`,
  "transaction.deleted": () => `deleted a transaction`,
  "transaction.imported": (p) => `imported ${p.count || "some"} transactions`,
  "budget.created": (p) => `created a budget for ${p.category || "a category"}`,
  "budget.updated": (p) => `updated the ${p.category || ""} budget`,
  "goal.created": (p) => `created goal "${p.title || "Untitled"}"`,
  "goal.completed": (p) => `completed goal "${p.title || "Untitled"}" 🎉`,
  "goal.updated": (p) => `updated goal "${p.title || "?"}"`,
  "workflow.created": (p) => `created workflow "${p.name || "Untitled"}"`,
  "workflow.executed": (p) => `ran workflow "${p.name || "?"}"`,
  "ai.insight": () => `received an AI insight`,
  "receipt.uploaded": () => `uploaded a receipt`,
  "account.created": (p) => `added account "${p.name || "Untitled"}"`,
  "member.invited": (p) => `invited ${p.email || "a member"} to the organization`,
  "member.joined": () => `joined the organization`,
};

function describeEvent(eventType: string, payload: Record<string, unknown>): string {
  const describer = EVENT_DESCRIPTIONS[eventType];
  if (describer) return describer(payload);
  // Fallback: humanize the event type
  return eventType.replace(/[._]/g, " ");
}

function getEventIcon(eventType: string): string {
  if (eventType.startsWith("transaction")) return "receipt";
  if (eventType.startsWith("budget")) return "wallet";
  if (eventType.startsWith("goal")) return "target";
  if (eventType.startsWith("workflow")) return "zap";
  if (eventType.startsWith("ai")) return "brain";
  if (eventType.startsWith("receipt")) return "camera";
  if (eventType.startsWith("account")) return "building";
  if (eventType.startsWith("member")) return "users";
  return "activity";
}

// ─── Activity Feed Endpoint ─────────────────────────────

export const getActivityFeed = async (req: Request, res: Response) => {
  const { orgId } = requireOrgContext(req);

  const limit = Math.min(Number(req.query?.limit) || 30, 100);
  const before = req.query?.before
    ? new Date(String(req.query.before))
    : undefined;

  const filter: any = { orgId };
  if (before && !isNaN(before.getTime())) {
    filter.createdAt = { $lt: before };
  }

  // Optional filters
  if (req.query?.event_type) {
    filter.eventType = String(req.query.event_type);
  }
  if (req.query?.user_id) {
    filter.userId = new mongoose.Types.ObjectId(String(req.query.user_id));
  }

  const events = await DomainEventModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("userId", "displayName email avatar")
    .lean();

  const activities = events.map((event: any) => ({
    id: String(event._id),
    event_type: event.eventType,
    description: describeEvent(event.eventType, event.payload || {}),
    icon: getEventIcon(event.eventType),
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId,
    actor: event.userId
      ? {
          id: String(event.userId._id || event.userId),
          name: event.userId.displayName || event.userId.email || "System",
          avatar: event.userId.avatar || null,
        }
      : { id: "system", name: "System", avatar: null },
    payload: event.payload,
    created_at: event.createdAt,
  }));

  const hasMore = events.length === limit;
  const nextCursor = hasMore ? events[events.length - 1].createdAt?.toISOString() : null;

  res.json({
    org_id: orgId.toString(),
    activities,
    has_more: hasMore,
    next_cursor: nextCursor,
    request_id: req.requestId,
  });
};
