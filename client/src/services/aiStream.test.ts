import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setActiveOrgId } from "@/lib/orgContext";
import { setCsrfToken } from "@/lib/api/core";
import { createAiStreamRequest } from "./aiStream";

const fetchMock = vi.fn();
const csrfFailure = () => Response.json({ code: "CSRF_FAILED" }, { status: 403 });
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setActiveOrgId("org-a");
  localStorage.setItem("userId", "user-a");
  setCsrfToken("initial-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
  localStorage.clear();
});

it("sends cookie credentials, current org and CSRF token without consuming SSE response", async () => {
  const response = new Response("data: hello\n\n", { status: 200 });
  fetchMock.mockResolvedValueOnce(response);
  const result = await createAiStreamRequest({ command: "test" });
  expect(result).toBe(response);
  expect(await result.text()).toBe("data: hello\n\n");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/ai/process/stream");
  expect(options).toMatchObject({ method: "POST", credentials: "include", body: JSON.stringify({ command: "test" }) });
  const headers = new Headers(options.headers);
  expect(headers.get("X-CSRF-Token")).toBe("initial-token");
  expect(headers.get("X-Org-Id")).toBe("org-a");
  expect(headers.get("Content-Type")).toBe("application/json");
});

it("fetches a token before sending if auth initialization has not completed", async () => {
  setCsrfToken(null);
  fetchMock.mockResolvedValueOnce(Response.json({ csrf_token: "first-token" }))
    .mockResolvedValueOnce(new Response("data: ok\n\n"));
  await createAiStreamRequest({ command: "test" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/csrf");
  expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-CSRF-Token")).toBe("first-token");
});

it("refreshes an expired CSRF token once and retries the current stream", async () => {
  fetchMock.mockResolvedValueOnce(csrfFailure())
    .mockResolvedValueOnce(Response.json({ csrf_token: "new-token" }))
    .mockResolvedValueOnce(new Response("data: ok\n\n"));
  const result = await createAiStreamRequest({ command: "test" });
  expect(await result.text()).toBe("data: ok\n\n");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(new Headers(fetchMock.mock.calls[2][1].headers).get("X-CSRF-Token")).toBe("new-token");
});

it("does not retry a stream after the organization changes, even if it changes back", async () => {
  const pending = deferred();
  fetchMock.mockReturnValueOnce(pending.promise);
  const result = createAiStreamRequest({ command: "test" });
  setActiveOrgId("org-b");
  setActiveOrgId("org-a");
  pending.resolve(csrfFailure());
  await expect(result).rejects.toThrow(/workspace changed/i);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not retry a stream after a different account signs in", async () => {
  const pending = deferred();
  fetchMock.mockReturnValueOnce(pending.promise);
  const result = createAiStreamRequest({ command: "test" });
  localStorage.setItem("userId", "user-b");
  pending.resolve(csrfFailure());
  await expect(result).rejects.toThrow(/account or workspace changed/i);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not replay after workspace changes while a CSRF refresh is pending", async () => {
  const pending = deferred();
  fetchMock.mockResolvedValueOnce(csrfFailure()).mockReturnValueOnce(pending.promise);
  const result = createAiStreamRequest({ command: "test" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  setActiveOrgId("org-b");
  pending.resolve(Response.json({ csrf_token: "new-token" }));
  await expect(result).rejects.toThrow(/workspace changed/i);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("honors cancellation before retrying a rejected stream", async () => {
  const controller = new AbortController();
  const pending = deferred();
  fetchMock.mockReturnValueOnce(pending.promise);
  const result = createAiStreamRequest({ command: "test" }, controller.signal);
  controller.abort();
  pending.resolve(csrfFailure());
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("passes unrelated failures back to the stream consumer without retrying", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ code: "ACCESS_DENIED" }, { status: 403 }));
  const response = await createAiStreamRequest({ command: "test" });
  expect(response.status).toBe(403);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
