import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Transactions from "./Transactions";
import * as apiClient from "@/lib/apiClient";

vi.mock("@/lib/apiClient", async () => {
  const actual = await vi.importActual<typeof apiClient>("@/lib/apiClient");
  return {
    ...actual,
    getTransactions: vi.fn().mockResolvedValue({ transactions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    bulkDeleteTransactions: vi.fn(),
    bulkCategorizeTransactions: vi.fn(),
    createRecurringRule: vi.fn(),
    getMerchantClusters: vi.fn().mockResolvedValue({
      clusters: [
        {
          cluster_key: "starbucks",
          normalized_name: "Starbucks",
          raw_descriptions: ["Starbucks Coffee", "STARBUCKS #1042"],
          transaction_ids: ["tx-1"],
          count: 2,
          total_spend: 25.0,
          suggested_category: "Food & Dining",
          confidence: 0.95,
        },
      ],
      total_clusters: 1,
      currency: "USD",
      fx_rate: 1.0,
      currency_symbol: "$",
    }),
    applyMerchantCluster: vi.fn().mockResolvedValue({
      success: true,
      updated_count: 2,
      normalized_name: "Starbucks",
      category: "Food & Dining",
    }),
    ingestBankFeed: vi.fn().mockResolvedValue({
      success: true,
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      processed: 1,
      inserted: 1,
      duplicates_skipped: 0,
    }),
  };
});

vi.mock("@/hooks/useOrgFormatters", () => ({
  useOrgFormatters: () => ({
    formatMoney: (v: number) => `USD ${Math.round(v)}`,
    formatDate: (d: string) => String(d).slice(0, 10),
    currency: "USD",
  }),
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast }) }));

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
function renderPage(txList: Awaited<ReturnType<typeof apiClient.getTransactions>>["transactions"] = mockTransactions) {
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
  vi.mocked(apiClient.getMerchantClusters).mockResolvedValue({
    clusters: [
      {
        cluster_key: "starbucks",
        normalized_name: "Starbucks",
        raw_descriptions: ["Starbucks Coffee", "STARBUCKS #1042"],
        transaction_ids: ["tx-1"],
        count: 2,
        total_spend: 25.0,
        suggested_category: "Food & Dining",
        confidence: 0.95,
      },
    ],
    total_clusters: 1,
    currency: "USD",
    fx_rate: 1.0,
    currency_symbol: "$",
  });
  vi.mocked(apiClient.applyMerchantCluster).mockResolvedValue({
    success: true,
    updated_count: 2,
    normalized_name: "Starbucks",
    category: "Food & Dining",
  });
  vi.mocked(apiClient.ingestBankFeed).mockResolvedValue({
    success: true,
    webhook_type: "TRANSACTIONS",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    processed: 1,
    inserted: 1,
    duplicates_skipped: 0,
  });
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

it("keeps split drafts open until confirmation, preserves failed saves, and retries", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<never>((_resolve, rejectRequest) => { reject = rejectRequest; });
  vi.mocked(apiClient.updateTransaction).mockReturnValueOnce(pending);
  renderPage();
  fireEvent.click(await screen.findByTestId("btn-split-transaction-tx-1"));
  fireEvent.change(screen.getByTestId("select-split-category-0"), { target: { value: "Groceries" } });
  fireEvent.change(screen.getByTestId("select-split-category-1"), { target: { value: "Utilities" } });
  fireEvent.click(screen.getByTestId("btn-submit-split"));
  await waitFor(() => expect(apiClient.updateTransaction).toHaveBeenCalled());
  expect(screen.getByTestId("dialog-split-transaction")).toBeInTheDocument();
  expect(screen.getByTestId("btn-submit-split")).toBeDisabled();
  expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Transaction Split Saved" }));
  await act(async () => { reject(new Error("Network unavailable")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
  expect(screen.getByRole("combobox", { name: "Split 1 category" })).toHaveValue("Groceries");
  expect(screen.getByRole("spinbutton", { name: "Split 1 amount" })).toHaveValue(2.75);
  vi.mocked(apiClient.updateTransaction).mockResolvedValueOnce({ message: "Saved", transaction: mockTransactions[0] });
  fireEvent.click(screen.getByTestId("btn-submit-split"));
  await waitFor(() => expect(screen.queryByTestId("dialog-split-transaction")).not.toBeInTheDocument());
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Transaction Split Saved" }));
});

it("does not announce split clearing when the server rejects it", async () => {
  vi.mocked(apiClient.updateTransaction).mockRejectedValueOnce(new Error("Update rejected"));
  renderPage();
  fireEvent.click(await screen.findByTestId("badge-split-transaction"));
  fireEvent.click(screen.getByTestId("btn-clear-splits-tx-4"));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Update failed" })));
  expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Splits Cleared" }));
  expect(screen.getByTestId("split-breakdown-tx-4")).toBeInTheDocument();
});

it("retains saved custom split categories in the editor", async () => {
  renderPage();
  fireEvent.click(await screen.findByTestId("btn-split-transaction-tx-4"));
  expect(screen.getByRole("combobox", { name: "Split 2 category" })).toHaveValue("Household Supplies");
});

it("edits the original ledger value when the API returns a converted amount", async () => {
  renderPage([{ ...mockTransactions[0], amount: -5.06, raw_amount: -5.5, currency: "EUR", category: "Imported custom category" }]);
  fireEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
  expect(screen.getByRole("spinbutton", { name: "Amount (USD)" })).toHaveValue(5.5);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByTestId("btn-make-recurring-tx-1"));
  expect(screen.getByTestId("select-recurring-rule-category")).toHaveValue("Imported custom category");
});

it("uses original amounts for split and recurring actions instead of FX estimates", async () => {
  renderPage([{ ...mockTransactions[3], amount: -138, raw_amount: -150, currency: "EUR",
    splits: [{ category: "Groceries", amount: 92, raw_amount: 100 }, { category: "Household Supplies", amount: 46, raw_amount: 50 }],
  }]);
  fireEvent.click(await screen.findByTestId("btn-split-transaction-tx-4"));
  expect(screen.getByRole("spinbutton", { name: "Split 1 amount" })).toHaveValue(100);
  expect(screen.getByRole("spinbutton", { name: "Split 2 amount" })).toHaveValue(50);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByTestId("btn-make-recurring-tx-4"));
  expect(screen.getByRole("spinbutton", { name: "Expected Amount (USD)" })).toHaveValue(150);
});

it("prevents editing a converted transaction when the original value is unavailable", async () => {
  renderPage([{ ...mockTransactions[0], amount: -5.06, currency: "EUR" }]);
  fireEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
  expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Original amount unavailable" }));
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

it("renders Multi-Currency FX Cockpit and switches currencies dynamically with deterministic FX rates", async () => {
  renderPage();

  expect(await screen.findByTestId("card-transactions-currency-normalization")).toBeInTheDocument();
  expect(screen.getByTestId("badge-transactions-reporting-currency")).toHaveTextContent("Active: USD ($)");
  expect(screen.getByTestId("badge-transactions-fx-rate")).toHaveTextContent("1 USD = 1 USD");

  // Verify all 7 currency pills exist
  for (const curr of ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]) {
    expect(screen.getByTestId(`btn-transactions-currency-${curr}`)).toBeInTheDocument();
  }

  // Switch to EUR
  fireEvent.click(screen.getByTestId("btn-transactions-currency-EUR"));
  expect(screen.getByTestId("badge-transactions-reporting-currency")).toHaveTextContent("Active: EUR (€)");
  expect(screen.getByTestId("badge-transactions-fx-rate")).toHaveTextContent("1 USD = 0.92 EUR");

  // Switch to JPY via dropdown
  const currSelect = screen.getByTestId("select-transactions-currency");
  fireEvent.change(currSelect, { target: { value: "JPY" } });
  expect(screen.getByTestId("badge-transactions-reporting-currency")).toHaveTextContent("Active: JPY (¥)");
  expect(screen.getByTestId("badge-transactions-fx-rate")).toHaveTextContent("1 USD = 155 JPY");
});

it("renders Automated Merchant Clustering Engine and applies 1-click normalization", async () => {
  renderPage();

  expect(await screen.findByTestId("card-merchant-clustering-engine")).toBeInTheDocument();
  expect(screen.getByTestId("badge-merchant-cluster-count")).toHaveTextContent("1 Merchant Cluster");
  expect(screen.getByTestId("badge-merchant-cluster-confidence")).toHaveTextContent("Suggested matches");
  fireEvent.click(screen.getByText("Review 1 suggested match"));
  expect(screen.getByTestId("text-merchant-variants")).toHaveTextContent("Starbucks Coffee, STARBUCKS #1042");

  // Click Apply Normalization
  const applyBtn = screen.getByTestId("btn-apply-merchant-cluster-starbucks");
  fireEvent.click(applyBtn);

  await waitFor(() => {
    expect(apiClient.applyMerchantCluster).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster_key: "starbucks",
        normalized_name: "Starbucks",
        category: "Food & Dining",
        transaction_ids: ["tx-1"],
      }),
      expect.anything()
    );
  });
});

it("opens Bank Connector Webhook Feed Simulator and simulates real-time transaction ingestion", async () => {
  renderPage();

  expect(await screen.findByTestId("btn-open-bank-feed-modal")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("btn-open-bank-feed-modal"));

  expect(screen.getByTestId("dialog-bank-feed-simulation")).toBeInTheDocument();

  // Switch to Amazon preset
  const amazonPresetBtn = screen.getByTestId("preset-bank-feed-amazon");
  fireEvent.click(amazonPresetBtn);

  // Click Simulate Ingestion
  const simulateBtn = screen.getByTestId("btn-simulate-bank-feed");
  fireEvent.click(simulateBtn);

  await waitFor(() => {
    expect(apiClient.ingestBankFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        webhook_type: "TRANSACTIONS",
        webhook_code: "SYNC_UPDATES_AVAILABLE",
        transactions: expect.arrayContaining([
          expect.objectContaining({
            amount: 84.99,
            name: "AMZN Mktp US*3B982 Seattle WA",
            category: ["Shopping", "General Merchandise"],
          }),
        ]),
      }),
      expect.anything()
    );
  });
});

it("sends the review filter to the server so pagination totals match the filtered list", async () => {
  renderPage();
  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Review"), { target: { value: "recurring_candidate" } });
  await waitFor(() => {
    expect(apiClient.getTransactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, review_flag: "recurring_candidate", needs_review: undefined })
    );
  });

  fireEvent.change(screen.getByLabelText("Review"), { target: { value: "needs_attention" } });
  await waitFor(() => {
    expect(apiClient.getTransactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ needs_review: true, review_flag: undefined })
    );
  });
});

it("does not accept a zero amount in the create form", async () => {
  renderPage();
  expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /Add Transaction/ })[0]);
  expect(screen.getByLabelText("Amount (USD)")).toHaveAttribute("min", "0.01");
});

it("scrolls the add/edit form into view and focuses the amount field when opened", async () => {
  const scrollSpy = vi.fn();
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollSpy;
  try {
    renderPage();
    expect(await screen.findByText("Starbucks Coffee")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Add Transaction/ })[0]);
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(document.activeElement).toBe(screen.getByLabelText("Amount (USD)"));
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});
