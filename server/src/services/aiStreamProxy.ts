import type { Writable } from "node:stream";

/**
 * Minimal view of the Express response that the proxy needs. Declared
 * structurally so the proxy can be unit-tested with a plain Writable.
 */
// Defines minimal writable stream interface required to pipe Server-Sent Events.
// Ensures compatibility with Express response objects as well as mock test streams.
// Exposes stream write capabilities along with terminal completion flags.
export type SseSink = Writable & { writableEnded: boolean };

// Callback function invoked when the upstream AI stream reaches completion.
// Receives the final result payload and optionally returns augmented metadata.
// Supports both asynchronous and synchronous handlers with graceful error handling.
export type StreamCompleteHandler = (
  result: Record<string, unknown>
) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;

// Represents the final execution state and outcome of proxying an AI stream.
// Captures whether the stream finished cleanly, terminated early by client, or failed.
// Preserves upstream error diagnostic messages for observability and auditing.
export type ProxyAiStreamResult = {
  /** A `complete` event was seen and forwarded. */
  completed: boolean;
  /** The downstream client went away before the stream finished. */
  clientClosed: boolean;
  /** The upstream stream failed (not a client disconnect). */
  upstreamError?: string;
};

// A single SSE event is a few KB in practice; this only guards against an
// upstream that never emits an event separator.
const MAX_PENDING_BYTES = 8 * 1024 * 1024;

// Helper predicate to inspect whether the downstream SSE sink is closed or destroyed.
// Used before initiating stream writes to avoid writing to dead client connections.
// Prevents unhandled stream error events and avoids wasted processing cycles.
const isSinkClosed = (sink: SseSink) => sink.writableEnded || sink.destroyed;

/**
 * Writes to the sink and, when its buffer is full, waits for `drain` (or the
 * sink closing) so a slow client cannot make us buffer the whole stream.
 * Returns false when the sink is no longer writable.
 */
// Safely writes chunk data to the downstream SSE sink respecting backpressure buffers.
// Pauses upstream consumption until the sink drains when internal buffers fill up.
// Returns a boolean indicating whether the sink remains writable for future chunks.
const writeWithBackpressure = async (sink: SseSink, text: string): Promise<boolean> => {
  if (isSinkClosed(sink)) return false;
  if (sink.write(text)) return true;

  await new Promise<void>((resolve) => {
    const done = () => {
      sink.off("drain", done);
      sink.off("close", done);
      resolve();
    };
    sink.once("drain", done);
    sink.once("close", done);
  });
  return !isSinkClosed(sink);
};

// Extracts and concatenates data line payloads from raw SSE event text blocks.
// Normalizes trailing carriage returns and strips standard SSE protocol data prefixes.
// Returns the joined payload string or null if no valid data lines were encountered.
const parseDataPayload = (rawEvent: string): string | null => {
  const dataLines = rawEvent
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  return dataLines.length ? dataLines.join("\n") : null;
};

/**
 * Proxies an upstream AI Core SSE stream to the client, event by event.
 *
 * - Preserves ordering and honours backpressure.
 * - Intercepts the `complete` event so the caller can persist the outcome
 *   (AgentOutput + usage) and have extra fields (e.g. `agent_output_id`)
 *   merged into `result` before the client sees it. A failing `onComplete`
 *   never breaks the stream; the event is forwarded unchanged.
 * - Stops reading as soon as the client disconnects. The caller is
 *   responsible for aborting upstream work (see `streamAiCoreRequest`'s
 *   `signal`) and releasing its concurrency slot.
 */
// Proxies an upstream Server-Sent Events stream from AI Core to downstream HTTP client.
// Manages chunk buffering, event boundary parsing, backpressure, and lifecycle events.
// Intercepts completion payloads for optional enrichment while handling disconnections cleanly.
export const proxyAiStream = async (params: {
  upstream: AsyncIterable<Buffer | string> & { destroy?: (error?: Error) => unknown };
  sink: SseSink;
  isClientClosed: () => boolean;
  acceptCompletion?: (result: Record<string, unknown>) => boolean;
  onComplete?: StreamCompleteHandler;
  onError?: (message: string, error: unknown) => void;
}): Promise<ProxyAiStreamResult> => {
  const { upstream, sink, isClientClosed, acceptCompletion, onComplete, onError } = params;
  const outcome: ProxyAiStreamResult = { completed: false, clientClosed: false };

  const transformEvent = async (rawEvent: string): Promise<string> => {
    const payload = parseDataPayload(rawEvent);
    if (payload === null || payload === "[DONE]") return rawEvent;

    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return rawEvent;
    }

    if (parsed?.phase === "complete" && parsed.result && typeof parsed.result === "object") {
      if (acceptCompletion && !acceptCompletion(parsed.result)) {
        return `data: ${JSON.stringify({ phase: "error", message: "AI Core is temporarily unavailable. Please retry shortly." })}`;
      }
      outcome.completed = true;
      if (onComplete) {
        try {
          const extra = await onComplete(parsed.result as Record<string, unknown>);
          if (extra && typeof extra === "object") {
            parsed = { ...parsed, result: { ...parsed.result, ...extra } };
          }
        } catch (error) {
          onError?.("onComplete handler failed", error);
        }
      }
      return `data: ${JSON.stringify(parsed)}`;
    }
    return rawEvent;
  };

  let pending = "";
  try {
    for await (const chunk of upstream) {
      if (isClientClosed() || isSinkClosed(sink)) {
        outcome.clientClosed = true;
        break;
      }

      pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (pending.length > MAX_PENDING_BYTES) {
        throw new Error("Upstream SSE event exceeded the maximum size");
      }

      let separator = pending.indexOf("\n\n");
      while (separator !== -1) {
        const rawEvent = pending.slice(0, separator);
        pending = pending.slice(separator + 2);

        const out = await transformEvent(rawEvent);
        if (!(await writeWithBackpressure(sink, `${out}\n\n`))) {
          outcome.clientClosed = true;
          break;
        }
        separator = pending.indexOf("\n\n");
      }
      if (outcome.clientClosed) break;
    }

    if (!outcome.clientClosed && pending.trim()) {
      await writeWithBackpressure(sink, `${await transformEvent(pending)}\n\n`);
    }
  } catch (error) {
    if (isClientClosed() || isSinkClosed(sink)) {
      // Destroying the upstream after a disconnect surfaces as a stream error;
      // that is expected and not an upstream failure.
      outcome.clientClosed = true;
    } else {
      outcome.upstreamError = error instanceof Error ? error.message : String(error);
      onError?.("upstream stream failed", error);
      await writeWithBackpressure(
        sink,
        `data: ${JSON.stringify({ phase: "error", message: "Stream interrupted" })}\n\ndata: [DONE]\n\n`
      );
    }
  } finally {
    if (outcome.clientClosed) {
      try {
        upstream.destroy?.();
      } catch {
        // already destroyed
      }
    }
    if (!sink.writableEnded && !sink.destroyed) sink.end();
  }

  return outcome;
};
