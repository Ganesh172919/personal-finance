import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import DomainEventModel from "../../models/domainEventModel";
import { HttpError } from "../../middleware/httpError";
import { getEventBus, type EventBusEvent, type EventBusSubscription } from "../../modules/realtime/eventBus";

const requireOrgContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  return new mongoose.Types.ObjectId(req.org.orgId);
};

const parseAfterId = (req: Request): mongoose.Types.ObjectId | null => {
  const header = String(req.header("last-event-id") || "").trim();
  const query = String((req.query as any)?.after || "").trim();
  const candidate = header || query;
  if (!candidate) return null;
  if (!mongoose.Types.ObjectId.isValid(candidate)) {
    throw new HttpError(400, "INVALID_AFTER_ID", "Invalid after id (expected ObjectId)");
  }
  return new mongoose.Types.ObjectId(candidate);
};

export const streamEvents = async (req: Request, res: Response) => {
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }

  const orgId = requireOrgContext(req);
  let lastId = parseAfterId(req);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Initial message (lets clients confirm the stream is live).
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, request_id: req.requestId })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`: keep-alive ${Date.now()}\n\n`);
      }
    } catch {
      // ignore write errors on closed connections
    }
  }, 15_000);

  const writeChunk = async (chunk: string) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      const ok = res.write(chunk);
      if (!ok) {
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    } catch (error: any) {
      // ignore write errors on closed connections
      void error;
    }
  };

  let stopped = false;
  let subscription: EventBusSubscription | null = null;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    if (subscription) {
      subscription.close();
      subscription = null;
    }
    res.end();
  };

  const sendDomainEvent = async (data: any) => {
    const id = String(data?.id || "");
    if (!id) return;
    await writeChunk(`id: ${id}\nevent: domain_event\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let writeChain = Promise.resolve();
  const enqueueWrite = (write: () => Promise<void>) => {
    writeChain = writeChain.then(write).catch(() => undefined);
  };

  const orgIdString = orgId.toString();
  const buffer: EventBusEvent[] = [];
  let busPaused = true;

  const onBusEvent = (evt: EventBusEvent) => {
    if (stopped) return;
    if (evt.kind !== "domain_event") return;
    if (evt.orgId !== orgIdString) return;

    if (busPaused) {
      buffer.push(evt);
      return;
    }

    const id = String(evt.event?.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) return;
    if (lastId && id <= lastId.toString()) return;

    lastId = new mongoose.Types.ObjectId(id);

    const data = {
      id,
      type: String(evt.event?.type || ""),
      aggregate_type: String(evt.event?.aggregate_type || ""),
      aggregate_id: String(evt.event?.aggregate_id || ""),
      action_link_id: evt.event?.action_link_id ?? null,
      request_id: evt.event?.request_id ?? null,
      payload: evt.event?.payload || {},
      created_at: evt.event?.created_at ?? null,
    };

    enqueueWrite(() => sendDomainEvent(data));
  };

  subscription = getEventBus().subscribe({ orgId: orgIdString, onEvent: onBusEvent });

  const replayFromDb = async () => {
    const maxReplay = 1000;
    const pageSize = 200;
    let replayed = 0;

    while (!stopped && replayed < maxReplay) {
      const remaining = maxReplay - replayed;
      const limit = Math.min(pageSize, remaining);

      const query: any = { orgId };
      if (lastId) {
        query._id = { $gt: lastId };
      }

      const events = await DomainEventModel.find(query)
        .sort({ _id: 1 })
        .limit(limit)
        .select({
          eventType: 1,
          aggregateType: 1,
          aggregateId: 1,
          actionLinkId: 1,
          requestId: 1,
          payload: 1,
          createdAt: 1,
        })
        .lean();

      if (!events.length) {
        break;
      }

      for (const event of events as any[]) {
        const id = String(event._id);
        if (!mongoose.Types.ObjectId.isValid(id)) continue;
        if (lastId && id <= lastId.toString()) continue;
        lastId = new mongoose.Types.ObjectId(id);

        const data = {
          id,
          type: String(event.eventType || ""),
          aggregate_type: String(event.aggregateType || ""),
          aggregate_id: String(event.aggregateId || ""),
          action_link_id: event.actionLinkId ? String(event.actionLinkId) : null,
          request_id: event.requestId ? String(event.requestId) : null,
          payload: event.payload || {},
          created_at: event.createdAt ? new Date(event.createdAt).toISOString() : null,
        };

        enqueueWrite(() => sendDomainEvent(data));
      }

      replayed += events.length;
    }
  };

  const unpauseAndFlush = () => {
    busPaused = false;
    while (buffer.length > 0) {
      const evt = buffer.shift()!;
      onBusEvent(evt);
    }
  };

  if (!lastId) {
    unpauseAndFlush();
  } else {
    void replayFromDb()
      .catch((error: any) => {
        enqueueWrite(() =>
          writeChunk(
            `event: error\ndata: ${JSON.stringify({
              message: "Event stream replay failed",
              error: String(error?.message || error).slice(0, 300),
              request_id: req.requestId,
            })}\n\n`
          )
        );
      })
      .finally(unpauseAndFlush);
  }

  req.on("close", cleanup);
  req.on("aborted", cleanup);
};
