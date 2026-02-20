import type { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import DomainEventModel from "../models/domainEventModel";
import { getEnv } from "../config/env";
import { processDomainEventById } from "./domainEventTriggers";
import { getEventBus } from "../modules/realtime/eventBus";

export type PublishDomainEventInput = {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actionLinkId?: string;
  requestId?: string;
  payload?: Record<string, unknown>;
  session?: ClientSession;
};

export const publishDomainEvent = async (event: PublishDomainEventInput) => {
  const document = new DomainEventModel({
    orgId: event.orgId,
    userId: event.userId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    actionLinkId: event.actionLinkId,
    requestId: event.requestId,
    payload: event.payload || {},
  });
  await document.save(event.session ? { session: event.session } : undefined);

  if (event.session) {
    return;
  }

  const env = getEnv();
  if (!env.ASYNC_JOBS_ENABLED) {
    getEventBus().publish({
      kind: "domain_event",
      orgId: document.orgId.toString(),
      event: {
        id: document._id.toString(),
        org_id: document.orgId.toString(),
        type: document.eventType,
        aggregate_type: document.aggregateType,
        aggregate_id: document.aggregateId,
        action_link_id: document.actionLinkId ? String(document.actionLinkId) : null,
        request_id: document.requestId ? String(document.requestId) : null,
        payload: (document as any).payload || {},
        created_at: (document as any).createdAt ? new Date((document as any).createdAt).toISOString() : null,
      },
    });
  }

  void processDomainEventById(document._id.toString()).catch(() => null);
};
