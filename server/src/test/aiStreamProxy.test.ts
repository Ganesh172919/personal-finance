import { PassThrough, Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { proxyAiStream, type SseSink } from "../services/aiStreamProxy";

const sse = (payload: unknown) => `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;

const collect = (sink: PassThrough) => {
  let text = "";
  sink.on("data", (chunk) => {
    text += chunk.toString("utf8");
  });
  return () => text;
};

const parseEvents = (text: string) =>
  text
    .split("\n\n")
    .filter(Boolean)
    .map((raw) => raw.replace(/^data: /, ""))
    .map((payload) => (payload === "[DONE]" ? payload : JSON.parse(payload)));

describe("proxyAiStream", () => {
  it("forwards events in order and injects fields returned by onComplete into the complete result", async () => {
    const sink = new PassThrough();
    const read = collect(sink);
    const upstream = Readable.from([
      sse({ phase: "routing", request_id: "r1" }),
      sse({ phase: "trace", entry: { agent: "budget" } }),
      sse({ phase: "complete", result: { final_output: "ok", usage: { tokens_in: 10 } } }),
      sse("[DONE]"),
    ]);
    const onComplete = vi.fn(async () => ({ agent_output_id: "ao_123" }));

    const outcome = await proxyAiStream({
      upstream,
      sink: sink as unknown as SseSink,
      isClientClosed: () => false,
      onComplete,
    });

    expect(outcome).toEqual({ completed: true, clientClosed: false });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ final_output: "ok", usage: { tokens_in: 10 } });

    const events = parseEvents(read());
    expect(events.map((e: any) => (e === "[DONE]" ? e : e.phase))).toEqual(["routing", "trace", "complete", "[DONE]"]);
    expect((events[2] as any).result).toEqual({
      final_output: "ok",
      usage: { tokens_in: 10 },
      agent_output_id: "ao_123",
    });
    expect(sink.writableEnded).toBe(true);
  });

  it("reassembles events split across arbitrary chunk boundaries", async () => {
    const sink = new PassThrough();
    const read = collect(sink);
    const whole = sse({ phase: "routing" }) + sse({ phase: "complete", result: { final_output: "x" } }) + sse("[DONE]");
    // 7-byte chunks cut events (and the \n\n separators) mid-way.
    const chunks = whole.match(/[\s\S]{1,7}/g) as string[];

    await proxyAiStream({
      upstream: Readable.from(chunks),
      sink: sink as unknown as SseSink,
      isClientClosed: () => false,
      onComplete: () => ({ agent_output_id: "ao_1" }),
    });

    const events = parseEvents(read());
    expect(events).toHaveLength(3);
    expect((events[1] as any).result.agent_output_id).toBe("ao_1");
  });

  it("forwards the complete event unchanged when onComplete throws", async () => {
    const sink = new PassThrough();
    const read = collect(sink);
    const onError = vi.fn();

    const outcome = await proxyAiStream({
      upstream: Readable.from([sse({ phase: "complete", result: { final_output: "ok" } }), sse("[DONE]")]),
      sink: sink as unknown as SseSink,
      isClientClosed: () => false,
      onComplete: async () => {
        throw new Error("db down");
      },
      onError,
    });

    expect(outcome.completed).toBe(true);
    expect(onError).toHaveBeenCalledWith("onComplete handler failed", expect.any(Error));
    const events = parseEvents(read());
    expect((events[0] as any).result).toEqual({ final_output: "ok" });
    expect(events[1]).toBe("[DONE]");
  });

  it("passes non-JSON data and comment/heartbeat events through untouched", async () => {
    const sink = new PassThrough();
    const read = collect(sink);

    await proxyAiStream({
      upstream: Readable.from([": keep-alive\n\n", "data: not json\n\n", sse("[DONE]")]),
      sink: sink as unknown as SseSink,
      isClientClosed: () => false,
    });

    expect(read()).toBe(": keep-alive\n\ndata: not json\n\ndata: [DONE]\n\n");
  });

  it("stops reading and destroys the upstream when the client disconnects, without persisting", async () => {
    const sink = new PassThrough();
    collect(sink);
    let closed = false;
    const onComplete = vi.fn();

    let sentFirst = false;
    const upstream = new Readable({
      read() {
        // Emit exactly one event, then hold the stream open like a long-running
        // LLM call (pushing on every read() would generate an endless stream).
        if (!sentFirst) {
          sentFirst = true;
          this.push(sse({ phase: "routing" }));
        }
      },
    });
    const destroySpy = vi.spyOn(upstream, "destroy");

    const done = proxyAiStream({
      upstream,
      sink: sink as unknown as SseSink,
      isClientClosed: () => closed,
      onComplete,
    });

    // Client goes away mid-stream, then more data arrives upstream.
    await new Promise((r) => setTimeout(r, 10));
    closed = true;
    sink.destroy();
    upstream.push(sse({ phase: "complete", result: { final_output: "late" } }));

    const outcome = await done;
    expect(outcome.clientClosed).toBe(true);
    expect(outcome.completed).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalled();
  });

  it("emits an error event and ends the stream when the upstream fails", async () => {
    const sink = new PassThrough();
    const read = collect(sink);
    const onError = vi.fn();

    const upstream = new Readable({
      read() {
        this.push(sse({ phase: "routing" }));
        this.destroy(new Error("socket hang up"));
      },
    });

    const outcome = await proxyAiStream({
      upstream,
      sink: sink as unknown as SseSink,
      isClientClosed: () => false,
      onError,
    });

    expect(outcome.upstreamError).toBe("socket hang up");
    expect(outcome.completed).toBe(false);
    expect(onError).toHaveBeenCalled();
    const events = parseEvents(read());
    expect(events.at(-2)).toEqual({ phase: "error", message: "Stream interrupted" });
    expect(events.at(-1)).toBe("[DONE]");
    expect(sink.writableEnded).toBe(true);
  });

  it("waits for drain instead of buffering the whole stream when the client is slow", async () => {
    // highWaterMark of 1 byte makes every write report backpressure.
    const sink = new PassThrough({ highWaterMark: 1 });
    const received: string[] = [];
    const events = Array.from({ length: 5 }, (_, i) => sse({ phase: "trace", i }));

    const done = proxyAiStream({
      upstream: Readable.from(events),
      sink: sink as unknown as SseSink,
      isClientClosed: () => false,
    });

    // Slow consumer: drain one chunk at a time.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 5));
      const chunk = sink.read();
      if (chunk) received.push(chunk.toString("utf8"));
    }
    await done;
    sink.on("data", (c) => received.push(c.toString("utf8")));
    await new Promise((r) => setTimeout(r, 5));

    const all = received.join("");
    for (let i = 0; i < 5; i += 1) expect(all).toContain(`"i":${i}`);
  });
});
