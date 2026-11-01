import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Dashboard from "./Dashboard";

const apiMocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  fetchSessions: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Alex Mercer", email: "alex@finwise.dev" },
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  getDashboardSummary: apiMocks.getDashboardSummary,
}));

vi.mock("@/services/chatApi", () => ({
  fetchSessions: apiMocks.fetchSessions,
}));

vi.mock("@/components/AiCommandBar", () => ({
  AICommandBar: () => <div data-testid="mock-ai-command-bar" />,
}));
vi.mock("@/components/ActionableInsights", () => ({
  ActionableInsights: () => <div data-testid="mock-actionable-insights" />,
}));
vi.mock("@/components/BudgetHealthCard", () => ({
  default: () => <div data-testid="mock-budget-health-card" />,
}));
vi.mock("@/components/CommandCenter", () => ({
  default: () => <div data-testid="mock-command-center" />,
}));
vi.mock("@/components/ConversationInsightsPanel", () => ({
  ConversationInsightsPanel: () => <div data-testid="mock-conversation-insights" />,
}));
vi.mock("@/components/FinancialVitals", () => ({
  FinancialVitals: () => <div data-testid="mock-financial-vitals" />,
}));
vi.mock("@/components/GoalProgress", () => ({
  GoalProgress: () => <div data-testid="mock-goal-progress" />,
}));
vi.mock("@/components/InvestmentPortfolio", () => ({
  InvestmentPortfolio: () => <div data-testid="mock-investment-portfolio" />,
}));

const mockSummary = {
  cash_flow: { monthly_income: 6000, monthly_expenses: 3500, net: 2500, savings_rate_pct: 41.7 },
  savings: { balance: 12000, emergency_fund_months: 3.4 },
  goals: { total_count: 2, on_track: 2, total_target: 20000, total_current: 12000, progress_pct: 60 },
  debts: { total_balance: 5000, count: 1, debt_to_income_pct: 7 },
  review_queue: {
    needs_attention: 7,
    uncategorized: 4,
    needs_merchant_match: 2,
    suspected_duplicates: 1,
    recurring_candidates: 3,
  },
  monthly_close: {
    period_key: "2026-10",
    status: "in_progress",
    totals: { income: 6000, expenses: 3500, net: 2500, tx_count: 42 },
    budget: { planned: 4000, spent: 3500, remaining: 500, unbudgeted_spent: 150 },
    ready_to_close: false,
  },
  signals: {
    anomalies: [
      { id: "anom-1", title: "Unusual utility bill", severity: "medium", metric: 240, detail: "Electric bill 65% higher than 3-month median" },
      { id: "anom-2", title: "Duplicate charge", severity: "high", metric: 85, detail: "Potential duplicate at Coffee Shop" },
    ],
    recurring_candidates: [
      { id: "rec-1", title: "Gym Membership", confidence: 0.95, cadence: "monthly" },
    ],
    upcoming_reminders: 2,
  },
  completeness: {
    has_income: true,
    has_expenses: true,
    has_goals: true,
    has_debts: true,
    has_transactions: true,
  },
};

const mockSessions = {
  sessions: [
    { id: "sess-1", title: "October Budget Review", lastMessageAt: "2026-10-29T14:30:00Z" },
    { id: "sess-2", title: "Emergency Fund Planning", lastMessageAt: "2026-10-28T10:15:00Z" },
  ],
  total: 2,
};

let queryClient: QueryClient;

function renderDashboard() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    queryClient?.clear();
  });

  it("renders personalized greeting, date, and quick-launch action cards", async () => {
    apiMocks.fetchSessions.mockResolvedValue({ sessions: [], total: 0 });
    apiMocks.getDashboardSummary.mockResolvedValue(mockSummary);

    renderDashboard();

    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent(/Alex/);
    expect(screen.getByText(/Track your money, check your goals, and ask the assistant for help/i)).toBeInTheDocument();

    expect(screen.getByTestId("quick-launch-chat")).toHaveAttribute("href", "/chat");
    expect(screen.getByTestId("quick-launch-transactions")).toHaveAttribute("href", "/transactions");
    expect(screen.getByTestId("quick-launch-files")).toHaveAttribute("href", "/files");
    expect(screen.getByTestId("quick-launch-goals-debts")).toHaveAttribute("href", "/goals-debts");

    expect(screen.getByTestId("mock-financial-vitals")).toBeInTheDocument();
    expect(screen.getByTestId("mock-command-center")).toBeInTheDocument();
    expect(screen.getByTestId("mock-budget-health-card")).toBeInTheDocument();
    expect(screen.getByTestId("mock-goal-progress")).toBeInTheDocument();
    expect(screen.getByTestId("mock-investment-portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("mock-actionable-insights")).toBeInTheDocument();
  });

  it("renders recent conversations when loaded and links to chat sessions", async () => {
    apiMocks.fetchSessions.mockResolvedValue(mockSessions);
    apiMocks.getDashboardSummary.mockResolvedValue(mockSummary);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("recent-session-sess-1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("recent-session-sess-1")).toHaveAttribute("href", "/chat/sess-1");
    expect(screen.getByText("October Budget Review")).toBeInTheDocument();
    expect(screen.getByTestId("recent-session-sess-2")).toHaveAttribute("href", "/chat/sess-2");
    expect(screen.getByText("Emergency Fund Planning")).toBeInTheDocument();

    expect(screen.getByTestId("open-chat-btn")).toBeInTheDocument();
    expect(screen.getByTestId("open-files-btn")).toBeInTheDocument();
  });

  it("displays empty state when there are no recent chat sessions", async () => {
    apiMocks.fetchSessions.mockResolvedValue({ sessions: [], total: 0 });
    apiMocks.getDashboardSummary.mockResolvedValue(mockSummary);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("no-recent-sessions")).toBeInTheDocument();
    });

    expect(screen.getByText(/No recent chat sessions yet/i)).toBeInTheDocument();
  });

  it("renders Trust and Close metrics, review queue counts, and proactive anomalies", async () => {
    apiMocks.fetchSessions.mockResolvedValue({ sessions: [], total: 0 });
    apiMocks.getDashboardSummary.mockResolvedValue(mockSummary);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("trust-and-close-section")).toBeInTheDocument();
    });

    expect(screen.getByTestId("review-queue-count")).toHaveTextContent("7");
    expect(screen.getByTestId("review-queue-details")).toHaveTextContent(/4 uncategorized/);
    expect(screen.getByTestId("review-queue-details")).toHaveTextContent(/1 duplicate groups/);
    expect(screen.getByTestId("review-queue-details")).toHaveTextContent(/2 merchant matches/);
    expect(screen.getByTestId("open-review-queue-btn")).toBeInTheDocument();

    expect(screen.getByTestId("monthly-close-status")).toHaveTextContent("In progress");
    expect(screen.getByTestId("monthly-close-details")).toHaveTextContent(/2026-10 net 2500/);
    expect(screen.getByTestId("monthly-close-details")).toHaveTextContent(/150 unbudgeted spend/);
    expect(screen.getByTestId("inspect-budget-btn")).toBeInTheDocument();

    expect(screen.getByTestId("proactive-signals-count")).toHaveTextContent("2");
    expect(screen.getByTestId("proactive-signals-summary")).toHaveTextContent(/1 recurring candidates/);
    expect(screen.getByTestId("proactive-signals-summary")).toHaveTextContent(/2 upcoming reminders/);

    expect(screen.getByTestId("signal-anom-1")).toHaveTextContent(/Unusual utility bill/);
    expect(screen.getByTestId("signal-anom-2")).toHaveTextContent(/Duplicate charge/);
  });

  it("renders monthly close as 'Ready' when ready_to_close is true", async () => {
    const readySummary = {
      ...mockSummary,
      monthly_close: {
        ...mockSummary.monthly_close,
        ready_to_close: true,
      },
    };

    apiMocks.fetchSessions.mockResolvedValue({ sessions: [], total: 0 });
    apiMocks.getDashboardSummary.mockResolvedValue(readySummary);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("monthly-close-status")).toHaveTextContent("Ready");
    });
  });

  it("handles loading or absent dashboard summary gracefully without crashing", async () => {
    apiMocks.fetchSessions.mockResolvedValue({ sessions: [], total: 0 });
    apiMocks.getDashboardSummary.mockResolvedValue(null);

    renderDashboard();

    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("trust-and-close-section")).not.toBeInTheDocument();
  });
});
