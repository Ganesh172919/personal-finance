import type { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import DomainEventModel from "../models/domainEventModel";
import { processDomainEventById } from "./domainEventTriggers";

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

  void processDomainEventById(document._id.toString()).catch(() => null);
};
