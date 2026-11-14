import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Notes from "./Notes";

const mockApi = vi.hoisted(() => ({
  listJournalEntries: vi.fn(),
  getJournalEntry: vi.fn(),
  recognizeHandwriting: vi.fn(),
  generateJournalInsights: vi.fn(),
  patchJournalEntry: vi.fn(),
  createGoal: vi.fn(),
  updateFinancialProfile: vi.fn(),
  createTasksFromPlan: vi.fn(),
  syncOfflineJournalNotes: vi.fn(),
  searchJournalEntries: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...mockApi,
  ApiError: class extends Error {
    requestId = "req-test-123";
  },
}));

const mockConfig = vi.hoisted(() => ({
  useAppConfig: vi.fn(),
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => mockConfig.useAppConfig(),
}));

const canvasState = vi.hoisted(() => ({ strokes: [[{ x: 0.1, y: 0.2, t: 100 }]] as unknown[] }));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/features/journaling/HandwritingCanvas", () => ({
  HandwritingCanvas: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      clear: vi.fn(),
      undo: vi.fn(),
      exportBlob: vi.fn().mockResolvedValue(new Blob(["canvas"], { type: "image/png" })),
      getStrokes: () => canvasState.strokes,
    }));
    return <div data-testid="handwriting-canvas" />;
  }),
}));

const mockEntries = {
  entries: [
    {
      id: "entry-1",
      createdAt: "2026-10-25T10:00:00Z",
      recognizedText: "Save 5000 for emergency fund by December",
      fileId: "file-123",
      sentiment: "optimistic",
      tags: ["savings", "emergency"],
      hasEmbedding: true,
      parsedIntent: {
        amounts: [{ value: 5000, currency: "USD" }],
        goal_candidates: [{ name: "Emergency Fund", target: 5000 }],
      },
    },
    {
      id: "entry-2",
      createdAt: "2026-10-26T14:30:00Z",
      recognizedText: "Cut groceries down to 600 monthly",
      fileId: null,
      sentiment: "concerned",
      tags: ["budget"],
      hasEmbedding: true,
      parsedIntent: {
        amounts: [{ value: 600, currency: "USD" }],
      },
    },
  ],
  pagination: { page: 1, limit: 10, totalPages: 1, total: 2 },
};

describe("Notes / Financial Journal Page", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    canvasState.strokes = [[{ x: 0.1, y: 0.2, t: 100 }]];

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    mockConfig.useAppConfig.mockReturnValue({
      data: {
        features: {
          journal_enabled: true,
          tasks_enabled: true,
        },
      },
      isLoading: false,
    });

    mockApi.listJournalEntries.mockResolvedValue(mockEntries);
    mockApi.getJournalEntry.mockResolvedValue({
      entry: mockEntries.entries[0],
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const renderNotes = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Notes />
      </QueryClientProvider>,
    );
  };

  it("renders disabled banner when journal_enabled feature flag is false", () => {
    mockConfig.useAppConfig.mockReturnValue({
      data: {
        features: {
          journal_enabled: false,
          tasks_enabled: false,
        },
      },
      isLoading: false,
    });

    renderNotes();

    expect(screen.getByTestId("journal-disabled-card")).toBeInTheDocument();
    expect(screen.getByText("Financial Journal is disabled on this server.")).toBeInTheDocument();
  });

  it("renders canvas and recent journal entries when feature is enabled", async () => {
    renderNotes();

    expect(screen.getByTestId("notes-page")).toBeInTheDocument();
    expect(screen.getByTestId("handwriting-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("recognize-btn")).toBeInTheDocument();
    expect(screen.getByTestId("card-journal-semantic-search")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByTestId("journal-entry-item").length).toBe(2);
    });

    expect(screen.getByText(/Save 5000 for emergency fund/)).toBeInTheDocument();
    expect(screen.getByText(/Cut groceries down to 600/)).toBeInTheDocument();
  });

  it("triggers handwriting recognition and displays detected values & goal suggestion", async () => {
    mockApi.recognizeHandwriting.mockResolvedValue({
      entry_id: "entry-new",
      recognized_text: "Save 3000 for vacation fund",
      confidence: { overall: 0.94 },
      sentiment: "optimistic",
      tags: ["savings", "vacation"],
      detected_values: {
        amounts: [{ value: 3000, currency: "USD" }],
        goal_candidates: [{ name: "Vacation Fund", target: 3000 }],
      },
    });

    renderNotes();

    const recognizeBtn = screen.getByTestId("recognize-btn");
    fireEvent.click(recognizeBtn);

    await waitFor(() => {
      expect(mockApi.recognizeHandwriting).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId("recognized-text-area")).toHaveValue("Save 3000 for vacation fund");
      expect(screen.getByTestId("recognition-confidence")).toHaveTextContent("Confidence: 94%");
      expect(screen.getByTestId("goal-suggestion-box")).toBeInTheDocument();
    });

    // Create Goal button inside the suggestion box
    const createGoalBtn = screen.getByTestId("create-goal-btn");
    expect(createGoalBtn).toBeInTheDocument();

    mockApi.createGoal.mockResolvedValue({ success: true });
    fireEvent.click(createGoalBtn);

    await waitFor(() => {
      expect(mockApi.createGoal).toHaveBeenCalled();
      expect(mockApi.createGoal.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          name: "Vacation Fund",
          target: 3000,
          current: 0,
          priority: 1,
        }),
      );
    });
  });

  it("allows updating monthly expenses", async () => {
    mockApi.updateFinancialProfile.mockResolvedValue({ success: true });

    renderNotes();

    const expensesInput = screen.getByTestId("monthly-expenses-input");
    const updateBtn = screen.getByTestId("update-expenses-btn");

    expect(updateBtn).toBeDisabled();

    fireEvent.change(expensesInput, { target: { value: "4500" } });
    expect(updateBtn).not.toBeDisabled();

    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(mockApi.updateFinancialProfile).toHaveBeenCalledWith({
        monthly_expenses: 4500,
      });
    });
  });

  it("opens entry detail sheet when an entry is clicked, saves edits, and generates insights with tasks", async () => {
    mockApi.patchJournalEntry.mockResolvedValue({ success: true });
    mockApi.generateJournalInsights.mockResolvedValue({
      response: "Strong saving discipline. Recommend establishing a high-yield account.",
      plan: {
        steps: [{ title: "Open HYSA", duration: "1 week" }],
      },
      agent_output_id: "agent-out-456",
      request_id: "req-789",
    });
    mockApi.createTasksFromPlan.mockResolvedValue({ created: 2 });

    renderNotes();

    await waitFor(() => {
      expect(screen.getAllByTestId("journal-entry-item").length).toBe(2);
    });

    // Click the first entry
    fireEvent.click(screen.getAllByTestId("journal-entry-item")[0]);

    await waitFor(() => {
      expect(screen.getByTestId("journal-detail-sheet")).toBeInTheDocument();
      expect(screen.getByTestId("sheet-recognized-text")).toBeInTheDocument();
    });

    // Edit text and save
    const sheetTextarea = screen.getByTestId("sheet-recognized-text");
    fireEvent.change(sheetTextarea, {
      target: { value: "Save 6000 for emergency fund by December" },
    });

    const saveBtn = screen.getByTestId("sheet-save-btn");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockApi.patchJournalEntry).toHaveBeenCalledWith(
        "entry-1",
        "Save 6000 for emergency fund by December",
      );
    });

    // Generate insights
    const insightsBtn = screen.getByTestId("sheet-generate-insights-btn");
    fireEvent.click(insightsBtn);

    await waitFor(() => {
      expect(mockApi.generateJournalInsights).toHaveBeenCalledWith("entry-1");
      expect(screen.getByTestId("sheet-ai-insights-box")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Strong saving discipline. Recommend establishing a high-yield account./),
    ).toBeInTheDocument();

    // Add tasks from plan
    const addTasksBtn = screen.getByTestId("sheet-add-tasks-btn");
    fireEvent.click(addTasksBtn);

    await waitFor(() => {
      expect(mockApi.createTasksFromPlan).toHaveBeenCalledWith({
        plan: {
          steps: [{ title: "Open HYSA", duration: "1 week" }],
        },
        source: {
          agentOutputId: "agent-out-456",
          requestId: "req-789",
        },
      });
    });
  });

  it("saves canvas strokes locally as an offline draft and increments pending badge count", async () => {
    renderNotes();

    const saveOfflineBtn = screen.getByTestId("btn-save-offline-draft");
    fireEvent.click(saveOfflineBtn);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Draft saved locally",
        }),
      );
      expect(screen.getByTestId("badge-offline-queue-count")).toHaveTextContent("1");
      expect(screen.getByTestId("card-offline-journal-sync")).toBeInTheDocument();
    });
  });

  it("does not queue or recognize an empty canvas", async () => {
    canvasState.strokes = [];
    renderNotes();

    fireEvent.click(screen.getByTestId("btn-save-offline-draft"));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Nothing to save" }));
    expect(screen.queryByTestId("badge-offline-queue-count")).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);

    fireEvent.click(screen.getByTestId("recognize-btn"));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Recognition failed" }));
    });
    expect(mockApi.recognizeHandwriting).not.toHaveBeenCalled();
  });

  it("opens a journal entry from the keyboard", async () => {
    renderNotes();

    await waitFor(() => {
      expect(screen.getAllByTestId("journal-entry-item").length).toBe(2);
    });
    const entry = screen.getAllByTestId("journal-entry-item")[0];
    expect(entry).toHaveAttribute("tabindex", "0");
    expect(entry).toHaveAttribute("role", "button");

    fireEvent.keyDown(entry, { key: "Enter" });

    await waitFor(() => {
      expect(mockApi.getJournalEntry).toHaveBeenCalledWith("entry-1");
      expect(screen.getByTestId("sheet-recognized-text")).toBeInTheDocument();
    });
  });

  it("synchronizes queued offline notes batch and flushes local storage queue", async () => {
    // Pre-populate an offline draft in localStorage
    const sampleDraft = {
      clientDraftId: "draft-local-123",
      title: "Offline Travel Budget",
      recognizedText: "Budget 1500 for summer trip #travel",
      strokes: [[{ x: 0.1, y: 0.1, t: 100 }]],
      createdAt: new Date().toISOString(),
      tags: ["travel"],
    };
    localStorage.setItem("finwise_offline_journal_queue", JSON.stringify([sampleDraft]));

    mockApi.syncOfflineJournalNotes.mockResolvedValue({
      success: true,
      syncedCount: 1,
      duplicatesSkipped: 0,
      entries: [
        {
          id: "entry-synced-1",
          clientDraftId: "draft-local-123",
          title: "Offline Travel Budget",
          recognizedText: "Budget 1500 for summer trip #travel",
          tags: ["travel"],
          sentiment: "neutral",
          parsedIntent: { amounts: [{ value: 1500, currency: "USD" }] },
          createdAt: sampleDraft.createdAt,
          isDuplicate: false,
        },
      ],
    });

    renderNotes();

    await waitFor(() => {
      expect(screen.getByTestId("badge-offline-queue-count")).toHaveTextContent("1");
    });

    const syncBtn = screen.getByTestId("btn-sync-offline-strokes");
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockApi.syncOfflineJournalNotes).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            clientDraftId: "draft-local-123",
          }),
        ]),
      );
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Offline notes synced",
        }),
      );
      expect(screen.queryByTestId("badge-offline-queue-count")).not.toBeInTheDocument();
    });
  });

  it("performs semantic vector search and displays similarity match badges", async () => {
    mockApi.searchJournalEntries.mockResolvedValue({
      query: "emergency savings",
      threshold: 0.1,
      totalMatches: 1,
      results: [
        {
          id: "entry-1",
          title: "Emergency Fund",
          recognizedText: "Save 5000 for emergency fund by December",
          tags: ["savings", "emergency"],
          sentiment: "optimistic",
          similarityScore: 0.93,
          parsedIntent: { amounts: [{ value: 5000 }] },
          createdAt: "2026-10-25T10:00:00Z",
        },
      ],
    });

    renderNotes();

    const searchInput = screen.getByTestId("input-semantic-search");
    fireEvent.change(searchInput, { target: { value: "emergency savings" } });

    const searchBtn = screen.getByTestId("btn-semantic-search");
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(mockApi.searchJournalEntries).toHaveBeenCalledWith({
        query: "emergency savings",
        threshold: 0.1,
        limit: 15,
        tag: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("semantic-search-results")).toBeInTheDocument();
      expect(screen.getByTestId("badge-similarity-score-entry-1")).toHaveTextContent("93% Match");
    });

    // Test clear button
    const clearBtn = screen.getByTestId("btn-clear-search");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("semantic-search-results")).not.toBeInTheDocument();
      expect(searchInput).toHaveValue("");
    });
  });

  it("filters semantic search when clicking category concept tags", async () => {
    mockApi.searchJournalEntries.mockResolvedValue({
      query: "savings",
      threshold: 0.1,
      totalMatches: 1,
      results: [
        {
          id: "entry-1",
          title: "Emergency Fund",
          recognizedText: "Save 5000 for emergency fund by December",
          tags: ["savings"],
          sentiment: "optimistic",
          similarityScore: 0.88,
          parsedIntent: {},
          createdAt: "2026-10-25T10:00:00Z",
        },
      ],
    });

    renderNotes();

    const savingsChip = screen.getByTestId("chip-tag-savings");
    fireEvent.click(savingsChip);

    await waitFor(() => {
      expect(mockApi.searchJournalEntries).toHaveBeenCalledWith({
        query: "savings",
        threshold: 0.1,
        limit: 15,
        tag: "savings",
      });
    });
  });
});
