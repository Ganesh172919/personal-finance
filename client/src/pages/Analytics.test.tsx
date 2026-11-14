import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Analytics from "./Analytics";

const workspace = vi.hoisted(() => ({ currency: "USD", locale: "en-US" }));
vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    currency: workspace.currency,
    formatMoney: (amount: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(workspace.locale, {
        style: "currency", currency: workspace.currency, ...options,
      }).format(amount),
  }),
}));

const apiAnalytics = vi.hoisted(() => ({
  getIncomeExpenseSummary: vi.fn(),
  getCategoryTrends: vi.fn(),
  getAccountBalances: vi.fn(),
  getTopMerchants: vi.fn(),
  getSpendingHeatmap: vi.fn(),
  getMultiCurrencySummary: vi.fn(),
}));

vi.mock("@/lib/api/v1/analytics", () => ({
  ...apiAnalytics,
}));

vi.mock("recharts", async () => {
  const original = await vi.importActual<any>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div data-testid="mock-responsive-container">{children}</div>,
  };
});

const mockIncomeExpense = {
  org_id: "org-1",
  months: 12,
  data: [
    { month: "2026-08", income: 8000, expense: 5000, net: 3000, savings_rate: 38 },
    { month: "2026-09", income: 8500, expense: 4500, net: 4000, savings_rate: 47 },
    { month: "2026-10", income: 9000, expense: 4000, net: 5000, savings_rate: 56 },
  ],
  request_id: "req-1",
};

const mockCategoryTrends = {
  org_id: "org-1",
  months: 12,
  data: [
    { month: "2026-08", categories: { Housing: 2000, Food: 800 }, total: 2800 },
    { month: "2026-09", categories: { Housing: 2000, Food: 900 }, total: 2900 },
    { month: "2026-10", categories: { Housing: 2000, Food: 750 }, total: 2750 },
  ],
  request_id: "req-2",
};

const mockAccountBalances = {
  org_id: "org-1",
  accounts: [
    {
      id: "acc-1",
      name: "Checking Account",
      type: "checking",
      institution: "Chase",
      currency: "USD",
      balance: 12500,
      transaction_count: 42,
      last_transaction: "2026-10-28",
    },
    {
      id: "acc-2",
      name: "Credit Card",
      type: "credit",
      institution: "Amex",
      currency: "USD",
      balance: 1500,
      transaction_count: 15,
      last_transaction: "2026-10-29",
    },
  ],
  summary: {
    total_assets: 12500,
    total_liabilities: 1500,
    net_worth: 11000,
  },
  request_id: "req-3",
};

const mockTopMerchants = {
  org_id: "org-1",
  months: 12,
  merchants: [
    { merchant_id: "m-1", name: "Whole Foods", total: 1200, count: 8, avg: 150 },
    { merchant_id: "m-2", name: "Amazon", total: 850, count: 6, avg: 141.67 },
  ],
  request_id: "req-4",
};

const mockSpendingHeatmap = {
  org_id: "org-1",
  days_back: 90,
  data: [
    { date: "2026-10-30", total: 450, count: 4 }, // Friday
    { date: "2026-10-31", total: 200, count: 2 }, // Saturday
    { date: "2026-10-26", total: 150, count: 3 }, // Monday
  ],
  request_id: "req-5",
};

const mockMultiCurrencySummary = {
  org_id: "org-1",
  base_currency: "USD",
  target_currency: "USD",
  fx_rate: 1.0,
  currency_symbol: "$",
  base_summary: {
    total_assets: 12500,
    total_liabilities: 1500,
    net_worth: 11000,
  },
  converted_summary: {
    total_assets: 12500,
    total_liabilities: 1500,
    net_worth: 11000,
  },
  rates_table: [
    { currency: "USD", symbol: "$", fx_rate: 1.0, net_worth_localized: 11000, assets_localized: 12500, liabilities_localized: 1500 },
    { currency: "EUR", symbol: "€", fx_rate: 0.92, net_worth_localized: 10120, assets_localized: 11500, liabilities_localized: 1380 },
    { currency: "GBP", symbol: "£", fx_rate: 0.78, net_worth_localized: 8580, assets_localized: 9750, liabilities_localized: 1170 },
    { currency: "INR", symbol: "₹", fx_rate: 83.5, net_worth_localized: 918500, assets_localized: 1043750, liabilities_localized: 125250 },
    { currency: "CAD", symbol: "CA$", fx_rate: 1.36, net_worth_localized: 14960, assets_localized: 17000, liabilities_localized: 2040 },
    { currency: "AUD", symbol: "A$", fx_rate: 1.52, net_worth_localized: 16720, assets_localized: 19000, liabilities_localized: 2280 },
    { currency: "JPY", symbol: "¥", fx_rate: 155.0, net_worth_localized: 1705000, assets_localized: 1937500, liabilities_localized: 232500 },
  ],
  request_id: "req-6",
};

describe("Analytics Page", () => {
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

    apiAnalytics.getIncomeExpenseSummary.mockResolvedValue(mockIncomeExpense);
    apiAnalytics.getCategoryTrends.mockResolvedValue(mockCategoryTrends);
    apiAnalytics.getAccountBalances.mockResolvedValue(mockAccountBalances);
    apiAnalytics.getTopMerchants.mockResolvedValue(mockTopMerchants);
    apiAnalytics.getSpendingHeatmap.mockResolvedValue(mockSpendingHeatmap);
    apiAnalytics.getMultiCurrencySummary.mockResolvedValue(mockMultiCurrencySummary);
  });

  afterEach(() => {
    cleanup();
  });

  const renderAnalytics = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Analytics />
      </QueryClientProvider>,
    );
  };

  it("renders page header and stat cards with formatted values", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("analytics-page")).toBeInTheDocument();
    });

    expect(screen.getByText("Financial analytics that highlight movement, not just totals")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("stat-total-income")).toBeInTheDocument();
    });

    // Total income = 8000 + 8500 + 9000 = 25,500
    expect(screen.getByTestId("stat-total-income")).toHaveTextContent("$25,500");
    // Total expenses = 5000 + 4500 + 4000 = 13,500
    expect(screen.getByTestId("stat-total-expenses")).toHaveTextContent("$13,500");
    // Net worth = 11,000
    expect(screen.getByTestId("stat-net-worth")).toHaveTextContent("$11,000");
    // Avg savings rate = round((38 + 47 + 56) / 3) = 47%
    expect(screen.getByTestId("stat-savings-rate")).toHaveTextContent("47%");
  });

  it("renders all four primary analytical chart cards", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("card-income-expenses")).toBeInTheDocument();
      expect(screen.getByTestId("card-category-distribution")).toBeInTheDocument();
      expect(screen.getByTestId("card-top-merchants")).toBeInTheDocument();
      expect(screen.getByTestId("card-account-balances")).toBeInTheDocument();
    });

    // Top merchants should show Whole Foods and Amazon
    expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    expect(screen.getByText("Amazon")).toBeInTheDocument();
  });

  it("uses the workspace currency and preserves cents in totals", async () => {
    workspace.currency = "INR";
    workspace.locale = "en-IN";
    apiAnalytics.getAccountBalances.mockResolvedValue({
      ...mockAccountBalances,
      accounts: mockAccountBalances.accounts.map(account => ({ ...account, currency: "INR" })),
    });
    apiAnalytics.getIncomeExpenseSummary.mockResolvedValue({
      ...mockIncomeExpense,
      data: [{ month: "2026-10", income: 1250.50, expense: 25.25, net: 1225.25, savings_rate: 98 }],
    });
    renderAnalytics();
    expect(await screen.findByTestId("stat-total-income")).toHaveTextContent("₹1,250.50");
    expect(screen.getByTestId("stat-total-expenses")).toHaveTextContent("₹25.25");
    expect(screen.getByTestId("analytics-page")).not.toHaveTextContent("$25");
  });

  it("shows a retryable failure instead of inventing zero totals", async () => {
    apiAnalytics.getAccountBalances.mockRejectedValueOnce(new Error("Service unavailable"));
    renderAnalytics();
    expect(await screen.findByRole("alert")).toHaveTextContent("Analytics could not load");
    expect(screen.queryByTestId("stat-net-worth")).not.toBeInTheDocument();
    expect(screen.queryByTestId("analytics-empty-state")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry analytics" }));
    expect(await screen.findByTestId("stat-net-worth")).toHaveTextContent("$11,000");
    expect(apiAnalytics.getAccountBalances).toHaveBeenCalledTimes(2);
  });

  it("does not label mixed-currency balances as a single converted net worth", async () => {
    apiAnalytics.getAccountBalances.mockResolvedValue({
      ...mockAccountBalances,
      accounts: [mockAccountBalances.accounts[0], { ...mockAccountBalances.accounts[1], currency: "INR" }],
    });
    renderAnalytics();
    expect(await screen.findByTestId("stat-net-worth")).toHaveTextContent("Not combined");
    expect(screen.getByText(/Only USD accounts are shown/)).toBeInTheDocument();
  });

  it("allows switching time range to 3M and 6M", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("range-3m")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("range-3m"));

    await waitFor(() => {
      expect(apiAnalytics.getIncomeExpenseSummary).toHaveBeenCalledWith(3);
      expect(apiAnalytics.getCategoryTrends).toHaveBeenCalledWith(3);
      expect(apiAnalytics.getTopMerchants).toHaveBeenCalledWith({ limit: 8, months: 3 });
    });

    fireEvent.click(screen.getByTestId("range-6m"));

    await waitFor(() => {
      expect(apiAnalytics.getIncomeExpenseSummary).toHaveBeenCalledWith(6);
      expect(apiAnalytics.getCategoryTrends).toHaveBeenCalledWith(6);
      expect(apiAnalytics.getTopMerchants).toHaveBeenCalledWith({ limit: 8, months: 6 });
    });
  });

  it("renders empty state when no financial data is returned", async () => {
    apiAnalytics.getIncomeExpenseSummary.mockResolvedValue({ org_id: "org-1", months: 12, data: [], request_id: "r1" });
    apiAnalytics.getCategoryTrends.mockResolvedValue({ org_id: "org-1", months: 12, data: [], request_id: "r2" });
    apiAnalytics.getAccountBalances.mockResolvedValue({
      org_id: "org-1",
      accounts: [],
      summary: { total_assets: 0, total_liabilities: 0, net_worth: 0 },
      request_id: "r3",
    });
    apiAnalytics.getTopMerchants.mockResolvedValue({ org_id: "org-1", months: 12, merchants: [], request_id: "r4" });
    apiAnalytics.getSpendingHeatmap.mockResolvedValue({ org_id: "org-1", days_back: 90, data: [], request_id: "r5" });

    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("analytics-empty-state")).toBeInTheDocument();
    });

    expect(screen.getByText("Not enough analytics data yet")).toBeInTheDocument();
  });

  it("renders spending velocity metrics and day-of-week heatmap card", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("card-spending-velocity")).toBeInTheDocument();
    });

    // Peak day is Friday ($450)
    expect(screen.getByTestId("metric-peak-day")).toHaveTextContent("Friday");
    expect(screen.getByTestId("badge-peak-day")).toHaveTextContent("Peak Day");

    // Weekday (Fri: 450, Mon: 150 = 600) vs Weekend (Sat: 200) -> 75% / 25%
    expect(screen.getByTestId("metric-weekday-weekend-ratio")).toHaveTextContent("75% / 25%");

    // Active days count
    expect(screen.getByTestId("metric-active-days")).toHaveTextContent("3 active spending days in 90D");

    // Peak single date
    expect(screen.getByTestId("metric-peak-single-day")).toHaveTextContent("2026-10-30");

    // All 7 weekday cards rendered
    expect(screen.getByTestId("dow-bar-monday")).toHaveTextContent("$150");
    expect(screen.getByTestId("dow-bar-friday")).toHaveTextContent("$450");
    expect(screen.getByTestId("dow-bar-friday")).toHaveTextContent("TOP");
    expect(screen.getByTestId("dow-bar-saturday")).toHaveTextContent("$200");
    expect(screen.getByTestId("dow-bar-tuesday")).toHaveTextContent("$0");
  });

  it("allows switching spending heatmap range between 30D, 180D, and 365D", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("heatmap-range-30")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("heatmap-range-30"));
    await waitFor(() => {
      expect(apiAnalytics.getSpendingHeatmap).toHaveBeenCalledWith(30);
      expect(screen.getByTestId("heatmap-range-180")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("heatmap-range-180"));
    await waitFor(() => {
      expect(apiAnalytics.getSpendingHeatmap).toHaveBeenCalledWith(180);
      expect(screen.getByTestId("heatmap-range-365")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("heatmap-range-365"));
    await waitFor(() => {
      expect(apiAnalytics.getSpendingHeatmap).toHaveBeenCalledWith(365);
    });
  });

  it("calculates liquid cash runway accurately from checking and savings accounts", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("metric-cash-runway")).toBeInTheDocument();
    });

    // Checking balance is $12,500. Total spend is $800 over 90 days = $8.888/day.
    // Runway = floor(12500 / 8.888) = 1406 days.
    expect(screen.getByTestId("metric-cash-runway")).toHaveTextContent("1406 days");
  });

  it("renders multi-currency normalization cockpit with default USD reporting currency", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("card-currency-normalization")).toBeInTheDocument();
      expect(screen.getByTestId("text-normalized-net-worth")).toBeInTheDocument();
    });

    expect(screen.getByTestId("badge-analytics-reporting-currency")).toHaveTextContent("USD ($)");
    expect(screen.getByTestId("text-normalized-net-worth")).toHaveTextContent("Normalized Net Worth: $11,000");

    // All 7 currency buttons are present
    expect(screen.getByTestId("btn-currency-usd")).toBeInTheDocument();
    expect(screen.getByTestId("btn-currency-eur")).toBeInTheDocument();
    expect(screen.getByTestId("btn-currency-gbp")).toBeInTheDocument();
    expect(screen.getByTestId("btn-currency-inr")).toBeInTheDocument();
    expect(screen.getByTestId("btn-currency-cad")).toBeInTheDocument();
    expect(screen.getByTestId("btn-currency-aud")).toBeInTheDocument();
    expect(screen.getByTestId("btn-currency-jpy")).toBeInTheDocument();
  });

  it("switches reporting currency via select dropdown to EUR and updates FX badge and API queries", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("select-analytics-currency")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select-analytics-currency");
    fireEvent.change(select, { target: { value: "EUR" } });

    await waitFor(() => {
      expect(screen.getByTestId("badge-analytics-reporting-currency")).toHaveTextContent("EUR (€)");
      expect(screen.getByTestId("badge-analytics-fx-rate")).toHaveTextContent("1 USD = 0.92 EUR");
    });

    // Verifies queries were called with "EUR"
    await waitFor(() => {
      expect(apiAnalytics.getIncomeExpenseSummary).toHaveBeenCalledWith(12, "EUR");
      expect(apiAnalytics.getCategoryTrends).toHaveBeenCalledWith(12, "EUR");
      expect(apiAnalytics.getAccountBalances).toHaveBeenCalledWith("EUR");
      expect(apiAnalytics.getTopMerchants).toHaveBeenCalledWith({ limit: 8, months: 12, currency: "EUR" });
      expect(apiAnalytics.getSpendingHeatmap).toHaveBeenCalledWith(90, "EUR");
    });
  });

  it("switches currency via quick button to JPY and formats amounts with JPY integer rounding", async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByTestId("btn-currency-jpy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-currency-jpy"));

    await waitFor(() => {
      expect(screen.getByTestId("badge-analytics-reporting-currency")).toHaveTextContent("JPY (¥)");
      expect(screen.getByTestId("badge-analytics-fx-rate")).toHaveTextContent("1 USD = 155 JPY");
    });

    // In JPY (155 FX rate, 0 decimals):
    // 25,500 USD * 155 = 3,952,500 JPY
    expect(screen.getByTestId("stat-total-income")).toHaveTextContent("¥3,952,500");
  });
});
