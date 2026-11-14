test_file = r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Transactions.test.tsx"

with open(test_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add createRecurringRule to mock
old_mock = """    deleteTransaction: vi.fn(),
    bulkDeleteTransactions: vi.fn(),
    bulkCategorizeTransactions: vi.fn(),
  };"""

new_mock = """    deleteTransaction: vi.fn(),
    bulkDeleteTransactions: vi.fn(),
    bulkCategorizeTransactions: vi.fn(),
    createRecurringRule: vi.fn(),
  };"""
content = content.replace(old_mock, new_mock)

# 2. Add tx-4 with splits to mockTransactions
old_txs = """  {
    id: "tx-3",
    _id: "tx-3",
    description: "Paycheck",
    amount: 2500,
    type: "income" as const,
    category: "Income",
    date: "2026-02-01T09:00:00.000Z",
  },
];"""

new_txs = """  {
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
];"""
content = content.replace(old_txs, new_txs)

# 3. Add 4 new tests
new_tests = """
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
"""

content = content + "\n" + new_tests

with open(test_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully updated Transactions.test.tsx")
