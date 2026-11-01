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
}));

vi.mock("wouter", () => ({
  useLocation: () => mockLocation.useLocation(),
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
});
