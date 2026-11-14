import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetHealthCard from "./BudgetHealthCard";

const workspace = vi.hoisted(() => ({ currency: "USD", locale: "en-US" }));
vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    currency: workspace.currency,
    formatMoney: (amount: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(workspace.locale, {
        style: "currency",
        currency: workspace.currency,
        ...options,
      }).format(amount),
  }),
}));

const apiTransactions = vi.hoisted(() => ({
  getBudgetHealth: vi.fn(),
}));

vi.mock("@/lib/api/transactions", () => ({
  ...apiTransactions,
}));

const apiFinance = vi.hoisted(() => ({
  rebalanceBudgetAllocations: vi.fn(),
}));

vi.mock("@/lib/api/v1/finance", () => ({
  ...apiFinance,
}));

const apiTasks = vi.hoisted(() => ({
  createTask: vi.fn(),
}));

vi.mock("@/lib/api/tasks", () => ({
  ...apiTasks,
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockBudgetHealthData = {
  generated_at: "2026-10-31T12:00:00Z",
  period_key: "2026-10",
  health_score: {
    data_available: true,
    total: 82,
    budget_adherence: 34,
    review_cleanliness: 18,
    goal_progress: 15,
    debt_management: 15,
  },
  burn_rate_alerts: [
    {
      category: "Dining Out",
      severity: "critical" as const,
      message: "Burned 88% of budget with 35% of the month left.",
    },
    {
      category: "Shopping",
      severity: "warning" as const,
      message: "Trending 15% ahead of planned pace.",
    },
  ],
  pace_comparison: {
    current_week_avg_daily: 95.5,
    last_week_avg_daily: 120,
    monthly_avg_daily: 105,
    trend: "improving" as const,
  },
  projection: {
    if_you_continue: "At this pace, you'll finish the month $240 under budget. Nice!",
    projected_month_end_spend: 3260,
    budget_planned: 3500,
    delta: -240,
  },
  predictive_spending_limits: [
    {
      category: "Dining Out",
      planned: 500,
      spent: 450,
      remaining: 50,
      days_remaining: 10,
      current_daily_spend: 22.5,
      safe_daily_spend: 5,
      projected_eom: 675,
      overshoot_risk: true,
      overshoot_amount: 175,
      recommended_cap: 50,
      daily_reduction_required: 17.5,
      status: "critical" as const,
    },
    {
      category: "Groceries",
      planned: 600,
      spent: 300,
      remaining: 300,
      days_remaining: 10,
      current_daily_spend: 15,
      safe_daily_spend: 30,
      projected_eom: 450,
      overshoot_risk: false,
      overshoot_amount: 0,
      recommended_cap: 300,
      daily_reduction_required: 0,
      status: "safe" as const,
    },
    {
      category: "Shopping",
      planned: 300,
      spent: 240,
      remaining: 60,
      days_remaining: 10,
      current_daily_spend: 12,
      safe_daily_spend: 6,
      projected_eom: 360,
      overshoot_risk: true,
      overshoot_amount: 60,
      recommended_cap: 60,
      daily_reduction_required: 6,
      status: "caution" as const,
    },
  ],
  predictive_limits_summary: {
    days_remaining: 10,
    total_safe_daily_spend: 41,
    categories_at_risk: 2,
    total_daily_reduction_required: 23.5,
  },
  proactive_savings_recommendations: [
    {
      id: "cap-dining-out",
      title: "Cap Dining Out spending to $5/day",
      category: "Dining Out",
      impact_monthly_savings: 175,
      score_impact_pts: 8,
      difficulty: "moderate" as const,
      reasoning: "Spending in Dining Out is running at $22.5/day ($450 spent of $500 planned). Capping to $5/day for remaining 10 days prevents $175 budget overshoot.",
      action_type: "create_task" as const,
      suggested_task_title: "Enforce $5/day spending limit on Dining Out for remainder of month",
    },
    {
      id: "trim-shopping",
      title: "15% discretionary micro-trim on Shopping",
      category: "Shopping",
      impact_monthly_savings: 36,
      score_impact_pts: 3,
      difficulty: "easy" as const,
      reasoning: "A modest 15% reduction on Shopping unlocks $36/mo in monthly surplus without impacting essential obligations.",
      action_type: "create_task" as const,
      suggested_task_title: "Audit Shopping non-essential purchases to save $36/mo",
    },
  ],
  savings_potential_summary: {
    total_monthly_savings: 211,
    potential_score_improvement: 11,
    recommended_actions_count: 2,
  },
  peer_benchmarks: [
    {
      category: "Dining Out",
      user_spend: 450,
      user_pct_of_income: 11.2,
      peer_median_pct: 12.0,
      peer_p25_pct: 8.0,
      peer_p75_pct: 16.0,
      delta_vs_peer_median: -0.8,
      monthly_dollar_delta: -32,
      status: "aligned" as const,
      benchmark_description: "Aligned: Spending is 11.2% of income, well within typical peer bounds (8.0%–16.0%).",
    },
    {
      category: "Groceries",
      user_spend: 300,
      user_pct_of_income: 6.5,
      peer_median_pct: 10.0,
      peer_p25_pct: 7.0,
      peer_p75_pct: 13.5,
      delta_vs_peer_median: -3.5,
      monthly_dollar_delta: -140,
      status: "frugal" as const,
      benchmark_description: "Top Saver: Your spending is 6.5% of income, significantly below peer median (10%).",
    },
    {
      category: "Shopping",
      user_spend: 240,
      user_pct_of_income: 11.5,
      peer_median_pct: 6.5,
      peer_p25_pct: 4.0,
      peer_p75_pct: 10.0,
      delta_vs_peer_median: 5.0,
      monthly_dollar_delta: 200,
      status: "elevated" as const,
      benchmark_description: "Elevated: Spending is 11.5% of income vs peer median of 6.5% (+$200/mo above peers).",
    },
  ],
  peer_benchmarking_summary: {
    available: true,
    cohort_name: "Standard Household Peer Cohort",
    alignment_index: 86,
    frugal_categories_count: 1,
    elevated_categories_count: 1,
    top_peer_savings_opportunity: "Shopping",
  },
  auto_rebalance_plan: {
    period_key: "2026-10",
    needed: true,
    transfers: [
      {
        from_category: "Groceries",
        to_category: "Dining Out",
        amount: 50,
        reason: "Transfer $50 surplus from Groceries to cover Dining Out overrun without increasing total budget",
      },
    ],
    proposed_allocations: [
      {
        category: "Groceries",
        current_planned: 600,
        recommended_planned: 550,
        delta: -50,
        status: "surplus_donated" as const,
      },
      {
        category: "Dining Out",
        current_planned: 500,
        recommended_planned: 550,
        delta: 50,
        status: "deficit_buffered" as const,
      },
    ],
    total_rebalanced_amount: 50,
    envelopes_stabilized: 1,
    budget_preserved: true,
  },
};

describe("BudgetHealthCard Component", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    workspace.currency = "USD";
    workspace.locale = "en-US";
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    apiTransactions.getBudgetHealth.mockResolvedValue(mockBudgetHealthData);
    apiFinance.rebalanceBudgetAllocations.mockResolvedValue({
      message: "Budget allocations successfully rebalanced",
      period_key: "2026-10",
      transfers_executed: 1,
      total_rebalanced: 50,
      allocations: [
        { category: "Groceries", amount: 550, currency: "USD", previous_amount: 600, delta: -50 },
        { category: "Dining Out", amount: 550, currency: "USD", previous_amount: 500, delta: 50 },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderBudgetHealth = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BudgetHealthCard />
      </QueryClientProvider>,
    );
  };

  it("renders 82 health score gauge and 4 pillar score breakdowns", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("budget-health-card")).toBeInTheDocument();
    });

    // Score gauge
    expect(screen.getByTestId("health-score-gauge")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();

    // 4 Pillars
    expect(screen.getByTestId("score-breakdown-adherence")).toHaveTextContent("Budget Adherence");
    expect(screen.getByTestId("score-breakdown-adherence")).toHaveTextContent("34/40");

    expect(screen.getByTestId("score-breakdown-review")).toHaveTextContent("Review Cleanliness");
    expect(screen.getByTestId("score-breakdown-review")).toHaveTextContent("18/20");

    expect(screen.getByTestId("score-breakdown-goal")).toHaveTextContent("Goal Progress");
    expect(screen.getByTestId("score-breakdown-goal")).toHaveTextContent("15/20");

    expect(screen.getByTestId("score-breakdown-debt")).toHaveTextContent("Debt Management");
    expect(screen.getByTestId("score-breakdown-debt")).toHaveTextContent("15/20");
  });

  it("renders spending trend projection and daily week-over-week averages", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("budget-health-projection")).toBeInTheDocument();
    });

    const projection = screen.getByTestId("budget-health-projection");
    expect(projection).toHaveTextContent("Spending Trend: Improving");
    expect(projection).toHaveTextContent("At this pace, you'll finish the month $240 under budget. Nice!");
    expect(projection).toHaveTextContent("This week: $96/day");
    expect(projection).toHaveTextContent("Last week: $120/day");
  });

  it("renders category burn rate alerts", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("budget-health-alerts")).toBeInTheDocument();
    });

    const diningAlert = screen.getByTestId("alert-chip-dining-out");
    expect(diningAlert).toHaveTextContent("Dining Out");
    expect(diningAlert).toHaveTextContent("Burned 88% of budget with 35% of the month left.");

    const shoppingAlert = screen.getByTestId("alert-chip-shopping");
    expect(shoppingAlert).toHaveTextContent("Shopping");
    expect(shoppingAlert).toHaveTextContent("Trending 15% ahead of planned pace.");
  });

  it("renders clean empty state when data is not yet available", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      health_score: {
        ...mockBudgetHealthData.health_score,
        data_available: false,
      },
    });

    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("budget-health-empty")).toBeInTheDocument();
    });

    expect(screen.getByText("Add transactions, a budget, or goals to calculate your financial health score.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /set up a budget/i })).toHaveAttribute("href", "/finance?tab=budgets");

    // Projections and alerts should not be rendered
    expect(screen.queryByTestId("budget-health-projection")).not.toBeInTheDocument();
    expect(screen.queryByTestId("budget-health-alerts")).not.toBeInTheDocument();
    expect(screen.queryByTestId("predictive-spending-limits")).not.toBeInTheDocument();
  });

  it("renders predictive spending limits section with safe daily allowances and dynamic recommended caps", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("predictive-spending-limits")).toBeInTheDocument();
    });

    // Summary headers
    expect(screen.getByTestId("badge-days-remaining")).toHaveTextContent("10d remaining");
    expect(screen.getByTestId("metric-total-safe-daily")).toHaveTextContent("$41/day total safe");
    expect(screen.getByTestId("badge-categories-at-risk")).toHaveTextContent("2 at risk");

    // Groceries envelope (safe)
    const groceries = screen.getByTestId("predictive-limit-groceries");
    expect(groceries).toBeInTheDocument();
    expect(screen.getByTestId("badge-status-groceries")).toHaveTextContent("On Track");
    expect(screen.getByTestId("metric-safe-daily-groceries")).toHaveTextContent("$30/day");
    expect(screen.getByTestId("metric-recommended-cap-groceries")).toHaveTextContent("$300");

    // Shopping envelope (caution)
    const shopping = screen.getByTestId("predictive-limit-shopping");
    expect(shopping).toBeInTheDocument();
    expect(screen.getByTestId("badge-status-shopping")).toHaveTextContent("Caution");
    expect(screen.getByTestId("metric-safe-daily-shopping")).toHaveTextContent("$6/day");
    expect(screen.getByTestId("metric-recommended-cap-shopping")).toHaveTextContent("$60");
  });

  it("displays category overshoot warning and daily reduction required callout", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("predictive-spending-limits")).toBeInTheDocument();
    });

    // Dining Out is critical and requires reduction
    expect(screen.getByTestId("badge-status-dining-out")).toHaveTextContent("Critical");
    expect(screen.getByTestId("metric-safe-daily-dining-out")).toHaveTextContent("$5/day");
    expect(screen.getByTestId("metric-reduction-required-dining-out")).toHaveTextContent(
      "Reduce spend by $18/day to stay on budget"
    );

    // Shopping requires reduction
    expect(screen.getByTestId("metric-reduction-required-shopping")).toHaveTextContent(
      "Reduce spend by $6/day to stay on budget"
    );
  });

  it("correctly handles exhausted envelopes with 0 safe daily spend and critical status", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      predictive_spending_limits: [
        {
          category: "Entertainment",
          planned: 200,
          spent: 240,
          remaining: -40,
          days_remaining: 10,
          current_daily_spend: 12,
          safe_daily_spend: 0,
          projected_eom: 360,
          overshoot_risk: true,
          overshoot_amount: 160,
          recommended_cap: 0,
          daily_reduction_required: 16,
          status: "critical" as const,
        },
      ],
      predictive_limits_summary: {
        days_remaining: 10,
        total_safe_daily_spend: 0,
        categories_at_risk: 1,
        total_daily_reduction_required: 16,
      },
    });

    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("predictive-limit-entertainment")).toBeInTheDocument();
    });

    expect(screen.getByTestId("badge-status-entertainment")).toHaveTextContent("Critical");
    expect(screen.getByTestId("metric-safe-daily-entertainment")).toHaveTextContent("$0/day");
    expect(screen.getByTestId("metric-recommended-cap-entertainment")).toHaveTextContent("$0");
    expect(screen.getByTestId("metric-reduction-required-entertainment")).toHaveTextContent(
      "Reduce spend by $16/day to stay on budget"
    );
  });

  it("renders proactive savings recommendations and potential savings summary badges", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("proactive-savings-recommendations")).toBeInTheDocument();
    });

    // Summary indicators
    expect(screen.getByTestId("badge-total-potential-savings")).toHaveTextContent("Save up to $211/mo");
    expect(screen.getByTestId("badge-potential-score-bump")).toHaveTextContent("+11 pts score potential");

    // Dining Out recommendation card
    expect(screen.getByTestId("rec-card-cap-dining-out")).toBeInTheDocument();
    expect(screen.getByText("Cap Dining Out spending to $5/day")).toBeInTheDocument();
    expect(screen.getByTestId("badge-rec-difficulty-cap-dining-out")).toHaveTextContent("moderate");
    expect(screen.getByTestId("badge-rec-savings-cap-dining-out")).toHaveTextContent("+$175/mo");
    expect(screen.getByTestId("badge-rec-score-cap-dining-out")).toHaveTextContent("+8 pts");

    // Shopping recommendation card
    expect(screen.getByTestId("rec-card-trim-shopping")).toBeInTheDocument();
    expect(screen.getByText("15% discretionary micro-trim on Shopping")).toBeInTheDocument();
    expect(screen.getByTestId("badge-rec-difficulty-trim-shopping")).toHaveTextContent("easy");
    expect(screen.getByTestId("badge-rec-savings-trim-shopping")).toHaveTextContent("+$36/mo");
    expect(screen.getByTestId("badge-rec-score-trim-shopping")).toHaveTextContent("+3 pts");
  });

  it("allows user to 1-click schedule an action task from a proactive recommendation", async () => {
    apiTasks.createTask.mockResolvedValueOnce({
      task: {
        id: "task-rec-123",
        title: "Enforce $5/day spending limit on Dining Out for remainder of month",
      },
    });

    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("btn-apply-recommendation-cap-dining-out")).toBeInTheDocument();
    });

    // Click Add to Tasks on Dining Out recommendation
    fireEvent.click(screen.getByTestId("btn-apply-recommendation-cap-dining-out"));

    await waitFor(() => {
      expect(apiTasks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Enforce $5/day spending limit on Dining Out for remainder of month",
          kind: "budget",
          priority: "medium",
          expected_impact: expect.stringContaining("175"),
        })
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Savings Action Added",
          description: expect.stringContaining("Enforce $5/day spending limit on Dining Out"),
        })
      );
    });
  });

  it("renders peer spending benchmarks tab with statistical cohort alignment and category insights", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("btn-tab-peer-benchmarks")).toBeInTheDocument();
    });

    // Switch to peer benchmarks tab
    fireEvent.click(screen.getByTestId("btn-tab-peer-benchmarks"));

    await waitFor(() => {
      expect(screen.getByTestId("card-peer-benchmarking")).toBeInTheDocument();
    });

    // Cohort metadata badges
    expect(screen.getByTestId("badge-peer-cohort")).toHaveTextContent("Standard Household Peer Cohort");
    expect(screen.getByTestId("badge-peer-alignment")).toHaveTextContent("Peer Alignment: 86%");
    expect(screen.getByTestId("badge-peer-frugal-count")).toHaveTextContent("1 Frugal Categories");
    expect(screen.getByTestId("badge-peer-elevated-count")).toHaveTextContent("1 Elevated Categories");

    // Top savings opportunity banner
    expect(screen.getByTestId("card-peer-opportunity-banner")).toHaveTextContent("Shopping");

    // Category cards and statuses
    expect(screen.getByTestId("card-peer-item-dining-out")).toBeInTheDocument();
    expect(screen.getByTestId("badge-peer-status-dining-out")).toHaveTextContent("Aligned");
    expect(screen.getByTestId("metric-peer-delta-dining-out")).toHaveTextContent("-$32/mo");

    expect(screen.getByTestId("card-peer-item-groceries")).toBeInTheDocument();
    expect(screen.getByTestId("badge-peer-status-groceries")).toHaveTextContent("Top Saver");
    expect(screen.getByTestId("metric-peer-delta-groceries")).toHaveTextContent("-$140/mo");

    expect(screen.getByTestId("card-peer-item-shopping")).toBeInTheDocument();
    expect(screen.getByTestId("badge-peer-status-shopping")).toHaveTextContent("Elevated");
    expect(screen.getByTestId("metric-peer-delta-shopping")).toHaveTextContent("+$200/mo");
    expect(screen.getByTestId("desc-peer-benchmark-shopping")).toHaveTextContent("Elevated: Spending is 11.5% of income");
  });

  it("shows an unavailable peer comparison state without inventing cohort statistics", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      peer_benchmarks: [],
      peer_benchmarking_summary: {
        available: false,
        unavailable_reason: "No verified peer comparison data is connected.",
        cohort_name: null,
        alignment_index: null,
        frugal_categories_count: null,
        elevated_categories_count: null,
      },
    });
    renderBudgetHealth();
    fireEvent.click(await screen.findByTestId("btn-tab-peer-benchmarks"));

    expect(screen.getByTestId("peer-benchmarks-unavailable")).toHaveTextContent("No verified peer comparison data is connected.");
    expect(screen.queryByTestId("badge-peer-cohort")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-peer-alignment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-peer-frugal-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-peer-elevated-count")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View your budget" }));
    expect(screen.getByTestId("predictive-spending-limits")).toBeInTheDocument();
  });

  it("keeps peer and rebalance controls useful when no financial records exist", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      health_score: { ...mockBudgetHealthData.health_score, data_available: false },
      peer_benchmarks: [],
      peer_benchmarking_summary: { available: false, unavailable_reason: "No verified peer comparison data is connected." },
    });
    renderBudgetHealth();
    expect(await screen.findByTestId("budget-health-empty")).toHaveTextContent("Add transactions");
    fireEvent.click(screen.getByTestId("btn-tab-peer-benchmarks"));
    expect(screen.getByTestId("peer-benchmarks-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("btn-tab-peer-benchmarks")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("btn-tab-auto-rebalance"));
    expect(screen.getByTestId("budget-health-empty")).toHaveTextContent("Add budget allocations and spending");
    expect(screen.queryByTestId("card-peer-benchmarking")).not.toBeInTheDocument();
  });

  it("does not display a fallback cohort or alignment when peer metadata is missing", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      peer_benchmarks: [],
      peer_benchmarking_summary: undefined,
    });
    renderBudgetHealth();
    fireEvent.click(await screen.findByTestId("btn-tab-peer-benchmarks"));

    expect(screen.getByTestId("peer-benchmarks-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-peer-cohort")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-peer-alignment")).not.toBeInTheDocument();
  });

  it("honors explicit peer unavailability even if an old payload contains benchmark rows", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      peer_benchmarking_summary: {
        ...mockBudgetHealthData.peer_benchmarking_summary,
        available: false,
      },
    });
    renderBudgetHealth();
    fireEvent.click(await screen.findByTestId("btn-tab-peer-benchmarks"));

    expect(screen.getByTestId("peer-benchmarks-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("card-peer-item-dining-out")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-peer-alignment")).not.toBeInTheDocument();
  });

  it("keeps unknown debt savings and score impact out of badges and task promises", async () => {
    apiTransactions.getBudgetHealth.mockResolvedValueOnce({
      ...mockBudgetHealthData,
      proactive_savings_recommendations: [{
        id: "debt-saved-card",
        title: "Accelerate payoff on Saved Card",
        category: "Debt Paydown",
        impact_monthly_savings: null,
        score_impact_pts: null,
        difficulty: "strategic",
        reasoning: "Your saved balance is $1000.00 at 20% APR. Extra-payment savings have not been calculated.",
        action_type: "create_task",
        suggested_task_title: "Review an affordable extra principal payment on Saved Card",
      }],
      savings_potential_summary: {
        total_monthly_savings: 0,
        potential_score_improvement: 0,
        recommended_actions_count: 1,
      },
    });
    apiTasks.createTask.mockResolvedValueOnce({ task: { id: "debt-review-task" } });
    renderBudgetHealth();

    expect(await screen.findByTestId("rec-impact-unknown-debt-saved-card")).toHaveTextContent("Savings not calculated");
    expect(screen.queryByTestId("badge-rec-savings-debt-saved-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-rec-score-debt-saved-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-total-potential-savings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-potential-score-bump")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("btn-apply-recommendation-debt-saved-card"));
    await waitFor(() => expect(apiTasks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      expected_impact: "Savings and health-score impact have not been calculated.",
    })));
  });

  it("renders auto-rebalancing cockpit and executes 1-click envelope rebalance with budget preservation", async () => {
    renderBudgetHealth();

    await waitFor(() => {
      expect(screen.getByTestId("btn-tab-auto-rebalance")).toBeInTheDocument();
    });

    // Switch to auto-rebalance tab
    fireEvent.click(screen.getByTestId("btn-tab-auto-rebalance"));

    await waitFor(() => {
      expect(screen.getByTestId("card-envelope-auto-rebalance")).toBeInTheDocument();
    });

    // Plan badges and guarantees
    expect(screen.getByTestId("badge-rebalance-preserved")).toHaveTextContent("Zero-Sum Budget Preserved: Total Budget Unchanged");
    expect(screen.getByTestId("badge-rebalance-needed")).toHaveTextContent("1 Transfers Recommended");
    expect(screen.getByTestId("metric-total-rebalanced")).toHaveTextContent("$50");

    // Transfers proposal items
    expect(screen.getByTestId("item-rebalance-transfer-0")).toHaveTextContent("Groceries (Surplus)");
    expect(screen.getByTestId("item-rebalance-transfer-0")).toHaveTextContent("Dining Out (Deficit)");
    expect(screen.getByTestId("metric-transfer-amount-0")).toHaveTextContent("$50");

    // Proposed allocations breakdown
    expect(screen.getByTestId("item-proposed-allocation-groceries")).toHaveTextContent("Planned: $600.00 → $550.00");
    expect(screen.getByTestId("item-proposed-allocation-dining-out")).toHaveTextContent("Planned: $500.00 → $550.00");

    // Click 1-Click Execute Envelope Auto-Rebalance
    const rebalanceBtn = screen.getByTestId("btn-apply-auto-rebalance");
    expect(rebalanceBtn).not.toBeDisabled();
    fireEvent.click(rebalanceBtn);

    await waitFor(() => {
      expect(apiFinance.rebalanceBudgetAllocations).toHaveBeenCalledWith(
        "2026-10",
        {
          transfers: [
            {
              from_category: "Groceries",
              to_category: "Dining Out",
              amount: 50,
              reason: "Transfer $50 surplus from Groceries to cover Dining Out overrun without increasing total budget",
            },
          ],
        }
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Envelope Budget Rebalanced",
          description: expect.stringContaining("Successfully executed 1 transfers"),
        })
      );
    });
  });
});
