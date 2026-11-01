import { StrictMode, useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setActiveOrgId } from "@/lib/orgContext";
import { useChatStore } from "@/stores/chatStore";
import { useCommandBarStore } from "@/stores/commandBarStore";
import { ScopedDataProvider } from "./ScopedDataProvider";

const auth = vi.hoisted(() => ({ user: { id: "user-a" } as { id: string } | null, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
let request: () => Promise<string>;
let client: QueryClient;
function Consumer() {
  const activeClient = useQueryClient();
  useEffect(() => { client = activeClient; }, [activeClient]);
  const result = useQuery({ queryKey: ["private-finances"], queryFn: () => request(), staleTime: Infinity });
  return <><p>{result.data || "Loading private data"}</p><input aria-label="Workspace draft" /></>;
}
const show = () => <ScopedDataProvider><Consumer /></ScopedDataProvider>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
beforeEach(() => {
  localStorage.clear();
  auth.user = { id: "user-a" }; auth.loading = false;
  setActiveOrgId("org-a");
  useChatStore.getState().bindDataScope(null);
  request = vi.fn().mockResolvedValue("Private A");
});
afterEach(() => { cleanup(); localStorage.clear(); });

it("replaces cached finances, drafts and transient history when the account changes", async () => {
  const view = render(show());
  await screen.findByText("Private A");
  const retired = client;
  useCommandBarStore.getState().pushHistory("Private question A");
  useChatStore.setState({ messages: [{ id: "old", content: "Private answer A" } as never] });
  fireEvent.change(screen.getByLabelText("Workspace draft"), { target: { value: "Old account draft" } });
  const next = deferred<string>(); request = () => next.promise;
  auth.user = { id: "user-b" }; view.rerender(show());
  expect(screen.queryByText("Private A")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Workspace draft")).toHaveValue("");
  expect(useChatStore.getState().messages).toEqual([]);
  expect(useCommandBarStore.getState().history).toEqual([]);
  expect(retired.getQueryData(["private-finances"])).toBeUndefined();
  await act(async () => next.resolve("Private B"));
  expect(await screen.findByText("Private B")).toBeInTheDocument();
});

it("retires workspace queries and ignores late replies from a previous workspace", async () => {
  const old = deferred<string>(); request = () => old.promise;
  render(show());
  const retired = client;
  request = vi.fn().mockResolvedValue("Workspace B");
  act(() => setActiveOrgId("org-b"));
  expect(await screen.findByText("Workspace B")).toBeInTheDocument();
  await act(async () => old.resolve("Late private A"));
  expect(screen.queryByText("Late private A")).not.toBeInTheDocument();
  expect(client.getQueryData(["private-finances"])).toBe("Workspace B");
  expect(retired.getQueryData(["private-finances"])).toBeUndefined();
});

it("clears private cached data when signing out", async () => {
  const view = render(show());
  await screen.findByText("Private A");
  request = vi.fn().mockResolvedValue("Signed out");
  auth.user = null; view.rerender(show());
  expect(screen.queryByText("Private A")).not.toBeInTheDocument();
  expect(useChatStore.getState().dataScope).toBeNull();
  expect(await screen.findByText("Signed out")).toBeInTheDocument();
});

it("preserves the saved session for the same authenticated owner during boot", async () => {
  const scope = JSON.stringify(["user-a", "org-a"]);
  useChatStore.getState().bindDataScope(scope);
  useChatStore.setState({ currentSessionId: "owned-saved-session" });
  auth.loading = true; auth.user = null;
  const view = render(show());
  expect(useChatStore.getState().currentSessionId).toBe("owned-saved-session");
  auth.loading = false; auth.user = { id: "user-a" }; view.rerender(show());
  await screen.findByText("Private A");
  expect(useChatStore.getState().currentSessionId).toBe("owned-saved-session");
});

it("loads private queries under React StrictMode", async () => {
  render(<StrictMode>{show()}</StrictMode>);
  expect(await screen.findByText("Private A")).toBeInTheDocument();
  expect(client.getQueryData(["private-finances"])).toBe("Private A");
});
