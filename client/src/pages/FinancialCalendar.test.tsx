import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialCalendar from "./FinancialCalendar";

const apiCore = vi.hoisted(() => ({
  apiClient: vi.fn(),
}));

const apiTx = vi.hoisted(() => ({
  createTransaction: vi.fn(),
}));

vi.mock("@/lib/api/core", () => ({
  ...apiCore,
}));

vi.mock("@/lib/api/transactions", () => ({
  ...apiTx,
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      org: {
        role: "admin",
        currency: "USD",
        locale: "en-US",
      },
    },
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockTransactions = [
  {
    _id: "tx-1",
    amount: 150.25,
    category: "Groceries",
    description: "Trader Joe's groceries",
    date: "2026-10-15T14:30:00.000Z",
    type: "expense" as const,
  },
  {
    _id: "tx-2",
    amount: 3200,
    category: "Salary",
    description: "Bi-weekly paycheck",
    date: "2026-10-15T09:00:00.000Z",
    type: "income" as const,
  },
  {
    _id: "tx-3",
    amount: 45,
    category: "Dining",
    description: "Coffee and bagel",
    date: "2026-10-20T10:15:00.000Z",
    type: "expense" as const,
  },
];

const mockReminders = [
  {
    id: "rem-1",
    date: "2026-10-15",
    title: "Pay electric bill",
    description: "Monthly ConEd bill",
    completed: false,
  },
  {
    id: "rem-2",
    date: "2026-10-20",
    title: "Car insurance due",
    description: "Geico payment",
    completed: true,
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
      <FinancialCalendar />
    </QueryClientProvider>
  );
}

describe("FinancialCalendar Page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    vi.clearAllMocks();
    // Default mock responses
    apiCore.apiClient.mockImplementation(async (url: string, opts?: any) => {
      if (url.startsWith("/calendar-reminders") && (!opts || opts.method === "GET")) {
        return { reminders: mockReminders };
      }
      if (url.startsWith("/transactions") && (!opts || opts.method === "GET")) {
        return { transactions: mockTransactions, pagination: { totalPages: 1 } };
      }
      if (url === "/calendar-reminders" && opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        return {
          reminder: {
            id: "rem-new",
            date: body.date,
            title: body.title,
            completed: false,
          },
        };
      }
      if (url.includes("/toggle") && opts?.method === "PATCH") {
        return {
          reminder: {
            id: "rem-1",
            title: "Pay electric bill",
            completed: true,
          },
        };
      }
      if (url.startsWith("/finance/recurring/candidates")) {
        return {
          candidates: [
            {
              candidate_id: "cand-1",
              cadence: "monthly",
              confidence: 0.95,
              occurrences: 6,
              description_sample: "Netflix Subscription",
              amount_avg: 15.99,
              last_seen_at: "2026-10-14T10:00:00.000Z",
              suggested_rule: {
                name: "Netflix monthly",
                cron: "0 9 14 * *",
                amount: 15.99,
                category: "Entertainment",
              },
            },
          ],
        };
      }
      if (url.startsWith("/calendar-reminders/") && opts?.method === "DELETE") {
        return { success: true };
      }
      return {};
    });

    apiTx.createTransaction.mockResolvedValue({
      id: "tx-new",
      amount: 75.5,
      category: "Groceries",
      description: "Organic milk and produce",
      type: "expense",
      date: "2026-10-15",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    for (const c of clients) c.clear();
    clients.length = 0;
  });

  it("renders page header, monthly totals, and weekday grid", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: /Financial Calendar/i })).toBeInTheDocument();
    expect(screen.getByText(/Visualize your transactions and reminders day by day/i)).toBeInTheDocument();

    // Check weekday column headers
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }

    // Monthly totals calculated from mock transactions:
    // Income: 3200, Expense: 150.25 + 45 = 195.25, Net: ~3005
    expect(await screen.findByText("$3,200")).toBeInTheDocument();
    expect(screen.getByText("$195")).toBeInTheDocument();
    expect(screen.getByText("+$3,005")).toBeInTheDocument();

    // Pending reminders badge
    expect(screen.getByText("1 pending")).toBeInTheDocument();
  });

  it("displays reminder indicator dots on cells and opens day detail on click", async () => {
    renderPage();

    // Expect reminder indicator dot on 2026-10-15
    const dot15 = await screen.findByTestId("reminder-indicator-2026-10-15");
    expect(dot15).toBeInTheDocument();

    // Click day cell for October 15
    const cell15 = screen.getByTestId("cal-day-2026-10-15");
    fireEvent.click(cell15);

    // Detail panel header reflects date
    expect(await screen.findByText(/Thu, Oct 15, 2026/i)).toBeInTheDocument();
    expect(screen.getByText("2 txs")).toBeInTheDocument();
    expect(screen.getByText("1 reminder")).toBeInTheDocument();

    // Transactions listed
    expect(screen.getByText("Trader Joe's groceries")).toBeInTheDocument();
    expect(screen.getByText("Bi-weekly paycheck")).toBeInTheDocument();
    expect(screen.getByText("-$150")).toBeInTheDocument();
    expect(screen.getByText("+$3,200")).toBeInTheDocument();

    // Reminders listed
    expect(screen.getByText("Pay electric bill")).toBeInTheDocument();
  });

  it("adds a new reminder using preset pill and submits mutation", async () => {
    renderPage();

    // Select October 15
    const cell15 = await screen.findByTestId("cal-day-2026-10-15");
    fireEvent.click(cell15);

    // Toggle add reminder form
    const toggleBtn = screen.getByTestId("button-toggle-add-reminder");
    fireEvent.click(toggleBtn);

    // Form appears
    const input = screen.getByTestId("input-reminder-title");
    expect(input).toBeInTheDocument();

    // Click preset chip "Pay rent"
    const rentChip = screen.getByRole("button", { name: "Pay rent" });
    fireEvent.click(rentChip);
    expect(input).toHaveValue("Pay rent");

    // Submit form
    const submitBtn = screen.getByTestId("button-submit-reminder");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiCore.apiClient).toHaveBeenCalledWith(
        "/calendar-reminders",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ date: "2026-10-15", title: "Pay rent" }),
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reminder Added",
        description: expect.stringContaining("Pay rent"),
      })
    );
  });

  it("toggles and deletes reminders with toast feedback", async () => {
    renderPage();

    // Select October 15
    const cell15 = await screen.findByTestId("cal-day-2026-10-15");
    fireEvent.click(cell15);

    // Toggle reminder
    const toggleBtn = await screen.findByTestId("reminder-toggle-rem-1");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(apiCore.apiClient).toHaveBeenCalledWith("/calendar-reminders/rem-1/toggle", {
        method: "PATCH",
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reminder Completed",
      })
    );

    // Delete reminder
    const deleteBtn = screen.getByTestId("reminder-delete-rem-1");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(apiCore.apiClient).toHaveBeenCalledWith("/calendar-reminders/rem-1", {
        method: "DELETE",
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reminder Deleted",
      })
    );
  });

  it("opens Add Transaction dialog for selected day and saves transaction", async () => {
    renderPage();

    // Select October 15
    const cell15 = await screen.findByTestId("cal-day-2026-10-15");
    fireEvent.click(cell15);

    // Click Add Tx button in day detail panel
    const addTxBtn = await screen.findByTestId("button-add-calendar-tx");
    fireEvent.click(addTxBtn);

    // Dialog opens
    expect(await screen.findByTestId("dialog-add-calendar-tx")).toBeInTheDocument();
    expect(screen.getByText(/Record a transaction for 2026-10-15/i)).toBeInTheDocument();

    // Fill form
    const amountInput = screen.getByTestId("input-calendar-tx-amount");
    fireEvent.change(amountInput, { target: { value: "75.50" } });

    // Click category preset "Groceries"
    const groceriesChip = screen.getByRole("button", { name: "Groceries" });
    fireEvent.click(groceriesChip);

    const descInput = screen.getByTestId("input-calendar-tx-description");
    fireEvent.change(descInput, { target: { value: "Organic milk and produce" } });

    // Submit dialog
    const saveBtn = screen.getByTestId("button-submit-calendar-tx");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiTx.createTransaction).toHaveBeenCalledWith({
        amount: 75.5,
        category: "Groceries",
        description: "Organic milk and produce",
        type: "expense",
        date: "2026-10-15",
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Transaction Added",
      })
    );
  });

  it("navigates next month, previous month, and restores today", async () => {
    renderPage();

    const titleEl = await screen.findByTestId("calendar-month-heading");
    const initialTitle = titleEl.textContent;

    // Click Next month
    const nextBtn = screen.getByRole("button", { name: "Next month" });
    fireEvent.click(nextBtn);

    const nextTitle = screen.getByTestId("calendar-month-heading").textContent;
    expect(nextTitle).not.toBe(initialTitle);

    // Click Previous month
    const prevBtn = screen.getByRole("button", { name: "Previous month" });
    fireEvent.click(prevBtn);

    const restoredTitle = screen.getByTestId("calendar-month-heading").textContent;
    expect(restoredTitle).toBe(initialTitle);
  });

  it("opens sync recurring bills dialog, selects candidate bill, and schedules reminder", async () => {
    renderPage();

    const syncTriggerBtn = await screen.findByTestId("sync-bills-trigger-btn");
    expect(syncTriggerBtn).toBeInTheDocument();
    expect(await screen.findByTestId("recurring-candidates-count")).toHaveTextContent("1");

    fireEvent.click(syncTriggerBtn);

    const dialog = await screen.findByTestId("dialog-sync-recurring-bills");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Netflix Subscription")).toBeInTheDocument();
    expect(screen.getByText("Projected day 14 of month")).toBeInTheDocument();

    const confirmBtn = screen.getByTestId("confirm-sync-bills-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiCore.apiClient).toHaveBeenCalledWith(
        "/calendar-reminders",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Netflix Subscription"),
        })
      );
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Bills Synced",
        })
      );
    });
  });

  it("exports calendar reminders to RFC 5545 .ics format", async () => {
    const origCreateObjectURL = window.URL.createObjectURL;
    const origRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => "blob:test-calendar-ics");
    window.URL.revokeObjectURL = vi.fn();

    renderPage();

    // Wait for reminders to be loaded
    expect(await screen.findByText("1 pending")).toBeInTheDocument();

    const exportBtn = await screen.findByTestId("export-calendar-ics-btn");
    expect(exportBtn).toBeInTheDocument();

    fireEvent.click(exportBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Calendar Exported",
      })
    );

    window.URL.createObjectURL = origCreateObjectURL;
    window.URL.revokeObjectURL = origRevokeObjectURL;
  });
});
