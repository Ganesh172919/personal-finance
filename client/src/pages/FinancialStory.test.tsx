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

it("labels completed goals as achieved (not overdue) and guards zero targets", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  try {
    api.apiClient.mockImplementation(async (path: string) => path === "/financial-profiles/me" ? {
      savings: 0,
      goals: [
        { name: "Done Past", target: 1000, current: 1000, deadline: "2026-01-01", priority: 1 },
        { name: "Year Out", target: 1200, current: 0, deadline: "2027-11-08", priority: 1 },
        { name: "Zero Target", target: 0, current: 0, deadline: "2027-01-01", priority: 1 },
      ],
    } : []);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><FinancialStory /></QueryClientProvider>);
    const done = await screen.findByTestId("story-goal-done-past");
    expect(done).toHaveTextContent("Achieved");
    expect(done).not.toHaveTextContent("Overdue");
    // 364.5 days away is 12 months on the Goals & Debts page's 30.4375-day month, not 13.
    expect(screen.getByTestId("story-goal-year-out")).toHaveTextContent("12 months left");
    expect(screen.getByTestId("story-goal-zero-target")).toHaveTextContent("0% complete");
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
