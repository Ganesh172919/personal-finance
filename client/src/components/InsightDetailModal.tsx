/**
 * @fileoverview InsightDetailModal — full-screen dialog for viewing a single AI-generated
 * insight with markdown-rendered analysis, task creation, thumbs-up/down feedback, and
 * a contextual action button.
 *
 * WHAT IT DOES
 *  - Fetches an `IAgentOutput` by `insightId` from `/api/agent-outputs/:id`.
 *  - Renders the insight's `response` field as rich Markdown (headings, lists, code blocks).
 *  - Offers "Add to tasks" to convert an embedded plan into trackable tasks via the API.
 *  - Collects user feedback (thumbs up/down) on the insight via `submitAgentOutputFeedback`.
 *  - Maps `actionType` to an in-app route for the "Take Action" button.
 *
 * KEY PROPS & DATA FLOW
 *  - `insightId` (string | null) — the ID to fetch; null hides the dialog.
 *  - `isOpen` / `onClose` — controlled dialog visibility.
 *  - Mutations: `createTasksFromPlan`, `submitAgentOutputFeedback`.
 *
 * ARCHITECTURE NOTES
 *  - Opened from `ActionableInsights` when a user clicks on an insight card.
 *  - Uses the same markdown component map as `AiCommandBar` for visual consistency.
 *  - All API errors are formatted with request IDs for support traceability.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IAgentOutput } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ListTodo, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useLocation } from "wouter";
import { ApiError, createTasksFromPlan, submitAgentOutputFeedback } from "@/lib/apiClient";
import { useToast } from "@/hooks/useToast";

// Re-using the markdown styles from AICommandBar for consistency
const markdownComponents = {
  h1: ({children}: any) => <h1 className="text-xl font-bold text-foreground mb-3 mt-4">{children}</h1>,
  h2: ({children}: any) => <h2 className="text-lg font-semibold text-foreground mb-2 mt-3">{children}</h2>,
  p: ({children}: any) => <p className="leading-relaxed text-foreground mb-3">{children}</p>,
  ul: ({children}: any) => <ul className="list-disc list-inside space-y-1 my-3 ml-4">{children}</ul>,
  ol: ({children}: any) => <ol className="list-decimal list-inside space-y-1 my-3 ml-4">{children}</ol>,
  li: ({children}: any) => <li className="leading-relaxed text-foreground">{children}</li>,
  blockquote: ({children}: any) => <blockquote className="border-l-4 border-primary/30 pl-4 py-2 my-3 text-muted-foreground italic">{children}</blockquote>,
  code: ({inline, children}: any) => inline ? <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code> : <code className="block bg-muted p-3 rounded text-xs font-mono overflow-x-auto my-3">{children}</code>,
  pre: ({children}: any) => <pre className="bg-muted p-3 rounded overflow-x-auto my-3">{children}</pre>,
};

interface InsightDetailModalProps {
  insightId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InsightDetailModal({ insightId, isOpen, onClose }: InsightDetailModalProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [feedbackRating, setFeedbackRating] = useState<"up" | "down" | null>(null);
  const [tasksAdded, setTasksAdded] = useState(false);

  useEffect(() => {
    setFeedbackRating(null);
    setTasksAdded(false);
  }, [insightId, isOpen]);

  const formatError = (error: unknown, fallback: string) => {
    const requestId = error instanceof ApiError ? error.requestId : undefined;
    const message = error instanceof Error ? error.message : fallback;
    return requestId ? `${message} (Request ID: ${requestId})` : message;
  };

  const { data: insight, isLoading } = useQuery<IAgentOutput>({
    queryKey: [`/api/agent-outputs`, insightId], // Fetches /api/agent-outputs/:id
    enabled: !!insightId && isOpen,
  });

  const createTasksMutation = useMutation({
    mutationFn: (payload: { agentOutputId: string; plan: any }) =>
      createTasksFromPlan({ source: { agentOutputId: payload.agentOutputId }, plan: payload.plan }),
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

  const handleAddToTasks = () => {
    const plan = (insight as any)?.outputData?.plan;
    if (!insight?.id || !plan) return;
    createTasksMutation.mutate({ agentOutputId: insight.id, plan });
  };

  const handleFeedback = (rating: "up" | "down") => {
    if (!insight?.id) return;
    feedbackMutation.mutate({ agentOutputId: insight.id, rating });
  };

  const handleAction = () => {
    if (!insight?.outputData?.actionType) return;
    
    const actionType = insight.outputData.actionType;
    const actionRouteMap: Record<string, string> = {
      "invest": "/portfolio",
      "review_budget": "/scenarios",
      "start_learning": "/financial-story",
      "optimize_spending": "/scenarios",
      "manage_debt": "/scenarios",
      "increase_savings": "/scenarios",
      "review": "/dashboard"
    };
    const route = actionRouteMap[actionType] || "/dashboard";
    onClose(); 
    navigate(route);
  };

  const getActionText = (actionType: string | undefined) => {
    switch (actionType) {
      case "invest": return "View Portfolio";
      case "review_budget": return "Review Budget";
      case "start_learning": return "Start Learning";
      case "optimize_spending": return "Optimize Spending";
      case "manage_debt": return "Manage Debt";
      case "increase_savings": return "Increase Savings";
      default: return "Take Action";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        {!isLoading && insight && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">{insight.outputData.title}</DialogTitle>
              <DialogDescription>
                {insight.outputData.description}
              </DialogDescription>
              <div className="flex gap-2 pt-2">
                <Badge variant="outline">{insight.agentType}</Badge>
                {insight.priority && <Badge variant={insight.priority === 'high' ? 'destructive' : 'secondary'}>{insight.priority} priority</Badge>}
              </div>
            </DialogHeader>

            {/* This is where the long markdown "response" is rendered */}
            <div className="flex-1 overflow-y-auto pr-6 text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {insight.outputData.response || "No detailed analysis available."}
              </ReactMarkdown>
            </div>

            <DialogFooter className="pt-4 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
              <div className="flex flex-wrap items-center gap-2">
                {(insight.outputData as any)?.plan && (
                  <Button
                    variant="outline"
                    onClick={handleAddToTasks}
                    disabled={createTasksMutation.isPending}
                    title="Convert this plan into trackable tasks"
                  >
                    <ListTodo className="w-4 h-4 mr-2" />
                    {createTasksMutation.isPending
                      ? "Adding..."
                      : tasksAdded
                        ? "Added to tasks"
                        : "Add to tasks"}
                  </Button>
                )}

                <div className="flex items-center gap-1">
                  <Button
                    variant={feedbackRating === "up" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleFeedback("up")}
                    disabled={feedbackMutation.isPending}
                    title="Thumbs up"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={feedbackRating === "down" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleFeedback("down")}
                    disabled={feedbackMutation.isPending}
                    title="Thumbs down"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
                {insight.actionable && insight.outputData.actionType && (
                  <Button onClick={handleAction}>
                    {getActionText(insight.outputData.actionType)}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
