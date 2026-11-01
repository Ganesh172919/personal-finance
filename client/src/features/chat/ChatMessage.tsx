/**
 * @fileoverview Chat Message Component
 *
 * Renders a single chat message (user or assistant) with rich formatting.
 *
 * FEATURES:
 * - Markdown rendering with GFM support (tables, code blocks, lists)
 * - User vs assistant visual distinction (avatar, alignment)
 * - Tool call visualization with approve/simulate actions
 * - Action plan rendering with "Create tasks" button
 * - File attachment display
 * - Agent workflow trace visualization
 * - Copy-to-clipboard for assistant messages
 * - Thumbs up/down feedback for AI outputs
 *
 * TOOL CALLS:
 * When the AI suggests actions (create transaction, create goal, etc.),
 * each tool call is rendered as an interactive card. Users can:
 * - "Simulate" — preview the effect without applying
 * - "Approve" — execute the action on the server
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * ChatMessage Component
 * ├── 1. Message Bubble Taxonomy
 * │   ├── User Message: Right-aligned, primary accent bubble, user avatar
 * │   └── Assistant Message: Left-aligned, bot icon, full markdown prose
 * ├── 2. Markdown Rendering Engine (ReactMarkdown + remarkGfm)
 * │   ├── Tables, code blocks, checklists, emphasized math
 * │   └── Sanitized links and bullet lists
 * ├── 3. RAG Grounding Evidence & Citations
 * │   ├── File attachment chips
 * │   └── Evidence footnotes and knowledge chunk citations
 * ├── 4. Interactive AI Tool Calls (ToolCallCard)
 * │   ├── Simulate Button: Previews transaction/goal effect without state changes
 * │   └── Approve Button: Directly commits action to database
 * ├── 5. Structured Action Plan Card
 * │   └── "Create tasks from plan" bulk action button
 * └── 6. Message Controls & Feedback
 *     ├── Copy message text to clipboard
 *     ├── Thumbs up / down feedback submission (submitAgentOutputFeedback)
 *     └── Agent workflow trace collapsible inspector
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                   ChatMessage Component Mounts                |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *                      [Is message from User or AI?]
 *                               /          \
 *                             USER          ASSISTANT
 *                             /              \
 *                            v                v
 *     +----------------------------+   +----------------------------+
 *     | Right-aligned chat bubble  |   | Left-aligned AI bubble     |
 *     | with avatar & attachments  |   | ReactMarkdown formatting   |
 *     +----------------------------+   +--------------+-------------+
 *                                                     |
 *                                                     v
 *                                      +----------------------------+
 *                                      | Grounding Evidence Badges  |
 *                                      | - Source file citations    |
 *                                      +--------------+-------------+
 *                                                     |
 *                                                     v
 *                                      +----------------------------+
 *                                      | Interactive Tool Cards     |
 *                                      | [Simulate]    [Approve]    |
 *                                      +--------------+-------------+
 *                                                     |
 *                                                     v
 *                                      +----------------------------+
 *                                      | Action Plan & Feedback Row |
 *                                      | [Add Tasks] [👍] [👎] [📋] |
 *                                      +----------------------------+
 * ```
 *
 * @module features/chat/ChatMessage
 */

import { motion } from "framer-motion";
import { User, Wand2, Copy, CheckCircle, ListTodo, Paperclip, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { IChatAttachment, IChatMessage } from "@/types/chat.types";
import { Avatar, AvatarFallback } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { AgentWorkflowVisualizer } from "@/components/AgentWorkflowVisualizer";
import { SourceEvidenceList } from "@/components/SourceEvidenceList";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  approveAutopilotRun,
  createTasksFromPlan,
  executeAutopilotRun,
  executeToolCall,
  getAutopilotRun,
  simulateAutopilotRun,
  simulateToolCall,
  submitAgentOutputFeedback,
} from "@/lib/apiClient";
import { useToast } from "@/hooks/useToast";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";
import type { ToolCall } from "@/types/ai.types";
import { buildApiUrl } from "@/lib/apiBase";
import { splitAnswerAndPlan } from "@/lib/chatResponse";
import { ChatDocumentCard } from "./ChatDocumentCard";

interface ChatMessageProps {
  message: IChatMessage;
  onUseDocument?: (file: IChatAttachment) => void;
  isSending?: boolean;
}

export function ChatMessage({ message, onUseDocument, isSending }: ChatMessageProps) {
  const chatLocation = `/chat/${message.sessionId}`;
  const isUser = message.role === "user";
  const responseParts = splitAnswerAndPlan(message.content);
  const [copied, setCopied] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<"up" | "down" | null>(null);
  const [tasksAdded, setTasksAdded] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { configQuery, formatMoney, formatTime } = useOrgFormatters({ enabled: !isUser });
  const tasksEnabled = configQuery.data?.features.tasks_enabled;
  const autopilotRunId =
    !isUser && typeof (message.metadata as any)?.autopilotRunId === "string"
      ? String((message.metadata as any).autopilotRunId)
      : !isUser && typeof (message.metadata as any)?.autopilot_run_id === "string"
        ? String((message.metadata as any).autopilot_run_id)
        : null;

  const autopilotRunQuery = useQuery({
    queryKey: ["v1/autopilot/runs", autopilotRunId || "none"],
    queryFn: () => getAutopilotRun(String(autopilotRunId)),
    enabled: Boolean(autopilotRunId),
    retry: 1,
  });

  const autopilotRun = autopilotRunQuery.data?.run;
  const autopilotToolCalls = autopilotRun ? ((autopilotRun.tool_calls || []) as unknown as ToolCall[]) : null;
  const autopilotApprovals =
    autopilotRun?.approvals && typeof autopilotRun.approvals === "object" && !Array.isArray(autopilotRun.approvals)
      ? (autopilotRun.approvals as Record<string, any>)
      : {};
  const requiredApprovalIds = autopilotToolCalls?.filter((call) => call.requires_confirmation).map((call) => call.id) || [];
  const missingApprovalIds = requiredApprovalIds.filter((id) => !autopilotApprovals?.[id]?.approved);

  const formatError = (error: unknown, fallback: string) => {
    const requestId = error instanceof ApiError ? error.requestId : undefined;
    const msg = error instanceof Error ? error.message : fallback;
    return requestId ? `${msg} (Request ID: ${requestId})` : msg;
  };

  const createTasksMutation = useMutation({
    mutationFn: (payload: { plan: any; source?: { agentOutputId?: string; chatMessageId?: string; requestId?: string } }) =>
      createTasksFromPlan({ source: payload.source, plan: payload.plan }),
    onSuccess: async (data) => {
      setTasksAdded(true);
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      const created = Number((data as any)?.created || 0);
      toast({
        title: "Tasks updated",
        description: created > 0 ? `Added ${created} tasks.` : "No new tasks — already added.",
      });
    },
    onError: (error: unknown) => {
      const fallback =
        error instanceof ApiError && error.status === 404
          ? "Tasks are disabled on this server."
          : "Couldn't add tasks from this plan.";

      toast({
        title: "Failed to add tasks",
        description: formatError(error, fallback),
        variant: "destructive",
      });
    },
  });

  const simulateToolMutation = useMutation({
    mutationFn: (toolCall: ToolCall) => simulateToolCall(toolCall),
    onSuccess: (data) => {
      const operation =
        typeof (data as any)?.preview?.operation === "string"
          ? String((data as any).preview.operation)
          : data.tool;
      toast({
        title: "Preview ready",
        description: operation,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Preview failed",
        description: formatError(error, "Couldn't simulate this action."),
        variant: "destructive",
      });
    },
  });

  const executeToolMutation = useMutation({
    mutationFn: (toolCall: ToolCall) =>
      executeToolCall(toolCall, { confirm: true, idempotency_key: toolCall.id }),
    onSuccess: (data) => {
      toast({
        title: "Action applied",
        description: data.idempotent_replay ? "Already applied (idempotent replay)." : "Applied successfully.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Action failed",
        description: formatError(error, "Couldn't execute this action."),
        variant: "destructive",
      });
    },
  });

  const simulateRunMutation = useMutation({
    mutationFn: (runId: string) => simulateAutopilotRun({ run_id: runId }),
    onSuccess: async (_data, runId) => {
      await queryClient.invalidateQueries({ queryKey: ["v1/autopilot/runs", runId] });
      toast({ title: "Preview ready", description: "Autopilot simulations updated." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Preview failed",
        description: formatError(error, "Couldn't simulate this run."),
        variant: "destructive",
      });
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: (payload: { runId: string; approveAll?: boolean; toolCallIds?: string[] }) =>
      approveAutopilotRun({
        run_id: payload.runId,
        approve_all: payload.approveAll,
        tool_call_ids: payload.toolCallIds,
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["v1/autopilot/runs", data.run.id] });
      toast({ title: "Approved", description: "Autopilot approvals recorded." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Approval failed",
        description: formatError(error, "Couldn't approve this run."),
        variant: "destructive",
      });
    },
  });

  const executeRunMutation = useMutation({
    mutationFn: (runId: string) => executeAutopilotRun({ run_id: runId }),
    onSuccess: async (_data, runId) => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["v1/autopilot/runs", runId] }),
        queryClient.invalidateQueries({ queryKey: ["v1/workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/exports"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/finance/accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/finance/merchants"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/finance/recurring"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
      ]);
      toast({ title: "Autopilot complete", description: "Execution finished." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Execution failed",
        description: formatError(error, "Couldn't execute this run."),
        variant: "destructive",
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: (payload: { agentOutputId: string; rating: "up" | "down" }) =>
      submitAgentOutputFeedback(payload.agentOutputId, { rating: payload.rating }),
    onSuccess: (_data, variables) => {
      setFeedbackRating(variables.rating);
      toast({ title: "Thanks for the feedback!" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Feedback failed",
        description: formatError(error, "Couldn't submit feedback."),
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    const rounded = Math.round(Number(value));
    return formatMoney(rounded, { maximumFractionDigits: 0 });
  };

  const formatPercent = (value?: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${value.toFixed(1)}%`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddToTasks = () => {
    const plan = message.metadata?.plan;
    if (!plan) return;
    if (tasksEnabled === false) return;

    createTasksMutation.mutate({
      plan,
      source: {
        chatMessageId: message.id,
        agentOutputId: message.metadata?.agentOutputId,
        requestId: message.metadata?.requestId,
      },
    });
  };

  const handleFeedback = (rating: "up" | "down") => {
    const agentOutputId = message.metadata?.agentOutputId;
    if (!agentOutputId) return;
    feedbackMutation.mutate({ agentOutputId, rating });
  };

  const handleOpenAttachment = (fileId: string) => {
    window.open(buildApiUrl(`/media/${fileId}`), "_blank", "noopener,noreferrer");
  };

  const handlePreviewToolCall = (toolCall: ToolCall) => {
    simulateToolMutation.mutate(toolCall);
  };

  const handleExecuteToolCall = (toolCall: ToolCall) => {
    const ok = window.confirm(`Apply: ${toolCall.title}?`);
    if (!ok) return;
    executeToolMutation.mutate(toolCall);
  };

  // Custom markdown components for AI responses
  const markdownComponents = {
    h1: ({ children }: any) => (
      <h3 className="text-xl font-bold text-foreground mb-3 mt-4">{children}</h3>
    ),
    h2: ({ children }: any) => (
      <h3 className="text-lg font-semibold text-foreground mb-2 mt-3">{children}</h3>
    ),
    h3: ({ children }: any) => (
      <h4 className="text-base font-semibold text-foreground mb-2 mt-3">{children}</h4>
    ),
    p: ({ children }: any) => (
      <p className="text-sm text-foreground leading-relaxed mb-3">{children}</p>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside space-y-1 my-3 ml-4 text-foreground">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside space-y-1 my-3 ml-4 text-foreground">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-sm text-foreground leading-relaxed">{children}</li>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary/30 pl-4 py-2 my-3 text-muted-foreground italic">
        {children}
      </blockquote>
    ),
    code: ({ inline, children }: any) => {
      return inline ? (
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground">
          {children}
        </code>
      ) : (
        <code className="block bg-muted p-3 rounded text-xs font-mono text-foreground overflow-x-auto my-3">
          {children}
        </code>
      );
    },
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full divide-y divide-border">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => <thead className="bg-muted">{children}</thead>,
    th: ({ children }: any) => (
      <th className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{children}</td>
    ),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group flex gap-2 p-3 sm:gap-4 sm:p-4 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <Wand2 className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={`flex min-w-0 flex-col ${isUser ? "max-w-[85%] items-end" : "flex-1 items-start"}`}
      >
        {!isUser && message.metadata?.evidence?.length ? (
          <details className="mb-3 w-full rounded-lg border border-border bg-background/60">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              Sources ({message.metadata.evidence.length})
            </summary>
            <SourceEvidenceList items={message.metadata.evidence} returnTo={chatLocation} />
          </details>
        ) : null}
        <div
          className={`min-w-0 max-w-full break-words rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "w-full bg-accent/50 text-foreground rounded-bl-md"
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {responseParts.answer}
              </ReactMarkdown>
              {responseParts.plan ? (
                <details className="mt-3 rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                    View financial plan
                  </summary>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {responseParts.plan}
                  </ReactMarkdown>
                </details>
              ) : null}
            </div>
          )}
        </div>

        {!isUser && message.metadata?.generatedDocuments?.map(document => <ChatDocumentCard key={document.fileId} document={document} returnTo={chatLocation} onUseDocument={onUseDocument} disabled={isSending} />)}

        {message.metadata?.attachments?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.metadata.attachments.map((attachment) => (
              <button
                key={attachment.workspaceFileId}
                type="button"
                onClick={() => handleOpenAttachment(attachment.fileId)}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="max-w-[220px] truncate">{attachment.originalName}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!isUser && message.metadata?.plan?.key_metrics && Object.values(message.metadata.plan.key_metrics).some(value => typeof value === "number" && Number.isFinite(value)) && (
          <div className="mt-2 w-full grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-md border border-border bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Net cash flow</p>
              <p className="text-sm font-semibold">
                {formatCurrency(message.metadata.plan.key_metrics.monthly_net_cash_flow)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Savings rate</p>
              <p className="text-sm font-semibold">
                {formatPercent(message.metadata.plan.key_metrics.savings_rate)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Debt-to-income</p>
              <p className="text-sm font-semibold">
                {formatPercent(message.metadata.plan.key_metrics.debt_to_income)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Emergency fund</p>
              <p className="text-sm font-semibold">
                {message.metadata.plan.key_metrics.emergency_fund_months === null ||
                message.metadata.plan.key_metrics.emergency_fund_months === undefined
                  ? "—"
                  : `${message.metadata.plan.key_metrics.emergency_fund_months.toFixed(1)} mo`}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Total debt</p>
              <p className="text-sm font-semibold">
                {formatCurrency(message.metadata.plan.key_metrics.total_debt)}
              </p>
            </div>
          </div>
        )}

        {!isUser && message.metadata?.plan?.data_warnings?.length ? (
          <div className="mt-2 w-full rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Data warnings</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
              {message.metadata.plan.data_warnings.slice(0, 5).map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isUser && (message.metadata?.confidence || message.metadata?.evidence?.length || message.metadata?.suggestedActions?.length) ? (
          <div className="mt-2 w-full space-y-2">
            {message.metadata?.confidence ? (
              <div className="rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-semibold text-foreground">Context coverage</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {message.metadata.confidence.label || "unknown"} coverage
                  {typeof message.metadata.confidence.score === "number"
                    ? ` • score ${message.metadata.confidence.score.toFixed(2)}`
                    : ""}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Based on the records and document passages available for this answer.</p>
                {message.metadata.confidence.notes?.length ? (
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-muted-foreground">
                    {message.metadata.confidence.notes.slice(0, 3).map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {message.metadata?.suggestedActions?.length ? (
              <div className="rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-semibold text-foreground">Suggested next actions</div>
                <div className="mt-2 space-y-2">
                  {message.metadata.suggestedActions.slice(0, 3).map((item, idx) => (
                    <div key={`${item.title}-${idx}`} className="rounded-md border border-border/70 bg-background p-2">
                      <div className="text-sm font-medium text-foreground">{item.title || "Action"}</div>
                      {item.why ? <div className="mt-1 text-xs text-muted-foreground">{item.why}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isUser &&
        ((autopilotRunId && (autopilotRunQuery.isLoading || Boolean(autopilotRunQuery.data))) ||
          (message.metadata?.toolCalls && message.metadata.toolCalls.length > 0)) ? (
          <div className="mt-2 w-full rounded-md border border-border bg-background/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Autopilot actions</p>
              {autopilotRunId ? (
                <span className="text-[11px] text-muted-foreground">
                  Run status: {autopilotRun?.status || (autopilotRunQuery.isLoading ? "loading" : "unknown")}
                </span>
              ) : null}
            </div>

            {autopilotRunId && autopilotRunQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : autopilotRun ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    {missingApprovalIds.length > 0 ? `Approval required: ${missingApprovalIds.length}` : "No approvals required"}
                    {autopilotRun.error ? ` · ${autopilotRun.error}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => simulateRunMutation.mutate(autopilotRun.id)}
                      disabled={simulateRunMutation.isPending || executeRunMutation.isPending}
                    >
                      {simulateRunMutation.isPending ? "Simulating..." : "Simulate"}
                    </Button>
                    {missingApprovalIds.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => approveRunMutation.mutate({ runId: autopilotRun.id, approveAll: true })}
                        disabled={approveRunMutation.isPending || executeRunMutation.isPending}
                      >
                        {approveRunMutation.isPending ? "Approving..." : `Approve (${missingApprovalIds.length})`}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={() => {
                        const ok = window.confirm("Execute this autopilot run?");
                        if (!ok) return;
                        executeRunMutation.mutate(autopilotRun.id);
                      }}
                      disabled={executeRunMutation.isPending || missingApprovalIds.length > 0 || autopilotRun.status === "executing"}
                    >
                      {executeRunMutation.isPending ? "Executing..." : "Execute"}
                    </Button>
                  </div>
                </div>

                {Array.isArray(autopilotRun.simulations) && autopilotRun.simulations.length > 0 ? (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs font-semibold text-foreground">Previews</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {autopilotRun.simulations.filter((s: any) => Boolean(s?.ok)).length}/{autopilotRun.simulations.length} succeeded
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-background p-3 text-[11px] text-muted-foreground">
                    No previews yet. Click Simulate to generate safe diffs.
                  </div>
                )}

                <div className="space-y-2">
                  {(autopilotToolCalls || []).slice(0, 8).map((toolCall) => {
                    const approved = toolCall.requires_confirmation ? Boolean(autopilotApprovals?.[toolCall.id]?.approved) : true;
                    return (
                      <div
                        key={toolCall.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{toolCall.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{toolCall.description}</p>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Tool: {toolCall.tool} · Risk: {toolCall.risk}
                            {toolCall.requires_confirmation ? " · Confirm" : ""}
                            {approved ? " · Approved" : " · Pending approval"}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {toolCall.requires_confirmation && !approved ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveRunMutation.mutate({ runId: autopilotRun.id, toolCallIds: [toolCall.id] })}
                              disabled={approveRunMutation.isPending || executeRunMutation.isPending}
                            >
                              Approve
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {(message.metadata?.toolCalls || []).slice(0, 5).map((toolCall: ToolCall) => (
                  <div
                    key={toolCall.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{toolCall.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{toolCall.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Tool: {toolCall.tool} · Risk: {toolCall.risk}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreviewToolCall(toolCall)}
                        disabled={simulateToolMutation.isPending}
                      >
                        Preview
                      </Button>
                      <Button size="sm" onClick={() => handleExecuteToolCall(toolCall)} disabled={executeToolMutation.isPending}>
                        Apply
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {!isUser &&
          ((message.metadata?.workflowTrace && message.metadata.workflowTrace.length > 0) ||
            (message.metadata?.agentsInvolved && message.metadata.agentsInvolved.length > 0)) && (
          <div className="mt-2 w-full">
            <AgentWorkflowVisualizer
              workflowTrace={message.metadata?.workflowTrace || []}
              agentsInvolved={message.metadata?.agentsInvolved || []}
              fallbackUsed={message.metadata?.fallbackUsed || false}
              llmCallCount={message.metadata?.llmCallCount || 0}
            />
          </div>
          )}

        {!isUser &&
        (message.metadata?.activeProvider ||
          message.metadata?.activeModel ||
          message.metadata?.fallbackPath?.length ||
          message.metadata?.recoveredFailures?.length ||
          message.metadata?.sessionId) ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {message.metadata?.sessionId ? (
              <span className="rounded-full border border-border/70 bg-background/60 px-2 py-1 text-muted-foreground">
                session {message.metadata.sessionStatus || "active"}
              </span>
            ) : null}
            {message.metadata?.activeProvider ? (
              <span className="rounded-full border border-border/70 bg-background/60 px-2 py-1 text-muted-foreground">
                provider {message.metadata.activeProvider}
              </span>
            ) : null}
            {message.metadata?.activeModel ? (
              <span className="max-w-[280px] truncate rounded-full border border-border/70 bg-background/60 px-2 py-1 text-muted-foreground">
                model {message.metadata.activeModel}
              </span>
            ) : null}
            {message.metadata?.recoveredFailures?.length ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
                recovered {message.metadata.recoveredFailures.length}
              </span>
            ) : null}
            {message.metadata?.fallbackPath?.length ? (
              <span className="rounded-full border border-border/70 bg-background/60 px-2 py-1 text-muted-foreground">
                route {message.metadata.fallbackPath.length}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-1 flex max-w-full flex-wrap items-center gap-2 px-2">
          <span className="text-xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
          
          {!isUser && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              aria-label={copied ? "Response copied" : "Copy response"}
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:opacity-100"
            >
              {copied ? (
                <CheckCircle className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          )}

          {!isUser && message.metadata?.plan && Object.values(message.metadata.plan.actions || {}).some(bucket => Array.isArray(bucket) && bucket.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddToTasks}
              disabled={createTasksMutation.isPending || tasksEnabled === false}
              className="h-6 px-2 text-xs"
              title={tasksEnabled === false ? "Tasks are disabled on this server." : "Convert this plan into trackable tasks"}
            >
              <ListTodo className="w-3 h-3" />
              <span>{tasksAdded ? "Added" : "Tasks"}</span>
            </Button>
          )}

          {!isUser && message.metadata?.agentOutputId && (
            <div className="flex items-center gap-1">
              <Button
                variant={feedbackRating === "up" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleFeedback("up")}
                disabled={feedbackMutation.isPending}
                className="h-6 w-6 p-0"
                title="Thumbs up"
              >
                <ThumbsUp className="w-3 h-3" />
              </Button>
              <Button
                variant={feedbackRating === "down" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleFeedback("down")}
                disabled={feedbackMutation.isPending}
                className="h-6 w-6 p-0"
                title="Thumbs down"
              >
                <ThumbsDown className="w-3 h-3" />
              </Button>
            </div>
          )}
          
          {!isUser && message.metadata?.agentsInvolved && message.metadata.agentsInvolved.length > 0 && (
            <span className="break-all text-xs text-muted-foreground">
              via {message.metadata.agentsInvolved.join(", ")}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarFallback className="bg-muted">
            {user?.name?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}
