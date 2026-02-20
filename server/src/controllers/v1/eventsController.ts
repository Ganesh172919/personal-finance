import type { Request, Response } from "express";
import mongoose from "mongoose";

import type { IUserDocument } from "../../models/userModel";
import DomainEventModel from "../../models/domainEventModel";
import { HttpError } from "../../middleware/httpError";

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

  if (!lastId) {
    const latest = await DomainEventModel.findOne({ orgId }).sort({ _id: -1 }).select({ _id: 1 }).lean();
    if (latest?._id && mongoose.Types.ObjectId.isValid(String((latest as any)._id))) {
      lastId = new mongoose.Types.ObjectId(String((latest as any)._id));
    }
  }

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

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    res.end();
  };

  let pollTimeout: NodeJS.Timeout | null = null;

  const pollOnce = async () => {
    if (stopped || res.writableEnded || res.destroyed) return;

    try {
      const query: any = { orgId };
      if (lastId) {
        query._id = { $gt: lastId };
      }

      const events = await DomainEventModel.find(query)
        .sort({ _id: 1 })
        .limit(50)
        .select({
          orgId: 1,
          userId: 1,
          eventType: 1,
          aggregateType: 1,
          aggregateId: 1,
          actionLinkId: 1,
          requestId: 1,
          payload: 1,
          createdAt: 1,
        })
        .lean();

      for (const event of events as any[]) {
        const id = String(event._id);
        lastId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : lastId;

        const data = {
          id,
          type: String(event.eventType || ""),
          aggregate_type: String(event.aggregateType || ""),
          aggregate_id: String(event.aggregateId || ""),
          action_link_id: event.actionLinkId ? String(event.actionLinkId) : null,
          request_id: event.requestId ? String(event.requestId) : null,
          payload: event.payload || {},
          created_at: event.createdAt || null,
        };

        await writeChunk(`id: ${id}\nevent: domain_event\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } catch (error: any) {
      await writeChunk(
        `event: error\ndata: ${JSON.stringify({
          message: "Event stream poll failed",
          error: String(error?.message || error).slice(0, 300),
          request_id: req.requestId,
        })}\n\n`
      );
    } finally {
      if (!stopped) {
        pollTimeout = setTimeout(pollOnce, 2000);
      }
    }
  };

  pollTimeout = setTimeout(pollOnce, 2000);

  req.on("close", cleanup);
  req.on("aborted", cleanup);
};
