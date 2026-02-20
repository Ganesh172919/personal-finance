import mongoose from "mongoose";

import DomainEventModel from "../../models/domainEventModel";
import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import { getEventBus } from "./eventBus";

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

  const hydrateCursor = async () => {
    const latest = await DomainEventModel.findOne({})
      .sort({ _id: -1 })
      .select({ _id: 1 })
      .lean();

    if (latest?._id && mongoose.Types.ObjectId.isValid(String((latest as any)._id))) {
      lastSeenId = new mongoose.Types.ObjectId(String((latest as any)._id));
    }
  };

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

  const tick = async () => {
    if (stopped || tickInFlight) return;
    tickInFlight = true;

    try {
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
        publishDoc(doc);
      }
    } catch (error) {
      logger.warn({ error, event: "domain_event_fanout_failed" }, "Domain event fanout tick failed");
    } finally {
      tickInFlight = false;
    }
  };

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
        publishDoc(doc);
      } catch {
        // ignore publish errors
      }
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
