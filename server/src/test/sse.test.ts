/**
 * @fileoverview Server-Sent Events (SSE) Tests
 *
 * Tests for the SSE streaming implementation covering:
 * - SSE connection establishment
 * - Event delivery format (data: JSON\n\n)
 * - Heartbeat events
 * - Connection cleanup on client disconnect
 * - Mock res object for SSE
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { streamEvents } from "../controllers/v1/eventsController";
import type { IUserDocument } from "../models/userModel";

/**
 * Create a mock Express Response that behaves like a writable stream
 * suitable for SSE testing.
 */
function createMockRes() {
  const chunks: string[] = [];
  const emitter = new EventEmitter();
  let ended = false;

  const res: any = {
    writableEnded: false,
    destroyed: false,
    statusCode: 200,
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return this._headers[name.toLowerCase()];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    write(chunk: string) {
      if (ended) return false;
      chunks.push(chunk);
      return true;
    },
    end() {
      ended = true;
      this.writableEnded = true;
      emitter.emit("close");
    },
    on(event: string, listener: (...args: any[]) => void) {
      emitter.on(event, listener);
      return this;
    },
    once(event: string, listener: (...args: any[]) => void) {
      emitter.once(event, listener);
      return this;
    },
    emit(event: string, ...args: any[]) {
      emitter.emit(event, ...args);
    },
    _chunks: chunks,
    _emitter: emitter,
  };

  return res;
}

/**
 * Create a mock Express Request that behaves like an EventEmitter.
 * Pass `org = undefined` (or omit) for default valid org; pass `null` explicitly to simulate missing org.
 */
function createMockReq(user?: any, org?: any, headers?: Record<string, string>) {
  const emitter = new EventEmitter();
  const defaultOrg = { orgId: "aabbccddeeff00112233aabb" };
  const req: any = {
    requestId: "sse-test-req-123",
    user: user ?? null,
    org: org === undefined ? defaultOrg : org,
    headers: headers || {},
    header(name: string) {
      return this.headers[name.toLowerCase()] || "";
    },
    on(event: string, listener: (...args: any[]) => void) {
      emitter.on(event, listener);
      return this;
    },
    emit(event: string, ...args: any[]) {
      emitter.emit(event, ...args);
    },
  };
  return req;
}

// Mock the event bus and models to avoid DB/real dependencies
vi.mock("../../modules/realtime/eventBus", () => {
  let capturedCallback: ((evt: any) => void) | null = null;
  return {
    getEventBus: () => ({
      subscribe: (params: any) => {
        capturedCallback = params.onEvent;
        return { close: vi.fn() };
      },
      publish: vi.fn(),
    }),
    __getCapturedCallback: () => capturedCallback,
  };
});

vi.mock("../../models/domainEventModel", () => ({
  default: {
    find: () => ({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
  },
}));

describe("SSE streamEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when user is missing", async () => {
    const req = createMockReq(null, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    await expect(streamEvents(req, res)).rejects.toThrow("Missing user context");
  });

  it("returns 401 when org context is missing", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, null);
    const res = createMockRes();

    await expect(streamEvents(req, res)).rejects.toThrow("Organization context required");
  });

  it("sets correct SSE headers on connection", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    // streamEvents is async but sets up SSE and returns
    const promise = streamEvents(req, res);

    // Allow microtasks to flush
    await vi.advanceTimersByTimeAsync(10);

    expect(res._headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(res._headers["cache-control"]).toBe("no-cache, no-transform");
    expect(res._headers["connection"]).toBe("keep-alive");
    expect(res._headers["x-accel-buffering"]).toBe("no");
    expect(res.statusCode).toBe(200);

    // Clean up - simulate client disconnect
    req.emit("close");
    try { await promise; } catch { /* ignore */ }
  });

  it("sends initial ready event on connection", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    const promise = streamEvents(req, res);
    await vi.advanceTimersByTimeAsync(10);

    // First chunk should be the ready event
    const readyChunk = res._chunks.find((c: string) => c.includes("event: ready"));
    expect(readyChunk).toBeDefined();
    expect(readyChunk).toContain('"ok":true');
    expect(readyChunk).toContain('"request_id":"sse-test-req-123"');

    // SSE format: each event ends with double newline
    expect(readyChunk).toMatch(/\n\n$/);

    req.emit("close");
    try { await promise; } catch { /* ignore */ }
  });

  it("sends heartbeat comments to keep connection alive", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    const promise = streamEvents(req, res);
    await vi.advanceTimersByTimeAsync(10);

    // Advance past the 15-second heartbeat interval
    await vi.advanceTimersByTimeAsync(16_000);

    // Heartbeat is an SSE comment (starts with ":")
    const heartbeats = res._chunks.filter((c: string) => c.startsWith(": keep-alive"));
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    req.emit("close");
    try { await promise; } catch { /* ignore */ }
  });

  it("cleans up on client disconnect (close event)", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    const promise = streamEvents(req, res);
    await vi.advanceTimersByTimeAsync(10);

    // Simulate client disconnect
    req.emit("close");
    await vi.advanceTimersByTimeAsync(100);

    // After cleanup, the response should be ended
    expect(res.writableEnded).toBe(true);

    try { await promise; } catch { /* ignore */ }
  });

  it("cleans up on client abort event", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    const promise = streamEvents(req, res);
    await vi.advanceTimersByTimeAsync(10);

    // Simulate client abort
    req.emit("aborted");
    await vi.advanceTimersByTimeAsync(100);

    expect(res.writableEnded).toBe(true);

    try { await promise; } catch { /* ignore */ }
  });

  it("does not send multiple heartbeats before interval elapses", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" });
    const res = createMockRes();

    const promise = streamEvents(req, res);
    await vi.advanceTimersByTimeAsync(10);

    // Advance only 5 seconds (less than 15s heartbeat interval)
    await vi.advanceTimersByTimeAsync(5_000);

    const heartbeats = res._chunks.filter((c: string) => c.startsWith(": keep-alive"));
    expect(heartbeats).toHaveLength(0);

    req.emit("close");
    try { await promise; } catch { /* ignore */ }
  });

  it("returns 400 for invalid last-event-id header", async () => {
    const user = { _id: "user-123" } as unknown as IUserDocument;
    const req = createMockReq(user, { orgId: "aabbccddeeff00112233aabb" }, { "last-event-id": "not-a-valid-objectid" });
    const res = createMockRes();

    await expect(streamEvents(req, res)).rejects.toThrow("Invalid after id");
  });
});
