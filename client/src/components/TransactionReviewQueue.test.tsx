import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TransactionReviewQueue from "./TransactionReviewQueue";

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
    formatDate: (d: string) => String(d).slice(0, 10),
  }),
}));

const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const apiTransactions = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  approveTransaction: vi.fn(),
  bulkApproveTransactions: vi.fn(),
  alwaysCategorize: vi.fn(),
}));

vi.mock("@/lib/api/transactions", () => ({
  ...apiTransactions,
}));

const mockReviewTransactions = [
  {
    id: "tx-rev-1",
    amount: -45.5,
    category: "Uncategorized",
    description: "Corner Market Groceries",
    date: "2026-10-28T14:30:00Z",
    type: "expense" as const,
    review: {
      needs_attention: true,
      flags: ["uncategorized" as const],
      notes: ["Confidence score below automated threshold"],
      confidence_score: 0.35,
    },
  },
  {
    id: "tx-rev-2",
    amount: -120.0,
    category: "Software",
    description: "GitHub Enterprise Copilot",
    date: "2026-10-29T09:15:00Z",
    type: "expense" as const,
    review: {
      needs_attention: true,
      flags: ["suspected_duplicate" as const],
      notes: ["Similar transaction of $120.00 detected within 24h"],
      confidence_score: 0.88,
    },
  },
  {
    id: "tx-rev-3",
    amount: -18.75,
    category: "Transportation",
    description: "Transit Card Top-Up",
    date: "2026-10-30T08:00:00Z",
    type: "expense" as const,
    review: {
      needs_attention: true,
      flags: ["needs_merchant_match" as const],
      confidence_score: 0.55,
    },
  },
];

describe("TransactionReviewQueue Component", () => {
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

    apiTransactions.getTransactions.mockResolvedValue({
      transactions: mockReviewTransactions,
      total: mockReviewTransactions.length,
      page: 1,
      limit: 100,
    });
    apiTransactions.approveTransaction.mockResolvedValue({ success: true });
    apiTransactions.bulkApproveTransactions.mockResolvedValue({ modified: 3 });
    apiTransactions.alwaysCategorize.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  const renderReviewQueue = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TransactionReviewQueue />
      </QueryClientProvider>,
    );
  };

  it("renders pending review transactions with confidence badges, amounts, and flags", async () => {
    renderReviewQueue();

    // Wait until loading finishes and the first card is visible
    await waitFor(() => {
      expect(screen.getByTestId("card-review-tx-tx-rev-1")).toBeInTheDocument();
    });

    // Check transaction cards
    expect(screen.getByTestId("card-review-tx-tx-rev-2")).toBeInTheDocument();
    expect(screen.getByTestId("card-review-tx-tx-rev-3")).toBeInTheDocument();

    // Descriptions
    expect(screen.getByText("Corner Market Groceries")).toBeInTheDocument();
    expect(screen.getByText("GitHub Enterprise Copilot")).toBeInTheDocument();
    expect(screen.getByText("Transit Card Top-Up")).toBeInTheDocument();

    // Confidence badges (35%, 88%, 55%)
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();

    // Review flags
    expect(screen.getAllByText("Uncategorized").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Duplicate?").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No Merchant").length).toBeGreaterThan(0);

    // Action buttons
    expect(screen.getByTestId("btn-approve-tx-rev-1")).toBeInTheDocument();
    expect(screen.getByTestId("btn-always-categorize-tx-rev-1")).toBeInTheDocument();
    // Non-uncategorized items do not have the 'Always' rule button
    expect(screen.queryByTestId("btn-always-categorize-tx-rev-2")).not.toBeInTheDocument();
  });

  it("filters review queue when clicking filter chips", async () => {
    renderReviewQueue();

    await waitFor(() => {
      expect(screen.getByTestId("card-review-tx-tx-rev-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("filter-chip-suspected_duplicate"));

    await waitFor(() => {
      expect(apiTransactions.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          needs_review: true,
          review_flag: "suspected_duplicate",
        }),
      );
    });

    // Reset to All
    fireEvent.click(screen.getByTestId("filter-chip-all"));

    await waitFor(() => {
      expect(apiTransactions.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          needs_review: true,
          review_flag: undefined,
        }),
      );
    });
  });

  it("approves single transaction and slides it out of the queue", async () => {
    renderReviewQueue();

    await waitFor(() => {
      expect(screen.getByTestId("btn-approve-tx-rev-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-approve-tx-rev-1"));

    await waitFor(() => {
      expect(apiTransactions.approveTransaction).toHaveBeenCalledWith("tx-rev-1", expect.anything());
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Approved" }),
      );
    });

    // Item should now be filtered out by approvedIds
    await waitFor(() => {
      expect(screen.queryByTestId("card-review-tx-tx-rev-1")).not.toBeInTheDocument();
    });
  });

  it("creates an automated category rule via 'Always ↻'", async () => {
    renderReviewQueue();

    await waitFor(() => {
      expect(screen.getByTestId("btn-always-categorize-tx-rev-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-always-categorize-tx-rev-1"));

    await waitFor(() => {
      expect(apiTransactions.alwaysCategorize).toHaveBeenCalledWith("tx-rev-1", expect.anything());
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Rule Created" }),
      );
    });

    // Item should now be removed from visible list
    await waitFor(() => {
      expect(screen.queryByTestId("card-review-tx-tx-rev-1")).not.toBeInTheDocument();
    });
  });

  it("supports multi-select, select-all, and bulk approve", async () => {
    renderReviewQueue();

    await waitFor(() => {
      expect(screen.getByTestId("card-review-tx-tx-rev-1")).toBeInTheDocument();
      expect(screen.getByTestId("checkbox-select-all")).toBeInTheDocument();
    });

    // Select all
    fireEvent.click(screen.getByTestId("checkbox-select-all"));

    await waitFor(() => {
      expect(screen.getByTestId("btn-bulk-approve")).toBeInTheDocument();
      expect(screen.getByText("Approve 3")).toBeInTheDocument();
    });

    // Execute bulk approve
    fireEvent.click(screen.getByTestId("btn-bulk-approve"));

    await waitFor(() => {
      expect(apiTransactions.bulkApproveTransactions).toHaveBeenCalledWith(
        expect.arrayContaining(["tx-rev-1", "tx-rev-2", "tx-rev-3"]),
        expect.anything(),
      );
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Bulk Approved" }),
      );
    });

    // When all are approved, empty state should appear
    await waitFor(() => {
      expect(screen.getByTestId("empty-review-queue")).toBeInTheDocument();
      expect(screen.getByText("All clear!")).toBeInTheDocument();
    });
  });

  it("renders empty state celebration graphic when no transactions need review", async () => {
    apiTransactions.getTransactions.mockResolvedValue({
      transactions: [],
      total: 0,
      page: 1,
      limit: 100,
    });

    renderReviewQueue();

    await waitFor(() => {
      expect(screen.getByTestId("empty-review-queue")).toBeInTheDocument();
    });

    expect(screen.getByText("All clear!")).toBeInTheDocument();
    expect(
      screen.getByText("No transactions need review right now. Great work keeping your finances tidy."),
    ).toBeInTheDocument();
  });
});
