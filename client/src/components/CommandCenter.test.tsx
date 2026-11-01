import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandCenter from "./CommandCenter";

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
  getCommandCenter: vi.fn(),
}));

vi.mock("@/lib/api/transactions", () => ({
  ...apiTransactions,
}));

const mockCommandCenterData = {
  time_of_day: "morning" as const,
  cash_runway: {
    days_remaining: 142,
    liquid_balance: 24500,
    net_liquid_balance: 20000,
    avg_daily_expense: 172.5,
    balance_available: true,
  },
  consolidated_netting: {
    liquid_assets: 24500,
    investment_assets: 50000,
    total_assets: 74500,
    credit_liabilities: 4500,
    profile_debts: 15000,
    total_liabilities: 19500,
    net_liquid_cash: 20000,
    net_worth: 55000,
    netting_status: "surplus" as const,
    net_runway_days: 116,
    account_breakdown: [
      { id: "acc-1", name: "Primary Checking", type: "checking", balance: 14500, currency: "USD" },
      { id: "acc-2", name: "High Yield Savings", type: "savings", balance: 10000, currency: "USD" },
      { id: "acc-3", name: "Brokerage Index", type: "brokerage", balance: 50000, currency: "USD" },
      { id: "acc-4", name: "Sapphire Reserve", type: "credit", balance: 4500, currency: "USD" },
    ],
  },
  budget_burn: {
    burn_rate_pct: 64,
    total_spent: 3200,
    total_planned: 5000,
    day_of_month: 20,
    days_in_month: 31,
    on_pace: true,
    overshoot_amount: 0,
  },
  debt_pressure: {
    debt_count: 2,
    total_minimum_due: 450,
    pressure_level: "review_this_week" as const,
  },
  pending_tasks: {
    open: 4,
    due_soon: 2,
    overdue: 1,
  },
  goals_snapshot: {
    total: 3,
    on_track: 2,
    overall_progress_pct: 75,
  },
  priority_signals: [
    {
      id: "sig-1",
      priority: "act_now" as const,
      title: "Overdue Credit Card Bill",
      detail: "Minimum payment of $250 was due yesterday.",
      action_href: "/finance?tab=debts",
    },
    {
      id: "sig-2",
      priority: "review_this_week" as const,
      title: "Dining Out Nearing Budget",
      detail: "88% of dining budget consumed with 11 days remaining.",
      action_href: "/finance?tab=budgets",
    },
    {
      id: "sig-3",
      priority: "safe_to_ignore" as const,
      title: "Emergency Fund On Pace",
      detail: "Monthly automated savings deposited successfully.",
      action_href: "/goals-debts",
    },
  ],
  upcoming_bills: [
    {
      id: "bill-1",
      name: "Internet Fiber",
      due_date: "2026-11-03",
      amount_estimate: 80,
    },
    {
      id: "bill-2",
      name: "Apartment Rent",
      due_date: "2026-11-05",
      amount_estimate: 1850,
    },
  ],
};

describe("CommandCenter Component", () => {
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

    apiTransactions.getCommandCenter.mockResolvedValue(mockCommandCenterData);
  });

  afterEach(() => {
    cleanup();
  });

  const renderCommandCenter = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CommandCenter />
      </QueryClientProvider>,
    );
  };

  it("renders morning greeting and all 4 core KPI cards", async () => {
    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("command-center")).toBeInTheDocument();
    });

    expect(screen.getByText(/Good morning/i)).toBeInTheDocument();

    // Cash runway
    const runwayCard = screen.getByTestId("kpi-cash-runway");
    expect(runwayCard).toHaveTextContent("142d");
    expect(runwayCard).toHaveTextContent("$24,500 liquid");
    expect(runwayCard).toHaveTextContent("~$173/day avg spend");

    // Budget burn
    const budgetCard = screen.getByTestId("kpi-budget-burn");
    expect(budgetCard).toHaveTextContent("$3,200 spent");
    expect(budgetCard).toHaveTextContent("$5,000 planned");
    expect(budgetCard).toHaveTextContent("Day 20/31");

    // Pending tasks
    const tasksCard = screen.getByTestId("kpi-pending-tasks");
    expect(tasksCard).toHaveTextContent("4");
    expect(tasksCard).toHaveTextContent("2 due soon");
    expect(tasksCard).toHaveTextContent("1 overdue");

    // Goals & debt
    const goalsCard = screen.getByTestId("kpi-goals-debt");
    expect(goalsCard).toHaveTextContent("2");
    expect(goalsCard).toHaveTextContent("/ 3 on track");
    expect(goalsCard).toHaveTextContent("$450 min. payments");
  });

  it("renders priority signals detail list and action links", async () => {
    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("command-center-priority-signals")).toBeInTheDocument();
    });

    // Act now signal
    const actNowSignal = screen.getByTestId("signal-card-sig-1");
    expect(actNowSignal).toHaveTextContent("Overdue Credit Card Bill");
    expect(actNowSignal).toHaveTextContent("Minimum payment of $250 was due yesterday.");
    const actNowLink = screen.getByTestId("signal-action-sig-1");
    expect(actNowLink).toHaveAttribute("href", "/finance?tab=debts");

    // Review this week signal
    const reviewSignal = screen.getByTestId("signal-card-sig-2");
    expect(reviewSignal).toHaveTextContent("Dining Out Nearing Budget");
  });

  it("renders upcoming bills within next 7 days", async () => {
    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("command-center-upcoming-bills")).toBeInTheDocument();
    });

    expect(screen.getByTestId("upcoming-bill-bill-1")).toHaveTextContent("Internet Fiber");
    expect(screen.getByTestId("upcoming-bill-bill-1")).toHaveTextContent("$80");

    expect(screen.getByTestId("upcoming-bill-bill-2")).toHaveTextContent("Apartment Rent");
    expect(screen.getByTestId("upcoming-bill-bill-2")).toHaveTextContent("$1,850");
  });

  it("renders error card with retry button when query fails", async () => {
    apiTransactions.getCommandCenter.mockRejectedValueOnce(new Error("Server timeout"));

    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("command-center-error")).toBeInTheDocument();
    });

    expect(screen.getByText("Financial Command Center is temporarily unavailable.")).toBeInTheDocument();

    // Trigger retry
    apiTransactions.getCommandCenter.mockResolvedValueOnce(mockCommandCenterData);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByTestId("command-center")).toBeInTheDocument();
    });
  });

  it("shows all clear badge when no tasks are overdue or due soon", async () => {
    apiTransactions.getCommandCenter.mockResolvedValueOnce({
      ...mockCommandCenterData,
      pending_tasks: { open: 0, due_soon: 0, overdue: 0 },
    });

    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-pending-tasks")).toBeInTheDocument();
    });

    expect(screen.getByText("All clear")).toBeInTheDocument();
  });

  it("renders multi-account consolidated netting cockpit strip and net cash indicators", async () => {
    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-consolidated-netting")).toBeInTheDocument();
    });

    // Net cash inside Runway KPI
    expect(screen.getByTestId("metric-net-liquid-cash")).toHaveTextContent("$20,000");
    expect(screen.getByTestId("badge-netting-status")).toHaveTextContent("SURPLUS");
    expect(screen.getByTestId("metric-net-runway-days")).toHaveTextContent("(116d)");

    // Consolidated netting card
    const nettingCard = screen.getByTestId("card-consolidated-netting");
    expect(nettingCard).toBeInTheDocument();
    expect(screen.getByTestId("badge-consolidated-netting-status")).toHaveTextContent("SURPLUS RESERVE");

    // Breakdown metrics
    expect(screen.getByTestId("netting-liquid-assets")).toHaveTextContent("$24,500");
    expect(screen.getByTestId("netting-investment-assets")).toHaveTextContent("$50,000");
    expect(screen.getByTestId("netting-liabilities")).toHaveTextContent("$19,500");
    expect(screen.getByTestId("netting-net-worth")).toHaveTextContent("$55,000");

    // Manage accounts link
    expect(screen.getByTestId("link-manage-accounts")).toHaveAttribute("href", "/finance?tab=accounts");
  });

  it("renders deficit warning banner when credit liabilities exceed liquid cash", async () => {
    apiTransactions.getCommandCenter.mockResolvedValueOnce({
      ...mockCommandCenterData,
      consolidated_netting: {
        liquid_assets: 5000,
        investment_assets: 10000,
        total_assets: 15000,
        credit_liabilities: 8000,
        profile_debts: 12000,
        total_liabilities: 20000,
        net_liquid_cash: -3000,
        net_worth: -5000,
        netting_status: "deficit" as const,
        net_runway_days: 0,
        account_breakdown: [
          { id: "acc-1", name: "Checking", type: "checking", balance: 5000, currency: "USD" },
          { id: "acc-4", name: "Credit Card", type: "credit", balance: 8000, currency: "USD" },
        ],
      },
    });

    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("badge-netting-status")).toHaveTextContent("DEFICIT");
    });

    expect(screen.getByTestId("badge-consolidated-netting-status")).toHaveTextContent("DEFICIT WARNING");
    const deficitAlert = screen.getByTestId("alert-netting-deficit");
    expect(deficitAlert).toBeInTheDocument();
    expect(deficitAlert).toHaveTextContent("Immediate credit card obligations exceed your available liquid cash reserve by $3,000");
  });

  it("gracefully falls back when consolidated_netting is missing from legacy payload", async () => {
    const { consolidated_netting: _, ...legacyData } = mockCommandCenterData;
    apiTransactions.getCommandCenter.mockResolvedValueOnce({
      ...legacyData,
      cash_runway: {
        days_remaining: 142,
        liquid_balance: 24500,
        avg_daily_expense: 172.5,
        balance_available: true,
      },
    });

    renderCommandCenter();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-cash-runway")).toBeInTheDocument();
    });

    // Falls back to gross liquid balance
    expect(screen.getByTestId("metric-net-liquid-cash")).toHaveTextContent("$24,500");
    expect(screen.queryByTestId("card-consolidated-netting")).not.toBeInTheDocument();
  });
});
