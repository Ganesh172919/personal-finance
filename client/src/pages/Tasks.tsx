import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/hooks/useToast";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  ApiError,
  getTaskById,
  getTasks,
  type Task,
  type TaskStatus,
  updateTaskStatus,
} from "@/lib/apiClient";
import { TaskApplyDialog } from "@/components/TaskApplyDialog";

const EMPTY_TASKS: Task[] = [];

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

export default function TasksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const configQuery = useAppConfig();
  const tasksEnabled = configQuery.data?.features.tasks_enabled;

  const [status, setStatus] = useState<TaskStatus>("open");
  const [search, setSearch] = useState("");

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

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: TaskStatus }) => updateTaskStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Updated", description: "Task status updated." });
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground">Turn AI plans into trackable outcomes.</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or why…"
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          </TabsList>

          <TabsContent value={status}>
            <Card className="p-4">
              {configQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : tasksQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading tasks…</div>
              ) : tasksQuery.error ? (
                <div className="text-sm text-muted-foreground">
                  {formatError(tasksQuery.error, "Failed to load tasks.")}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tasks found.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((task) => (
                    <div key={task._id} className="rounded-md border border-border p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <div className="font-medium text-foreground truncate">{task.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{task.why}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Due: {formatDate(task.dueDate)} • Priority: {task.priority}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {status !== "completed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: task._id, status: "completed" })}
                          >
                            Complete
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: task._id, status: "open" })}
                          >
                            Reopen
                          </Button>
                        )}

                        {status !== "dismissed" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateStatusMutation.mutate({ id: task._id, status: "dismissed" })}
                          >
                            Dismiss
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: task._id, status: "open" })}
                          >
                            Undismiss
                          </Button>
                        )}

                        <Button size="sm" variant="secondary" onClick={() => setApplyTask(task)}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      <Sheet open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <SheetContent side="right" className="sm:max-w-lg w-full">
          <SheetHeader>
            <SheetTitle>{selectedTask?.title || "Task"}</SheetTitle>
            <SheetDescription>{selectedTask?.why}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {selectedTask?.steps?.length ? (
              <div>
                <div className="text-sm font-semibold text-foreground mb-2">Steps</div>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {selectedTask.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-md border border-border p-3 text-sm">
              <div className="text-muted-foreground">Due: {formatDate(selectedTask?.dueDate)}</div>
              <div className="text-muted-foreground">Priority: {selectedTask?.priority}</div>
              <div className="text-muted-foreground">Status: {selectedTask?.status}</div>
              {selectedTask?.appliedAt ? (
                <div className="text-muted-foreground">Applied: {formatDate(selectedTask.appliedAt)}</div>
              ) : null}
              {selectedTask?.appliedSummary ? (
                <div className="text-muted-foreground mt-1">
                  Applied summary: tx {selectedTask.appliedSummary.transactions.length} • goals{" "}
                  {selectedTask.appliedSummary.goals.length} • debts {selectedTask.appliedSummary.debts.length} • profile{" "}
                  {selectedTask.appliedSummary.profileUpdated ? "yes" : "no"}
                </div>
              ) : null}
            </div>

            {detailQuery.data?.source?.agent_output ? (
              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium text-foreground">Source</div>
                <div className="text-muted-foreground mt-1">
                  Title: {detailQuery.data.source.agent_output.title || "—"}
                </div>
                <div className="text-muted-foreground">Request: {detailQuery.data.source.agent_output.request_id || "—"}</div>
                <div className="text-muted-foreground mt-1">
                  Prompt: {detailQuery.data.source.agent_output.user_input_snippet}
                </div>
              </div>
            ) : selectedTask?.source?.requestId ? (
              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium text-foreground">Source</div>
                <div className="text-muted-foreground mt-1">Request: {selectedTask.source.requestId}</div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => selectedTask && setApplyTask(selectedTask)}>
                Apply outcomes
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedTask && updateStatusMutation.mutate({ id: selectedTask._id, status: "completed" })}
                disabled={updateStatusMutation.isPending}
              >
                Mark completed
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
