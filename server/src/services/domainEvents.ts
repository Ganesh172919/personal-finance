import type { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import DomainEventModel from "../models/domainEventModel";
import { getEnv } from "../config/env";
import { QUEUE_NAMES, getQueue } from "../worker/queues";

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
  if (!env.REDIS_URL || !env.WORKER_ENABLED) {
    return;
  }

  try {
    const queue = getQueue(QUEUE_NAMES.domainEvents);
    await queue.add(
      "domain-event",
      { domainEventId: document._id.toString() },
      {
        jobId: document._id.toString(),
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch {
    // best-effort enqueue; repeatable scan will pick up later
  }
};
