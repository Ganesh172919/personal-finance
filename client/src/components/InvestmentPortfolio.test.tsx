import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { InvestmentPortfolio } from "./InvestmentPortfolio";
import * as apiClient from "@/lib/apiClient";

vi.mock("@/lib/apiClient", async () => {
  const actual = await vi.importActual<typeof apiClient>("@/lib/apiClient");
  return {
    ...actual,
    getPortfolioSummary: vi.fn(),
  };
});

vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    formatMoney: (v: number) => `USD ${Math.round(v)}`,
  }),
}));

const clients: QueryClient[] = [];
function renderComponent(portfolioData?: any, isLoading = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  if (isLoading) {
    vi.mocked(apiClient.getPortfolioSummary).mockImplementation(() => new Promise(() => {}));
  } else {
    vi.mocked(apiClient.getPortfolioSummary).mockResolvedValue(portfolioData || {
      summary: { total_invested: 0, monthly_sip_estimate: 0, month_over_month_change_pct: 0 },
      allocations: [],
      holdings: [],
    });
  }

  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <InvestmentPortfolio />
    </QueryClientProvider>
  );
  return client;
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.clearAllMocks();
});

it("renders loading skeleton while query is in flight", () => {
  renderComponent(null, true);
  expect(screen.queryByText("Investment Portfolio")).not.toBeInTheDocument();
});

it("renders portfolio summary, allocations, holdings, and manage link", async () => {
  renderComponent({
    summary: {
      total_invested: 125000,
      monthly_sip_estimate: 1500,
      month_over_month_change_pct: 4.2,
    },
    allocations: [
      { name: "Equity Index", percentage: 65 },
      { name: "Debt Bonds", percentage: 25 },
      { name: "Gold ETF", percentage: 10 },
    ],
    holdings: [
      {
        name: "Vanguard Total Stock Market",
        asset_class: "Equity",
        invested_amount: 50000,
        weight_percentage: 40,
      },
      {
        name: "US Treasury 10Y",
        asset_class: "Debt",
        invested_amount: 25000,
        weight_percentage: 20,
      },
    ],
  });

  expect(await screen.findByText("Investment Portfolio")).toBeInTheDocument();
  expect(screen.getByText("USD 125000")).toBeInTheDocument();
  expect(screen.getByText("+4.2%")).toBeInTheDocument();
  expect(screen.getByText("Monthly SIP estimate: USD 1500")).toBeInTheDocument();

  expect(screen.getByText("Equity Index (65.0%)")).toBeInTheDocument();
  expect(screen.getByText("Debt Bonds (25.0%)")).toBeInTheDocument();
  expect(screen.getByText("Gold ETF (10.0%)")).toBeInTheDocument();

  expect(screen.getByText("Vanguard Total Stock Market")).toBeInTheDocument();
  expect(screen.getByText("Equity • USD 50000")).toBeInTheDocument();
  expect(screen.getByText("40.0%")).toBeInTheDocument();

  const manageLink = screen.getByRole("link", { name: /Manage →/i });
  expect(manageLink).toHaveAttribute("href", "/portfolio");
});

it("renders clean fallback text when allocations and holdings are empty", async () => {
  renderComponent({
    summary: {
      total_invested: 0,
      monthly_sip_estimate: 0,
      month_over_month_change_pct: 0,
    },
    allocations: [],
    holdings: [],
  });

  expect(await screen.findByText("Investment Portfolio")).toBeInTheDocument();
  expect(screen.getByText("No investment allocations yet.")).toBeInTheDocument();
  expect(screen.getByText("No holdings yet.")).toBeInTheDocument();
});
