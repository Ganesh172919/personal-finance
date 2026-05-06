/**
 * @fileoverview Domain Event System
 *
 * PURPOSE:
 * This module implements the Domain Event pattern -- a way for different parts
 * of the system to communicate asynchronously without direct coupling. When a
 * significant action happens (e.g., "transaction created", "budget exceeded"),
 * a domain event is published. Other parts of the system can then react to
 * these events independently.
 *
 * ARCHITECTURE:
 * This is the PUBLISHER side of the event system. The consumer side lives in
 * domainEventTriggers.ts, which processes events for side effects like:
 * - Sending notifications
 * - Updating aggregates
 * - Triggering AI analysis
 * - Syncing with external services
 *
 * EVENT LIFECYCLE:
 * 1. A service/controller calls publishDomainEvent()
 * 2. The event is persisted to MongoDB (DomainEventModel)
 * 3. If not in a transaction session:
 *    a. The event is published to the in-memory event bus (for real-time updates)
 *    b. The event is processed asynchronously via processDomainEventById
 * 4. If in a transaction session: only persistence happens (bus/processing
 *    are deferred until after the transaction commits)
 *
 * WHY PERSIST EVENTS?
 * Events are stored in MongoDB so they can be:
 * - Replayed if processing fails
 * - Audited for compliance
 * - Used for eventual consistency across microservices
 * - Processed by background jobs that pick up unprocessed events
 *
 * @module services/domainEvents
 */

import type { Types } from "mongoose"; // MongoDB ObjectId type
import type { ClientSession } from "mongoose"; // MongoDB transaction session
import DomainEventModel from "../models/domainEventModel"; // Event persistence model
import { getEnv } from "../config/env"; // Environment configuration
import { processDomainEventById } from "./domainEventTriggers"; // Event processing/handling
import { getEventBus } from "../modules/realtime/eventBus"; // In-memory pub/sub for real-time updates

/**
 * Input type for publishing a domain event.
 * Uses DDD terminology:
 * - aggregateType/aggregateId: The entity that the event is about (e.g., "Transaction", "abc123")
 * - eventType: What happened (e.g., "transaction.created", "budget.exceeded")
 * - actionLinkId: Optional link to the action that triggered this event
 */
export type PublishDomainEventInput = {
  orgId: Types.ObjectId; // Organization scope (multi-tenancy)
  userId: Types.ObjectId; // User who triggered the event
  eventType: string; // Event type identifier (e.g., "transaction.created")
  aggregateType: string; // Entity type (e.g., "Transaction", "Budget", "Goal")
  aggregateId: string; // Entity ID the event relates to
  actionLinkId?: string; // Optional link to an action/task
  requestId?: string; // Request ID for distributed tracing
  payload?: Record<string, unknown>; // Event-specific data
  session?: ClientSession; // MongoDB transaction session (if in a transaction)
};

/**
 * Publishes a domain event to the system.
 *
 * IMPORTANT BEHAVIOR WITH TRANSACTIONS:
 * When a session is provided (i.e., we're inside a MongoDB transaction), the
 * event is ONLY persisted. The event bus notification and event processing are
 * SKIPPED because:
 * 1. The transaction might roll back -- we don't want to notify prematurely
 * 2. Other services shouldn't see the event until the transaction commits
 * The caller is responsible for triggering processing after commit.
 *
 * @param {PublishDomainEventInput} event - The event to publish
 */
export const publishDomainEvent = async (event: PublishDomainEventInput) => {
  // STEP 1: Persist the event to MongoDB (always, even in transactions)
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
  // If in a transaction, the save is part of that transaction
  await document.save(event.session ? { session: event.session } : undefined);

  // STEP 2: If inside a transaction, stop here -- don't notify or process yet
  // The caller must handle post-commit processing
  if (event.session) {
    return;
  }

  // STEP 3: Publish to the in-memory event bus for real-time subscribers
  // (e.g., WebSocket connections for live UI updates)
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

  // STEP 4: Process the event asynchronously (fire-and-forget)
  // The void operator explicitly discards the Promise.
  // .catch(() => null) prevents unhandled promise rejection crashes.
  // In production with ASYNC_JOBS_ENABLED, this processing is handled by
  // a background job worker instead of inline.
  void processDomainEventById(document._id.toString()).catch(() => null);
};

// =============================================================================
// END-OF-FILE SUMMARY
// =============================================================================
//
// KEY TAKEAWAYS:
//
// 1. EVENT-DRIVEN ARCHITECTURE: This module enables loose coupling between
//    services. A transaction service doesn't need to know about notification
//    service -- it just publishes an event, and the notification service
//    subscribes to it independently.
//
// 2. TRANSACTION SAFETY: Events published inside a MongoDB transaction are
//    only persisted, not processed. This prevents side effects from firing
//    before the transaction commits (and potentially rolling back).
//
// 3. DUAL NOTIFICATION: Events go to both the persistent store (MongoDB) and
//    the in-memory event bus. MongoDB ensures durability; the event bus
//    enables real-time UI updates via WebSockets.
//
// 4. FIRE-AND-FORGET: Event processing is intentionally non-blocking. The
//    publisher doesn't wait for handlers to complete. This keeps the request
//    path fast but means event processing is eventually consistent.
// =============================================================================
