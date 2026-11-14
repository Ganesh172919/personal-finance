import { getEnv } from "../../config/env";
import { getRedis } from "../../config/redis";
import { logger } from "../../config/logger";
import { RedisEventBus } from "./redisEventBus";

// Payload contract defining domain event properties broadcast across the realtime bus.
// Includes event identifier, organization ID, aggregate identifiers, and timestamp.
// Serves as standardized envelope structure for cross-service asynchronous events.
type DomainEventPayload = {
  id: string;
  org_id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  action_link_id: string | null;
  request_id: string | null;
  payload: Record<string, unknown>;
  created_at: string | null;
};

// Discriminated event union wrapping domain events transmitted through the event bus.
// Tags event with literal kind discriminator and destination organization routing ID.
// Guarantees proper tenant routing across pub/sub subscribers and SSE channels.
export type EventBusEvent = {
  kind: "domain_event";
  orgId: string;
  event: DomainEventPayload;
};

// Subscription handle providing an idempotent teardown closure for event listeners.
// Closes active subscription and cleans up organization listener registrations.
// Prevents memory leaks by unbinding subscriber callbacks on socket disconnects.
export type EventBusSubscription = { close: () => void };

// Contract defining publication and subscription methods for realtime event buses.
// Supports broadcasting events and subscribing listeners scoped by organization ID.
// Implemented by both in-memory local emitter and distributed Redis pub/sub buses.
export interface EventBus {
  publish: (event: EventBusEvent) => void;
  subscribe: (params: { orgId: string; onEvent: (event: EventBusEvent) => void }) => EventBusSubscription;
}

// In-memory single-process implementation of the EventBus interface.
// Organizes active subscriber callbacks by organization ID with built-in deduplication.
// Defaults to zero-dependency local operation for development and single-node setups.
export class InMemoryEventBus implements EventBus {
  private listenersByOrg = new Map<string, Set<(event: EventBusEvent) => void>>();
  private recentlySeenEventIdsByOrg = new Map<string, Map<string, number>>();

  private static readonly EVENT_DEDUP_TTL_MS = 10 * 60 * 1000;
  private static readonly EVENT_DEDUP_MAX_PER_ORG = 2000;

  // Evaluates whether an incoming event was recently dispatched within deduplication window.
  // Maintains LRU time-bounded event cache per organization up to configured capacity.
  // Drops duplicate deliveries to prevent multiple client executions of identical events.
  private shouldDropDuplicate(event: EventBusEvent) {
    const id = String(event.event?.id || "");
    if (!id) return false;

    const orgId = String(event.orgId || "");
    if (!orgId) return false;

    const now = Date.now();
    const ttlMs = InMemoryEventBus.EVENT_DEDUP_TTL_MS;

    let map = this.recentlySeenEventIdsByOrg.get(orgId);
    if (!map) {
      map = new Map();
      this.recentlySeenEventIdsByOrg.set(orgId, map);
    }

    const seenAt = map.get(id);
    if (typeof seenAt === "number" && now - seenAt < ttlMs) {
      return true;
    }

    map.set(id, now);

    if (map.size <= InMemoryEventBus.EVENT_DEDUP_MAX_PER_ORG) {
      return false;
    }

    for (const [key, ts] of map.entries()) {
      if (now - ts >= ttlMs) {
        map.delete(key);
      }
    }

    while (map.size > InMemoryEventBus.EVENT_DEDUP_MAX_PER_ORG) {
      const oldest = map.keys().next().value as string | undefined;
      if (!oldest) break;
      map.delete(oldest);
    }

    return false;
  }

  // Dispatches an event to all subscribed listeners registered under the event orgId.
  // Checks deduplication filters and safely swallows listener handler exceptions.
  // Guarantees publisher execution paths remain uninterrupted by faulty listener logic.
  publish(event: EventBusEvent) {
    if (this.shouldDropDuplicate(event)) {
      return;
    }

    const listeners = this.listenersByOrg.get(event.orgId);
    if (!listeners || listeners.size === 0) return;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must never crash publisher paths.
      }
    }
  }

  // Registers a callback listener for realtime events targeting a specific organization.
  // Adds listener function to organization listener sets and returns teardown handle.
  // Automatically purges empty organization listener sets upon subscription cancellation.
  subscribe(params: { orgId: string; onEvent: (event: EventBusEvent) => void }): EventBusSubscription {
    const orgId = String(params.orgId);
    const onEvent = params.onEvent;

    let listeners = this.listenersByOrg.get(orgId);
    if (!listeners) {
      listeners = new Set();
      this.listenersByOrg.set(orgId, listeners);
    }

    listeners.add(onEvent);

    return {
      close: () => {
        const current = this.listenersByOrg.get(orgId);
        if (!current) return;
        current.delete(onEvent);
        if (current.size === 0) {
          this.listenersByOrg.delete(orgId);
          this.recentlySeenEventIdsByOrg.delete(orgId);
        }
      },
    };
  }
}

let singleton: EventBus | null = null;
let redisBus: RedisEventBus | null = null;

// Factory resolving the configured EventBus driver based on environment variables.
// Configures distributed Redis pub/sub when enabled with fallbacks to local memory bus.
// Logs configuration alerts if Redis is selected but unconfigured at runtime.
const buildEventBus = (): EventBus => {
  const local = new InMemoryEventBus();
  let selected = "memory";
  try {
    selected = getEnv().EVENT_BUS;
  } catch {
    // invalid/mocked env: stay on the in-memory default
  }
  if (selected !== "redis") return local;

  const publisher = getRedis();
  if (!publisher) {
    logger.error(
      { event: "event_bus_fallback", alert: true },
      "ALERT: EVENT_BUS=redis but Redis is not configured; using the in-memory event bus (SSE events will not cross replicas)",
    );
    return local;
  }
  const subscriber = publisher.duplicate();
  subscriber.on("error", (err) => logger.warn({ err: err.message, event: "event_bus_subscriber_error" }, "Event bus subscriber error (non-fatal)"));
  redisBus = new RedisEventBus({ publisher, subscriber, local });
  logger.info({ event: "event_bus_redis" }, "Realtime event bus: Redis pub/sub");
  return redisBus;
};

// Returns the application-wide singleton EventBus instance.
// Initializes the configured bus driver lazily on first access.
// Shared by domain event producers and SSE realtime notification bridges.
export const getEventBus = (): EventBus => {
  if (!singleton) {
    singleton = buildEventBus();
  }
  return singleton;
};

/** Closes the Redis subscriber connection (graceful shutdown) and resets the singleton. */
// Gracefully tears down the realtime event bus during server shutdown sequences.
// Unsubscribes and closes Redis subscriber socket connections when active.
// Resets singleton instances to allow clean reinitialization in test environments.
export const shutdownEventBus = async (): Promise<void> => {
  const bus = redisBus;
  redisBus = null;
  singleton = null;
  await bus?.close();
};
