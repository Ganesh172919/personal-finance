import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Transactions from "./Transactions";
import * as apiClient from "@/lib/apiClient";

vi.mock("@/lib/apiClient", async () => {
  const actual = await vi.importActual<typeof apiClient>("@/lib/apiClient");
  return {
    ...actual,
    getTransactions: vi.fn(),
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    bulkDeleteTransactions: vi.fn(),
    bulkCategorizeTransactions: vi.fn(),
    createRecurringRule: vi.fn(),
  };
});

vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    formatMoney: (v: number) => `USD ${Math.round(v)}`,
    formatDate: (d: string) => String(d).slice(0, 10),
    currency: "USD",
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockTransactions = [
  {
    id: "tx-1",
    _id: "tx-1",
    description: "Starbucks Coffee",
    amount: -5.5,
    type: "expense" as const,
    category: "Uncategorized",
    date: "2026-02-10T10:00:00.000Z",
  },
  {
    id: "tx-2",
    _id: "tx-2",
    description: "Uber Ride",
    amount: -24.0,
    type: "expense" as const,
    category: "Uncategorized",
    date: "2026-02-11T12:00:00.000Z",
  },
  {
    id: "tx-3",
    _id: "tx-3",
    description: "Paycheck",
    amount: 2500,
    type: "income" as const,
    category: "Income",
    date: "2026-02-01T09:00:00.000Z",
  },
  {
    id: "tx-4",
    _id: "tx-4",
    description: "Target Groceries & Household",
    amount: -150,
    type: "expense" as const,
    category: "Shopping",
    date: "2026-02-12T14:00:00.000Z",
    splits: [
      { category: "Groceries", amount: 100 },
      { category: "Household Supplies", amount: 50 },
    ],
  },
];

const clients: QueryClient[] = [];
function renderPage(txList = mockTransactions) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  vi.mocked(apiClient.getTransactions).mockResolvedValue({
    transactions: txList,
    pagination: { page: 1, limit: 20, total: txList.length, totalPages: 1 },
  });

  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <Transactions />
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  window.confirm = vi.fn().mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.clearAllMocks();
});

it("renders the transaction ledger with items", async () => {
  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();
  expect(screen.getByText("Uber Ride")).toBeInTheDocument();
  expect(screen.getByText("Paycheck")).toBeInTheDocument();
  expect(screen.getByText("Select all visible (4)")).toBeInTheDocument();
});

it("selects individual transactions and shows the batch actions bar", async () => {
  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  // Batch actions bar is not visible initially
  expect(screen.queryByTestId("batch-actions-bar")).not.toBeInTheDocument();

  // Select Starbucks
  const starbucksCheckbox = screen.getByLabelText("Select transaction Starbucks Coffee");
  fireEvent.click(starbucksCheckbox);

  // Batch actions bar should now appear
  expect(screen.getByTestId("batch-actions-bar")).toBeInTheDocument();
  expect(within(screen.getByTestId("batch-actions-bar")).getByText(/1 selected/i)).toBeInTheDocument();

  // Select Uber
  const uberCheckbox = screen.getByLabelText("Select transaction Uber Ride");
  fireEvent.click(uberCheckbox);

  expect(within(screen.getByTestId("batch-actions-bar")).getByText(/2 selected/i)).toBeInTheDocument();
});

it("toggles select all visible transactions", async () => {
  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  const selectAllCheckbox = screen.getByLabelText("Select all visible transactions");
  fireEvent.click(selectAllCheckbox);

  expect(within(screen.getByTestId("batch-actions-bar")).getByText(/4 selected/i)).toBeInTheDocument();

  // Click again to deselect all
  fireEvent.click(selectAllCheckbox);
  expect(screen.queryByTestId("batch-actions-bar")).not.toBeInTheDocument();
});

it("executes batch categorization on selected transactions", async () => {
  vi.mocked(apiClient.bulkCategorizeTransactions).mockResolvedValue({
    message: "Transactions categorized",
    modified_count: 2,
    category: "Transportation",
  });

  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  // Select 2 items
  fireEvent.click(screen.getByLabelText("Select transaction Starbucks Coffee"));
  fireEvent.click(screen.getByLabelText("Select transaction Uber Ride"));

  // Select category
  const select = screen.getByTestId("batch-category-select");
  fireEvent.change(select, { target: { value: "Transportation" } });

  const applyBtn = screen.getByRole("button", { name: "Apply Category" });
  fireEvent.click(applyBtn);

  await waitFor(() => {
    expect(apiClient.bulkCategorizeTransactions).toHaveBeenCalledWith(
      expect.arrayContaining(["tx-1", "tx-2"]),
      "Transportation"
    );
  });
});

it("executes batch deletion on selected transactions after confirmation", async () => {
  vi.mocked(apiClient.bulkDeleteTransactions).mockResolvedValue({
    message: "Transactions deleted",
    deleted_count: 2,
  });

  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  // Select 2 items
  fireEvent.click(screen.getByLabelText("Select transaction Starbucks Coffee"));
  fireEvent.click(screen.getByLabelText("Select transaction Uber Ride"));

  const deleteBtn = screen.getByRole("button", { name: "Delete (2)" });
  fireEvent.click(deleteBtn);

  await waitFor(() => {
    expect(apiClient.bulkDeleteTransactions).toHaveBeenCalledWith(
      expect.arrayContaining(["tx-1", "tx-2"])
    );
  });
});


it("opens Split Transaction dialog and saves multi-category allocation", async () => {
  vi.mocked(apiClient.updateTransaction).mockResolvedValueOnce({
    message: "Transaction updated",
    transaction: { id: "tx-1", amount: -5.5, category: "Food & Dining" },
  });

  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  // Click Split button for tx-1
  const splitBtn = screen.getByTestId("btn-split-transaction-tx-1");
  fireEvent.click(splitBtn);

  expect(screen.getByTestId("dialog-split-transaction")).toBeInTheDocument();
  expect(screen.getByText(/Split Transaction/i)).toBeInTheDocument();

  // Select categories and amounts for the 2 rows
  const cat0 = screen.getByTestId("select-split-category-0");
  fireEvent.change(cat0, { target: { value: "Food & Dining" } });
  const amt0 = screen.getByTestId("input-split-amount-0");
  fireEvent.change(amt0, { target: { value: "3.50" } });

  const cat1 = screen.getByTestId("select-split-category-1");
  fireEvent.change(cat1, { target: { value: "Entertainment" } });
  const amt1 = screen.getByTestId("input-split-amount-1");
  fireEvent.change(amt1, { target: { value: "2.00" } });

  // Status should be balanced (3.50 + 2.00 = 5.50)
  expect(screen.getByTestId("badge-split-status")).toHaveTextContent("Balanced");

  // Submit split
  const submitSplitBtn = screen.getByTestId("btn-submit-split");
  expect(submitSplitBtn).not.toBeDisabled();
  fireEvent.click(submitSplitBtn);

  await waitFor(() => {
    expect(apiClient.updateTransaction).toHaveBeenCalledWith(
      "tx-1",
      expect.objectContaining({
        splits: [
          { category: "Food & Dining", amount: 3.5 },
          { category: "Entertainment", amount: 2 },
        ],
      })
    );
  });
});

it("renders split badge and toggles breakdown details for split transactions", async () => {
  renderPage();

  expect(await screen.findByText("Target Groceries & Household")).toBeInTheDocument();

  // Badge should be visible
  const splitBadge = screen.getByTestId("badge-split-transaction");
  expect(splitBadge).toBeInTheDocument();
  expect(splitBadge).toHaveTextContent("Split (2)");

  // Click to expand details
  fireEvent.click(splitBadge);

  expect(screen.getByTestId("split-breakdown-tx-4")).toBeInTheDocument();
  expect(within(screen.getByTestId("split-breakdown-tx-4")).getByText("Groceries")).toBeInTheDocument();
  expect(within(screen.getByTestId("split-breakdown-tx-4")).getByText("Household Supplies")).toBeInTheDocument();
});

it("clears split breakdown and restores unified category", async () => {
  vi.mocked(apiClient.updateTransaction).mockResolvedValueOnce({
    message: "Transaction updated",
    transaction: { id: "tx-4", amount: -150, category: "Shopping" },
  });

  renderPage();

  expect(await screen.findByText("Target Groceries & Household")).toBeInTheDocument();

  // Expand breakdown
  fireEvent.click(screen.getByTestId("badge-split-transaction"));

  // Click Clear Splits
  const clearBtn = screen.getByTestId("btn-clear-splits-tx-4");
  fireEvent.click(clearBtn);

  await waitFor(() => {
    expect(apiClient.updateTransaction).toHaveBeenCalledWith(
      "tx-4",
      expect.objectContaining({
        splits: [],
      })
    );
  });
});

it("opens Create Recurring Rule dialog and submits new rule for transaction", async () => {
  vi.mocked(apiClient.createRecurringRule).mockResolvedValueOnce({
    org_id: "org-1",
    rule: {
      id: "rule-1",
      name: "Starbucks Coffee",
      status: "active",
      cron: "0 0 * * 1",
      merchant_id: null,
      merchant_name: null,
      category: "Uncategorized",
      amount_min: 5.5,
      amount_max: 5.5,
      next_run_at: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    request_id: "req-1",
  });

  renderPage();

  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  // Click Recurring button on tx-1
  const recBtn = screen.getByTestId("btn-make-recurring-tx-1");
  fireEvent.click(recBtn);

  expect(screen.getByTestId("dialog-create-recurring-rule")).toBeInTheDocument();
  expect(screen.getByTestId("input-recurring-rule-name")).toHaveValue("Starbucks Coffee");

  // Select Weekly frequency
  const freqSelect = screen.getByTestId("select-recurring-rule-frequency");
  fireEvent.change(freqSelect, { target: { value: "weekly" } });

  // Click Create Rule
  const submitBtn = screen.getByTestId("btn-submit-recurring-rule");
  fireEvent.click(submitBtn);

  await waitFor(() => {
    expect(apiClient.createRecurringRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Starbucks Coffee",
        cron: "0 0 * * 1",
        amount_min: 5.5,
        amount_max: 5.5,
        status: "active",
      })
    );
  });
});
