import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setActiveOrgId } from "@/lib/orgContext";
import { ConversationInsightsPanel } from "./ConversationInsightsPanel";
import { ApiError } from "@/lib/apiError";

const mocks = vi.hoisted(() => ({ userId: "user-a", fetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock("@/services/chatApi", () => ({ fetchConversationInsights: mocks.fetch }));
let client: QueryClient;
const snapshot = (response: string, cache_hit = false) => ({
  response, cache_hit, sessions_considered: 2, generated_at: "2026-10-30T08:00:00Z",
});
function show() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ConversationInsightsPanel /></QueryClientProvider>);
}
beforeEach(() => { mocks.userId = "user-a"; mocks.fetch.mockReset(); setActiveOrgId("org-a"); });
afterEach(() => { cleanup(); client.clear(); localStorage.clear(); });

it("marks a reused summary and explicitly bypasses cache on Refresh", async () => {
  mocks.fetch.mockResolvedValueOnce(snapshot("Existing summary", true)).mockResolvedValueOnce(snapshot("Fresh summary"));
  show();
  expect(await screen.findByText("Existing summary")).toBeInTheDocument();
  expect(screen.getByText("Saved summary")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh conversation insights" }));
  expect(await screen.findByText("Fresh summary")).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenLastCalledWith({ refresh: true, orgId: "org-a" });
  expect(screen.queryByText("Saved summary")).not.toBeInTheDocument();
});

it("retains the previous summary when explicit refresh fails", async () => {
  mocks.fetch.mockResolvedValueOnce(snapshot("Keep this summary")).mockRejectedValueOnce(new Error("Unavailable"));
  show();
  await screen.findByText("Keep this summary");
  fireEvent.click(screen.getByRole("button", { name: "Refresh conversation insights" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
  expect(screen.getByText("Keep this summary")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh conversation insights" })).toBeEnabled();
});

it("explains a basic recap without exposing its internal agent name", async () => {
  mocks.fetch.mockResolvedValue({ ...snapshot("Saved conversation recap"), fallback_used: true,
    agents_involved: ["conversation_summarizer"] });
  show();
  expect(await screen.findByText("Basic summary")).toHaveAttribute("title", expect.stringContaining("AI narration"));
  expect(screen.queryByText("conversation_summarizer")).not.toBeInTheDocument();
});

it("keeps a late refresh response out of another workspace", async () => {
  let finish!: (value: unknown) => void;
  mocks.fetch.mockResolvedValueOnce(snapshot("Workspace A summary"))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(snapshot("Workspace B summary"));
  show();
  await screen.findByText("Workspace A summary");
  fireEvent.click(screen.getByRole("button", { name: "Refresh conversation insights" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  act(() => setActiveOrgId("org-b"));
  expect(await screen.findByText("Workspace B summary")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh conversation insights" })).toBeEnabled();
  await act(async () => finish(snapshot("Late private A summary")));
  expect(screen.queryByText("Late private A summary")).not.toBeInTheDocument();
  expect(screen.getByText("Workspace B summary")).toBeInTheDocument();
});

it("explains a quota failure and keeps the previous summary available", async () => {
  mocks.fetch.mockResolvedValueOnce(snapshot("Keep my previous summary"))
    .mockRejectedValueOnce(new ApiError("Limit reached", { status: 402, code: "FEATURE_LIMIT_REACHED" }));
  show();
  await screen.findByText("Keep my previous summary");
  fireEvent.click(screen.getByRole("button", { name: "Refresh conversation insights" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("monthly AI limit");
  expect(screen.getByRole("link", { name: "View plan limits" })).toHaveAttribute("href", "/billing");
  expect(screen.getByText("Keep my previous summary")).toBeInTheDocument();
});

it("does not reuse the previous user's query state", async () => {
  mocks.fetch.mockResolvedValueOnce(snapshot("User A summary")).mockResolvedValueOnce(snapshot("User B summary"));
  const view = show();
  await screen.findByText("User A summary");
  mocks.userId = "user-b";
  view.rerender(<QueryClientProvider client={client}><ConversationInsightsPanel /></QueryClientProvider>);
  expect(await screen.findByText("User B summary")).toBeInTheDocument();
  expect(screen.queryByText("User A summary")).not.toBeInTheDocument();
});

it("keeps the full plan optional and avoids a second primary heading", async () => {
  mocks.fetch.mockResolvedValue(snapshot("Direct summary\nFINANCIAL PLAN\n==================\nPlan details"));
  const view = show();
  await screen.findByText("Direct summary");
  const disclosure = screen.getByText("View full financial plan").closest("details");
  expect(disclosure).not.toHaveAttribute("open");
  expect(view.container.querySelectorAll("h1")).toHaveLength(0);
});

it("rechecks context on mount even when a previous summary was just cached", async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(["/api/chat/insights/conversation", "user-a", "org-a"], snapshot("Before the latest chat"));
  mocks.fetch.mockResolvedValue(snapshot("Includes the latest chat"));
  render(<QueryClientProvider client={client}><ConversationInsightsPanel /></QueryClientProvider>);
  expect(await screen.findByText("Includes the latest chat")).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledWith({ orgId: "org-a" });
});
