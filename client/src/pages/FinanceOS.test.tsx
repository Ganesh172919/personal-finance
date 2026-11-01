import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinanceOS from "./FinanceOS";

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  listMerchants: vi.fn(),
  upsertMerchant: vi.fn(),
  listBudgetAllocations: vi.fn(),
  upsertBudgetAllocation: vi.fn(),
  deleteBudgetAllocation: vi.fn(),
  getBudgetEnvelopes: vi.fn(),
  listRecurringRules: vi.fn(),
  createRecurringRule: vi.fn(),
  updateRecurringRule: vi.fn(),
  listRecurringCandidates: vi.fn(),
  getForecast: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...api,
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      org: {
        role: "admin",
        currency: "USD",
      },
    },
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockAccounts = [
  {
    id: "acc-1",
    name: "Chase Checking",
    type: "checking",
    status: "active",
    currency: "USD",
    institution: "Chase",
    mask: "4521",
  },
  {
    id: "acc-2",
    name: "Amex Gold",
    type: "credit",
    status: "active",
    currency: "USD",
    institution: "American Express",
    mask: "1002",
  },
];

const mockAllocations = [
  {
    id: "alloc-1",
    period_key: "2026-10",
    category: "Housing",
    amount: 1500,
    currency: "USD",
    updated_at: "2026-10-15T12:00:00Z",
  },
  {
    id: "alloc-2",
    period_key: "2026-10",
    category: "Groceries",
    amount: 450,
    currency: "USD",
    updated_at: "2026-10-18T10:00:00Z",
  },
];

const clients: QueryClient[] = [];

function renderPage(searchQuery = "") {
  window.history.pushState({}, "", `/finance${searchQuery}`);
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
      <FinanceOS />
    </QueryClientProvider>
  );
}

describe("FinanceOS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listAccounts.mockResolvedValue({ accounts: mockAccounts });
    api.listBudgetAllocations.mockResolvedValue({ allocations: mockAllocations });
    api.listMerchants.mockResolvedValue({ merchants: [] });
    api.listRecurringRules.mockResolvedValue({ rules: [] });
    api.getBudgetEnvelopes.mockResolvedValue({ envelopes: [] });
    api.listRecurringCandidates.mockResolvedValue({ candidates: [] });
    api.getForecast.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((c) => c.clear());
  });

  it("renders Accounts tab by default with registered accounts", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Finance" })).toBeInTheDocument();
    expect(await screen.findByText("Chase Checking")).toBeInTheDocument();
    expect(screen.getByText("Amex Gold")).toBeInTheDocument();
    expect(screen.getByText("****4521")).toBeInTheDocument();
  });

  it("activates Budgets tab directly when ?tab=budgets is in URL", async () => {
    renderPage("?tab=budgets");

    expect(await screen.findByText("Total budgeted: 1950.00 USD")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Housing" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Groceries" })).toBeInTheDocument();
    expect(screen.getByText("1500.00")).toBeInTheDocument();
    expect(screen.getByText("450.00")).toBeInTheDocument();
  });

  it("applies category presets on click and allows clearing the form", async () => {
    renderPage("?tab=budgets");

    await screen.findByRole("cell", { name: "Housing" });

    const categoryInput = screen.getByLabelText("Category");
    const amountInput = screen.getByLabelText("Amount");

    // Click preset "Entertainment"
    const entertainmentChip = screen.getByRole("button", { name: "Entertainment" });
    fireEvent.click(entertainmentChip);

    expect(categoryInput).toHaveValue("Entertainment");

    // Enter an amount
    fireEvent.change(amountInput, { target: { value: "150" } });
    expect(amountInput).toHaveValue("150");

    // Clear button should appear
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);

    expect(categoryInput).toHaveValue("");
    expect(amountInput).toHaveValue("");
  });

  it("submits upsert allocation and deletes existing allocation", async () => {
    api.upsertBudgetAllocation.mockResolvedValue({ allocation: { id: "alloc-3", category: "Dining", amount: 200 } });
    api.deleteBudgetAllocation.mockResolvedValue({ message: "Budget allocation deleted", deleted_id: "alloc-1" });

    renderPage("?tab=budgets");

    await screen.findByRole("cell", { name: "Housing" });

    const categoryInput = screen.getByLabelText("Category");
    const amountInput = screen.getByLabelText("Amount");

    fireEvent.change(categoryInput, { target: { value: "Dining" } });
    fireEvent.change(amountInput, { target: { value: "200" } });

    const upsertBtn = screen.getByRole("button", { name: "Upsert allocation" });
    fireEvent.click(upsertBtn);

    await waitFor(() => {
      expect(api.upsertBudgetAllocation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ category: "Dining", amount: 200 })
      );
    });

    // Delete Housing allocation
    const deleteHousingBtn = screen.getByLabelText("Delete Housing allocation");
    fireEvent.click(deleteHousingBtn);

    await waitFor(() => {
      expect(api.deleteBudgetAllocation).toHaveBeenCalledWith(
        expect.any(String),
        "alloc-1"
      );
    });
  });
  it("steps monthly budget periods using previous and next month buttons", async () => {
    renderPage("?tab=budgets");

    const prevBtn = await screen.findByTestId("btn-prev-budget-period");
    const nextBtn = screen.getByTestId("btn-next-budget-period");
    const periodInput = screen.getByLabelText("Period key");

    const initialVal = periodInput.getAttribute("value") || "";
    fireEvent.click(prevBtn);
    expect(periodInput).not.toHaveValue(initialVal);

    fireEvent.click(nextBtn);
    expect(periodInput).toHaveValue(initialVal);
  });

  it("opens Roll Forward dialog and copies allocations from previous month", async () => {
    api.listBudgetAllocations.mockImplementation(async (periodKey: string) => {
      if (periodKey === "2026-09") {
        return {
          allocations: [
            { id: "prev-1", category: "Rent", amount: 1200, currency: "USD" },
            { id: "prev-2", category: "Utilities", amount: 150, currency: "USD" },
          ],
        };
      }
      return { allocations: mockAllocations };
    });
    api.upsertBudgetAllocation.mockResolvedValue({ allocation: { id: "new-1" } });

    renderPage("?tab=budgets");

    const periodInput = await screen.findByLabelText("Period key");
    fireEvent.change(periodInput, { target: { value: "2026-10" } });

    const rollForwardBtn = screen.getByTestId("roll-forward-budget-btn");
    fireEvent.click(rollForwardBtn);

    const dialog = await screen.findByTestId("dialog-roll-forward-budgets");
    expect(dialog).toBeInTheDocument();
    expect(await within(dialog).findByText("Rent")).toBeInTheDocument();
    expect(await within(dialog).findByText("Utilities")).toBeInTheDocument();

    const bufferBtn = screen.getByRole("button", { name: /\+5% \(Inflation Buffer\)/i });
    fireEvent.click(bufferBtn);

    const confirmBtn = screen.getByTestId("confirm-roll-forward-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.upsertBudgetAllocation).toHaveBeenCalledWith(
        "2026-10",
        expect.objectContaining({ category: "Rent", amount: 1260 })
      );
      expect(api.upsertBudgetAllocation).toHaveBeenCalledWith(
        "2026-10",
        expect.objectContaining({ category: "Utilities", amount: 158 })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Budgets Rolled Forward",
      })
    );
  });

  it("opens Smart Budget Recommendations dialog and applies calculated spending caps", async () => {
    api.getForecast.mockResolvedValue({
      top_categories: [
        { category: "Groceries", expense_monthly_avg: 400 },
        { category: "Dining", expense_monthly_avg: 250 },
      ],
    });
    api.upsertBudgetAllocation.mockResolvedValue({ allocation: { id: "new-smart-1" } });

    renderPage("?tab=budgets");

    const smartBtn = await screen.findByTestId("auto-budget-suggest-btn");
    fireEvent.click(smartBtn);

    const dialog = await screen.findByTestId("dialog-smart-budget-suggestions");
    expect(dialog).toBeInTheDocument();
    expect(await within(dialog).findByText("Avg: 400.00")).toBeInTheDocument();
    expect(await within(dialog).findByText("Avg: 250.00")).toBeInTheDocument();

    const applyBtn = screen.getByTestId("confirm-apply-smart-suggestions-btn");
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(api.upsertBudgetAllocation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ category: "Groceries", amount: 440 })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Recommended Caps Applied",
      })
    );
  });

  it("renders live envelope spend, remaining balance, and burn indicators", async () => {
    api.getBudgetEnvelopes.mockResolvedValue({
      totals: { planned: 1950, spent: 1600, remaining: 350, unbudgeted_spent: 0 },
      envelopes: [
        { category: "Housing", planned: 1500, spent: 1600, remaining: -100, currency: "USD", tx_count: 1, unbudgeted: false },
        { category: "Groceries", planned: 450, spent: 300, remaining: 150, currency: "USD", tx_count: 3, unbudgeted: false },
      ],
    });

    renderPage("?tab=budgets");

    expect(await screen.findByText("Spent to date:")).toBeInTheDocument();
    expect(screen.getByText("1600.00 USD")).toBeInTheDocument();
    expect(screen.getByText("-100.00 over")).toBeInTheDocument();
    expect(screen.getByText("OVER")).toBeInTheDocument();
    expect(screen.getByText("150.00 left")).toBeInTheDocument();
  });
});
