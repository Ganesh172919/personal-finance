import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, RefreshCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
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
}, limit = 3) => {
  if (!plan?.actions) return [];

  return [
    ...(plan.actions.next_7_days || []),
    ...(plan.actions.next_30_days || []),
    ...(plan.actions.next_12_months || []),
  ].slice(0, limit);
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
    () => collectActionItems(insightsQuery.data?.plan, compact ? 1 : 3),
    [compact, insightsQuery.data?.plan]
  );

  return (
    <Card className={className}>
      <div className={cn("flex flex-col", compact ? "gap-2 p-2.5" : "gap-4 p-5")}>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl bg-primary text-primary-foreground",
                  compact ? "h-7 w-7" : "h-10 w-10"
                )}
              >
                <BrainCircuit className={compact ? "h-3 w-3" : "h-4 w-4"} />
              </div>
              <div>
                <div className={cn("font-semibold text-foreground", compact ? "text-[11px] leading-4" : "text-sm")}>
                  Conversation intelligence
                </div>
                {!compact ? (
                  <div className="text-xs text-muted-foreground">
                    Patterns pulled from your recent AI conversations
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className={cn("rounded-2xl", compact ? "h-6 w-6" : "")}
            onClick={() => insightsQuery.refetch()}
            disabled={insightsQuery.isFetching}
            aria-label="Refresh conversation insights"
          >
            <RefreshCcw className={`${compact ? "h-3 w-3" : "h-4 w-4"} ${insightsQuery.isFetching ? "animate-spin" : ""}`} />
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
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline" className={compact ? "px-1.5 py-0 text-[9px]" : undefined}>
                {insightsQuery.data.sessions_considered} session
                {insightsQuery.data.sessions_considered === 1 ? "" : "s"}
              </Badge>
              {insightsQuery.data.fallback_used ? (
                <Badge variant="outline" className={compact ? "px-1.5 py-0 text-[9px]" : undefined}>Fallback response</Badge>
              ) : null}
              {(insightsQuery.data.agents_involved || []).slice(0, compact ? 2 : 4).map((agent) => (
                <Badge key={agent} className={cn("bg-primary/10 text-primary", compact ? "px-1.5 py-0 text-[9px]" : "")}>
                  {agent}
                </Badge>
              ))}
            </div>

            <div className={cn("max-w-none text-foreground dark:prose-invert", compact ? "prose prose-xs" : "prose prose-sm")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {insightsQuery.data.response}
              </ReactMarkdown>
            </div>

            {actionItems.length ? (
              <div className="space-y-2">
                <div className={cn("font-semibold uppercase text-muted-foreground", compact ? "text-[10px] tracking-[0.18em]" : "text-xs tracking-[0.22em]")}>
                  Recommended next moves
                </div>
                <div className="grid gap-2">
                  {actionItems.map((action, index) => (
                    <div
                      key={`${action.title}-${index}`}
                      className={cn("rounded-[calc(var(--radius)-10px)] border border-border/70 bg-muted/20", compact ? "p-2.5" : "p-3")}
                    >
                      <div className={cn("font-semibold text-foreground", compact ? "text-xs leading-4" : "text-sm")}>{action.title}</div>
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
