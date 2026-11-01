import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Portfolio from "./Portfolio";

const api = vi.hoisted(() => ({
  getPortfolioSummary: vi.fn(),
  getTransactions: vi.fn(),
  apiClient: vi.fn(),
  createTask: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...api,
  ApiError: class extends Error {
    requestId = "req-123";
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "investor@finwise.dev", name: "Alex Investor" },
    isAuthenticated: true,
  }),
}));

vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    formatMoney: (val: number) => `$${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    currency: "USD",
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

// Mock recharts ResponsiveContainer and charts to prevent jsdom SVG sizing issues
vi.mock("recharts", async () => {
  const original = await vi.importActual<any>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  };
});

const mockPortfolioSummary = {
  summary: {
    total_invested: 25000,
    month_over_month_change_pct: 4.8,
    monthly_sip_estimate: 1200,
  },
  holdings: [
    {
      name: "Vanguard Total Stock Market ETF",
      asset_class: "Equity",
      invested_amount: 15000,
    },
    {
      name: "US 10-Year Treasury Bonds",
      asset_class: "Debt",
      invested_amount: 6000,
    },
    {
      name: "SPDR Gold Shares",
      asset_class: "Gold/Commodity",
      invested_amount: 4000,
    },
  ],
  allocations: [
    { name: "Equity", percentage: 60 },
    { name: "Debt", percentage: 24 },
    { name: "Gold", percentage: 16 },
  ],
  performance: [
    { month: "Jan 2026", cumulative: 20000 },
    { month: "Feb 2026", cumulative: 22000 },
    { month: "Mar 2026", cumulative: 25000 },
  ],
  dividends: {
    total_received: 850,
    ttm_received: 750,
    portfolio_yield_pct: 3.0,
    monthly_average: 62.5,
    payouts_by_holding: [
      {
        holding_name: "Vanguard Total Stock Market ETF",
        total_amount: 450,
        payout_count: 3,
        invested_amount: 15000,
        yield_on_cost_pct: 3.0,
      },
      {
        holding_name: "US 10-Year Treasury Bonds",
        total_amount: 300,
        payout_count: 2,
        invested_amount: 6000,
        yield_on_cost_pct: 5.0,
      },
      {
        holding_name: "SPDR Gold Shares",
        total_amount: 100,
        payout_count: 1,
        invested_amount: 4000,
        yield_on_cost_pct: 2.5,
      },
    ],
    monthly_progression: [
      { month: "Jan 2026", amount: 200 },
      { month: "Feb 2026", amount: 250 },
      { month: "Mar 2026", amount: 300 },
    ],
    recent_payouts: [
      {
        id: "div-1",
        description: "Vanguard Total Stock Market ETF Dividend",
        amount: 150,
        date: "2026-03-15T00:00:00.000Z",
        category: "Investments",
      },
    ],
  },
};

const mockAgentOutputs = [
  {
    id: "output-1",
    agentType: "investment_advisor",
    analysis_type: "investment_advice",
    timestamp: "2026-10-25T14:30:00Z",
    outputData: {
      title: "Quarterly Asset Rebalancing Recommendation",
      response: "Your equity exposure is currently at **60%**, which aligns with your moderate-aggressive risk tolerance. Consider increasing your monthly contributions to Treasury Bonds to maintain a 70/30 target allocation.",
    },
  },
];

const clients: QueryClient[] = [];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  clients.push(client);

  return render(
    <QueryClientProvider client={client}>
      <Portfolio />
    </QueryClientProvider>
  );
}

function selectTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.keyDown(tab, { key: "Enter" });
  fireEvent.click(tab);
}

describe("Portfolio Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getTransactions.mockResolvedValue({ transactions: [] });
    api.getPortfolioSummary.mockResolvedValue(mockPortfolioSummary);
    api.createTransaction.mockResolvedValue({ message: "Transaction created" });
    api.apiClient.mockImplementation((url: string) => {
      if (url.includes("investments")) {
        return Promise.resolve({ message: "Investment added successfully" });
      }
      return Promise.resolve(mockAgentOutputs);
    });
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((c) => c.clear());
  });

  it("renders portfolio overview metrics, asset allocations, and performance summary", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Investment Portfolio" })).toBeInTheDocument();

    // Summary cards
    expect(await screen.findByText("$25,000.00")).toBeInTheDocument();
    expect(screen.getByText("+4.8%")).toBeInTheDocument();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();

    // Allocations in overview tab
    expect(screen.getByText("Equity")).toBeInTheDocument();
    expect(screen.getByText("(60.0%)")).toBeInTheDocument();
    expect(screen.getByText("Debt")).toBeInTheDocument();
    expect(screen.getByText("(24.0%)")).toBeInTheDocument();
  });

  it("renders Holdings tab with holding details and percentage shares", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    // Switch to Holdings tab
    selectTab("Holdings");

    expect(await screen.findByText("Vanguard Total Stock Market ETF")).toBeInTheDocument();
    expect(screen.getByText("US 10-Year Treasury Bonds")).toBeInTheDocument();
    expect(screen.getByText("SPDR Gold Shares")).toBeInTheDocument();

    expect(screen.getByText("$15,000.00")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("24.0%")).toBeInTheDocument();
  });

  it("displays empty state in Holdings tab when no holdings exist", async () => {
    api.getPortfolioSummary.mockResolvedValue({
      summary: { total_invested: 0, month_over_month_change_pct: 0, monthly_sip_estimate: 0 },
      holdings: [],
      allocations: [],
      performance: [],
    });
    api.getTransactions.mockResolvedValue({ transactions: [] });

    renderPage();

    await screen.findAllByText("$0.00");

    selectTab("Holdings");

    expect(await screen.findByText("No Holdings Recorded")).toBeInTheDocument();
    expect(
      screen.getByText(/Add your stocks, index funds, bonds, or commodities/i)
    ).toBeInTheDocument();

    const addFirstBtn = screen.getByRole("button", { name: "Add First Investment" });
    expect(addFirstBtn).toBeInTheDocument();

    // Clicking button opens dialog
    fireEvent.click(addFirstBtn);
    expect(await screen.findByRole("heading", { name: "Add New Investment" })).toBeInTheDocument();
  });

  it("populates investment presets and submits new investment mutation", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    // Open Add Investment Dialog
    const addBtn = screen.getByTestId("button-add-investment");
    fireEvent.click(addBtn);

    expect(await screen.findByRole("heading", { name: "Add New Investment" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Investment Name");
    const amountInput = screen.getByLabelText(/Amount/i);

    // Click suggestion preset "Bitcoin"
    const bitcoinChip = screen.getByRole("button", { name: "Bitcoin" });
    fireEvent.click(bitcoinChip);
    expect(nameInput).toHaveValue("Bitcoin");

    // Click amount booster "+1000"
    const booster1000 = screen.getByRole("button", { name: "+1000" });
    fireEvent.click(booster1000);
    expect(amountInput).toHaveValue(1000);

    // Submit dialog
    const submitBtn = screen.getByRole("button", { name: "Add Investment" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.apiClient).toHaveBeenCalledWith(
        "/financial-profiles/investments",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"name":"Bitcoin"'),
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Investment Added",
      })
    );
  });

  it("renders AI Analysis tab with markdown insights", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    // Switch to Analysis tab
    selectTab("Analysis");

    expect(await screen.findByText("Quarterly Asset Rebalancing Recommendation")).toBeInTheDocument();
    expect(screen.getByText(/Your equity exposure is currently at/i)).toBeInTheDocument();
  });

  it("renders asset allocation drift alert in Overview and navigates to Rebalance tab", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    expect(screen.getByTestId("portfolio-drift-alert")).toBeInTheDocument();
    expect(screen.getByText("Asset Allocation Drift Detected")).toBeInTheDocument();
    expect(screen.getByText(/±6.0% drift/i)).toBeInTheDocument();

    const reviewBtn = screen.getByTestId("review-drift-btn");
    fireEvent.click(reviewBtn);

    expect(await screen.findByTestId("portfolio-rebalance-tab")).toBeInTheDocument();
    expect(screen.getByText("Target Allocation & Drift Rebalancing")).toBeInTheDocument();
  });

  it("switches target models and displays drift cards with status badges", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    selectTab("Rebalance");

    expect(await screen.findByTestId("portfolio-rebalance-tab")).toBeInTheDocument();
    expect(screen.getByTestId("drift-card-equity")).toBeInTheDocument();
    expect(screen.getByTestId("drift-card-debt")).toBeInTheDocument();

    const aggressiveBtn = screen.getByTestId("model-preset-aggressive");
    fireEvent.click(aggressiveBtn);

    expect(screen.getByText(/Capital appreciation oriented for long horizons/i)).toBeInTheDocument();
    expect(screen.getByTestId("drift-card-equity")).toHaveTextContent("Target: 80%");

    const conservativeBtn = screen.getByTestId("model-preset-conservative");
    fireEvent.click(conservativeBtn);

    expect(screen.getByText(/Capital preservation and yield focus/i)).toBeInTheDocument();
    expect(screen.getByTestId("drift-card-equity")).toHaveTextContent("Target: 30%");
  });

  it("switches rebalance modes and schedules a rebalance plan task with one click", async () => {
    api.createTask.mockResolvedValue({ task: { id: "rebalance-task-1" } });
    renderPage();

    await screen.findByText("$25,000.00");

    selectTab("Rebalance");

    const inflowInput = screen.getByTestId("rebalance-inflow-input");
    fireEvent.change(inflowInput, { target: { value: "1500" } });
    expect(inflowInput).toHaveValue(1500);

    const fullModeBtn = screen.getByTestId("mode-full-btn");
    fireEvent.click(fullModeBtn);
    expect(screen.getByText("Full Portfolio Rebalance Trade Orders")).toBeInTheDocument();

    const scheduleBtn = screen.getByTestId("schedule-rebalance-task-btn");
    fireEvent.click(scheduleBtn);

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Portfolio Rebalance"),
          kind: "invest",
          steps: expect.arrayContaining([
            expect.stringContaining("FinWise Portfolio"),
          ]),
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Scheduled",
      })
    );
  });

  it("renders dividend summary widget in overview and navigates to Dividends tab", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    const divCard = screen.getByTestId("portfolio-dividend-overview-card");
    expect(divCard).toBeInTheDocument();
    expect(divCard).toHaveTextContent("$750.00");
    expect(divCard).toHaveTextContent("3.00% Yield");

    const manageBtn = screen.getByTestId("view-dividends-tab-btn");
    fireEvent.click(manageBtn);

    expect(await screen.findByTestId("portfolio-dividends-tab")).toBeInTheDocument();
    expect(screen.getByText("Dividend Tracking & DRIP Compounding")).toBeInTheDocument();
  });

  it("renders Dividends tab with stat cards, yield on cost breakdown, and monthly chart", async () => {
    renderPage();

    await screen.findByText("$25,000.00");

    selectTab("Dividends");

    expect(await screen.findByTestId("portfolio-dividends-tab")).toBeInTheDocument();

    // 4 Stat Cards
    expect(screen.getByTestId("metric-total-dividends")).toHaveTextContent("$850.00");
    expect(screen.getByTestId("metric-annual-dividends")).toHaveTextContent("$750.00");
    expect(screen.getByTestId("metric-portfolio-dividend-yield")).toHaveTextContent("3.00%");
    expect(screen.getByTestId("metric-monthly-dividend-avg")).toHaveTextContent("$62.50");

    // Holdings Yield on Cost Table
    const holdingsTable = screen.getByTestId("table-dividends-by-holding");
    expect(holdingsTable).toBeInTheDocument();
    expect(holdingsTable).toHaveTextContent("Vanguard Total Stock Market ETF");
    expect(holdingsTable).toHaveTextContent("3.00% Yield on Cost");
    expect(holdingsTable).toHaveTextContent("US 10-Year Treasury Bonds");
    expect(holdingsTable).toHaveTextContent("5.00% Yield on Cost");

    // Monthly Chart
    expect(screen.getByTestId("chart-monthly-dividends")).toBeInTheDocument();

    // Recent payouts table
    expect(screen.getByTestId("table-recent-dividends")).toHaveTextContent("Vanguard Total Stock Market ETF Dividend");
  });

  it("submits record dividend dialog with DRIP reinvestment and schedules DRIP action plan", async () => {
    api.createTask.mockResolvedValue({ task: { id: "drip-task-1" } });
    renderPage();

    await screen.findByText("$25,000.00");

    selectTab("Dividends");

    // Open Record Dividend Dialog
    const openBtn = screen.getByTestId("button-open-record-dividend");
    fireEvent.click(openBtn);

    expect(await screen.findByTestId("dialog-record-dividend")).toBeInTheDocument();

    const holdingInput = screen.getByTestId("input-dividend-holding");
    fireEvent.change(holdingInput, { target: { value: "Apple Inc" } });

    const amountInput = screen.getByTestId("input-dividend-amount");
    fireEvent.change(amountInput, { target: { value: "250" } });

    const reinvestSwitch = screen.getByTestId("switch-dividend-reinvest");
    fireEvent.click(reinvestSwitch);

    const submitBtn = screen.getByTestId("button-submit-dividend");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 250,
          category: "Investments",
          description: "Apple Inc Dividend",
          type: "income",
        })
      );
      expect(api.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 250,
          category: "Investments",
          description: "Apple Inc DRIP Reinvestment",
          type: "investment",
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Dividend Payout Recorded 💰",
      })
    );

    // Test DRIP simulator horizon toggles
    const horizon20Btn = screen.getByTestId("btn-drip-horizon-20");
    fireEvent.click(horizon20Btn);
    expect(screen.getByTestId("drip-val-with-drip")).toBeInTheDocument();

    // Schedule DRIP Plan Task
    const scheduleDripBtn = screen.getByTestId("schedule-dividend-task-btn");
    fireEvent.click(scheduleDripBtn);

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Dividend Income & DRIP Reinvestment Optimization",
          kind: "invest",
          steps: expect.arrayContaining([
            expect.stringContaining("automated dividend reinvestment (DRIP)"),
          ]),
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Scheduled",
      })
    );
  });
});
