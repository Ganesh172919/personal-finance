import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { apiClient, setCsrfToken } from "./core";
import { getActiveOrgId, setActiveOrgId } from "../orgContext";
import { retireRequestContext } from "../requestContext";
import { useAppDialogStore } from "@/stores/appDialogStore";

const fetchMock = vi.fn();
const response = (code: string, status = 403) => Response.json({ code, message: code }, { status });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(finish => { resolve = finish; });
  return { promise, resolve };
}
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  setActiveOrgId("org-a"); setCsrfToken("old-token");
  localStorage.setItem("userId", "user-a");
  useAppDialogStore.getState().closeFeatureLimit();
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("does not clear the new workspace when an old read is denied", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
  const result = apiClient("/private-records").catch(error => error);
  setActiveOrgId("org-b"); old.resolve(response("ORG_ACCESS_DENIED"));
  expect(await result).toMatchObject({ code: "ORG_ACCESS_DENIED" });
  expect(getActiveOrgId()).toBe("org-b");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not replay an old write after switching away and back", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
  const result = apiClient("/tasks", { method: "POST", body: "{}" }).catch(error => error);
  setActiveOrgId("org-b"); setActiveOrgId("org-a");
  old.resolve(response("CSRF_FAILED"));
  expect(await result).toMatchObject({ code: "CSRF_FAILED" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rechecks the owner after awaiting CSRF refresh", async () => {
  const token = deferred();
  fetchMock.mockResolvedValueOnce(response("CSRF_FAILED")).mockReturnValueOnce(token.promise);
  const result = apiClient("/tasks", { method: "POST", body: "{}" }).catch(error => error);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  setActiveOrgId("org-b"); token.resolve(Response.json({ csrf_token: "new-token" }));
  expect(await result).toMatchObject({ code: "CSRF_FAILED" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(getActiveOrgId()).toBe("org-b");
});

it("does not open a previous account's feature-limit dialog", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
  const result = apiClient("/private-records").catch(error => error);
  retireRequestContext(); old.resolve(response("FEATURE_LIMIT_REACHED", 402));
  expect(await result).toMatchObject({ status: 402 });
  expect(useAppDialogStore.getState().featureLimit).toBeNull();
});

it("detects another tab's workspace change before its storage event is handled", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
  const result = apiClient("/private-records").catch(error => error);
  localStorage.setItem("finwise.active_org_id", "org-b");
  old.resolve(response("ORG_ACCESS_DENIED"));
  expect(await result).toMatchObject({ code: "ORG_ACCESS_DENIED" });
  expect(getActiveOrgId()).toBe("org-b");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not replay a write under a different stored account in the same workspace", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
  const result = apiClient("/tasks", { method: "POST", body: "{}" }).catch(error => error);
  localStorage.setItem("userId", "user-b");
  old.resolve(response("CSRF_FAILED"));
  expect(await result).toMatchObject({ code: "CSRF_FAILED" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("preserves CSRF recovery for a current write and its organization", async () => {
  fetchMock.mockResolvedValueOnce(response("CSRF_FAILED"))
    .mockResolvedValueOnce(Response.json({ csrf_token: "new-token" }))
    .mockResolvedValueOnce(Response.json({ created: true }));
  expect(await apiClient("/tasks", { method: "POST", body: "{}" })).toEqual({ created: true });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const headers = new Headers(fetchMock.mock.calls[2][1].headers);
  expect(headers.get("X-Org-Id")).toBe("org-a");
  expect(headers.get("X-CSRF-Token")).toBe("new-token");
});

it("preserves safe-read recovery when the current stored organization is stale", async () => {
  fetchMock.mockResolvedValueOnce(response("ORG_ACCESS_DENIED"))
    .mockResolvedValueOnce(Response.json({ current: true }));
  expect(await apiClient("/private-records")).toEqual({ current: true });
  expect(getActiveOrgId()).toBeNull();
  expect(new Headers(fetchMock.mock.calls[1][1].headers).has("X-Org-Id")).toBe(false);
});
