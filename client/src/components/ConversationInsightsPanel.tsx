import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, RefreshCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fetchConversationInsights } from "@/services/chatApi";
import type { ActionItem } from "@/types/ai.types";

type ConversationInsightsPanelProps = {
  compact?: boolean;
  className?: string;
};

const collectActionItems = (plan?: {
  actions?: {
    next_7_days?: ActionItem[];
    next_30_days?: ActionItem[];
    next_12_months?: ActionItem[];
  };
}) => {
  if (!plan?.actions) return [];

  return [
    ...(plan.actions.next_7_days || []),
    ...(plan.actions.next_30_days || []),
    ...(plan.actions.next_12_months || []),
  ].slice(0, 3);
};

export function ConversationInsightsPanel({
  compact = false,
  className,
}: ConversationInsightsPanelProps) {
  const insightsQuery = useQuery({
    queryKey: ["/api/chat/insights/conversation"],
    queryFn: fetchConversationInsights,
    staleTime: 60_000,
  });

  const actionItems = useMemo(
    () => collectActionItems(insightsQuery.data?.plan),
    [insightsQuery.data?.plan]
  );

  return (
    <Card className={className}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Conversation intelligence</div>
                <div className="text-xs text-muted-foreground">
                  Patterns pulled from your recent AI conversations
                </div>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-2xl"
            onClick={() => insightsQuery.refetch()}
            disabled={insightsQuery.isFetching}
            aria-label="Refresh conversation insights"
          >
            <RefreshCcw className={`h-4 w-4 ${insightsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {insightsQuery.isLoading ? (
          <div className="rounded-[calc(var(--radius)-8px)] border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            Summarizing your recent conversations...
          </div>
        ) : insightsQuery.isError ? (
          <div className="rounded-[calc(var(--radius)-8px)] border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">
            Conversation insights are temporarily unavailable.
          </div>
        ) : insightsQuery.data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {insightsQuery.data.sessions_considered} session
                {insightsQuery.data.sessions_considered === 1 ? "" : "s"}
              </Badge>
              {insightsQuery.data.fallback_used ? (
                <Badge variant="outline">Fallback response</Badge>
              ) : null}
              {(insightsQuery.data.agents_involved || []).slice(0, compact ? 2 : 4).map((agent) => (
                <Badge key={agent} className="bg-primary/10 text-primary">
                  {agent}
                </Badge>
              ))}
            </div>

            <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {insightsQuery.data.response}
              </ReactMarkdown>
            </div>

            {actionItems.length ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Recommended next moves
                </div>
                <div className="grid gap-2">
                  {actionItems.map((action, index) => (
                    <div
                      key={`${action.title}-${index}`}
                      className="rounded-[calc(var(--radius)-10px)] border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="text-sm font-semibold text-foreground">{action.title}</div>
                      {!compact ? (
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{action.why}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[calc(var(--radius)-8px)] border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            Start chatting to generate cross-conversation insights.
          </div>
        )}
      </div>
    </Card>
  );
}
