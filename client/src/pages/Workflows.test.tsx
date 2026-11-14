import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowsPage from "./Workflows";

const mockApi = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  listWorkflowTemplates: vi.fn(),
  simulateToolCall: vi.fn(),
  executeToolCall: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  ...mockApi,
  ApiError: class extends Error {
    requestId = "req-wf-123";
  },
}));

const mockLocation = vi.hoisted(() => ({
  useLocation: vi.fn(),
  useSearch: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => mockLocation.useLocation(),
  useSearch: () => mockLocation.useSearch(),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mockWorkflows = [
  {
    id: "wf-1",
    name: "Weekly Cashflow Audit",
    enabled: true,
    trigger: { type: "cron", cron: "0 9 * * 1" },
    actions: [
      {
        type: "create_task",
        bucket: 7,
        title: "Weekly check-in",
        why: "Review habit",
        priority: "high",
        kind: "cashflow",
      },
    ],
  },
  {
    id: "wf-2",
    name: "Monthly Summary Export",
    enabled: false,
    trigger: { type: "manual" },
    actions: [
      {
        type: "export_report",
        export_type: "monthly_summary_pdf",
        params: { period_key: "2026-10" },
      },
    ],
  },
  {
    id: "wf-3",
    name: "Stripe Charge Inbound Webhook",
    enabled: true,
    trigger: { type: "webhook", webhook_token: "whk_abc1234567890abcdef12345" },
    actions: [
      {
        type: "create_task",
        bucket: 7,
        title: "Review large charge",
        why: "Investigate high charge",
        priority: "high",
        kind: "budget",
        condition: { field: "amount", operator: "gte", value: 500 },
      },
    ],
  },
];

const mockPluginTemplates = {
  templates: [
    {
      template_key: "tpl-savings-pulse",
      name: "Savings Pulse Alert",
      description: "Alerts when savings rate dips below target",
      plugin_key: "savings-monitor",
      plugin_version: "1.2.0",
      request: {
        name: "Savings Pulse Alert",
        enabled: true,
        trigger: { type: "event", event_type: "MonthlyAnalyticsReady" },
        actions: [{ type: "send_notification", channel: "email", subject: "Savings Check", message: "Review rate" }],
      },
    },
  ],
};

describe("Workflows Page", () => {
  let queryClient: QueryClient;
  const navigateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    mockLocation.useLocation.mockReturnValue(["/workflows", navigateMock]);
    mockLocation.useSearch.mockReturnValue("");
    mockApi.listWorkflows.mockResolvedValue({ workflows: mockWorkflows });
    mockApi.listWorkflowTemplates.mockResolvedValue(mockPluginTemplates);
  });

  afterEach(() => {
    cleanup();
  });

  const renderWorkflows = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>,
    );
  };

  it("renders workflows page with list of user workflows", async () => {
    renderWorkflows();

    expect(screen.getByTestId("workflows-page")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Weekly Cashflow Audit")).toBeInTheDocument();
      expect(screen.getByText("Monthly Summary Export")).toBeInTheDocument();
      expect(screen.getByText("Stripe Charge Inbound Webhook")).toBeInTheDocument();
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId("workflow-card");
      expect(cards.length).toBe(3);
    });

    expect(screen.getAllByText("Status: enabled").length).toBe(2);
    expect(screen.getByText("Status: disabled")).toBeInTheDocument();
  });

  it("renders webhook trigger badge, token preview, and allows copying webhook URL", async () => {
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    renderWorkflows();

    await waitFor(() => {
      expect(screen.getByTestId("badge-webhook-wf-3")).toBeInTheDocument();
      expect(screen.getByTestId("btn-copy-webhook-wf-3")).toBeInTheDocument();
      expect(screen.getByTestId("badge-action-condition-wf-3-0")).toBeInTheDocument();
      expect(screen.getByText(/rule: amount gte 500/)).toBeInTheDocument();
    });

    // Click copy webhook URL
    fireEvent.click(screen.getByTestId("btn-copy-webhook-wf-3"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/api/workflows/webhook/whk_abc1234567890abcdef12345")
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Copied",
        })
      );
    });
  });

  it("triggers simulation and allows confirming workflow run", async () => {
    mockApi.simulateToolCall.mockResolvedValue({
      preview: { simulated_tasks: 1, action: "run_workflow" },
    });
    mockApi.executeToolCall.mockResolvedValue({ success: true });

    renderWorkflows();

    await waitFor(() => {
      expect(screen.getAllByTestId("workflow-run-btn").length).toBe(3);
    });

    // Run first workflow
    fireEvent.click(screen.getAllByTestId("workflow-run-btn")[0]);

    await waitFor(() => {
      expect(mockApi.simulateToolCall).toHaveBeenCalled();
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("Confirm: Run workflow")).toBeInTheDocument();
    expect(screen.getByText(/"simulated_tasks": 1/)).toBeInTheDocument();

    // Confirm execution
    fireEvent.click(screen.getByTestId("confirm-execute-btn"));

    await waitFor(() => {
      expect(mockApi.executeToolCall).toHaveBeenCalled();
    });

    // Confirm dialog should close
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });

  it("loads a shared ?template= link from the query string (wouter useSearch)", async () => {
    const request = {
      name: "Shared QA template",
      enabled: true,
      trigger: { type: "manual" },
      actions: [{ type: "send_notification", channel: "email", subject: "Hi", message: "Body" }],
    };
    const encoded = btoa(JSON.stringify(request)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // wouter v3 useLocation() returns only the pathname; the query lives in useSearch().
    mockLocation.useLocation.mockReturnValue(["/workflows", navigateMock]);
    mockLocation.useSearch.mockReturnValue(`template=${encoded}`);

    renderWorkflows();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Template loaded" }));
      expect(screen.getByTestId("workflow-name-input")).toHaveValue("Shared QA template");
    });
    expect(navigateMock).toHaveBeenCalledWith("/workflows");
  });

  it("summarises what a workflow run produced after confirmation", async () => {
    mockApi.simulateToolCall.mockResolvedValue({ preview: { operation: "run_workflow" } });
    mockApi.executeToolCall.mockResolvedValue({
      ok: true,
      tool: "workflows.run",
      result: {
        queued: false,
        run: { id: "run-1", status: "succeeded", result: { tasks_created: ["t1", "t2"], exports_created: ["e1"], notifications_sent: [] } },
      },
    });

    renderWorkflows();
    await waitFor(() => expect(screen.getAllByTestId("workflow-run-btn").length).toBe(3));
    fireEvent.click(screen.getAllByTestId("workflow-run-btn")[0]);
    await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("confirm-execute-btn"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Done", description: "Workflow run succeeded: 2 tasks created, 1 export created." })
      );
    });
  });

  it("triggers simulation for toggling workflow enabled/disabled status", async () => {
    mockApi.simulateToolCall.mockResolvedValue({
      preview: { enabled: false },
    });

    renderWorkflows();

    await waitFor(() => {
      expect(screen.getAllByTestId("workflow-toggle-btn").length).toBe(3);
    });

    // First workflow is enabled, so button says "Disable"
    expect(screen.getAllByTestId("workflow-toggle-btn")[0]).toHaveTextContent("Disable");
    fireEvent.click(screen.getAllByTestId("workflow-toggle-btn")[0]);

    await waitFor(() => {
      expect(mockApi.simulateToolCall).toHaveBeenCalled();
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("Confirm: Disable workflow")).toBeInTheDocument();

    // Cancel modal
    fireEvent.click(screen.getByTestId("confirm-cancel-btn"));
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });

  it("switches to create tab and simulates creating a new workflow", async () => {
    mockApi.simulateToolCall.mockResolvedValue({
      preview: { created_workflow: "Quarterly Review" },
    });

    renderWorkflows();

    const createTab = screen.getByTestId("tab-create");
    fireEvent.click(createTab);

    const nameInput = screen.getByTestId("workflow-name-input");
    fireEvent.change(nameInput, { target: { value: "Quarterly Review" } });

    const createBtn = screen.getByTestId("workflow-create-btn");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockApi.simulateToolCall).toHaveBeenCalled();
      expect(mockApi.simulateToolCall.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          tool: "workflows.create",
          args: expect.objectContaining({
            name: "Quarterly Review",
          }),
        }),
      );
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
  });

  it("allows adding and updating a conditional branch filter rule on an action", async () => {
    renderWorkflows();

    const createTab = screen.getByTestId("tab-create");
    fireEvent.click(createTab);

    // Initial state: action has no condition
    expect(screen.getByText("Always execute (unconditional)")).toBeInTheDocument();
    expect(screen.getByTestId("btn-add-condition-0")).toBeInTheDocument();

    // Click to add branch filter
    fireEvent.click(screen.getByTestId("btn-add-condition-0"));

    // Now condition box is populated
    await waitFor(() => {
      expect(screen.getByTestId("condition-badge-0")).toBeInTheDocument();
      expect(screen.getByTestId("input-condition-field-0")).toBeInTheDocument();
      expect(screen.getByTestId("input-condition-value-0")).toBeInTheDocument();
      expect(screen.getByTestId("btn-clear-condition-0")).toBeInTheDocument();
    });

    // Update field name
    fireEvent.change(screen.getByTestId("input-condition-field-0"), {
      target: { value: "severity" },
    });

    // Update comparison value
    fireEvent.change(screen.getByTestId("input-condition-value-0"), {
      target: { value: "critical" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("condition-badge-0")).toHaveTextContent("if severity gte critical");
    });

    // Click to remove branch filter
    fireEvent.click(screen.getByTestId("btn-clear-condition-0"));

    await waitFor(() => {
      expect(screen.queryByTestId("condition-badge-0")).not.toBeInTheDocument();
      expect(screen.getByText("Always execute (unconditional)")).toBeInTheDocument();
    });
  });

  it("switches to templates tab and allows using a template", async () => {
    renderWorkflows();

    const templatesTab = screen.getByTestId("tab-templates");
    fireEvent.click(templatesTab);

    await waitFor(() => {
      expect(screen.getByText("Savings Pulse Alert")).toBeInTheDocument();
    });

    const useTemplateBtns = screen.getAllByTestId("template-use-btn");
    expect(useTemplateBtns.length).toBeGreaterThan(0);

    // Click to use plugin template
    fireEvent.click(useTemplateBtns[0]);

    // Should switch to create tab and show loaded template toast
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Template loaded",
        }),
      );
    });
  });

  it("displays empty state when no workflows exist", async () => {
    mockApi.listWorkflows.mockResolvedValue({ workflows: [] });

    renderWorkflows();

    await waitFor(() => {
      expect(screen.getByTestId("workflows-empty")).toBeInTheDocument();
    });

    expect(
      screen.getByText("No workflows yet. Create one from the Create tab or import a template link."),
    ).toBeInTheDocument();
  });

  it("renders visual pipeline ribbons on workflow cards in My Workflows", async () => {
    renderWorkflows();

    await waitFor(() => {
      expect(screen.getByTestId("workflow-pipeline-wf-1")).toBeInTheDocument();
      expect(screen.getByTestId("workflow-pipeline-wf-2")).toBeInTheDocument();
      expect(screen.getByTestId("workflow-pipeline-wf-3")).toBeInTheDocument();
    });

    const pipelineWf1 = screen.getByTestId("workflow-pipeline-wf-1");
    expect(pipelineWf1).toHaveTextContent("Trigger: cron");
    expect(pipelineWf1).toHaveTextContent("Weekly check-in");

    const pipelineWf3 = screen.getByTestId("workflow-pipeline-wf-3");
    expect(pipelineWf3).toHaveTextContent("Trigger: webhook");
    expect(pipelineWf3).toHaveTextContent("Review large charge");
    expect(pipelineWf3).toHaveTextContent("(cond)");
  });

  it("renders the interactive node pipeline flow canvas in the Create tab", async () => {
    renderWorkflows();

    fireEvent.click(screen.getByTestId("tab-create"));

    await waitFor(() => {
      expect(screen.getByTestId("card-workflow-node-canvas")).toBeInTheDocument();
      expect(screen.getByTestId("node-canvas-trigger")).toBeInTheDocument();
      expect(screen.getByTestId("node-canvas-action-0")).toBeInTheDocument();
      expect(screen.getByTestId("btn-canvas-add-delay")).toBeInTheDocument();
      expect(screen.getByTestId("btn-canvas-add-task")).toBeInTheDocument();
      expect(screen.getByTestId("btn-canvas-add-notify")).toBeInTheDocument();
      expect(screen.getByTestId("btn-canvas-add-export")).toBeInTheDocument();
    });

    expect(screen.getByTestId("node-canvas-trigger")).toHaveTextContent("Trigger");
    expect(screen.getByTestId("node-canvas-trigger")).toHaveTextContent("manual");
    expect(screen.getByTestId("node-canvas-action-0")).toHaveTextContent("Step 1");
    expect(screen.getByTestId("node-canvas-action-0")).toHaveTextContent("Weekly money check-in");
  });

  it("adds a multi-step delay action via canvas quick add and configures duration and presets", async () => {
    renderWorkflows();

    fireEvent.click(screen.getByTestId("tab-create"));

    // Click + Delay on canvas quick add
    fireEvent.click(screen.getByTestId("btn-canvas-add-delay"));

    await waitFor(() => {
      expect(screen.getByTestId("node-canvas-action-1")).toBeInTheDocument();
      expect(screen.getByTestId("action-card-1")).toBeInTheDocument();
      expect(screen.getByTestId("action-delay-config-1")).toBeInTheDocument();
    });

    // Check canvas action 1 shows Delay and default 300s
    expect(screen.getByTestId("node-canvas-action-1")).toHaveTextContent("Delay");
    expect(screen.getByTestId("node-canvas-action-1")).toHaveTextContent("Wait 300s");

    // Change delay duration to 1 hour using preset button
    const preset1hBtn = screen.getByTestId("btn-delay-preset-1-1h");
    fireEvent.click(preset1hBtn);

    await waitFor(() => {
      expect(screen.getByTestId("input-delay-seconds-1")).toHaveValue(3600);
      expect(screen.getByTestId("node-canvas-action-1")).toHaveTextContent("Wait 3600s");
    });

    // Edit description
    const descInput = screen.getByTestId("input-delay-description-1");
    fireEvent.change(descInput, { target: { value: "Wait for webhook callback {{event_id}}" } });

    expect(descInput).toHaveValue("Wait for webhook callback {{event_id}}");
  });

  it("reorders actions using visual canvas move buttons", async () => {
    renderWorkflows();

    fireEvent.click(screen.getByTestId("tab-create"));

    // Add a delay action
    fireEvent.click(screen.getByTestId("btn-add-action-delay"));

    await waitFor(() => {
      expect(screen.getByTestId("node-canvas-action-0")).toHaveTextContent("Weekly money check-in");
      expect(screen.getByTestId("node-canvas-action-1")).toHaveTextContent("Delay");
    });

    // First action's move-up should be disabled, move-down enabled
    expect(screen.getByTestId("btn-canvas-move-up-0")).toBeDisabled();
    expect(screen.getByTestId("btn-canvas-move-down-0")).not.toBeDisabled();

    // Click move down on Step 1 (canvas)
    fireEvent.click(screen.getByTestId("btn-canvas-move-down-0"));

    // After reordering, Step 1 is now Delay, and Step 2 is Task
    await waitFor(() => {
      expect(screen.getByTestId("node-canvas-action-0")).toHaveTextContent("Delay");
      expect(screen.getByTestId("node-canvas-action-1")).toHaveTextContent("Weekly money check-in");
    });

    // Now move Step 2 up from the action card buttons
    fireEvent.click(screen.getByTestId("btn-action-move-up-1"));

    await waitFor(() => {
      expect(screen.getByTestId("node-canvas-action-0")).toHaveTextContent("Weekly money check-in");
      expect(screen.getByTestId("node-canvas-action-1")).toHaveTextContent("Delay");
    });
  });

  it("simulates and creates a multi-step workflow with delay timer action", async () => {
    mockApi.simulateToolCall.mockResolvedValue({
      preview: { created_workflow: "Automated Delayed Pipeline", steps: 2 },
    });
    mockApi.executeToolCall.mockResolvedValue({ success: true });

    renderWorkflows();

    fireEvent.click(screen.getByTestId("tab-create"));

    const nameInput = screen.getByTestId("workflow-name-input");
    fireEvent.change(nameInput, { target: { value: "Automated Delayed Pipeline" } });

    // Add delay step
    fireEvent.click(screen.getByTestId("btn-canvas-add-delay"));

    await waitFor(() => {
      expect(screen.getByTestId("action-card-1")).toBeInTheDocument();
    });

    // Set delay preset to 15m (900s)
    fireEvent.click(screen.getByTestId("btn-delay-preset-1-15m"));

    // Click simulate + create
    fireEvent.click(screen.getByTestId("workflow-create-btn"));

    await waitFor(() => {
      expect(mockApi.simulateToolCall).toHaveBeenCalled();
      const toolCallArg = mockApi.simulateToolCall.mock.calls[0][0];
      expect(toolCallArg.tool).toBe("workflows.create");
      expect(toolCallArg.args.actions).toHaveLength(2);
      expect(toolCallArg.args.actions[1]).toEqual(
        expect.objectContaining({
          type: "delay",
          duration_seconds: 900,
        })
      );
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    // Confirm execution
    fireEvent.click(screen.getByTestId("confirm-execute-btn"));

    await waitFor(() => {
      expect(mockApi.executeToolCall).toHaveBeenCalled();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });
});
