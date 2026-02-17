import type { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import DomainEventModel from "../models/domainEventModel";

export type PublishDomainEventInput = {
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
    userId: event.userId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    actionLinkId: event.actionLinkId,
    requestId: event.requestId,
    payload: event.payload || {},
  });
  await document.save(event.session ? { session: event.session } : undefined);
};
