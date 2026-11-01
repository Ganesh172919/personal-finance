import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ActivityFeedPage from "./ActivityFeed";
import type { ActivityFeedResponse } from "@/lib/api/v1/collaboration";

const apiCollab = vi.hoisted(() => ({
  getActivityFeed: vi.fn(),
}));

vi.mock("@/lib/api/v1/collaboration", () => ({
  ...apiCollab,
}));

const mockFeed: ActivityFeedResponse = {
  org_id: "org-1",
  has_more: true,
  next_cursor: "cursor-123",
  request_id: "req-collab-1",
  activities: [
    {
      id: "act-1",
      event_type: "transaction.created",
      description: "recorded a new expense of $120.00 for Groceries",
      icon: "receipt",
      aggregate_type: "transaction",
      aggregate_id: "tx-101",
      actor: { id: "user-1", name: "Alice", avatar: null },
      payload: { amount: 120, category: "Groceries" },
      created_at: "2026-10-28T14:30:00.000Z",
    },
    {
      id: "act-2",
      event_type: "budget.updated",
      description: "increased Housing allocation by $200.00",
      icon: "wallet",
      aggregate_type: "budget",
      aggregate_id: "budget-202",
      actor: { id: "user-2", name: "Bob", avatar: null },
      payload: { category: "Housing", delta: 200 },
      created_at: "2026-10-28T10:15:00.000Z",
    },
    {
      id: "act-3",
      event_type: "goal.created",
      description: "created a new financial goal: Vacation Fund ($3,000)",
      icon: "target",
      aggregate_type: "goal",
      aggregate_id: "goal-303",
      actor: { id: "user-1", name: "Alice", avatar: null },
      payload: { target: 3000 },
      created_at: "2026-10-27T09:00:00.000Z",
    },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ActivityFeedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiCollab.getActivityFeed.mockResolvedValue(mockFeed);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders page header, refresh button, filter chips, and timeline items", async () => {
    renderWithClient(<ActivityFeedPage />);

    expect(screen.getByTestId("activity-feed-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity Feed" })).toBeInTheDocument();
    expect(screen.getByTestId("button-refresh-activities")).toBeInTheDocument();
    expect(screen.getByTestId("input-search-activities")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("activity-item-act-1")).toBeInTheDocument();
      expect(screen.getByTestId("activity-item-act-2")).toBeInTheDocument();
      expect(screen.getByTestId("activity-item-act-3")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Alice").length).toBe(2);
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(
      screen.getByText("recorded a new expense of $120.00 for Groceries")
    ).toBeInTheDocument();
    expect(screen.getByText("transaction → created")).toBeInTheDocument();
  });

  it("filters activities by event type when clicking filter chips", async () => {
    renderWithClient(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByTestId("activity-item-act-1")).toBeInTheDocument();
    });

    const txFilter = screen.getByTestId("activity-filter-transaction");
    fireEvent.click(txFilter);

    await waitFor(() => {
      expect(apiCollab.getActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "transaction",
        })
      );
    });
  });

  it("filters activities by search query in real-time", async () => {
    renderWithClient(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByTestId("activity-item-act-1")).toBeInTheDocument();
      expect(screen.getByTestId("activity-item-act-2")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("input-search-activities");
    fireEvent.change(searchInput, { target: { value: "Housing" } });

    // Only Bob's Housing activity should remain
    expect(screen.queryByTestId("activity-item-act-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-item-act-2")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-item-act-3")).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByTestId("activity-item-act-1")).toBeInTheDocument();
    expect(screen.getByTestId("activity-item-act-2")).toBeInTheDocument();
    expect(screen.getByTestId("activity-item-act-3")).toBeInTheDocument();
  });

  it("loads more activities when clicking Load more button", async () => {
    const page2: ActivityFeedResponse = {
      org_id: "org-1",
      has_more: false,
      next_cursor: null,
      request_id: "req-collab-2",
      activities: [
        {
          id: "act-4",
          event_type: "workflow.completed",
          description: "executed scheduled monthly export workflow",
          icon: "zap",
          aggregate_type: "workflow",
          aggregate_id: "wf-404",
          actor: { id: "sys-1", name: "Automation System", avatar: null },
          payload: {},
          created_at: "2026-10-26T00:00:00.000Z",
        },
      ],
    };

    apiCollab.getActivityFeed
      .mockResolvedValueOnce(mockFeed)
      .mockResolvedValueOnce(page2);

    renderWithClient(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByTestId("button-load-more")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-load-more"));

    await waitFor(() => {
      expect(apiCollab.getActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          before: "cursor-123",
        })
      );
      expect(screen.getByTestId("activity-item-act-4")).toBeInTheDocument();
    });
  });

  it("displays empty state when search matches no activities", async () => {
    renderWithClient(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByTestId("activity-item-act-1")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("input-search-activities");
    fireEvent.change(searchInput, { target: { value: "nonexistent term" } });

    expect(screen.getByText("No matching activity found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Search" })).toBeInTheDocument();
  });

  it("displays empty state when initial feed is empty", async () => {
    apiCollab.getActivityFeed.mockResolvedValueOnce({
      org_id: "org-1",
      has_more: false,
      next_cursor: null,
      request_id: "req-collab-empty",
      activities: [],
    });

    renderWithClient(<ActivityFeedPage />);

    await waitFor(() => {
      expect(screen.getByText("No activity yet")).toBeInTheDocument();
    });
  });
});
