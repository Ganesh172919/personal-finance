/**
 * @fileoverview Automation Event Controller (v1)
 *
 * Catalog of automation-triggerable domain events and an endpoint to
 * manually emit custom events for testing or integration purposes.
 *
 * Routes served:
 *   GET  /api/v1/automation/events - listAutomationEvents (catalog)
 *   POST /api/v1/automation/events - emitAutomationEvent (admin)
 *
 * Key patterns:
 *   - listAutomationEvents returns a static catalog of supported event types
 *   - emitAutomationEvent publishes a domain event via the event bus (admin only)
 *   - Custom events use aggregate_type "custom_event" by default
 *   - Published events are consumed by workflows, notifications, and the activity feed
 *
 * @module controllers/v1/automationEventController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";
import { publishDomainEvent } from "../../services/domainEvents";

const roleRank: Record<"member" | "admin" | "owner", number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const AUTOMATION_EVENT_CATALOG = [
  {
    event_type: "TransactionCreated",
    title: "Transaction Created",
    source: "ledger",
    description: "Triggered when a transaction is created manually, via imports, or by tools.",
  },
  {
    event_type: "TransactionImported",
    title: "Transaction Imported",
    source: "ledger",
    description: "Triggered when transaction import runs ingest one or more records.",
  },
  {
    event_type: "ReceiptConfirmed",
    title: "Receipt Confirmed",
    source: "receipts",
    description: "Triggered after a parsed receipt is confirmed and persisted.",
  },
  {
    event_type: "ScenarioEvaluated",
    title: "Scenario Evaluated",
    source: "ai",
    description: "Triggered when a scenario run is completed and summarized.",
  },
  {
    event_type: "WorkflowCreated",
    title: "Workflow Created",
    source: "automation",
    description: "Triggered when a workflow is created through tools or API.",
  },
  {
    event_type: "TaskApplied",
    title: "Task Applied",
    source: "tasks",
    description: "Triggered when a task action is applied to financial state.",
  },
  {
    event_type: "GoalUpserted",
    title: "Goal Upserted",
    source: "goals",
    description: "Triggered whenever a goal is created or updated.",
  },
  {
    event_type: "DebtUpserted",
    title: "Debt Upserted",
    source: "debts",
    description: "Triggered whenever a debt item is created or updated.",
  },
  {
    event_type: "NotificationSent",
    title: "Notification Sent",
    source: "notifications",
    description: "Triggered after an outbound notification is sent.",
  },
] as const;

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const requireOrgAdmin = (req: Request) => {
  const orgId = requireOrgContext(req);
  if (roleRank[req.org!.role] < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  return orgId;
};

export const listAutomationEvents = async (req: Request, res: Response) => {
  const orgId = requireOrgContext(req);
  return res.json({
    org_id: orgId.toString(),
    events: AUTOMATION_EVENT_CATALOG,
    request_id: req.requestId,
  });
};

export const emitAutomationEvent = async (req: Request, res: Response) => {
  const orgId = requireOrgAdmin(req);
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const body = req.body as {
    event_type: string;
    aggregate_type?: string;
    aggregate_id?: string;
    payload?: Record<string, unknown>;
  };

  const aggregateType = body.aggregate_type?.trim() || "custom_event";
  const aggregateId = body.aggregate_id?.trim() || `req:${req.requestId}`;

  await publishDomainEvent({
    orgId,
    userId: user._id,
    eventType: String(body.event_type || "").trim(),
    aggregateType,
    aggregateId,
    requestId: req.requestId,
    payload: body.payload || {},
  });

  return res.status(202).json({
    accepted: true,
    org_id: orgId.toString(),
    event_type: String(body.event_type || "").trim(),
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    request_id: req.requestId,
  });
};
