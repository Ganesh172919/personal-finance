/**
 * @fileoverview TasksWidget — dashboard card listing open tasks bucketed into "Next 7 days"
 * and "Next 30 days" with quick-action buttons for completing, applying, or dismissing each task.
 *
 * WHAT IT DOES
 *  - Fetches open tasks from `/api/tasks?status=open&limit=50` (feature-gated on `tasks_enabled`).
 *  - Splits tasks into two time buckets and renders up to 5 per bucket.
 *  - Three actions per task: checkmark (mark completed), rocket (open TaskApplyDialog to
 *    convert into financial actions), X (dismiss with "dismissed" status).
 *  - Uses optimistic updates: on mutate, the task is immediately removed from the list;
 *    on error, the previous list is restored.
 *
 * KEY PROPS & DATA FLOW
 *  - No props — data is fully server-fetched and feature-gated.
 *  - Embeds `TaskApplyDialog` for the "apply" flow; `applyTask` state controls its visibility.
 *  - Mutation: `updateTaskStatus` with onMutate/onError rollback.
 *
 * ARCHITECTURE NOTES
 *  - Feature-gated: shows "Tasks are disabled" when `tasks_enabled` is false in app config.
 *  - Optimistic UI pattern with `cancelQueries` + `setQueryData` for snappy interactions.
 *  - Invalidates all `/api/tasks` queries on success to keep other views in sync.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Rocket, XCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/hooks/useToast";
import {
  ApiError,
  getTasks,
  Task,
  TaskStatus,
  updateTaskStatus,
} from "@/lib/apiClient";
import { useAppConfig } from "@/hooks/useAppConfig";
import { TaskApplyDialog } from "@/components/TaskApplyDialog";

const EMPTY_TASKS: Task[] = [];

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

export function TasksWidget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const configQuery = useAppConfig();
  const tasksEnabled = configQuery.data?.features.tasks_enabled;
  const [applyTask, setApplyTask] = useState<Task | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/tasks", "open"],
    queryFn: () => getTasks({ status: "open", limit: 50 }),
    enabled: tasksEnabled === true,
  });

  const tasks = ((data?.tasks as Task[] | undefined) ?? EMPTY_TASKS) as Task[];
  const tasksDisabled = tasksEnabled === false;

  const buckets = useMemo(() => {
    const next7 = tasks.filter(t => t.bucket === 7).slice(0, 5);
    const next30 = tasks.filter(t => t.bucket === 30).slice(0, 5);
    return { next7, next30 };
  }, [tasks]);

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => updateTaskStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", "open"] });
      const previous = queryClient.getQueryData<{ tasks: Task[] }>(["/api/tasks", "open"]);

      if (previous?.tasks) {
        queryClient.setQueryData(["/api/tasks", "open"], {
          tasks: previous.tasks.filter(task => task._id !== id),
        });
      }

      return { previous, id, status };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/tasks", "open"], context.previous);
      }
      toast({
        title: "Task update failed",
        description: formatError(error, "Failed to update task."),
        variant: "destructive",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const renderBucket = (title: string, items: Task[]) => {
    return (
      <div>
        <div className="text-sm font-semibold mb-2">{title}</div>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No tasks.</div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item._id}
                className="rounded-md border border-border bg-background/60 p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{item.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{item.why}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateMutation.mutate({ id: item._id, status: "completed" })}
                    title="Mark completed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setApplyTask(item)}
                    title="Apply task outcome"
                  >
                    <Rocket className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => updateMutation.mutate({ id: item._id, status: "dismissed" })}
                    title="Dismiss"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Card className="p-6" data-testid="tasks-widget">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Tasks</h3>
        <span className="text-xs text-muted-foreground">{tasksDisabled ? "disabled" : `${tasks.length} open`}</span>
      </div>

      {tasksDisabled ? (
        <div className="text-sm text-muted-foreground">Tasks are disabled on this server.</div>
      ) : configQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tasks...</div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tasks...</div>
      ) : error ? (
        <div className="text-sm text-muted-foreground">{formatError(error, "Failed to load tasks.")}</div>
      ) : (
        <div className="space-y-4">
          {renderBucket("Next 7 days", buckets.next7)}
          {renderBucket("Next 30 days", buckets.next30)}
        </div>
      )}
      </Card>

      {applyTask ? (
        <TaskApplyDialog
          task={applyTask}
          open={Boolean(applyTask)}
          onOpenChange={(open) => {
            if (!open) setApplyTask(null);
          }}
          defaultNote="Applied from dashboard task widget"
        />
      ) : null}
    </>
  );
}
