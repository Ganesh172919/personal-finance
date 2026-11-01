import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setActiveOrgId } from "@/lib/orgContext";
import { FinancialCopilot } from "./FinancialCopilot";

const state = vi.hoisted(() => ({ userId: "user-a" as string | null, orgId: "org-a", processAICommand: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }));
vi.mock("@/hooks/useAppConfig", () => ({ useAppConfig: () => ({ data: { org: { id: state.orgId } } }) }));
vi.mock("@/lib/api/ai", () => ({ processAICommand: state.processAICommand }));
let client: QueryClient;
const key = (user = "user-a", org = "org-a") => `finwise_copilot_messages_v2:${user}:${org}`;
function save(storageKey: string, content: string) {
  sessionStorage.setItem(storageKey, JSON.stringify([{ id: "stored", role: "assistant", content, timestamp: "2026-10-29T12:00:00Z" }]));
}
function show() {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><FinancialCopilot /></QueryClientProvider>);
}
function open() { fireEvent.click(screen.getByRole("button", { name: "Open AI Copilot" })); }
beforeEach(() => { state.userId = "user-a"; state.orgId = "org-a"; sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); client?.clear(); vi.clearAllMocks(); });

it("restores only the current user's workspace history and ignores the legacy shared cache", () => {
  save("finwise_copilot_messages_v1", "Legacy shared private response");
  save(key(), "Account A response"); save(key("user-b"), "Account B response");
  const view = show(); open();
  expect(screen.getByText("Account A response")).toBeInTheDocument();
  expect(screen.queryByText("Legacy shared private response")).not.toBeInTheDocument();
  state.userId = "user-b";
  view.rerender(<QueryClientProvider client={client}><FinancialCopilot /></QueryClientProvider>); open();
  expect(screen.getByText("Account B response")).toBeInTheDocument();
  expect(screen.queryByText("Account A response")).not.toBeInTheDocument();
});

it("hides old organization context immediately and restores only the new scope after confirmation", () => {
  save(key(), "Workspace A response"); save(key("user-a", "org-b"), "Workspace B response");
  const view = show(); open();
  act(() => setActiveOrgId("org-b"));
  expect(screen.queryByText("Workspace A response")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open AI Copilot" })).not.toBeInTheDocument();
  state.orgId = "org-b";
  view.rerender(<QueryClientProvider client={client}><FinancialCopilot /></QueryClientProvider>); open();
  expect(screen.getByText("Workspace B response")).toBeInTheDocument();
});

it("keeps the direct answer visible and the full financial plan behind a disclosure", async () => {
  state.processAICommand.mockResolvedValue({ response: "Monthly income USD 7500.\nFINANCIAL PLAN\n====================\nFull planning detail" });
  show(); open();
  fireEvent.change(screen.getByRole("textbox", { name: "Question for AI Copilot" }), { target: { value: "What is my monthly income?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send question to AI Copilot" }));
  expect((await screen.findByText("Monthly income USD 7500.")).closest("details")).toBeNull();
  const details = screen.getByText("Full planning detail").closest("details");
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("View financial plan"));
  expect(details).toHaveAttribute("open");
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(key()) || "[]")).toHaveLength(2));
});

it("does not surface a late response after changing the signed-in user", async () => {
  let resolve!: (data: { response: string }) => void;
  state.processAICommand.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = show(); open();
  fireEvent.change(screen.getByRole("textbox", { name: "Question for AI Copilot" }), { target: { value: "My budget" } });
  fireEvent.click(screen.getByRole("button", { name: "Send question to AI Copilot" }));
  await waitFor(() => expect(state.processAICommand).toHaveBeenCalled());
  state.userId = "user-b";
  view.rerender(<QueryClientProvider client={client}><FinancialCopilot /></QueryClientProvider>); open();
  await act(async () => { resolve({ response: "Late account A response" }); });
  expect(screen.queryByText("Late account A response")).not.toBeInTheDocument();
  expect(sessionStorage.getItem(key("user-b"))).not.toContain("Late account A response");
});
