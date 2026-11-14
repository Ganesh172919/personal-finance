/**
 * @fileoverview Workflow automation page for creating and managing automated tasks.
 *
 * Provides a three-tab interface: existing workflows, a create form,
 * and a template gallery. Workflows combine triggers (manual, cron
 * schedule, event-based, or inbound webhook) with actions (task creation,
 * export report, or send notification) and multi-step conditional branch logic.
 *
 * Key data flows:
 * - listWorkflows() loads existing workflows; listWorkflowTemplates()
 *   and builtinWorkflowTemplates() provide server + client templates.
 * - simulateToolCall() dry-runs a workflow to preview its effect.
 * - executeToolCall() runs a workflow for real, creating tasks or
 *   exports as configured.
 * - Template deep-links are parsed from the URL query string via
 *   parseWorkflowTemplateParam() and pre-populate the create form.
 * - Inbound Webhook triggers receive external JSON payloads at POST /api/workflows/webhook/:token
 *   and support templated string interpolation ({{field}}) and multi-step branch filters.
 *
 * Accessible from the sidebar under "Workflows" for authenticated users.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/TextArea";
import { useToast } from "@/hooks/useToast";
import { ArrowRight, CheckSquare, ChevronLeft, ChevronRight, FileText, GripVertical, Mail, Timer, Trash2, Zap } from "lucide-react";
import { reportClientError } from "@/lib/runtimeLogger";
import { getSearchParam } from "@/lib/url";
import type { ToolCall } from "@/types/ai.types";
import {
  ApiError,
  executeToolCall,
  listWorkflows,
  listWorkflowTemplates,
  simulateToolCall,
  type CreateWorkflowRequest,
  type Workflow,
} from "@/lib/apiClient";

import type { TaskKind, TaskPriority, WorkflowAction, WorkflowConditionOperator } from "@/types/apiTypes";

import {
  builtinWorkflowTemplates,
  buildWorkflowTemplateLink,
  parseWorkflowTemplateParam,
  workflowToTemplateRequest,
} from "@/features/workflows/templateLinks";
import {
  toolCallForWorkflowCreate,
  toolCallForWorkflowEnable,
  toolCallForWorkflowRun,
  workflowActionLabel,
} from "@/features/workflows/toolCalls";

// Formats workflow API error instances into user-facing notification strings.
// Appends server request identifiers when present on ApiError objects.
// Returns a fallback message if error details cannot be determined.
const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

// Counts elements in an array safely without throwing on non-array values.
// Returns zero if the provided value is null, undefined, or not an array.
// Facilitates pluralization and outcome summary generation.
const countOf = (value: unknown) => (Array.isArray(value) ? value.length : 0);
// Returns a singular or pluralized word string based on the given count.
// Appends an s suffix when the count differs from exactly one.
// Used for human-readable run outcome and action summaries.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Generates human-readable summary text describing completed workflow run results.
// Counts tasks created, exports generated, and notifications dispatched.
// Returns queued notification text when runs are in-flight or backgrounded.
/** Summarises a `workflows.run` execution so users can see what the run produced. */
const describeRunResult = (result: Record<string, unknown> | undefined): string | null => {
  const run = (result as { run?: { status?: string; result?: Record<string, unknown> } } | undefined)?.run;
  if (!run) return null;
  if ((result as { queued?: boolean }).queued || run.status === "queued" || run.status === "running") {
    return "Workflow run queued. Results will appear when it finishes.";
  }
  const outcome = run.result || {};
  const parts = [
    countOf(outcome.tasks_created) ? plural(countOf(outcome.tasks_created), "task") + " created" : "",
    countOf(outcome.exports_created) ? plural(countOf(outcome.exports_created), "export") + " created" : "",
    countOf(outcome.notifications_sent) ? plural(countOf(outcome.notifications_sent), "notification") + " sent" : "",
    countOf(outcome.actions_skipped) ? plural(countOf(outcome.actions_skipped), "action") + " skipped" : "",
  ].filter(Boolean);
  return parts.length ? `Workflow run ${run.status || "finished"}: ${parts.join(", ")}.` : `Workflow run ${run.status || "finished"}.`;
};

// Splits multi-line string input into a sanitized array of action step strings.
// Trims whitespace from individual lines, discards blanks, and limits to 20 steps.
// Prepares task creation instructions from raw textarea form values.
const normalizeSteps = (raw: string) =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

// Predefined time delay increments for workflow execution pauses.
// Maps duration labels (1m to 1d) to exact duration values in seconds.
// Used when configuring delay nodes inside multi-step automated workflows.
const DELAY_PRESETS = [
  { label: "1m", seconds: 60, id: "1m" },
  { label: "5m", seconds: 300, id: "5m" },
  { label: "15m", seconds: 900, id: "15m" },
  { label: "1h", seconds: 3600, id: "1h" },
  { label: "1d", seconds: 86400, id: "1d" },
];

// Type guard verifying if a given workflow action is a delay step.
// Narrows the WorkflowAction union to the delay action interface.
// Powers delay configuration controls within the visual workflow builder.
const isDelayAction = (
  action: WorkflowAction
): action is Extract<WorkflowAction, { type: "delay" }> =>
  action.type === "delay";

// Returns the current year and month as a standard YYYY-MM period key.
// Pads single-digit months with a leading zero for ISO format consistency.
// Used as the default period parameter for scheduled export report actions.
const defaultPeriodKey = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// Type guard verifying if an action represents a monthly summary PDF export.
// Confirms that the action type matches export_report with monthly_summary_pdf format.
// Used for conditional rendering of monthly period selection parameters.
const isExportActionMonthly = (
  action: WorkflowAction
): action is Extract<WorkflowAction, { type: "export_report"; export_type: "monthly_summary_pdf" }> =>
  action.type === "export_report" && (action as any).export_type === "monthly_summary_pdf";

// Type guard verifying if an action represents a transactions CSV export.
// Ensures that the action type matches export_report with transactions_csv format.
// Used for displaying transaction date filter parameters in workflow nodes.
const isExportActionCsv = (
  action: WorkflowAction
): action is Extract<WorkflowAction, { type: "export_report"; export_type: "transactions_csv" }> =>
  action.type === "export_report" && (action as any).export_type === "transactions_csv";

// Visual automation workflows builder and management dashboard.
// Allows constructing multi-step trigger-action flows with drag-and-drop ordering.
// Manages manual execution, run history tracking, and trigger activation toggles.
export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // wouter v3: useLocation() is pathname-only; the query string comes from useSearch().
  const search = useSearch();

  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);

  const moveAction = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= draft.actions.length ||
      toIndex >= draft.actions.length
    ) {
      return;
    }
    setDraft((prev) => {
      const updated = [...prev.actions];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return { ...prev, actions: updated };
    });
  };

  const [activeTab, setActiveTab] = useState<"workflows" | "create" | "templates">("workflows");

  const builtinTemplates = useMemo(() => builtinWorkflowTemplates(), []);

  const templatesQuery = useQuery({
    queryKey: ["v1/workflows/templates"],
    queryFn: () => listWorkflowTemplates(),
  });

  const templates = useMemo(() => {
    const pluginTemplates = (templatesQuery.data?.templates || []).map((t) => ({
      id: t.template_key,
      name: t.name,
      description: t.description,
      request: t.request as any,
      source: "plugin" as const,
      plugin_key: t.plugin_key,
      plugin_version: t.plugin_version,
    }));

    return [
      ...builtinTemplates.map((t) => ({ ...t, source: "builtin" as const })),
      ...pluginTemplates,
    ];
  }, [builtinTemplates, templatesQuery.data?.templates]);

  const [draft, setDraft] = useState<CreateWorkflowRequest>(() => ({
    name: "New workflow",
    enabled: true,
    trigger: { type: "manual" },
    actions: [
      {
        type: "create_task",
        bucket: 7,
        title: "Weekly money check-in",
        why: "Build a lightweight review habit.",
        steps: ["Scan transactions", "Adjust one category cap"],
        priority: "medium",
        expected_impact: "Improves consistency.",
        kind: "cashflow",
        due_days: 7,
      },
    ],
  }));

  useEffect(() => {
    const raw = getSearchParam(`?${search}`, "template");
    if (!raw) return;
    const request = parseWorkflowTemplateParam(raw);
    if (!request) {
      toast({ title: "Invalid template", description: "Template link is malformed.", variant: "destructive" });
      navigate("/workflows");
      return;
    }
    setDraft(request);
    setActiveTab("create");
    toast({ title: "Template loaded", description: `Ready to create: ${request.name}` });
    navigate("/workflows");
  }, [search, navigate, toast]);

  const workflowsQuery = useQuery({
    queryKey: ["v1/workflows"],
    queryFn: () => listWorkflows(),
  });

  const workflows = workflowsQuery.data?.workflows || [];

  const [pending, setPending] = useState<{
    toolCall: ToolCall;
    preview: Record<string, unknown>;
    label: string;
  } | null>(null);

  const simulateMutation = useMutation({
    mutationFn: simulateToolCall,
    onError: (error) => {
      toast({ title: "Simulation failed", description: formatError(error, "Couldn't simulate tool call."), variant: "destructive" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (toolCall: ToolCall) => executeToolCall(toolCall, { confirm: true, idempotency_key: toolCall.id }),
    onSuccess: async (data) => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["v1/workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/exports"] }),
      ]);
      toast({ title: "Done", description: describeRunResult(data?.result) || "Action executed successfully." });
      setPending(null);
    },
    onError: (error) => {
      toast({ title: "Execution failed", description: formatError(error, "Couldn't execute tool call."), variant: "destructive" });
    },
  });

  const requestToolExecution = async (toolCall: ToolCall, label: string) => {
    try {
      const sim = await simulateMutation.mutateAsync(toolCall);
      setPending({ toolCall, preview: sim.preview, label });
    } catch (error) {
      reportClientError("Tool call simulation failed", error);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: "Copied to clipboard." });
    } catch (error) {
      reportClientError("Clipboard write failed", error);
      toast({ title: "Copy failed", description: "Couldn't copy to clipboard.", variant: "destructive" });
    }
  };

  const setTriggerType = (type: "manual" | "cron" | "event" | "webhook") => {
    if (type === "manual") setDraft((prev) => ({ ...prev, trigger: { type: "manual" } }));
    if (type === "cron") setDraft((prev) => ({ ...prev, trigger: { type: "cron", cron: "0 9 * * 1" } as any }));
    if (type === "event") setDraft((prev) => ({ ...prev, trigger: { type: "event", event_type: "TransactionCreated" } as any }));
    if (type === "webhook") setDraft((prev) => ({ ...prev, trigger: { type: "webhook" } as any }));
  };

  const addAction = (type: WorkflowAction["type"]) => {
    if (type === "delay") {
      const next: WorkflowAction = {
        type: "delay",
        duration_seconds: 300,
        description: "Wait 5 minutes before next step",
      } as any;
      setDraft((prev) => ({ ...prev, actions: [...prev.actions, next] }));
      return;
    }
    if (type === "create_task") {
      const next: WorkflowAction = {
        type: "create_task",
        bucket: 7,
        title: "New task",
        why: "Explain why this matters.",
        steps: [],
        priority: "medium",
        expected_impact: "Expected impact.",
        kind: "generic",
        due_days: 7,
      };
      setDraft((prev) => ({ ...prev, actions: [...prev.actions, next] }));
      return;
    }
    if (type === "send_notification") {
      const next: WorkflowAction = {
        type: "send_notification",
        channel: "email",
        subject: "FinWise notification",
        message: "Message body.",
      };
      setDraft((prev) => ({ ...prev, actions: [...prev.actions, next] }));
      return;
    }
    if (type === "export_report") {
      const next: WorkflowAction = { type: "export_report", export_type: "transactions_csv", params: {} } as any;
      setDraft((prev) => ({ ...prev, actions: [...prev.actions, next] }));
    }
  };

  const removeAction = (index: number) => setDraft((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }));
  const updateAction = (index: number, next: WorkflowAction) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => (i === index ? next : a)) }));

  const handleCreateWorkflow = async () => {
    const name = String(draft.name || "").trim();
    if (!name) {
      toast({ title: "Name required", description: "Workflow name cannot be empty.", variant: "destructive" });
      return;
    }
    if (!draft.actions?.length) {
      toast({ title: "Add an action", description: "Workflows need at least one action.", variant: "destructive" });
      return;
    }
    const trigger = draft.trigger as any;
    if (trigger?.type === "cron" && !String(trigger?.cron || "").trim()) {
      toast({ title: "Cron required", description: "Cron trigger requires a cron expression.", variant: "destructive" });
      return;
    }
    if (trigger?.type === "event" && !String(trigger?.event_type || "").trim()) {
      toast({ title: "Event required", description: "Event trigger requires an event type.", variant: "destructive" });
      return;
    }
    for (const action of draft.actions as any[]) {
      if (action?.type === "delay") {
        const sec = Number(action?.duration_seconds);
        if (!Number.isFinite(sec) || sec < 1 || sec > 86400 * 30) {
          toast({ title: "Invalid delay", description: "Delay action duration must be between 1 second and 30 days.", variant: "destructive" });
          return;
        }
      }
      if (action?.type !== "export_report") continue;
      if (action.export_type !== "monthly_summary_pdf") continue;
      const key = String(action?.params?.period_key || "").trim();
      if (!/^\d{4}-\d{2}$/.test(key)) {
        toast({ title: "Invalid period", description: "Monthly summary export requires params.period_key (YYYY-MM).", variant: "destructive" });
        return;
      }
    }
    await requestToolExecution(toolCallForWorkflowCreate({ ...draft, name, enabled: Boolean(draft.enabled) }), "Create workflow");
  };

  return (
    <div className="p-6 space-y-4" data-testid="workflows-page">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Workflows</h1>
        <div className="text-sm text-muted-foreground">
          Automate tasks, exports, and notifications with conditional branching and webhook triggers. All actions run through simulation + confirmation.
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="workflows" data-testid="tab-workflows" onClick={() => setActiveTab("workflows")}>My workflows</TabsTrigger>
          <TabsTrigger value="create" data-testid="tab-create" onClick={() => setActiveTab("create")}>Create</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates" onClick={() => setActiveTab("templates")}>Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your workflows</CardTitle>
              <CardDescription>Enable/disable, run now, copy webhook URLs, and share templates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => workflowsQuery.refetch()} disabled={workflowsQuery.isFetching} data-testid="workflows-refresh-btn">
                  {workflowsQuery.isFetching ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              {workflowsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground" data-testid="workflows-loading">Loading...</div>
              ) : workflows.length ? (
                <div className="space-y-3">
                  {workflows.map((wf: Workflow) => (
                    <div key={wf.id} data-testid="workflow-card" className="rounded-md border border-border p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{wf.name}</span>
                            {(wf as any).trigger?.type === "webhook" ? (
                              <span
                                className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                data-testid={`badge-webhook-${wf.id}`}
                              >
                                Webhook
                              </span>
                            ) : null}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            Trigger: {(wf as any).trigger?.type || "manual"} | Actions:{" "}
                            {Array.isArray((wf as any).actions) ? (wf as any).actions.length : 0}
                          </div>
                          <div className="text-xs text-muted-foreground">Status: {wf.enabled ? "enabled" : "disabled"}</div>

                          {(wf as any).trigger?.type === "webhook" && (wf as any).trigger?.webhook_token ? (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[11px] font-mono text-muted-foreground truncate max-w-xs">
                                ...{String((wf as any).trigger?.webhook_token).slice(-12)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[11px] px-2 text-primary hover:text-primary/80"
                                onClick={() => {
                                  const url = `${window.location.origin}/api/workflows/webhook/${(wf as any).trigger?.webhook_token}`;
                                  copyToClipboard(url);
                                }}
                                data-testid={`btn-copy-webhook-${wf.id}`}
                              >
                                Copy webhook URL
                              </Button>
                            </div>
                          ) : null}

                          {Array.isArray((wf as any).actions) && (wf as any).actions.length ? (
                            <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground space-y-1">
                              {(wf as any).actions.slice(0, 6).map((action: WorkflowAction, idx: number) => (
                                <li key={idx} className="inline-flex items-center gap-1.5 flex-wrap">
                                  <span>{workflowActionLabel(action)}</span>
                                  {(action as any).condition?.field ? (
                                    <span
                                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                                      data-testid={`badge-action-condition-${wf.id}-${idx}`}
                                    >
                                      rule: {(action as any).condition.field} {(action as any).condition.operator} {String((action as any).condition.value)}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                              {(wf as any).actions.length > 6 ? <li>...</li> : null}
                            </ul>
                          ) : null}
                          {/* Visual pipeline ribbon */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-2" data-testid={`workflow-pipeline-${wf.id}`}>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-secondary-foreground border border-border">
                              <Zap className="w-3 h-3 text-amber-500" />
                              <span>Trigger: {(wf as any).trigger?.type || "manual"}</span>
                            </span>
                            {Array.isArray((wf as any).actions) && (wf as any).actions.map((act: WorkflowAction, aIdx: number) => (
                              <div key={aIdx} className="inline-flex items-center gap-1.5">
                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                                  act.type === "delay"
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                    : act.type === "create_task"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : act.type === "send_notification"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                }`}>
                                  {act.type === "delay" && <Timer className="w-3 h-3" />}
                                  {act.type === "create_task" && <CheckSquare className="w-3 h-3" />}
                                  {act.type === "send_notification" && <Mail className="w-3 h-3" />}
                                  {act.type === "export_report" && <FileText className="w-3 h-3" />}
                                  <span>
                                    {act.type === "delay"
                                      ? `Delay: ${Math.round((act as any).duration_seconds / 60)}m`
                                      : act.type === "create_task"
                                      ? (act as any).title || "Task"
                                      : act.type === "send_notification"
                                      ? (act as any).subject || "Email"
                                      : (act as any).export_type || "Export"}
                                  </span>
                                  {(act as any).condition?.field ? (
                                    <span className="text-[9px] font-mono opacity-80">(cond)</span>
                                  ) : null}
                                </span>
                              </div>
                            ))}
                          </div>

                        </div>

                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => requestToolExecution(toolCallForWorkflowRun(wf), "Run workflow")}
                            disabled={simulateMutation.isPending || executeMutation.isPending}
                            data-testid="workflow-run-btn"
                          >
                            Run now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => requestToolExecution(toolCallForWorkflowEnable(wf, !wf.enabled), wf.enabled ? "Disable workflow" : "Enable workflow")}
                            disabled={simulateMutation.isPending || executeMutation.isPending}
                            data-testid="workflow-toggle-btn"
                          >
                            {wf.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(buildWorkflowTemplateLink(workflowToTemplateRequest(wf)))}
                            data-testid="workflow-share-btn"
                          >
                            Share template
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground" data-testid="workflows-empty">
                  No workflows yet. Create one from the Create tab or import a template link.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Create workflow</CardTitle>
              <CardDescription>Build an automation with triggers, actions, and conditional branch filters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input className="mt-1" data-testid="workflow-name-input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">Enabled</div>
                    <div className="text-xs text-muted-foreground">Cron, event, or webhook triggers can run automatically.</div>
                  </div>
                  <Switch checked={Boolean(draft.enabled)} onCheckedChange={(v) => setDraft((p) => ({ ...p, enabled: Boolean(v) }))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Trigger type</Label>
                  <Select value={(draft.trigger as any).type} onValueChange={(v) => setTriggerType(v as any)}>
                    <SelectTrigger className="mt-1" data-testid="trigger-select-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual" data-testid="trigger-option-manual">manual</SelectItem>
                      <SelectItem value="cron" data-testid="trigger-option-cron">cron</SelectItem>
                      <SelectItem value="event" data-testid="trigger-option-event">event</SelectItem>
                      <SelectItem value="webhook" data-testid="trigger-option-webhook">webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(draft.trigger as any).type === "cron" ? (
                  <div className="md:col-span-2">
                    <Label>Cron</Label>
                    <Input className="mt-1" value={String((draft.trigger as any).cron || "")} onChange={(e) => setDraft((p) => ({ ...p, trigger: { type: "cron", cron: e.target.value } as any }))} />
                  </div>
                ) : (draft.trigger as any).type === "event" ? (
                  <div className="md:col-span-2">
                    <Label>Event type</Label>
                    <Input className="mt-1" value={String((draft.trigger as any).event_type || "")} onChange={(e) => setDraft((p) => ({ ...p, trigger: { type: "event", event_type: e.target.value } as any }))} />
                  </div>
                ) : (draft.trigger as any).type === "webhook" ? (
                  <div className="md:col-span-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 space-y-1.5" data-testid="webhook-trigger-panel">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Third-Party Webhook Receiver</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        POST /api/workflows/webhook/:token
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Generates a secure endpoint token on save. External services (Stripe, GitHub, Zapier, custom scripts) can POST JSON payloads to trigger this workflow.
                      Actions can reference fields via <code className="font-mono text-foreground font-semibold">{"{{field}}"}</code> and apply conditional branch logic.
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Manual workflows only run when you click Run now.
                  </div>
                )}
              </div>

                            {/* Visual Drag-and-Drop Node Graph Canvas Editor */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="card-workflow-node-canvas">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Interactive Node Pipeline Flow</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Visual graph representation of workflow execution. Drag nodes to reorder execution steps or use the arrows.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground mr-1">Quick Add:</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addAction("delay")} data-testid="btn-canvas-add-delay">
                      <Timer className="w-3 h-3 mr-1 text-amber-500" />
                      + Delay
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addAction("create_task")} data-testid="btn-canvas-add-task">
                      <CheckSquare className="w-3 h-3 mr-1 text-emerald-500" />
                      + Task
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addAction("send_notification")} data-testid="btn-canvas-add-notify">
                      <Mail className="w-3 h-3 mr-1 text-blue-500" />
                      + Email
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addAction("export_report")} data-testid="btn-canvas-add-export">
                      <FileText className="w-3 h-3 mr-1 text-purple-500" />
                      + Export
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto py-3 px-2 rounded-md border border-border/60 bg-muted/20 flex items-center gap-2.5 min-h-[130px]">
                  {/* Trigger Node */}
                  <div
                    className="shrink-0 rounded-lg border-2 border-primary/40 bg-card p-3 shadow-sm min-w-[150px] max-w-[180px] space-y-1.5"
                    data-testid="node-canvas-trigger"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-primary">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" />
                        Trigger
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-primary/10">Root</span>
                    </div>
                    <div className="text-sm font-medium text-foreground capitalize truncate">
                      {(draft.trigger as any).type}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {(draft.trigger as any).type === "cron"
                        ? (draft.trigger as any).cron || "0 9 * * 1"
                        : (draft.trigger as any).type === "event"
                        ? (draft.trigger as any).event_type || "Event"
                        : (draft.trigger as any).type === "webhook"
                        ? "Inbound HTTP"
                        : "On-demand execution"}
                    </div>
                  </div>

                  {/* Connector Arrow from Trigger to First Action */}
                  {draft.actions.length > 0 && (
                    <div className="shrink-0 flex items-center px-1 text-muted-foreground">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}

                  {/* Action Nodes */}
                  {draft.actions.map((act: WorkflowAction, idx: number) => (
                    <div key={idx} className="shrink-0 flex items-center gap-2.5">
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(idx));
                          setDraggedNodeIndex(idx);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromStr = e.dataTransfer.getData("text/plain");
                          const fromIdx = Number(fromStr);
                          if (!isNaN(fromIdx) && fromIdx !== idx) {
                            moveAction(fromIdx, idx);
                          }
                          setDraggedNodeIndex(null);
                        }}
                        onDragEnd={() => setDraggedNodeIndex(null)}
                        className={`shrink-0 rounded-lg border p-3 min-w-[170px] max-w-[210px] bg-card transition-all cursor-move ${
                          draggedNodeIndex === idx
                            ? "opacity-50 border-primary border-dashed shadow-md"
                            : "border-border shadow-sm hover:border-primary/50"
                        }`}
                        data-testid={`node-canvas-action-${idx}`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                            <GripVertical className="w-3 h-3 cursor-grab" />
                            Step {idx + 1}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            act.type === "delay"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : act.type === "create_task"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : act.type === "send_notification"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                          }`}>
                            {act.type === "delay" && <Timer className="w-3 h-3" />}
                            {act.type === "create_task" && <CheckSquare className="w-3 h-3" />}
                            {act.type === "send_notification" && <Mail className="w-3 h-3" />}
                            {act.type === "export_report" && <FileText className="w-3 h-3" />}
                            {act.type === "delay" ? "Delay" : act.type === "create_task" ? "Task" : act.type === "send_notification" ? "Email" : "Export"}
                          </span>
                        </div>

                        <div className="text-xs font-medium text-foreground truncate">
                          {act.type === "delay"
                            ? `Wait ${(act as any).duration_seconds}s`
                            : act.type === "create_task"
                            ? (act as any).title || "Task"
                            : act.type === "send_notification"
                            ? (act as any).subject || "Email"
                            : (act as any).export_type || "Export"}
                        </div>

                        {(act as any).condition?.field ? (
                          <div className="text-[10px] font-mono text-muted-foreground truncate mt-1 bg-muted/60 px-1.5 py-0.5 rounded">
                            if {(act as any).condition.field} {(act as any).condition.operator} {String((act as any).condition.value)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground/60 italic mt-1">Always run</div>
                        )}

                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              disabled={idx === 0}
                              onClick={() => moveAction(idx, idx - 1)}
                              data-testid={`btn-canvas-move-up-${idx}`}
                              title="Move step earlier"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              disabled={idx === draft.actions.length - 1}
                              onClick={() => moveAction(idx, idx + 1)}
                              data-testid={`btn-canvas-move-down-${idx}`}
                              title="Move step later"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            disabled={draft.actions.length <= 1}
                            onClick={() => removeAction(idx)}
                            data-testid={`btn-canvas-delete-${idx}`}
                            title="Remove step"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Connector Arrow between consecutive actions */}
                      {idx < draft.actions.length - 1 && (
                        <div className="shrink-0 flex items-center px-1 text-muted-foreground">
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Actions & Multi-Step Branch Rules</div>
                    <div className="text-xs text-muted-foreground">Actions run in sequence. Optional branch conditions evaluate against payload context.</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => addAction("delay")} data-testid="btn-add-action-delay"><Timer className="w-3.5 h-3.5 mr-1 text-amber-500" />Add delay</Button>
                    <Button size="sm" variant="outline" onClick={() => addAction("create_task")} data-testid="btn-add-action-task">Add task</Button>
                    <Button size="sm" variant="outline" onClick={() => addAction("export_report")} data-testid="btn-add-action-export">Add export</Button>
                    <Button size="sm" variant="outline" onClick={() => addAction("send_notification")} data-testid="btn-add-action-notify">Add email</Button>
                  </div>
                </div>

                {draft.actions.map((action: WorkflowAction, index: number) => (
                  <div key={index} className="rounded-md border border-border p-4 space-y-4" data-testid={`action-card-${index}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">{index + 1}. {workflowActionLabel(action)}</div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => moveAction(index, index - 1)}
                          disabled={index === 0}
                          data-testid={`btn-action-move-up-${index}`}
                        >
                          Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => moveAction(index, index + 1)}
                          disabled={index === draft.actions.length - 1}
                          data-testid={`btn-action-move-down-${index}`}
                        >
                          Down
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => removeAction(index)} disabled={draft.actions.length <= 1}>
                          Remove
                        </Button>
                      </div>
                    </div>

                    {/* Conditional Branch Logic Configuration */}
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3" data-testid={`action-condition-box-${index}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branch Logic:</span>
                          {(action as any).condition?.field ? (
                            <span
                              className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                              data-testid={`condition-badge-${index}`}
                            >
                              if {(action as any).condition.field} {(action as any).condition.operator} {String((action as any).condition.value)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Always execute (unconditional)</span>
                          )}
                        </div>
                        {(action as any).condition?.field ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const next = { ...action } as any;
                              delete next.condition;
                              updateAction(index, next);
                            }}
                            data-testid={`btn-clear-condition-${index}`}
                          >
                            Remove branch rule
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              updateAction(index, {
                                ...action,
                                condition: { field: "amount", operator: "gte", value: 100 },
                              } as any);
                            }}
                            data-testid={`btn-add-condition-${index}`}
                          >
                            + Add branch filter
                          </Button>
                        )}
                      </div>

                      {(action as any).condition?.field ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                          <div>
                            <Label className="text-xs">Context Field (or dot path)</Label>
                            <Input
                              className="mt-1 h-8 text-xs font-mono"
                              placeholder="amount, merchant, severity"
                              value={(action as any).condition?.field || ""}
                              onChange={(e) =>
                                updateAction(index, {
                                  ...action,
                                  condition: { ...((action as any).condition || {}), field: e.target.value },
                                } as any)
                              }
                              data-testid={`input-condition-field-${index}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Operator</Label>
                            <Select
                              value={String((action as any).condition?.operator || "eq")}
                              onValueChange={(v) =>
                                updateAction(index, {
                                  ...action,
                                  condition: { ...((action as any).condition || {}), operator: v as WorkflowConditionOperator },
                                } as any)
                              }
                            >
                              <SelectTrigger className="mt-1 h-8 text-xs" data-testid={`select-condition-operator-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="eq">Equal to (=)</SelectItem>
                                <SelectItem value="neq">Not equal to (!=)</SelectItem>
                                <SelectItem value="gt">Greater than (&gt;)</SelectItem>
                                <SelectItem value="gte">Greater than or equal (&gt;=)</SelectItem>
                                <SelectItem value="lt">Less than (&lt;)</SelectItem>
                                <SelectItem value="lte">Less than or equal (&lt;=)</SelectItem>
                                <SelectItem value="contains">Contains text</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Comparison Value</Label>
                            <Input
                              className="mt-1 h-8 text-xs font-mono"
                              placeholder="100, high, active"
                              value={String((action as any).condition?.value ?? "")}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const num = Number(raw);
                                const val = !isNaN(num) && raw.trim() !== "" ? num : raw;
                                updateAction(index, {
                                  ...action,
                                  condition: { ...((action as any).condition || {}), value: val },
                                } as any);
                              }}
                              data-testid={`input-condition-value-${index}`}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {isDelayAction(action) ? (
                      <div className="space-y-4" data-testid={`action-delay-config-${index}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Delay Duration (seconds)</Label>
                            <Input
                              className="mt-1"
                              type="number"
                              min={1}
                              max={2592000}
                              value={action.duration_seconds ?? 300}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                updateAction(index, { ...action, duration_seconds: val });
                              }}
                              data-testid={`input-delay-seconds-${index}`}
                            />
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {DELAY_PRESETS.map((p) => (
                                <Button
                                  key={p.id}
                                  type="button"
                                  size="sm"
                                  variant={action.duration_seconds === p.seconds ? "secondary" : "outline"}
                                  className="h-6 text-[11px] px-2"
                                  onClick={() => updateAction(index, { ...action, duration_seconds: p.seconds })}
                                  data-testid={`btn-delay-preset-${index}-${p.id}`}
                                >
                                  {p.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Label>Description / Purpose (Supports {"{{field}}"} tags)</Label>
                            <Input
                              className="mt-1"
                              placeholder="e.g. Wait 5 minutes before checking transaction confirmation"
                              value={action.description || ""}
                              onChange={(e) => updateAction(index, { ...action, description: e.target.value })}
                              data-testid={`input-delay-description-${index}`}
                            />
                            <span className="text-[11px] text-muted-foreground mt-1 block">
                              Interpolated context variables from webhook payloads can be referenced with <code className="font-mono">{"{{variable}}"}</code>.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {action.type === "create_task" ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <Label>Title</Label>
                          <Input className="mt-1" value={action.title} onChange={(e) => updateAction(index, { ...action, title: e.target.value })} />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Why</Label>
                          <Input className="mt-1" value={action.why} onChange={(e) => updateAction(index, { ...action, why: e.target.value })} />
                        </div>
                        <div>
                          <Label>Bucket</Label>
                          <Select value={String(action.bucket)} onValueChange={(v) => updateAction(index, { ...action, bucket: Number(v) as any })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">7 days</SelectItem>
                              <SelectItem value="30">30 days</SelectItem>
                              <SelectItem value="365">12 months</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Priority</Label>
                          <Select value={String(action.priority || "medium")} onValueChange={(v) => updateAction(index, { ...action, priority: v as TaskPriority })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">low</SelectItem>
                              <SelectItem value="medium">medium</SelectItem>
                              <SelectItem value="high">high</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Kind</Label>
                          <Select value={String(action.kind || "generic")} onValueChange={(v) => updateAction(index, { ...action, kind: v as TaskKind })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cashflow">cashflow</SelectItem>
                              <SelectItem value="budget">budget</SelectItem>
                              <SelectItem value="debt">debt</SelectItem>
                              <SelectItem value="invest">invest</SelectItem>
                              <SelectItem value="goal">goal</SelectItem>
                              <SelectItem value="education">education</SelectItem>
                              <SelectItem value="generic">generic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Due days (optional)</Label>
                          <Input className="mt-1" type="number" min={1} max={3650} value={action.due_days ?? ""} onChange={(e) => {
                            const raw = e.target.value;
                            const next = raw.trim() ? Number(raw) : undefined;
                            updateAction(index, { ...action, due_days: Number.isFinite(next as any) ? (next as any) : undefined });
                          }} />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Expected impact</Label>
                          <Input className="mt-1" value={action.expected_impact} onChange={(e) => updateAction(index, { ...action, expected_impact: e.target.value })} />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Steps (one per line)</Label>
                          <Textarea className="mt-1" rows={4} value={(action.steps || []).join("\n")} onChange={(e) => updateAction(index, { ...action, steps: normalizeSteps(e.target.value) })} />
                        </div>
                      </div>
                    ) : action.type === "send_notification" ? (
                      <div className="space-y-4">
                        <div>
                          <Label>Subject</Label>
                          <Input className="mt-1" value={action.subject} onChange={(e) => updateAction(index, { ...action, subject: e.target.value })} />
                        </div>
                        <div>
                          <Label>Message</Label>
                          <Textarea className="mt-1" rows={4} value={action.message} onChange={(e) => updateAction(index, { ...action, message: e.target.value })} />
                        </div>
                      </div>
                    ) : action.type === "export_report" ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Export type</Label>
                            <Select
                              value={String((action as any).export_type)}
                              onValueChange={(v) => {
                                if (v === "monthly_summary_pdf") {
                                  updateAction(index, { type: "export_report", export_type: "monthly_summary_pdf", params: { period_key: defaultPeriodKey() } } as any);
                                  return;
                                }
                                updateAction(index, { type: "export_report", export_type: "transactions_csv", params: {} } as any);
                              }}
                            >
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="transactions_csv">transactions_csv</SelectItem>
                                <SelectItem value="monthly_summary_pdf">monthly_summary_pdf</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {isExportActionMonthly(action) ? (
                            <div>
                              <Label>Period (YYYY-MM)</Label>
                              <Input className="mt-1" type="month" value={String(action.params?.period_key || "")} onChange={(e) => updateAction(index, { ...action, params: { period_key: e.target.value } } as any)} />
                            </div>
                          ) : null}
                        </div>

                        {isExportActionCsv(action) ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label>Date from (optional)</Label>
                              <Input className="mt-1" type="date" value={String((action.params as any)?.date_from || "")} onChange={(e) => {
                                const date = e.target.value.trim();
                                const params = { ...(action.params || {}) } as any;
                                if (date) params.date_from = new Date(date).toISOString();
                                else delete params.date_from;
                                updateAction(index, { ...action, params } as any);
                              }} />
                            </div>
                            <div>
                              <Label>Date to (optional)</Label>
                              <Input className="mt-1" type="date" value={String((action.params as any)?.date_to || "")} onChange={(e) => {
                                const date = e.target.value.trim();
                                const params = { ...(action.params || {}) } as any;
                                if (date) params.date_to = new Date(date).toISOString();
                                else delete params.date_to;
                                updateAction(index, { ...action, params } as any);
                              }} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" onClick={() => copyToClipboard(buildWorkflowTemplateLink({ ...draft, enabled: false }))}>
                  Copy template link
                </Button>
                <Button onClick={handleCreateWorkflow} disabled={simulateMutation.isPending || executeMutation.isPending} data-testid="workflow-create-btn">
                  {simulateMutation.isPending || executeMutation.isPending ? "Working..." : "Simulate + create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Templates</CardTitle>
              <CardDescription>Start from a proven workflow and customize.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {templatesQuery.isError ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Couldn't load marketplace templates. Built-in templates are still available.
                </div>
              ) : null}

              {templates.map((t) => (
                <div key={t.id} data-testid="template-card" className="rounded-md border border-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                    {(t as any).source === "plugin" ? (
                      <div className="text-[11px] text-muted-foreground mt-2">
                        From plugin: {(t as any).plugin_key}
                        {(t as any).plugin_version ? `@${(t as any).plugin_version}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid="template-use-btn"
                      onClick={() => {
                        setDraft(t.request);
                        setActiveTab("create");
                        toast({ title: "Template loaded", description: `Customize: ${t.name}` });
                      }}
                    >
                      Use template
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(buildWorkflowTemplateLink(t.request))}>
                      Copy link
                    </Button>
                  </div>
                </div>
              ))}

              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Import a shared template link by opening it directly. The workflow will load into the Create tab.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {pending ? (
        <Card data-testid="confirm-dialog">
          <CardHeader>
            <CardTitle className="text-lg">Confirm: {pending.label}</CardTitle>
            <CardDescription>Simulation preview is shown below. Executions are idempotent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-auto max-h-72">
              <pre className="whitespace-pre-wrap">{JSON.stringify(pending.preview, null, 2)}</pre>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" onClick={() => setPending(null)} disabled={executeMutation.isPending} data-testid="confirm-cancel-btn">
                Cancel
              </Button>
              <Button onClick={() => executeMutation.mutate(pending.toolCall)} disabled={executeMutation.isPending} data-testid="confirm-execute-btn">
                {executeMutation.isPending ? "Executing..." : "Confirm + execute"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
