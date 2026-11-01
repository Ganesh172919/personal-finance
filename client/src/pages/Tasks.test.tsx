import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TasksPage, { formatForJira, formatForLinear, formatForTodoist } from "./Tasks";

const api = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getTaskById: vi.fn(),
  updateTaskStatus: vi.fn(),
  createTask: vi.fn(),
  getTaskWebhookToken: vi.fn(),
  dispatchTasksWebhook: vi.fn(),
  apiClient: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...api,
  ApiError: class extends Error {
    requestId = "req-test-123";
  },
}));

vi.mock("@/hooks/useAppConfig", () => ({
  useAppConfig: () => ({
    data: {
      features: {
        tasks_enabled: true,
      },
    },
    isLoading: false,
  }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/components/TaskApplyDialog", () => ({
  TaskApplyDialog: ({ task, open }: any) =>
    open ? <div data-testid="task-apply-dialog">Apply: {task.title}</div> : null,
}));

const mockOpenTasks = [
  {
    _id: "task-1",
    title: "Schedule recurring transfer to emergency fund",
    why: "Builds a 3-month living expense buffer to cushion against sudden cash flow drops.",
    steps: ["Calculate target transfer ($250)", "Set standing instruction"],
    priority: "high" as const,
    bucket: 7 as const,
    dueDate: "2026-10-15T00:00:00.000Z", // Past date -> Overdue
    status: "open" as const,
    kind: "savings",
    recurrence: {
      cadence: "monthly" as const,
      generation: 1,
    },
  },
  {
    _id: "task-2",
    title: "Audit and cancel unused subscriptions",
    why: "Recurring charges drain cash flow without providing ongoing utility.",
    steps: ["Review statement", "Cancel inactive subscriptions"],
    priority: "medium" as const,
    bucket: 30 as const,
    dueDate: "2026-11-20T00:00:00.000Z", // Future date
    status: "open" as const,
    kind: "expense_reduction",
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
      <TasksPage />
    </QueryClientProvider>
  );
}

function selectTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.keyDown(tab, { key: "Enter" });
  fireEvent.click(tab);
}

describe("TasksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getTasks.mockImplementation(async ({ status }: { status: string }) => {
      if (status === "open") {
        return { tasks: mockOpenTasks };
      }
      return { tasks: [] };
    });

    api.getTaskById.mockImplementation(async (id: string) => {
      const found = mockOpenTasks.find((t) => t._id === id);
      return { task: found };
    });

    api.updateTaskStatus.mockResolvedValue({ success: true });
    api.apiClient.mockResolvedValue({ success: true });
    api.getTaskWebhookToken.mockResolvedValue({
      webhook_token: "test_webhook_token_abcdef123456",
      webhook_path: "/api/tasks/webhook/test_webhook_token_abcdef123456",
    });
    api.dispatchTasksWebhook.mockResolvedValue({
      success: true,
      target: "linear",
      dispatched_count: 2,
      delivery_status: "delivered",
      http_code: 200,
      response_snippet: '{"ok":true}',
    });
    api.createTask.mockResolvedValue({
      task: {
        _id: "task-new",
        title: "New Action Task",
        why: "Test rationale",
        priority: "medium",
        bucket: 30,
        status: "open",
      },
    });
  });

  afterEach(() => {
    cleanup();
    for (const c of clients) c.clear();
    clients.length = 0;
  });

  it("renders tasks header, metric summary badges, and task cards", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Turn AI plans into trackable financial outcomes.")).toBeInTheDocument();

    // Metric Badges
    expect(await screen.findByTestId("badge-total-tasks")).toHaveTextContent("2 open");
    expect(screen.getByTestId("badge-overdue-count")).toHaveTextContent("1 overdue");
    expect(screen.getByText("1 high priority")).toBeInTheDocument();

    // Task items
    expect(screen.getByText("Schedule recurring transfer to emergency fund")).toBeInTheDocument();
    expect(screen.getByText("Audit and cancel unused subscriptions")).toBeInTheDocument();

    // Priority badges
    expect(screen.getByTestId("badge-priority-task-1")).toHaveTextContent("High Priority");
    expect(screen.getByTestId("badge-priority-task-2")).toHaveTextContent("Medium");

    // Overdue badge on task-1
    expect(screen.getByTestId("badge-overdue-task-1")).toHaveTextContent("Overdue");

    // Recurrence badge on task-1
    expect(screen.getByTestId("badge-recurrence-task-1")).toHaveTextContent("Monthly");
  });

  it("filters tasks by keyword in search input", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    const searchInput = screen.getByTestId("input-search-tasks");
    fireEvent.change(searchInput, { target: { value: "subscriptions" } });

    // task-2 should be visible, task-1 filtered out
    expect(screen.getByText("Audit and cancel unused subscriptions")).toBeInTheDocument();
    expect(screen.queryByText("Schedule recurring transfer to emergency fund")).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Schedule recurring transfer to emergency fund")).toBeInTheDocument();
  });

  it("switches to Completed tab and renders empty state with prompt", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    selectTab("Completed");

    await waitFor(() => {
      expect(api.getTasks).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    });

    expect(await screen.findByText("No Completed Tasks Yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Tasks marked as completed will appear here for historical tracking./i)
    ).toBeInTheDocument();
  });

  it("opens Add Task modal, clicks a preset, and creates a new task", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Click Add Task button
    const addBtn = screen.getByTestId("button-add-task");
    fireEvent.click(addBtn);

    expect(await screen.findByRole("heading", { name: "Add Action Task" })).toBeInTheDocument();

    // Click a preset chip
    const presetBtn = screen.getByRole("button", { name: /Pay down highest-interest credit card balance/i });
    fireEvent.click(presetBtn);

    const titleInput = screen.getByTestId("input-task-title");
    expect(titleInput).toHaveValue("Pay down highest-interest credit card balance");

    const whyInput = screen.getByTestId("input-task-why");
    expect(whyInput).toHaveValue("Avalanche strategy saves the most in total accrued interest over time.");

    // Submit dialog
    const submitBtn = screen.getByTestId("button-submit-create-task");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pay down highest-interest credit card balance",
          priority: "high",
          bucket: 30,
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Created",
      })
    );
  });

  it("completes, dismisses, and applies tasks via row action buttons", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Click Complete button on task-1
    const completeBtn = screen.getByTestId("button-complete-task-task-1");
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("task-1", "completed");
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Completed",
      })
    );

    // Click Dismiss button on task-2
    const dismissBtn = screen.getByTestId("button-dismiss-task-task-2");
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("task-2", "dismissed");
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Dismissed",
      })
    );

    // Click Apply button on task-1
    const applyBtn = screen.getByTestId("button-apply-task-task-1");
    fireEvent.click(applyBtn);

    expect(await screen.findByTestId("task-apply-dialog")).toBeInTheDocument();
  });

  it("opens task detail sheet on title click", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    const viewBtn = screen.getByRole("button", {
      name: "View task: Schedule recurring transfer to emergency fund",
    });
    fireEvent.click(viewBtn);

    expect(await screen.findByTestId("task-detail-sheet")).toBeInTheDocument();
    expect(screen.getByText("Action Steps")).toBeInTheDocument();
    expect(screen.getByText("Calculate target transfer ($250)")).toBeInTheDocument();
  });

  it("supports multi-task selection, batch complete, and batch dismiss", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Click select all
    const selectAllBtn = screen.getByTestId("button-select-all-tasks");
    expect(selectAllBtn).toHaveTextContent("Select All");
    fireEvent.click(selectAllBtn);

    expect(selectAllBtn).toHaveTextContent("Deselect All");
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();

    // Batch Complete
    const batchCompleteBtn = screen.getByTestId("batch-complete-tasks-btn");
    expect(batchCompleteBtn).toHaveTextContent("Complete (2)");
    fireEvent.click(batchCompleteBtn);

    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("task-1", "completed");
      expect(api.updateTaskStatus).toHaveBeenCalledWith("task-2", "completed");
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Batch Complete",
        description: "Marked 2 tasks as completed.",
      })
    );

    // Re-select one individual task
    const checkboxTask1 = screen.getByTestId("checkbox-task-task-1");
    fireEvent.click(checkboxTask1);
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();

    // Batch Dismiss
    const batchDismissBtn = screen.getByTestId("batch-dismiss-tasks-btn");
    fireEvent.click(batchDismissBtn);

    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("task-1", "dismissed");
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Batch Dismiss",
        description: "Dismissed 1 tasks.",
      })
    );
  });

  it("supports batch and single calendar sync via apiClient /calendar-reminders", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Single task sync via card button
    const singleSyncBtn = screen.getByTestId("sync-calendar-task-task-1");
    fireEvent.click(singleSyncBtn);

    await waitFor(() => {
      expect(api.apiClient).toHaveBeenCalledWith(
        "/calendar-reminders",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Schedule recurring transfer to emergency fund"),
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Calendar Reminder Scheduled",
      })
    );

    // Batch calendar sync
    const selectAllBtn = screen.getByTestId("button-select-all-tasks");
    fireEvent.click(selectAllBtn);

    const batchSyncBtn = screen.getByTestId("batch-sync-calendar-btn");
    fireEvent.click(batchSyncBtn);

    await waitFor(() => {
      expect(api.apiClient).toHaveBeenCalledWith(
        "/calendar-reminders",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Audit and cancel unused subscriptions"),
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Batch Calendar Sync",
      })
    );
  });

  it("supports exporting tasks to RFC 5545 .ics format both individually, in batch, and from sheet", async () => {
    const origCreateObjectURL = window.URL.createObjectURL;
    const origRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => "blob:test-tasks-ics");
    window.URL.revokeObjectURL = vi.fn();

    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Export single task from card
    const singleExportBtn = screen.getByTestId("export-ics-task-task-1");
    fireEvent.click(singleExportBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Calendar File Exported",
        description: expect.stringContaining("1 action task"),
      })
    );

    // Export all tasks
    const exportAllBtn = screen.getByTestId("export-all-tasks-ics-btn");
    fireEvent.click(exportAllBtn);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Calendar File Exported",
        description: expect.stringContaining("2 action tasks"),
      })
    );

    // Open detail sheet and test sheet sync + export
    const viewBtn = screen.getByRole("button", {
      name: "View task: Schedule recurring transfer to emergency fund",
    });
    fireEvent.click(viewBtn);

    const sheetSyncBtn = await screen.findByTestId("sheet-sync-calendar-btn");
    fireEvent.click(sheetSyncBtn);

    await waitFor(() => {
      expect(api.apiClient).toHaveBeenCalledWith(
        "/calendar-reminders",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Schedule recurring transfer to emergency fund"),
        })
      );
    });

    const sheetExportBtn = screen.getByTestId("sheet-export-ics-btn");
    fireEvent.click(sheetExportBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalled();

    window.URL.createObjectURL = origCreateObjectURL;
    window.URL.revokeObjectURL = origRevokeObjectURL;
  });

  it("renders recurrence cadence badge on recurring tasks and displays recurrence in task detail sheet", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Verify card recurrence badge
    const badge = screen.getByTestId("badge-recurrence-task-1");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Monthly");

    // Open detail sheet
    const viewBtn = screen.getByRole("button", {
      name: "View task: Schedule recurring transfer to emergency fund",
    });
    fireEvent.click(viewBtn);

    expect(await screen.findByTestId("task-detail-sheet")).toBeInTheDocument();
    const detailRecurrence = screen.getByTestId("detail-recurrence");
    expect(detailRecurrence).toHaveTextContent("monthly");
  });

  it("creates a recurring task using presets with recurrence cadence", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    const addBtn = screen.getByTestId("button-add-task");
    fireEvent.click(addBtn);

    expect(await screen.findByRole("heading", { name: "Add Action Task" })).toBeInTheDocument();

    // Click recurring preset chip
    const presetBtn = screen.getByRole("button", { name: /Schedule recurring transfer to emergency fund/i });
    fireEvent.click(presetBtn);

    const submitBtn = screen.getByTestId("button-submit-create-task");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Schedule recurring transfer to emergency fund",
          priority: "high",
          bucket: 7,
          recurrence: { cadence: "monthly" },
        })
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Task Created",
      })
    );
  });

  it("celebrates recurring renewal toast when completing a task with scheduled next instance", async () => {
    api.updateTaskStatus.mockResolvedValueOnce({
      task: { ...mockOpenTasks[0], status: "completed" },
      next_task: {
        _id: "task-1-rec-2",
        title: "Schedule recurring transfer to emergency fund",
        dueDate: "2026-11-15T00:00:00.000Z",
        recurrence: { cadence: "monthly", generation: 2 },
      },
    });

    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    const completeBtn = screen.getByTestId("button-complete-task-task-1");
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("task-1", "completed");
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Recurring Task Renewed 🔄",
        description: expect.stringContaining("Next scheduled task created for"),
      })
    );
  });

  it("formats tasks for Linear, Todoist, and Jira trackers correctly", () => {
    const linearCsv = formatForLinear(mockOpenTasks as any);
    expect(linearCsv).toContain("Title,Description,Priority,Estimate,Status");
    expect(linearCsv).toContain('"Schedule recurring transfer to emergency fund"');
    expect(linearCsv).toContain("Backlog");

    const todoistCsv = formatForTodoist(mockOpenTasks as any);
    expect(todoistCsv).toContain("CONTENT,DESCRIPTION,PRIORITY,DATE");
    expect(todoistCsv).toContain('"Schedule recurring transfer to emergency fund"');
    expect(todoistCsv).toContain("2026-10-15");

    const jiraCsv = formatForJira(mockOpenTasks as any);
    expect(jiraCsv).toContain("Summary,Description,Priority,Due Date,Issue Type");
    expect(jiraCsv).toContain('"Schedule recurring transfer to emergency fund"');
    expect(jiraCsv).toContain("High,2026-10-15,Task");
  });

  it("opens External Sync & Webhook dialog and switches tracker formats", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    const syncBtn = screen.getByTestId("btn-sync-integrations");
    fireEvent.click(syncBtn);

    expect(await screen.findByTestId("dialog-task-sync-integrations")).toBeInTheDocument();
    expect(screen.getByText("External Task Sync & Webhook Integrations")).toBeInTheDocument();

    const preview = screen.getByTestId("textarea-tracker-preview") as HTMLTextAreaElement;
    expect(preview.value).toContain("Title,Description,Priority,Estimate,Status");

    // Switch to Todoist
    const todoistBtn = screen.getByTestId("btn-select-tracker-todoist");
    fireEvent.click(todoistBtn);
    expect(preview.value).toContain("CONTENT,DESCRIPTION,PRIORITY,DATE");

    // Switch to Jira
    const jiraBtn = screen.getByTestId("btn-select-tracker-jira");
    fireEvent.click(jiraBtn);
    expect(preview.value).toContain("Summary,Description,Priority,Due Date,Issue Type");

    // Copy to clipboard
    const copyBtn = screen.getByTestId("btn-copy-tracker-format");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Copied to Clipboard",
        })
      );
    });
  });

  it("dispatches tasks to external webhook via Push Dispatcher tab", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    const syncBtn = screen.getByTestId("btn-sync-integrations");
    fireEvent.click(syncBtn);

    selectTab("Push Dispatcher");

    const urlInput = await screen.findByTestId("input-webhook-url");
    fireEvent.change(urlInput, { target: { value: "https://api.linear.app/v1/webhook" } });

    const authHeaderInput = screen.getByTestId("input-webhook-auth-header");
    fireEvent.change(authHeaderInput, { target: { value: "Bearer test_linear_token" } });

    const dispatchBtn = screen.getByTestId("btn-dispatch-tasks-webhook");
    fireEvent.click(dispatchBtn);

    await waitFor(() => {
      expect(api.dispatchTasksWebhook).toHaveBeenCalledWith({
        target: "linear",
        webhook_url: "https://api.linear.app/v1/webhook",
        task_ids: ["task-1", "task-2"],
        headers: { Authorization: "Bearer test_linear_token" },
      });
    });

    expect(await screen.findByTestId("dispatch-result-box")).toBeInTheDocument();
    expect(screen.getByText(/Dispatch Status: delivered/i)).toBeInTheDocument();
  });

  it("displays inbound webhook URL and triggers test inbound webhook task creation", async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: "created" }),
    });
    global.fetch = fetchMock;

    try {
      renderPage();

      await screen.findByText("Schedule recurring transfer to emergency fund");

      const syncBtn = screen.getByTestId("btn-sync-integrations");
      fireEvent.click(syncBtn);

      selectTab("Inbound Webhook API");

      await waitFor(() => {
        expect(api.getTaskWebhookToken).toHaveBeenCalled();
      });

      const urlInput = (await screen.findByTestId("input-inbound-webhook-url")) as HTMLInputElement;
      expect(urlInput.value).toContain("/api/tasks/webhook/test_webhook_token_abcdef123456");

      const copyInboundBtn = screen.getByTestId("btn-copy-inbound-webhook");
      fireEvent.click(copyInboundBtn);
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Copied to Clipboard",
        })
      );

      const testBtn = screen.getByTestId("btn-send-test-inbound-task");
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/api/tasks/webhook/test_webhook_token_abcdef123456"),
          expect.objectContaining({
            method: "POST",
          })
        );
      });

      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Task Triggered",
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("opens Sync dialog for explicitly selected batch tasks from batch actions bar", async () => {
    renderPage();

    await screen.findByText("Schedule recurring transfer to emergency fund");

    // Select task 1
    const checkbox = screen.getByTestId("checkbox-task-task-1");
    fireEvent.click(checkbox);

    const batchSyncBtn = screen.getByTestId("btn-batch-export-trackers");
    expect(batchSyncBtn).toHaveTextContent("Sync & Webhooks (1)");
    fireEvent.click(batchSyncBtn);

    expect(await screen.findByTestId("dialog-task-sync-integrations")).toBeInTheDocument();
    expect(screen.getByText(/Exporting 1 task/i)).toBeInTheDocument();
  });
});
