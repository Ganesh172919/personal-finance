/**
 * @fileoverview Task management page for AI-generated action items.
 *
 * Displays tasks produced by AI agent plans, filterable by status
 * (open, in-progress, done) and free-text search. Selecting a task
 * opens a detail sheet with description, rationale (why), and status
 * mutation controls. An "Apply" dialog lets users accept a task's
 * recommended action into their financial plan.
 *
 * Key data flows:
 * - getTasks({ status, limit }) loads the task list; query key includes
 *   the active status filter for independent caching.
 * - getTaskById(id) fetches full detail for the selected task sheet.
 * - updateTaskStatus(id, status) mutates task lifecycle state.
 *
 * Tasks are sorted by due date ascending; overdue items surface first with
 * visual urgency indicators and priority badges.
 *
 * Accessible from the sidebar under "Tasks" for authenticated users.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  MessageSquare,
  Calendar,
  Download,
  CheckSquare,
  Square,
  RefreshCw,
  Share2,
  Copy,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/hooks/useToast";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  ApiError,
  apiClient,
  createTask,
  dispatchTasksWebhook,
  getTaskById,
  getTasks,
  getTaskWebhookToken,
  type DispatchTasksWebhookResult,
  type Task,
  type TaskRecurrenceCadence,
  type TaskStatus,
  updateTaskStatus,
} from "@/lib/apiClient";
import { TaskApplyDialog } from "@/components/TaskApplyDialog";

const EMPTY_TASKS: Task[] = [];

const TASK_PRESETS = [
  {
    title: "Schedule recurring transfer to emergency fund",
    why: "Builds a 3-month living expense buffer to cushion against sudden cash flow drops.",
    priority: "high" as const,
    bucket: 7 as const,
    steps: "1. Calculate target monthly transfer ($250)\n2. Set up standing instruction in checking account\n3. Mark as verified in FinWise",
    cadence: "monthly" as TaskRecurrenceCadence,
  },
  {
    title: "Pay down highest-interest credit card balance",
    why: "Avalanche strategy saves the most in total accrued interest over time.",
    priority: "high" as const,
    bucket: 30 as const,
    steps: "1. Identify card with highest APR\n2. Allocate surplus monthly savings\n3. Record payment in Debts & Goals",
    cadence: "none" as TaskRecurrenceCadence,
  },
  {
    title: "Audit and cancel unused recurring subscriptions",
    why: "Recurring charges drain cash flow without providing ongoing utility.",
    priority: "medium" as const,
    bucket: 7 as const,
    steps: "1. Review Recurring tab in Finance OS\n2. Cancel inactive services\n3. Verify next statement excludes charges",
    cadence: "monthly" as TaskRecurrenceCadence,
  },
  {
    title: "Rebalance portfolio toward target asset allocation",
    why: "Keeps equity and fixed income exposure aligned with current risk profile.",
    priority: "medium" as const,
    bucket: 30 as const,
    steps: "1. Inspect Portfolio asset distribution\n2. Direct new monthly contributions to underweight asset classes\n3. Re-verify allocation percentages",
    cadence: "quarterly" as TaskRecurrenceCadence,
  },
];

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

const formatDate = (value?: string | Date) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
};

const isTaskOverdue = (dueDate?: string | Date, status?: TaskStatus) => {
  if (!dueDate || status !== "open") return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

export const formatForLinear = (tasksToExport: Task[]): string => {
  const headers = ["Title", "Description", "Priority", "Estimate", "Status"];
  const rows = tasksToExport.map((t) => {
    const title = `"${(t.title || "").replace(/"/g, '""')}"`;
    const descContent = [
      t.why || "",
      Array.isArray(t.steps) && t.steps.length ? `Steps: ${t.steps.join(" | ")}` : "",
      t.expected_impact ? `Impact: ${t.expected_impact}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const desc = `"${descContent.replace(/"/g, '""')}"`;
    const priority = t.priority === "high" ? "2" : t.priority === "medium" ? "3" : "4";
    const estimate = t.bucket === 7 ? "1" : t.bucket === 30 ? "2" : "3";
    const status = t.status === "completed" ? "Done" : "Backlog";
    return [title, desc, priority, estimate, status].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
};

export const formatForTodoist = (tasksToExport: Task[]): string => {
  const headers = ["CONTENT", "DESCRIPTION", "PRIORITY", "DATE"];
  const rows = tasksToExport.map((t) => {
    const content = `"${(t.title || "").replace(/"/g, '""')}"`;
    const descContent = `${t.why || ""}${t.expected_impact ? ` | ${t.expected_impact}` : ""}`;
    const desc = `"${descContent.replace(/"/g, '""')}"`;
    const priority = t.priority === "high" ? "4" : t.priority === "medium" ? "3" : "1";
    const date = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "";
    return [content, desc, priority, date].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
};

export const formatForJira = (tasksToExport: Task[]): string => {
  const headers = ["Summary", "Description", "Priority", "Due Date", "Issue Type"];
  const rows = tasksToExport.map((t) => {
    const summary = `"${(t.title || "").replace(/"/g, '""')}"`;
    const descContent = [
      t.why || "",
      Array.isArray(t.steps) && t.steps.length ? `Steps:\n${t.steps.map((s) => `- ${s}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const desc = `"${descContent.replace(/"/g, '""')}"`;
    const priority = t.priority === "high" ? "High" : t.priority === "low" ? "Low" : "Medium";
    const dueDate = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "";
    return [summary, desc, priority, dueDate, "Task"].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
};

export default function TasksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const configQuery = useAppConfig();
  const tasksEnabled = configQuery.data?.features.tasks_enabled;

  const [status, setStatus] = useState<TaskStatus>("open");
  const [search, setSearch] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [applyTask, setApplyTask] = useState<Task | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["/api/tasks", status],
    queryFn: () => getTasks({ status, limit: 100 }),
    enabled: tasksEnabled === true,
  });

  const tasks = ((tasksQuery.data?.tasks as Task[] | undefined) ?? EMPTY_TASKS) as Task[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tasks.slice().sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
    if (!q) return base;
    return base.filter((t) => `${t.title} ${t.why}`.toLowerCase().includes(q));
  }, [tasks, search]);

  // Overall metric counters
  const overdueCount = useMemo(() => {
    return tasks.filter((t) => isTaskOverdue(t.dueDate, t.status)).length;
  }, [tasks]);

  const highPriorityCount = useMemo(() => {
    return tasks.filter((t) => t.priority === "high" && t.status === "open").length;
  }, [tasks]);

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: TaskStatus }) => updateTaskStatus(payload.id, payload.status),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/command-center"] });
      const nextTask = data?.next_task;
      if (variables.status === "completed" && nextTask) {
        toast({
          title: "Recurring Task Renewed 🔄",
          description: `Completed! Next scheduled task created for ${formatDate(nextTask.dueDate)}.`,
        });
      } else {
        toast({
          title: variables.status === "completed" ? "Task Completed" : variables.status === "dismissed" ? "Task Dismissed" : "Task Reopened",
          description: "Task status updated successfully.",
        });
      }
    },
    onError: (error) => {
      toast({ title: "Update failed", description: formatError(error, "Failed to update task."), variant: "destructive" });
    },
  });

  const detailQuery = useQuery({
    queryKey: ["/api/tasks", selectedTask?._id, "detail"],
    queryFn: () => getTaskById(String(selectedTask?._id)),
    enabled: Boolean(selectedTask?._id) && tasksEnabled === true,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState<{
    title: string;
    why: string;
    priority: "low" | "medium" | "high";
    bucket: 7 | 30 | 365;
    steps: string;
    cadence: TaskRecurrenceCadence;
  }>({
    title: "",
    why: "",
    priority: "medium",
    bucket: 30,
    steps: "",
    cadence: "none",
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[0]) => createTask(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task Created", description: "New action task created." });
      setIsCreateOpen(false);
      setNewTask({ title: "", why: "", priority: "medium", bucket: 30, steps: "", cadence: "none" });
    },
    onError: (error) => {
      toast({ title: "Failed to create task", description: formatError(error, "Failed to create task."), variant: "destructive" });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      toast({ title: "Validation Error", description: "Task title is required.", variant: "destructive" });
      return;
    }
    if (!newTask.why.trim()) {
      toast({ title: "Validation Error", description: "Please explain why this task is needed.", variant: "destructive" });
      return;
    }
    const stepsArray = newTask.steps
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    createTaskMutation.mutate({
      title: newTask.title.trim(),
      why: newTask.why.trim(),
      steps: stepsArray,
      priority: newTask.priority,
      bucket: newTask.bucket,
      due_days: newTask.bucket,
      expected_impact: newTask.why.trim(),
      recurrence: newTask.cadence && newTask.cadence !== "none" ? { cadence: newTask.cadence } : undefined,
    });
  };

  const handleApplyPreset = (preset: (typeof TASK_PRESETS)[number]) => {
    setNewTask({
      title: preset.title,
      why: preset.why,
      priority: preset.priority,
      bucket: preset.bucket,
      steps: preset.steps,
      cadence: preset.cadence || "none",
    });
  };

  // External Sync & Webhook State
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [activeSyncTab, setActiveSyncTab] = useState<"trackers" | "outbound" | "inbound">("trackers");
  const [activeTracker, setActiveTracker] = useState<"linear" | "todoist" | "jira">("linear");
  const [webhookTarget, setWebhookTarget] = useState<"linear" | "todoist" | "jira" | "slack" | "generic">("linear");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [customAuthHeader, setCustomAuthHeader] = useState("");
  const [dispatchResult, setDispatchResult] = useState<DispatchTasksWebhookResult | null>(null);

  const webhookTokenQuery = useQuery({
    queryKey: ["/api/tasks/webhook-token"],
    queryFn: getTaskWebhookToken,
    enabled: isSyncOpen && tasksEnabled === true,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inboundWebhookFullUrl = webhookTokenQuery.data?.webhook_token
    ? `${origin}/api/tasks/webhook/${webhookTokenQuery.data.webhook_token}`
    : "/api/tasks/webhook/…";

  const tasksForSync = useMemo(() => {
    if (selectedTaskIds.length > 0) {
      return tasks.filter((t) => selectedTaskIds.includes(t._id));
    }
    return filtered.length > 0 ? filtered : tasks;
  }, [selectedTaskIds, tasks, filtered]);

  const formattedTrackerText = useMemo(() => {
    if (activeTracker === "linear") return formatForLinear(tasksForSync);
    if (activeTracker === "todoist") return formatForTodoist(tasksForSync);
    return formatForJira(tasksForSync);
  }, [activeTracker, tasksForSync]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      toast({ title: "Copied to Clipboard", description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: "Copy Failed", description: "Could not write to clipboard.", variant: "destructive" });
    }
  };

  const downloadCsv = (content: string, filename: string) => {
    try {
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "CSV Downloaded", description: `Saved ${filename}` });
    } catch {
      toast({ title: "Download Failed", description: "Failed to download CSV.", variant: "destructive" });
    }
  };

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const task_ids = tasksForSync.map((t) => t._id);
      const headers = customAuthHeader.trim() ? { Authorization: customAuthHeader.trim() } : undefined;
      return dispatchTasksWebhook({
        target: webhookTarget,
        webhook_url: webhookUrl.trim(),
        task_ids,
        headers,
      });
    },
    onSuccess: (data) => {
      setDispatchResult(data);
      toast({
        title: "Tasks Dispatched",
        description: `Dispatched ${data.dispatched_count} tasks to ${data.target} webhook (${data.delivery_status}).`,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Dispatch Failed",
        description: formatError(err, "Failed to dispatch tasks to webhook."),
        variant: "destructive",
      });
    },
  });

  const testInboundMutation = useMutation({
    mutationFn: async () => {
      const token = webhookTokenQuery.data?.webhook_token;
      if (!token) throw new Error("No webhook token found");
      const res = await fetch(`/api/tasks/webhook/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: "Verify Third-Party Integration Connection",
          why: "Automated test verification item triggered from Inbound Webhook API tab.",
          steps: ["Test connection established", "Task received in FinWise"],
          priority: "medium",
          bucket: 7,
        }),
      });
      if (!res.ok) {
        throw new Error(`Inbound webhook returned HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Test Task Triggered",
        description: "Inbound webhook created a new action task successfully.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Test Inbound Webhook Failed",
        description: err instanceof Error ? err.message : "Failed to send test webhook",
        variant: "destructive",
      });
    },
  });

  const syncTaskToCalendar = async (task: Task) => {
    try {
      const dueDate = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      await apiClient("/calendar-reminders", {
        method: "POST",
        body: JSON.stringify({
          title: `Action: ${task.title}`,
          date: dueDate,
          amount: 0,
          category: "Task",
          notes: task.why || (Array.isArray(task.steps) ? task.steps.join(", ") : ""),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      toast({
        title: "Calendar Reminder Scheduled",
        description: `Scheduled "${task.title}" for ${dueDate} on your Financial Calendar.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sync task to calendar.";
      toast({ title: "Calendar Sync Failed", description: msg, variant: "destructive" });
    }
  };

  const exportTasksToIcs = (tasksToExport: Task[]) => {
    if (tasksToExport.length === 0) {
      toast({ title: "No Tasks to Export", description: "Select at least one task to export.", variant: "destructive" });
      return;
    }

    const nowIso = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FinWise//Financial Action Tasks//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:FinWise Action Tasks",
      "X-WR-TIMEZONE:UTC",
    ];

    for (const t of tasksToExport) {
      const d = t.dueDate ? new Date(t.dueDate) : new Date();
      const dClean = d.toISOString().slice(0, 10).replace(/-/g, "");
      const stepsStr = Array.isArray(t.steps) && t.steps.length ? ` Steps: ${t.steps.join(" | ")}` : "";
      const desc = `${t.why || ""}${stepsStr}`.replace(/[\r\n]/g, " ").trim();

      lines.push(
        "BEGIN:VEVENT",
        `UID:finwise-task-${t._id}@finwise.dev`,
        `DTSTAMP:${nowIso}`,
        `DTSTART;VALUE=DATE:${dClean}`,
        `SUMMARY:FinWise: ${t.title.replace(/[\r\n]/g, " ")}`,
        `DESCRIPTION:${desc || t.title.replace(/[\r\n]/g, " ")}`,
        `STATUS:${t.status === "completed" ? "COMPLETED" : "CONFIRMED"}`,
        `PRIORITY:${t.priority === "high" ? "1" : t.priority === "medium" ? "5" : "9"}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT9H",
        "ACTION:DISPLAY",
        `DESCRIPTION:FinWise Task Due: ${t.title.replace(/[\r\n]/g, " ")}`,
        "END:VALARM",
        "END:VEVENT"
      );
    }

    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finwise-tasks-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Calendar File Exported",
      description: `Exported ${tasksToExport.length} action task${tasksToExport.length > 1 ? "s" : ""} to .ics for Google and Apple Calendar.`,
    });
  };

  const handleBatchComplete = async () => {
    if (selectedTaskIds.length === 0) return;
    try {
      await Promise.all(selectedTaskIds.map(id => updateTaskStatus(id, "completed")));
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Batch Complete",
        description: `Marked ${selectedTaskIds.length} tasks as completed.`,
      });
      setSelectedTaskIds([]);
    } catch (err: unknown) {
      toast({ title: "Batch Action Failed", description: formatError(err, "Failed to complete tasks."), variant: "destructive" });
    }
  };

  const handleBatchDismiss = async () => {
    if (selectedTaskIds.length === 0) return;
    try {
      await Promise.all(selectedTaskIds.map(id => updateTaskStatus(id, "dismissed")));
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Batch Dismiss",
        description: `Dismissed ${selectedTaskIds.length} tasks.`,
      });
      setSelectedTaskIds([]);
    } catch (err: unknown) {
      toast({ title: "Batch Action Failed", description: formatError(err, "Failed to dismiss tasks."), variant: "destructive" });
    }
  };

  const handleBatchSyncCalendar = async () => {
    const selected = tasks.filter(t => selectedTaskIds.includes(t._id));
    if (selected.length === 0) return;
    try {
      await Promise.all(
        selected.map(t => {
          const dueDate = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
          return apiClient("/calendar-reminders", {
            method: "POST",
            body: JSON.stringify({
              title: `Action: ${t.title}`,
              date: dueDate,
              amount: 0,
              category: "Task",
              notes: t.why || (Array.isArray(t.steps) ? t.steps.join(", ") : ""),
            }),
          });
        })
      );
      await queryClient.invalidateQueries({ queryKey: ["calendar-reminders"] });
      toast({
        title: "Batch Calendar Sync",
        description: `Synced ${selected.length} tasks as reminders on your Financial Calendar.`,
      });
      setSelectedTaskIds([]);
    } catch (err: unknown) {
      toast({ title: "Sync Failed", description: formatError(err, "Failed to sync tasks to calendar."), variant: "destructive" });
    }
  };

  if (tasksEnabled === false) {
    return (
      <div className="flex-1 p-6 overflow-auto" data-testid="tasks-page">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
          <Card className="p-6">
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-2">Tasks are disabled on this server.</p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto" data-testid="tasks-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-6">
        {/* Header and Summary Metrics */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground">Turn AI plans into trackable financial outcomes.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs px-2.5 py-1 font-normal" data-testid="badge-total-tasks">
              {tasks.length} {status}
            </Badge>
            {overdueCount > 0 && status === "open" && (
              <Badge variant="destructive" className="text-xs px-2.5 py-1 flex items-center gap-1" data-testid="badge-overdue-count">
                <AlertTriangle className="w-3 h-3" />
                {overdueCount} overdue
              </Badge>
            )}
            {highPriorityCount > 0 && status === "open" && (
              <Badge variant="secondary" className="text-xs px-2.5 py-1 font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                {highPriorityCount} high priority
              </Badge>
            )}
          </div>
        </div>

        {/* Search and Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or rationale…"
              aria-label="Search tasks"
              className="pl-9"
              data-testid="input-search-tasks"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0 flex items-center gap-1.5"
              onClick={() => setIsSyncOpen(true)}
              data-testid="btn-sync-integrations"
            >
              <Share2 className="w-4 h-4 text-primary" />
              Sync & Webhooks
            </Button>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-10 shrink-0 w-full sm:w-auto" data-testid="button-add-task">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Task
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Action Task</DialogTitle>
                <DialogDescription>
                  Create a financial action task with steps and target timeframe.
                </DialogDescription>
              </DialogHeader>

              {/* Quick Presets */}
              <div className="pt-2">
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary" /> Quick Presets:
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {TASK_PRESETS.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border/70 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-left"
                      data-testid={`preset-${p.title.slice(0, 15).toLowerCase().replace(/\s/g, "-")}`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="task-title">Title</Label>
                  <Input
                    id="task-title"
                    placeholder="e.g. Schedule recurring transfer to emergency fund"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    required
                    data-testid="input-task-title"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-why">Rationale (Why)</Label>
                  <Input
                    id="task-why"
                    placeholder="e.g. Ensures $250/mo contribution is never missed"
                    value={newTask.why}
                    onChange={(e) => setNewTask({ ...newTask, why: e.target.value })}
                    required
                    data-testid="input-task-why"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-priority">Priority</Label>
                    <Select
                      value={newTask.priority}
                      onValueChange={(val: any) => setNewTask({ ...newTask, priority: val })}
                    >
                      <SelectTrigger id="task-priority" data-testid="select-task-priority">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="task-bucket">Timeframe</Label>
                    <Select
                      value={String(newTask.bucket)}
                      onValueChange={(val) => setNewTask({ ...newTask, bucket: Number(val) as any })}
                    >
                      <SelectTrigger id="task-bucket" data-testid="select-task-bucket">
                        <SelectValue placeholder="Timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Next 7 Days</SelectItem>
                        <SelectItem value="30">Next 30 Days</SelectItem>
                        <SelectItem value="365">Next 12 Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="task-cadence">Recurrence</Label>
                    <Select
                      value={newTask.cadence}
                      onValueChange={(val: any) => setNewTask({ ...newTask, cadence: val })}
                    >
                      <SelectTrigger id="task-cadence" data-testid="select-task-cadence">
                        <SelectValue placeholder="Recurrence" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">One-time</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-steps">Action Steps (one per line)</Label>
                  <textarea
                    id="task-steps"
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Step 1: Calculate target&#10;Step 2: Set instruction in bank&#10;Step 3: Confirm in FinWise"
                    value={newTask.steps}
                    onChange={(e) => setNewTask({ ...newTask, steps: e.target.value })}
                    data-testid="textarea-task-steps"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTaskMutation.isPending} data-testid="button-submit-create-task">
                    {createTaskMutation.isPending ? "Creating…" : "Create Task"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        </div>

        {/* Task Tabs */}
        <Tabs value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          </TabsList>

          <TabsContent value={status}>
            <Card className="p-4">
              {configQuery.isLoading ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
              ) : tasksQuery.isLoading ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Loading tasks…</div>
              ) : tasksQuery.error ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  {formatError(tasksQuery.error, "Failed to load tasks.")}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-tasks-container">
                  <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
                    {status === "open" ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    ) : (
                      <Clock className="w-6 h-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    {status === "open"
                      ? "All Caught Up!"
                      : status === "completed"
                      ? "No Completed Tasks Yet"
                      : "No Dismissed Tasks"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-4">
                    {status === "open"
                      ? "You have no pending tasks. Add an action task or ask the AI Financial Copilot in chat to generate an optimization plan."
                      : status === "completed"
                      ? "Tasks marked as completed will appear here for historical tracking."
                      : "Tasks you dismiss will be cataloged here."}
                  </p>
                  {status === "open" && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => setIsCreateOpen(true)} variant="outline">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add Task
                      </Button>
                      <Link href="/chat">
                        <Button size="sm" variant="default" className="gap-1.5">
                          <MessageSquare className="w-4 h-4" />
                          Ask Copilot
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {status === "open" && filtered.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60 bg-muted/30 text-xs">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2 flex items-center gap-1.5"
                          onClick={() => {
                            if (selectedTaskIds.length === filtered.length) {
                              setSelectedTaskIds([]);
                            } else {
                              setSelectedTaskIds(filtered.map(t => t._id));
                            }
                          }}
                          data-testid="button-select-all-tasks"
                        >
                          {selectedTaskIds.length === filtered.length && filtered.length > 0 ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          {selectedTaskIds.length === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
                        </Button>
                        <span className="text-muted-foreground">
                          {selectedTaskIds.length} of {filtered.length} selected
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {selectedTaskIds.length > 0 ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                              onClick={handleBatchComplete}
                              data-testid="batch-complete-tasks-btn"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Complete ({selectedTaskIds.length})
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs hover:bg-destructive/10 hover:text-destructive"
                              onClick={handleBatchDismiss}
                              data-testid="batch-dismiss-tasks-btn"
                            >
                              Dismiss
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs flex items-center gap-1 text-primary border-primary/30 hover:bg-primary/10"
                              onClick={handleBatchSyncCalendar}
                              data-testid="batch-sync-calendar-btn"
                            >
                              <Calendar className="w-3 h-3" />
                              Sync Calendar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs flex items-center gap-1"
                              onClick={() => exportTasksToIcs(tasks.filter(t => selectedTaskIds.includes(t._id)))}
                              data-testid="batch-export-ics-btn"
                            >
                              <Download className="w-3 h-3" />
                              Export .ics
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs flex items-center gap-1 text-primary border-primary/30 hover:bg-primary/10"
                              onClick={() => {
                                setIsSyncOpen(true);
                                setActiveSyncTab("trackers");
                              }}
                              data-testid="btn-batch-export-trackers"
                            >
                              <Share2 className="w-3 h-3" />
                              Sync & Webhooks ({selectedTaskIds.length})
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs flex items-center gap-1 text-primary hover:text-primary"
                              onClick={() => {
                                setIsSyncOpen(true);
                                setActiveSyncTab("trackers");
                              }}
                              data-testid="btn-sync-all-trackers"
                            >
                              <Share2 className="w-3 h-3" />
                              Sync & Webhooks
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() => exportTasksToIcs(filtered)}
                              data-testid="export-all-tasks-ics-btn"
                            >
                              <Download className="w-3 h-3" />
                              Export All .ics
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {filtered.map((task) => {
                    const overdue = isTaskOverdue(task.dueDate, task.status);

                    return (
                      <div
                        key={task._id}
                        className={`rounded-lg border p-4 flex flex-col sm:flex-row items-start justify-between gap-4 transition-all duration-200 hover:shadow-sm ${
                          overdue
                            ? "border-destructive/40 bg-destructive/5"
                            : "border-border hover:border-border/80 bg-card"
                        }`}
                        data-testid={`task-item-${task._id}`}
                      >
                        <div className="flex items-start gap-3 w-full sm:w-auto flex-1 min-w-0">
                          {status === "open" && (
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.includes(task._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTaskIds(prev => [...prev, task._id]);
                                } else {
                                  setSelectedTaskIds(prev => prev.filter(id => id !== task._id));
                                }
                              }}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary shrink-0 cursor-pointer"
                              data-testid={`checkbox-task-${task._id}`}
                              aria-label={`Select task: ${task.title}`}
                            />
                          )}

                          <button
                            type="button"
                            className="min-w-0 text-left flex-1"
                            aria-label={`View task: ${task.title}`}
                            onClick={() => setSelectedTask(task)}
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="font-semibold text-foreground text-base break-words">
                                {task.title}
                              </span>
                              {/* Priority Badge */}
                              {task.priority === "high" ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] uppercase font-semibold px-2 py-0.5"
                                  data-testid={`badge-priority-${task._id}`}
                                >
                                  High Priority
                                </Badge>
                              ) : task.priority === "medium" ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] uppercase font-semibold px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                  data-testid={`badge-priority-${task._id}`}
                                >
                                  Medium
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase font-semibold px-2 py-0.5 text-muted-foreground"
                                  data-testid={`badge-priority-${task._id}`}
                                >
                                  Low
                                </Badge>
                              )}

                              {/* Overdue Badge */}
                              {overdue && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1 shadow-sm"
                                  data-testid={`badge-overdue-${task._id}`}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Overdue
                                </Badge>
                              )}

                              {/* Recurrence Badge */}
                              {task.recurrence?.cadence && task.recurrence.cadence !== "none" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1 text-primary border-primary/30 bg-primary/10"
                                  data-testid={`badge-recurrence-${task._id}`}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  {task.recurrence.cadence.charAt(0).toUpperCase() + task.recurrence.cadence.slice(1)}
                                  {task.recurrence.generation && task.recurrence.generation > 1
                                    ? ` (Cycle ${task.recurrence.generation})`
                                    : ""}
                                </Badge>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
                              {task.why}
                            </div>

                            <div className="text-xs text-muted-foreground/80 flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> Due: {formatDate(task.dueDate)}
                              </span>
                              {task.bucket && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" /> Horizon: {task.bucket}d
                                </span>
                              )}
                            </div>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              syncTaskToCalendar(task);
                            }}
                            data-testid={`sync-calendar-task-${task._id}`}
                            className="h-8 text-xs text-muted-foreground hover:text-primary"
                            title="Sync to Financial Calendar"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              exportTasksToIcs([task]);
                            }}
                            data-testid={`export-ics-task-${task._id}`}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            title="Export .ics Calendar Event"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>

                          {status !== "completed" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: task._id, status: "completed" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-complete-task-${task._id}`}
                              className="h-8 text-xs font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                              Complete
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: task._id, status: "open" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-reopen-task-${task._id}`}
                              className="h-8 text-xs font-medium"
                            >
                              Reopen
                            </Button>
                          )}

                          {status !== "dismissed" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatusMutation.mutate({ id: task._id, status: "dismissed" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-dismiss-task-${task._id}`}
                              className="h-8 text-xs text-muted-foreground hover:text-destructive"
                            >
                              Dismiss
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: task._id, status: "open" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-undismiss-task-${task._id}`}
                              className="h-8 text-xs"
                            >
                              Undismiss
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setApplyTask(task)}
                            data-testid={`button-apply-task-${task._id}`}
                            className="h-8 text-xs"
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Detail Sheet */}
      <Sheet open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <SheetContent side="right" className="sm:max-w-lg w-full" data-testid="task-detail-sheet">
          <SheetHeader>
            <SheetTitle>{selectedTask?.title || "Task"}</SheetTitle>
            <SheetDescription>{selectedTask?.why}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {selectedTask?.steps?.length ? (
              <div>
                <div className="text-sm font-semibold text-foreground mb-2">Action Steps</div>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {selectedTask.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-lg border border-border p-3 text-sm space-y-1.5 bg-muted/20">
              <div className="text-muted-foreground flex justify-between">
                <span>Due Date:</span>
                <span className="font-medium text-foreground">{formatDate(selectedTask?.dueDate)}</span>
              </div>
              <div className="text-muted-foreground flex justify-between">
                <span>Priority:</span>
                <span className="font-medium uppercase text-foreground">{selectedTask?.priority}</span>
              </div>
              <div className="text-muted-foreground flex justify-between">
                <span>Status:</span>
                <span className="font-medium capitalize text-foreground">{selectedTask?.status}</span>
              </div>
              {selectedTask?.recurrence?.cadence && selectedTask.recurrence.cadence !== "none" && (
                <div className="text-muted-foreground flex justify-between" data-testid="detail-recurrence">
                  <span>Recurrence:</span>
                  <span className="font-medium text-foreground capitalize">
                    {selectedTask.recurrence.cadence}
                    {selectedTask.recurrence.generation && selectedTask.recurrence.generation > 1
                      ? ` (Cycle ${selectedTask.recurrence.generation})`
                      : ""}
                  </span>
                </div>
              )}
              {selectedTask?.appliedAt ? (
                <div className="text-muted-foreground flex justify-between">
                  <span>Applied Date:</span>
                  <span className="font-medium text-foreground">{formatDate(selectedTask.appliedAt)}</span>
                </div>
              ) : null}
              {selectedTask?.appliedSummary ? (
                <div className="text-muted-foreground pt-1 border-t border-border/60 text-xs">
                  Summary: tx {selectedTask.appliedSummary.transactions.length} • goals{" "}
                  {selectedTask.appliedSummary.goals.length} • debts {selectedTask.appliedSummary.debts.length} • profile{" "}
                  {selectedTask.appliedSummary.profileUpdated ? "yes" : "no"}
                </div>
              ) : null}
            </div>

            {detailQuery.data?.source?.agent_output ? (
              <div className="rounded-lg border border-border p-3 text-sm space-y-1 bg-muted/20">
                <div className="font-medium text-foreground">AI Plan Source</div>
                <div className="text-muted-foreground text-xs">
                  Title: {detailQuery.data.source.agent_output.title || "—"}
                </div>
                <div className="text-muted-foreground text-xs">Request ID: {detailQuery.data.source.agent_output.request_id || "—"}</div>
                <div className="text-muted-foreground text-xs pt-1">
                  User Prompt: {detailQuery.data.source.agent_output.user_input_snippet}
                </div>
              </div>
            ) : selectedTask?.source?.requestId ? (
              <div className="rounded-lg border border-border p-3 text-sm bg-muted/20">
                <div className="font-medium text-foreground">Source</div>
                <div className="text-muted-foreground text-xs mt-1">Request ID: {selectedTask.source.requestId}</div>
              </div>
            ) : null}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => selectedTask && setApplyTask(selectedTask)}
              >
                Apply outcomes
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={() => selectedTask && updateStatusMutation.mutate({ id: selectedTask._id, status: "completed" })}
                disabled={updateStatusMutation.isPending}
              >
                Mark completed
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => selectedTask && syncTaskToCalendar(selectedTask)}
                data-testid="sheet-sync-calendar-btn"
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Sync to Calendar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => selectedTask && exportTasksToIcs([selectedTask])}
                data-testid="sheet-export-ics-btn"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export .ics
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* External Sync & Webhook Integrations Dialog */}
      <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-task-sync-integrations">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle>External Task Sync & Webhook Integrations</DialogTitle>
                <DialogDescription className="text-xs">
                  Sync FinWise financial tasks with Jira, Linear, and Todoist, dispatch outbound payloads, or trigger tasks via inbound webhooks.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeSyncTab} onValueChange={(v) => setActiveSyncTab(v as any)} className="w-full mt-2">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="trackers" data-testid="tab-trackers">Task Trackers</TabsTrigger>
              <TabsTrigger value="outbound" data-testid="tab-outbound">Push Dispatcher</TabsTrigger>
              <TabsTrigger value="inbound" data-testid="tab-inbound">Inbound Webhook API</TabsTrigger>
            </TabsList>

            {/* TAB 1: TASK TRACKERS (Linear / Todoist / Jira) */}
            <TabsContent value="trackers" className="space-y-4 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Exporting {tasksForSync.length} task{tasksForSync.length !== 1 ? "s" : ""}
                  {selectedTaskIds.length > 0 ? " (selected)" : " (all in view)"}
                </span>
                <div className="flex items-center gap-1.5">
                  {(["linear", "todoist", "jira"] as const).map((tracker) => (
                    <Button
                      key={tracker}
                      type="button"
                      size="sm"
                      variant={activeTracker === tracker ? "default" : "outline"}
                      className="h-7 text-xs capitalize"
                      onClick={() => setActiveTracker(tracker)}
                      data-testid={`btn-select-tracker-${tracker}`}
                    >
                      {tracker}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  rows={8}
                  className="w-full font-mono text-xs rounded-md border border-input bg-muted/40 p-3 leading-relaxed focus:outline-none"
                  value={formattedTrackerText}
                  data-testid="textarea-tracker-preview"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-muted-foreground">
                  {activeTracker === "linear" && "Linear CSV format: Title, Description, Priority, Estimate, Status"}
                  {activeTracker === "todoist" && "Todoist CSV format: CONTENT, DESCRIPTION, PRIORITY, DATE"}
                  {activeTracker === "jira" && "Jira CSV format: Summary, Description, Priority, Due Date, Issue Type"}
                </span>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs flex items-center gap-1.5"
                    onClick={() => copyToClipboard(formattedTrackerText, `${activeTracker.toUpperCase()} format`)}
                    data-testid="btn-copy-tracker-format"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy for {activeTracker}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs flex items-center gap-1.5"
                    onClick={() => downloadCsv(formattedTrackerText, `finwise-tasks-${activeTracker}.csv`)}
                    data-testid="btn-download-tracker-csv"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: OUTBOUND WEBHOOK DISPATCHER */}
            <TabsContent value="outbound" className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="webhook-target">Target Destination / Payload Format</Label>
                <Select value={webhookTarget} onValueChange={(val: any) => setWebhookTarget(val)}>
                  <SelectTrigger id="webhook-target" data-testid="select-webhook-target">
                    <SelectValue placeholder="Target Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear Webhook / Zapier</SelectItem>
                    <SelectItem value="todoist">Todoist Sync Webhook</SelectItem>
                    <SelectItem value="jira">Jira Automation Webhook</SelectItem>
                    <SelectItem value="slack">Slack Incoming Webhook</SelectItem>
                    <SelectItem value="generic">Generic JSON Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="webhook-url">Target Webhook URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://api.linear.app/v1/webhook or https://hooks.slack.com/services/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  data-testid="input-webhook-url"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="webhook-headers">Custom Authorization Header (Optional)</Label>
                <Input
                  id="webhook-headers"
                  placeholder="Bearer lin_api_..."
                  value={customAuthHeader}
                  onChange={(e) => setCustomAuthHeader(e.target.value)}
                  data-testid="input-webhook-auth-header"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-muted/30 text-xs">
                <div>
                  <div className="font-medium text-foreground">Tasks to Dispatch: {tasksForSync.length} items</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">
                    {selectedTaskIds.length > 0 ? "Dispatching explicitly selected tasks" : "Dispatching all tasks currently listed"}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={dispatchMutation.isPending || !webhookUrl.trim() || tasksForSync.length === 0}
                  onClick={() => dispatchMutation.mutate()}
                  className="gap-1.5"
                  data-testid="btn-dispatch-tasks-webhook"
                >
                  <Send className="w-3.5 h-3.5" />
                  {dispatchMutation.isPending ? "Dispatching..." : "Dispatch Tasks Now"}
                </Button>
              </div>

              {dispatchResult && (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs space-y-1" data-testid="dispatch-result-box">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Dispatch Status: {dispatchResult.delivery_status} (HTTP {dispatchResult.http_code})
                  </div>
                  <div className="text-muted-foreground">
                    Target: {dispatchResult.target} | Dispatched: {dispatchResult.dispatched_count} tasks
                  </div>
                  {dispatchResult.response_snippet && (
                    <div className="font-mono text-[10px] bg-background/80 p-2 rounded border border-border/50 truncate">
                      {dispatchResult.response_snippet}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* TAB 3: INBOUND WEBHOOK API */}
            <TabsContent value="inbound" className="space-y-4 pt-3">
              <div className="p-3 rounded-lg border border-border/70 bg-muted/30 space-y-2 text-xs">
                <div className="font-medium text-foreground flex items-center justify-between">
                  <span>Your Inbound Task Webhook URL</span>
                  <Badge variant="outline" className="text-[10px] font-mono">Token Authenticated</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={inboundWebhookFullUrl}
                    className="font-mono text-xs bg-background select-all"
                    data-testid="input-inbound-webhook-url"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(inboundWebhookFullUrl, "Inbound Webhook URL")}
                    data-testid="btn-copy-inbound-webhook"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Post JSON to this URL from Jira automation, Linear webhooks, Zapier, or curl to automatically create or complete tasks.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Sample Payload (Create Task)</Label>
                <pre className="font-mono text-[11px] bg-muted/50 p-3 rounded-md border border-border/60 overflow-x-auto text-foreground">
{`curl -X POST "${inboundWebhookFullUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "create",
    "title": "Review Q4 Tax Prep from Linear",
    "why": "Triggered from accounting team sprint review",
    "priority": "high",
    "bucket": 7,
    "steps": ["Review 1099s", "Reconcile deductions"]
  }'`}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">
                  Also supports <code>action: "complete"</code> with <code>taskId</code> or <code>title</code> to auto-renew recurring tasks.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={testInboundMutation.isPending || !webhookTokenQuery.data?.webhook_token}
                  onClick={() => testInboundMutation.mutate()}
                  className="gap-1.5 text-xs"
                  data-testid="btn-send-test-inbound-task"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  {testInboundMutation.isPending ? "Sending..." : "Send Test Inbound Task"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {applyTask ? (
        <TaskApplyDialog
          task={applyTask}
          open={Boolean(applyTask)}
          onOpenChange={(open) => {
            if (!open) setApplyTask(null);
          }}
          defaultNote="Applied from tasks page"
        />
      ) : null}
    </div>
  );
}
