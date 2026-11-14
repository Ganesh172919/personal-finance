/**
 * Redis pub/sub event bus: lets every gateway replica deliver SSE/domain events
 * published on any other replica.
 *
 * Design:
 * - Each replica keeps a local in-memory bus for its own SSE subscribers
 *   (dedup, listener isolation and fan-out are reused as-is).
 * - `publish` delivers to local subscribers immediately (so a Redis outage never
 *   loses same-replica delivery) and also PUBLISHes to a per-org channel.
 * - A replica SUBSCRIBEs to an org channel only while it has local subscribers
 *   for that org, so quiet orgs cost nothing.
 * - Messages carry the sender's instance id; a replica ignores its own messages,
 *   so nothing is delivered twice. Cross-replica duplicates (several replicas
 *   running the domain-event poller) are dropped by the local bus's id dedup.
 * - Every Redis failure is logged as an alert and never thrown to publishers.
 *
 * Selected with EVENT_BUS=redis (see eventBus.ts#getEventBus).
 *
 * @module modules/realtime/redisEventBus
 */
import { randomUUID } from "node:crypto";
import { logger } from "../../config/logger";
import type { EventBus, EventBusEvent, EventBusSubscription } from "./eventBus";

/** Minimal slice of an ioredis client used for publishing. */
// Interface specifying minimal publishing capabilities required from a Redis client.
// Abstracts the redis publish method to enable easy mocking and testing.
// Decouples event bus broadcasting from concrete client library implementations.
export type PubSubPublisher = {
  publish(channel: string, message: string): Promise<number> | number;
};

/** Minimal slice of an ioredis client used for subscribing (its own connection). */
// Interface describing subscriber connection methods required for Redis pub/sub.
// Encapsulates channel subscription, message event registration, and connection teardown.
// Enforces separate dedicated connection usage required for Redis listening sockets.
export type PubSubSubscriber = {
  subscribe(...channels: string[]): Promise<unknown> | unknown;
  unsubscribe(...channels: string[]): Promise<unknown> | unknown;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
  off?(event: "message", listener: (channel: string, message: string) => void): unknown;
  removeListener?(event: "message", listener: (channel: string, message: string) => void): unknown;
  quit?(): Promise<unknown> | unknown;
};

// Configuration parameters supplied when constructing a RedisEventBus instance.
// Injects dedicated publisher and subscriber Redis clients along with local fallback bus.
// Supports custom channel namespace prefixing and unique instance identification.
export type RedisEventBusOptions = {
  publisher: PubSubPublisher;
  subscriber: PubSubSubscriber;
  /** Local in-memory bus that owns this replica's subscribers. */
  local: EventBus;
  channelPrefix?: string;
  /** Overridable for tests; defaults to a random UUID per process. */
  instanceId?: string;
};

// Wire protocol schema wrapping events with source instance metadata.
// Attaches sending replica instance ID to allow filtering out self-published events.
// Prevents event echo loops between Redis subscribers and local in-memory listeners.
type WireMessage = { src: string; event: EventBusEvent };

const ALERT_THROTTLE_MS = 30_000;

// Distributed EventBus driver synchronizing realtime events across multiple server replicas.
// Uses Redis pub/sub for cross-node fanout while delegating to local in-memory buses.
// Ensures immediate local delivery resilience even if the Redis broker encounters downtime.
export class RedisEventBus implements EventBus {
  readonly instanceId: string;

  private readonly publisher: PubSubPublisher;
  private readonly subscriber: PubSubSubscriber;
  private readonly local: EventBus;
  private readonly prefix: string;
  private readonly refsByOrg = new Map<string, number>();
  private chain: Promise<unknown> = Promise.resolve();
  private lastAlertAt = 0;
  private closed = false;

  private readonly onMessage = (channel: string, raw: string) => {
    if (!channel.startsWith(this.prefix)) return;
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch {
      return;
    }
    if (!message || message.src === this.instanceId) return; // our own publish: already delivered locally
    const event = message.event;
    if (!event || event.kind !== "domain_event" || `${this.prefix}${event.orgId}` !== channel) return;
    this.local.publish(event);
  };

  constructor(options: RedisEventBusOptions) {
    this.publisher = options.publisher;
    this.subscriber = options.subscriber;
    this.local = options.local;
    this.prefix = options.channelPrefix ?? "finwise:events:";
    this.instanceId = options.instanceId ?? randomUUID();
    this.subscriber.on("message", this.onMessage);
  }

  // Constructs the Redis channel key formatted with configured prefix and organization ID.
  // Scopes pub/sub channels strictly by tenant organization to isolate event streams.
  // Produces predictable Redis channel names across cluster nodes.
  private channel(orgId: string) {
    return `${this.prefix}${orgId}`;
  }

  // Logs throttled critical alerts when Redis operations fail.
  // Enforces a 30-second cooldown window to prevent log flooding during outages.
  // Informs site reliability monitoring without crashing client request threads.
  private alert(op: string, err: unknown) {
    const now = Date.now();
    if (now - this.lastAlertAt < ALERT_THROTTLE_MS) return;
    this.lastAlertAt = now;
    logger.error(
      { event: "event_bus_redis_error", alert: true, op, err: (err as Error)?.message },
      "ALERT: Redis event bus error; events are delivered to this replica only until Redis recovers",
    );
  }

  /** Serializes subscribe/unsubscribe so rapid open/close cannot reorder on the wire. */
  // Serializes asynchronous Redis subscription mutations via promise chaining.
  // Guarantees rapid subscribe and unsubscribe operations execute in strict chronological sequence.
  // Prevents race conditions and channel state drift over Redis protocol connections.
  private enqueue(op: string, fn: () => Promise<unknown> | unknown) {
    this.chain = this.chain
      .then(fn)
      .catch((err) => this.alert(op, err));
  }

  // Broadcasts event to local in-memory listeners and publishes to Redis organization channel.
  // Prioritizes local delivery so failures in Redis transport do not drop same-replica events.
  // Wraps event in wire envelope stamped with sending instance identifier.
  publish(event: EventBusEvent) {
    // Local first: same-replica delivery must never depend on Redis being up.
    this.local.publish(event);

    if (this.closed) return;
    try {
      const payload = JSON.stringify({ src: this.instanceId, event } satisfies WireMessage);
      Promise.resolve(this.publisher.publish(this.channel(String(event.orgId)), payload)).catch((err) => this.alert("publish", err));
    } catch (err) {
      this.alert("publish", err);
    }
  }

  // Subscribes a local listener to organization events and manages Redis channel interest.
  // Dynamically issues Redis SUBSCRIBE when the first local organization listener connects.
  // Issues Redis UNSUBSCRIBE when the final local listener for the organization disconnects.
  subscribe(params: { orgId: string; onEvent: (event: EventBusEvent) => void }): EventBusSubscription {
    const orgId = String(params.orgId);
    const inner = this.local.subscribe({ orgId, onEvent: params.onEvent });

    const refs = (this.refsByOrg.get(orgId) ?? 0) + 1;
    this.refsByOrg.set(orgId, refs);
    if (refs === 1) {
      this.enqueue("subscribe", () => this.subscriber.subscribe(this.channel(orgId)));
    }

    let closed = false;
    return {
      close: () => {
        if (closed) return;
        closed = true;
        inner.close();
        const remaining = (this.refsByOrg.get(orgId) ?? 1) - 1;
        if (remaining <= 0) {
          this.refsByOrg.delete(orgId);
          this.enqueue("unsubscribe", () => this.subscriber.unsubscribe(this.channel(orgId)));
        } else {
          this.refsByOrg.set(orgId, remaining);
        }
      },
    };
  }

  /** Resolves once every queued subscribe/unsubscribe has reached Redis (used by tests and shutdown). */
  // Awaits completion of all currently enqueued subscription operations.
  // Useful during test tear-downs and graceful server shutdowns to ensure state consistency.
  // Resolves once all pending Redis protocol commands resolve.
  async flush(): Promise<void> {
    await this.chain;
  }

  /** Stops listening and closes the dedicated subscriber connection. The publisher is shared and left open. */
  // Terminates the Redis subscriber client connection and deregisters event listeners.
  // Flushes pending operations and sends QUIT command over the dedicated subscriber socket.
  // Leaves shared publisher client open for other application services.
  async close(): Promise<void> {
    this.closed = true;
    (this.subscriber.off ?? this.subscriber.removeListener)?.call(this.subscriber, "message", this.onMessage);
    await this.flush();
    try {
      await this.subscriber.quit?.();
    } catch {
      // ignore errors during shutdown
    }
  }
}
