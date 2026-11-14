import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AllInsights from "./AllInsights";
import { IAgentOutput } from "@/types";

const navigateMock = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/all-insights", navigateMock],
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "test@finwise.dev" },
  }),
}));

vi.mock("@/components/InsightDetailModal", () => ({
  InsightDetailModal: ({ isOpen, insightId, onClose }: any) =>
    isOpen ? (
      <div data-testid="insight-detail-modal">
        <span>Modal for {insightId}</span>
        <button onClick={onClose} data-testid="button-close-modal">
          Close
        </button>
      </div>
    ) : null,
}));

const mockInsights: IAgentOutput[] = [
  {
    id: "insight-1",
    agentType: "debt_optimizer",
    priority: "high",
    actionable: true,
    outputData: {
      title: "High-Interest Credit Card Paydown Plan",
      description: "Pay down the $1,200 balance on card ending in 4021 at 22% APR to save $240/yr.",
      actionType: "manage_debt",
    },
    analysis_type: "debt_avalanche",
    agents_involved: ["debt_optimizer"],
    timestamp: "2026-10-28T10:00:00.000Z",
  },
  {
    id: "insight-2",
    agentType: "budget_planner",
    priority: "medium",
    actionable: true,
    outputData: {
      title: "Dining Out Exceeded 50/30/20 Allocation",
      description: "Dining expenses reached 18% of take-home pay, exceeding the 10% target.",
      actionType: "review_budget",
    },
    analysis_type: "budget_variance",
    agents_involved: ["budget_planner"],
    timestamp: "2026-10-27T14:30:00.000Z",
  },
  {
    id: "insight-3",
    agentType: "investment_advisor",
    priority: "low",
    actionable: true,
    outputData: {
      title: "Index Fund SIP Dollar-Cost Averaging",
      description: "Consistent monthly SIP of $200 projected to accumulate $15,000 in 5 years.",
      actionType: "invest",
    },
    analysis_type: "investment_projection",
    agents_involved: ["investment_advisor"],
    timestamp: "2026-10-26T09:15:00.000Z",
  },
];

function renderWithClient(ui: React.ReactElement, initialData: IAgentOutput[] = mockInsights) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: () => initialData,
      },
    },
  });
  queryClient.setQueryData(["/api/agent-outputs/user", "user-123"], initialData);

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("AllInsights page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders page header, metric counters, and all insights", () => {
    renderWithClient(<AllInsights />);

    expect(screen.getByTestId("all-insights-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All AI-Generated Insights" })).toBeInTheDocument();

    // Metric Badges
    expect(screen.getByTestId("metric-total-insights")).toHaveTextContent("3");
    expect(screen.getByTestId("metric-high-priority")).toHaveTextContent("1");
    expect(screen.getByTestId("metric-actionable-plans")).toHaveTextContent("3");

    // All 3 cards present
    expect(screen.getByTestId("insight-insight-1")).toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-2")).toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-3")).toBeInTheDocument();

    // Check specific content
    expect(screen.getByText("High-Interest Credit Card Paydown Plan")).toBeInTheDocument();
    expect(screen.getByText("Dining Out Exceeded 50/30/20 Allocation")).toBeInTheDocument();
    expect(screen.getByText("Index Fund SIP Dollar-Cost Averaging")).toBeInTheDocument();
  });

  it("filters insights by priority when clicking priority filter pills", () => {
    renderWithClient(<AllInsights />);

    // Click High priority filter
    fireEvent.click(screen.getByTestId("filter-priority-high"));

    expect(screen.getByTestId("insight-insight-1")).toBeInTheDocument();
    expect(screen.queryByTestId("insight-insight-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("insight-insight-3")).not.toBeInTheDocument();

    // Click Medium priority filter
    fireEvent.click(screen.getByTestId("filter-priority-medium"));

    expect(screen.queryByTestId("insight-insight-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-2")).toBeInTheDocument();
    expect(screen.queryByTestId("insight-insight-3")).not.toBeInTheDocument();

    // Restore All filter
    fireEvent.click(screen.getByTestId("filter-priority-all"));

    expect(screen.getByTestId("insight-insight-1")).toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-2")).toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-3")).toBeInTheDocument();
  });

  it("filters insights by text search query", () => {
    renderWithClient(<AllInsights />);

    const searchInput = screen.getByTestId("input-search-insights");
    fireEvent.change(searchInput, { target: { value: "credit card" } });

    expect(screen.getByTestId("insight-insight-1")).toBeInTheDocument();
    expect(screen.queryByTestId("insight-insight-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("insight-insight-3")).not.toBeInTheDocument();

    // Clear filters button appears and resets list
    const clearBtn = screen.getByTestId("button-clear-filters");
    fireEvent.click(clearBtn);

    expect(screen.getByTestId("insight-insight-1")).toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-2")).toBeInTheDocument();
    expect(screen.getByTestId("insight-insight-3")).toBeInTheDocument();
  });

  it("opens InsightDetailModal when an insight card is clicked", async () => {
    renderWithClient(<AllInsights />);

    const card = screen.getByTestId("insight-insight-1");
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("insight-detail-modal")).toBeInTheDocument();
      expect(screen.getByText("Modal for insight-1")).toBeInTheDocument();
    });

    // Close modal
    fireEvent.click(screen.getByTestId("button-close-modal"));
    await waitFor(() => {
      expect(screen.queryByTestId("insight-detail-modal")).not.toBeInTheDocument();
    });
  });

  it("navigates to relevant feature page when clicking Take Action button", () => {
    renderWithClient(<AllInsights />);

    // Test manage_debt action button -> /goals-and-debts
    const debtActionBtn = screen.getByTestId("button-manage_debt");
    fireEvent.click(debtActionBtn);
    expect(navigateMock).toHaveBeenCalledWith("/goals-and-debts");

    // Test invest action button -> /portfolio
    const investActionBtn = screen.getByTestId("button-invest");
    fireEvent.click(investActionBtn);
    expect(navigateMock).toHaveBeenCalledWith("/portfolio");

    // Test review_budget action button -> /scenarios
    const budgetActionBtn = screen.getByTestId("button-review_budget");
    fireEvent.click(budgetActionBtn);
    expect(navigateMock).toHaveBeenCalledWith("/scenarios");
  });

  it("renders empty state with Ask Copilot action when no insights exist", () => {
    renderWithClient(<AllInsights />, []);

    expect(screen.getByText("No Insights Available Yet")).toBeInTheDocument();
    const chatBtn = screen.getByTestId("button-chat-empty-state");
    expect(chatBtn).toBeInTheDocument();

    fireEvent.click(chatBtn);
    expect(navigateMock).toHaveBeenCalledWith("/chat");
  });
});
