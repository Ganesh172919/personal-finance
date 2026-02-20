import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
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

import type { TaskKind, TaskPriority, WorkflowAction } from "@finwise/sdk-ts";

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

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

const normalizeSteps = (raw: string) =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

const defaultPeriodKey = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const isExportActionMonthly = (
  action: WorkflowAction
): action is Extract<WorkflowAction, { type: "export_report"; export_type: "monthly_summary_pdf" }> =>
  action.type === "export_report" && (action as any).export_type === "monthly_summary_pdf";

const isExportActionCsv = (
  action: WorkflowAction
): action is Extract<WorkflowAction, { type: "export_report"; export_type: "transactions_csv" }> =>
  action.type === "export_report" && (action as any).export_type === "transactions_csv";

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, navigate] = useLocation();

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
    const raw = getSearchParam(location, "template");
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
  }, [location, navigate, toast]);

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
    onSuccess: async () => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["v1/workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/exports"] }),
      ]);
      toast({ title: "Done", description: "Action executed successfully." });
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
      toast({ title: "Copied", description: "Link copied to clipboard." });
    } catch (error) {
      reportClientError("Clipboard write failed", error);
      toast({ title: "Copy failed", description: "Couldn't copy to clipboard.", variant: "destructive" });
    }
  };

  const setTriggerType = (type: "manual" | "cron" | "event") => {
    if (type === "manual") setDraft((prev) => ({ ...prev, trigger: { type: "manual" } }));
    if (type === "cron") setDraft((prev) => ({ ...prev, trigger: { type: "cron", cron: "0 9 * * 1" } as any }));
    if (type === "event") setDraft((prev) => ({ ...prev, trigger: { type: "event", event_type: "TransactionCreated" } as any }));
  };

  const addAction = (type: WorkflowAction["type"]) => {
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
        <div className="text-xl font-semibold text-foreground">Workflows</div>
        <div className="text-sm text-muted-foreground">
          Automate tasks, exports, and notifications. All actions run through simulation + confirmation.
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="workflows">My workflows</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your workflows</CardTitle>
              <CardDescription>Enable/disable, run now, and share templates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => workflowsQuery.refetch()} disabled={workflowsQuery.isFetching}>
                  {workflowsQuery.isFetching ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              {workflowsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : workflows.length ? (
                <div className="space-y-3">
                  {workflows.map((wf: Workflow) => (
                    <div key={wf.id} className="rounded-md border border-border p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">{wf.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Trigger: {(wf as any).trigger?.type || "manual"} | Actions:{" "}
                            {Array.isArray((wf as any).actions) ? (wf as any).actions.length : 0}
                          </div>
                          <div className="text-xs text-muted-foreground">Status: {wf.enabled ? "enabled" : "disabled"}</div>
                          {Array.isArray((wf as any).actions) && (wf as any).actions.length ? (
                            <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground space-y-1">
                              {(wf as any).actions.slice(0, 6).map((action: WorkflowAction, idx: number) => (
                                <li key={idx}>{workflowActionLabel(action)}</li>
                              ))}
                              {(wf as any).actions.length > 6 ? <li>...</li> : null}
                            </ul>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => requestToolExecution(toolCallForWorkflowRun(wf), "Run workflow")}
                            disabled={simulateMutation.isPending || executeMutation.isPending}
                          >
                            Run now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => requestToolExecution(toolCallForWorkflowEnable(wf, !wf.enabled), wf.enabled ? "Disable workflow" : "Enable workflow")}
                            disabled={simulateMutation.isPending || executeMutation.isPending}
                          >
                            {wf.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(buildWorkflowTemplateLink(workflowToTemplateRequest(wf)))}
                          >
                            Share template
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
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
              <CardDescription>Build an automation with triggers and actions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input className="mt-1" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">Enabled</div>
                    <div className="text-xs text-muted-foreground">Cron/event triggers can run automatically.</div>
                  </div>
                  <Switch checked={Boolean(draft.enabled)} onCheckedChange={(v) => setDraft((p) => ({ ...p, enabled: Boolean(v) }))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Trigger type</Label>
                  <Select value={(draft.trigger as any).type} onValueChange={(v) => setTriggerType(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">manual</SelectItem>
                      <SelectItem value="cron">cron</SelectItem>
                      <SelectItem value="event">event</SelectItem>
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
                ) : (
                  <div className="md:col-span-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Manual workflows only run when you click Run now.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Actions</div>
                    <div className="text-xs text-muted-foreground">Actions run in order.</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => addAction("create_task")}>Add task</Button>
                    <Button size="sm" variant="outline" onClick={() => addAction("export_report")}>Add export</Button>
                    <Button size="sm" variant="outline" onClick={() => addAction("send_notification")}>Add email</Button>
                  </div>
                </div>

                {draft.actions.map((action: WorkflowAction, index: number) => (
                  <div key={index} className="rounded-md border border-border p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">{index + 1}. {workflowActionLabel(action)}</div>
                      <Button size="sm" variant="destructive" onClick={() => removeAction(index)} disabled={draft.actions.length <= 1}>Remove</Button>
                    </div>

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
                <Button onClick={handleCreateWorkflow} disabled={simulateMutation.isPending || executeMutation.isPending}>
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
                <div key={t.id} className="rounded-md border border-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Confirm: {pending.label}</CardTitle>
            <CardDescription>Simulation preview is shown below. Executions are idempotent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-auto max-h-72">
              <pre className="whitespace-pre-wrap">{JSON.stringify(pending.preview, null, 2)}</pre>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" onClick={() => setPending(null)} disabled={executeMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={() => executeMutation.mutate(pending.toolCall)} disabled={executeMutation.isPending}>
                {executeMutation.isPending ? "Executing..." : "Confirm + execute"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
