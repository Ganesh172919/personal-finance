import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialVitals } from "./FinancialVitals";

const summaryApi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/apiClient", () => ({ getDashboardSummary: summaryApi }));
vi.mock("@/hooks/useOrgFormatters", () => ({ useOrgFormatters: () => ({ formatMoney: (value: number) => `$${value}` }) }));

const summary = {
  cash_flow: { monthly_income: 5000, monthly_expenses: 4000, net: 1000, savings_rate_pct: 20 },
  savings: { balance: 8000, emergency_fund_months: 2 },
  goals: { total_count: 0, on_track: 0, total_target: 0, total_current: 0, progress_pct: 0 },
};
const clients: QueryClient[] = [];
function renderVitals() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><FinancialVitals /></QueryClientProvider>);
  return client;
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); summaryApi.mockReset(); });

describe("financial summary availability", () => {
  it("does not assess an empty workspace as balanced or below a savings target", async () => {
    summaryApi.mockResolvedValue({ ...summary,
      cash_flow: { monthly_income: 0, monthly_expenses: 0, net: 0, savings_rate_pct: 0 } });
    renderVitals();
    expect(await screen.findByText("Add income or expenses")).toBeInTheDocument();
    expect(screen.getByText("Add income to calculate")).toBeInTheDocument();
    expect(screen.getByTestId("value-cash-flow")).toHaveTextContent("—");
    expect(screen.getByTestId("value-savings-rate")).toHaveTextContent("—");
    expect(screen.queryByText("Balanced cash flow")).not.toBeInTheDocument();
    expect(screen.queryByText("Below target")).not.toBeInTheDocument();
  });

  it("shows known negative cash flow while asking for income before computing a rate", async () => {
    summaryApi.mockResolvedValue({ ...summary,
      cash_flow: { monthly_income: 0, monthly_expenses: 100, net: -100, savings_rate_pct: 0 } });
    renderVitals();
    expect(await screen.findByText("Negative cash flow")).toBeInTheDocument();
    expect(screen.getByTestId("value-cash-flow")).toHaveTextContent("$-100");
    expect(screen.getByText("Add income to calculate")).toBeInTheDocument();
  });

  it("shows a loading state instead of invented zero balances while waiting", () => {
    summaryApi.mockReturnValue(new Promise(() => {}));
    renderVitals();
    expect(screen.getByRole("status", { name: "Loading financial summary" })).toBeInTheDocument();
    expect(screen.queryByTestId("value-cash-flow")).not.toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("lets a failed request recover and labels the exact savings target correctly", async () => {
    summaryApi.mockRejectedValueOnce(new Error("Temporarily offline")).mockResolvedValue(summary);
    renderVitals();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByTestId("value-cash-flow")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("At target")).toBeInTheDocument();
    expect(screen.getByText("No goals added")).toBeInTheDocument();
    expect(summaryApi).toHaveBeenCalledTimes(2);
  });

  it("identifies cached figures when a background refresh fails", async () => {
    summaryApi.mockResolvedValueOnce(summary).mockRejectedValueOnce(new Error("Offline"));
    const client = renderVitals();
    expect(await screen.findByText("At target")).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
    expect(await screen.findByRole("status")).toHaveTextContent("Showing the last loaded values");
    expect(screen.getByTestId("value-cash-flow")).toHaveTextContent("$1000");
  });
});
