import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import FinancialStory from "./FinancialStory";

const api = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock("@/lib/api/core", () => api);
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "qa-user" } }) }));
vi.mock("@/hooks/useOrgFormatters", () => ({ useOrgFormatters: () => ({ formatMoney: (value: number) => `USD ${value}` }) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/apiClient", () => ({ createFinancialStoryShare: vi.fn() }));
vi.mock("@/components/GoalDetailModal", () => ({ GoalDetailModal: () => null }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.clearAllMocks(); });

it("loads full milestone records instead of the lightweight recent-output index", async () => {
  api.apiClient.mockImplementation(async (path: string) => path === "/financial-profiles/me" ? { goals: [] } : [
    { id: "milestone", agentType: "master", outputData: { title: "Saved budget review", description: "Reviewed the current budget" }, timestamp: "2026-10-29T10:00:00Z" },
  ]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><FinancialStory /></QueryClientProvider>);
  expect(await screen.findByText("Saved budget review")).toBeInTheDocument();
  expect(screen.getByText("Reviewed the current budget")).toBeInTheDocument();
  expect(api.apiClient).toHaveBeenCalledWith("/agent-outputs/user/qa-user?limit=20");
  expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
});
