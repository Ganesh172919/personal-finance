import mongoose from "mongoose";

import DomainEventModel from "../../models/domainEventModel";
import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import { getEventBus } from "./eventBus";
import { tryAcquireLeadership } from "../../services/leaderElection";

// Lease expiration TTL for domain event fanout leadership acquisition.
// Sets distributed lock duration to 15 seconds to prevent multiple replica fanout contention.
// Ensures failover recovery if the active fanout leader replica crashes.
const FANOUT_LEASE_MS = 15_000;

// Initializes domain event tailing and broadcasts new domain events over the event bus.
// Employs MongoDB change streams where available with polling fallback for resilience.
// Coordinates leadership election when Redis bus is configured to prevent duplicate dispatches.
export const startDomainEventFanout = () => {
  const env = getEnv();

  if (env.NODE_ENV === "test" || !env.DOMAIN_EVENT_FANOUT_ENABLED) {
    return { stop: () => undefined };
  }

  const bus = getEventBus();
  let lastSeenId: mongoose.Types.ObjectId | null = null;
  let stopped = false;
  let tickInFlight = false;
  let timer: NodeJS.Timeout | null = null;
  let changeStream: any | null = null;
  let usingChangeStream = false;

  // With the Redis event bus every replica would publish every event (N duplicates); only the
  // elected leader publishes. Followers still advance their cursor so a takeover does not replay
  // old events. With the in-process bus each replica must publish to its own SSE clients.
  const needsLeader = env.EVENT_BUS === "redis";
  let leaderUntil = 0;
  // Determines whether the current replica instance holds leadership for event broadcasting.
  // Renews distributed lease via tryAcquireLeadership if lease TTL is approaching expiration.
  // Defaults to true when running local event buses where each node must notify its own clients.
  const isLeader = async (): Promise<boolean> => {
    if (!needsLeader) return true;
    const now = Date.now();
    if (now < leaderUntil) return true;
    const ok = await tryAcquireLeadership("domain-event-fanout", FANOUT_LEASE_MS);
    if (ok) leaderUntil = now + FANOUT_LEASE_MS / 3;
    return ok;
  };

  // Queries database for the most recent domain event ObjectId to initialize cursor position.
  // Seeds lastSeenId so the fanout service only processes newly arrived events.
  // Prevents re-broadcasting entire historical event collections on service startup.
  const hydrateCursor = async () => {
    const latest = await DomainEventModel.findOne({})
      .sort({ _id: -1 })
      .select({ _id: 1 })
      .lean();

    if (latest?._id && mongoose.Types.ObjectId.isValid(String((latest as any)._id))) {
      lastSeenId = new mongoose.Types.ObjectId(String((latest as any)._id));
    }
  };

  // Formats and dispatches a database domain event record through the realtime event bus.
  // Standardizes event metadata fields, aggregate details, and payload dictionary.
  // Routes message directly to subscribed clients of the event organization.
  const publishDoc = (doc: any) => {
    bus.publish({
      kind: "domain_event",
      orgId: String(doc.orgId),
      event: {
        id: String(doc._id),
        org_id: String(doc.orgId),
        type: String(doc.eventType || ""),
        aggregate_type: String(doc.aggregateType || ""),
        aggregate_id: String(doc.aggregateId || ""),
        action_link_id: doc.actionLinkId ? String(doc.actionLinkId) : null,
        request_id: doc.requestId ? String(doc.requestId) : null,
        payload: doc.payload && typeof doc.payload === "object" ? doc.payload : {},
        created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
      },
    });
  };

  // Closes active MongoDB change stream listener and removes bound event handlers.
  // Cleans up database driver change stream resources safely on shutdown or failover.
  // Resets change stream status flags to allow fallback to timer polling.
  const stopChangeStream = () => {
    if (!changeStream) return;
    try {
      changeStream.removeAllListeners?.();
      void changeStream.close?.();
    } catch {
      // ignore close errors
    }
    changeStream = null;
    usingChangeStream = false;
  };

  // Polling execution cycle fetching newly inserted domain events newer than lastSeenId.
  // Fetches event batches in chronological order, updates local cursor, and dispatches events.
  // Guards against overlapping concurrent executions with tickInFlight state latch.
  const tick = async () => {
    if (stopped || tickInFlight) return;
    tickInFlight = true;

    try {
      const leader = await isLeader();
      const query: any = {};
      if (lastSeenId) {
        query._id = { $gt: lastSeenId };
      }

      const docs = await DomainEventModel.find(query)
        .sort({ _id: 1 })
        .limit(250)
        .select({
          _id: 1,
          orgId: 1,
          eventType: 1,
          aggregateType: 1,
          aggregateId: 1,
          actionLinkId: 1,
          requestId: 1,
          payload: 1,
          createdAt: 1,
        })
        .lean();

      for (const doc of docs as any[]) {
        const id = String(doc?._id || "");
        if (!mongoose.Types.ObjectId.isValid(id)) continue;
        lastSeenId = new mongoose.Types.ObjectId(id);
        if (leader) publishDoc(doc);
      }
    } catch (error) {
      logger.warn({ error, event: "domain_event_fanout_failed" }, "Domain event fanout tick failed");
    } finally {
      tickInFlight = false;
    }
  };

  // Starts interval polling timer to periodically trigger event ingestion cycles.
  // Unrefs timer so it does not block node runtime shutdown when idle.
  // Reads poll interval frequency from application environment configuration.
  const startPolling = () => {
    if (stopped) return;
    const intervalMs = env.DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS;
    timer = setInterval(() => void tick(), intervalMs);
    timer.unref();
    logger.info(
      { event: "domain_event_fanout_enabled", interval_ms: intervalMs, mode: "poll" },
      "Domain event fanout enabled"
    );
  };

  // Initializes MongoDB change stream watching insertion operations on DomainEvent collection.
  // Immediately processes new event documents as soon as they commit to database oplog.
  // Automatically falls back to interval polling if change stream initialization encounters errors.
  const startWatching = () => {
    if (stopped) return;

    try {
      changeStream = DomainEventModel.watch([{ $match: { operationType: "insert" } }], {
        fullDocument: "updateLookup",
      });
    } catch (error) {
      logger.warn({ error, event: "domain_event_watch_init_failed" }, "Domain event watch init failed");
      changeStream = null;
      usingChangeStream = false;
      return false;
    }

    usingChangeStream = true;

    changeStream.on("change", (change: any) => {
      if (stopped) return;
      const doc = change?.fullDocument;
      if (!doc) return;
      try {
        const id = String(doc?._id || "");
        if (mongoose.Types.ObjectId.isValid(id)) {
          lastSeenId = new mongoose.Types.ObjectId(id);
        }
      } catch {
        // ignore cursor errors
      }
      void isLeader()
        .then((leader) => {
          if (leader && !stopped) publishDoc(doc);
        })
        .catch(() => undefined);
    });

    changeStream.on("error", (error: any) => {
      if (stopped) return;
      logger.warn({ error, event: "domain_event_watch_failed" }, "Domain event watch failed; falling back to polling");
      stopChangeStream();
      if (!timer) {
        startPolling();
      }
    });

    logger.info({ event: "domain_event_fanout_enabled", mode: "change_stream" }, "Domain event fanout enabled");
    return true;
  };

  void hydrateCursor()
    .catch((error) => {
      logger.warn({ error, event: "domain_event_fanout_cursor_failed" }, "Domain event fanout cursor init failed");
    })
    .finally(() => {
      if (stopped) return;

      const mode = env.DOMAIN_EVENT_FANOUT_MODE;
      const shouldTryWatch = mode === "auto" || mode === "change_stream";
      const shouldPoll = mode === "auto" || mode === "poll";

      const watchingStarted = shouldTryWatch ? startWatching() : false;
      if (!watchingStarted && shouldPoll) {
        startPolling();
      }
      if (watchingStarted) {
        void tick().catch(() => null);
      }
    });

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      stopChangeStream();
    },
  };
};
