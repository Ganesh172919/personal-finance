import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAIStream } from "./useAIStream";
import { useAIStore } from "@/stores/aiStore";

const api = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("@/services/aiStream", () => ({ createAiStreamRequest: api.stream }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
const reply = (owner: string) => new Response('data: ' + JSON.stringify({
  phase: "complete", result: { owner },
}) + '\n\ndata: [DONE]\n\n');
beforeEach(() => { api.stream.mockReset(); useAIStore.getState().reset(); });
afterEach(() => { cleanup(); useAIStore.getState().reset(); });

it("aborts an unmounted stream and ignores a late response from the old workspace", async () => {
  const late = deferred<Response>(); api.stream.mockReturnValueOnce(late.promise);
  const hook = renderHook(() => useAIStream());
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.stream({ command: "Private A" }); });
  const signal = api.stream.mock.calls[0][1] as AbortSignal;
  hook.unmount();
  useAIStore.getState().reset();
  await act(async () => { late.resolve(reply("A")); await pending; });
  expect(signal.aborted).toBe(true);
  expect(useAIStore.getState().phase).toBe("idle");
});

it("does not let an older stream complete or unlock the current stream", async () => {
  const old = deferred<Response>(), current = deferred<Response>();
  api.stream.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const hook = renderHook(() => useAIStream());
  let first!: Promise<void>, second!: Promise<void>;
  act(() => { first = hook.result.current.stream({ command: "A" }); });
  const oldSignal = api.stream.mock.calls[0][1] as AbortSignal;
  act(() => { second = hook.result.current.stream({ command: "B" }); });
  await act(async () => { old.resolve(reply("A")); await first; });
  const stillStreaming = hook.result.current.isStreaming;
  const earlyResult = hook.result.current.result;
  await act(async () => { current.resolve(reply("B")); await second; });
  expect(oldSignal.aborted).toBe(true);
  expect(stillStreaming).toBe(true);
  expect(earlyResult).toBeNull();
  expect(hook.result.current.result).toEqual({ owner: "B" });
});

it("completes a current SSE response and releases the response reader", async () => {
  const response = reply("Current owner"); api.stream.mockResolvedValueOnce(response);
  const hook = renderHook(() => useAIStream());
  await act(async () => { await hook.result.current.stream({ command: "Current" }); });
  expect(hook.result.current.result).toEqual({ owner: "Current owner" });
  expect(hook.result.current.isStreaming).toBe(false);
  expect(useAIStore.getState().phase).toBe("complete");
  expect(response.body?.locked).toBe(false);
});
