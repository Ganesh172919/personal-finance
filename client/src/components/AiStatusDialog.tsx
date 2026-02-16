import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/Dialog";
import { getAiCoreStatus } from "@/lib/apiClient";

type AiStatusDialogProps = {
  lastRequestId?: string;
  fallbackUsed?: boolean;
  llmCallCount?: number;
  cacheHit?: boolean;
};

export function AiStatusDialog({
  lastRequestId,
  fallbackUsed,
  llmCallCount,
  cacheHit
}: AiStatusDialogProps) {
  const [open, setOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["/api/ai-core/status"],
    queryFn: getAiCoreStatus,
    enabled: open
  });

  const aiCore = statusQuery.data?.ai_core;
  const server = statusQuery.data?.server;

  const rateLimiter = (aiCore?.rate_limit_status as any)?.rate_limit_status;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          AI Status
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>AI Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Last response</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>requestId: {lastRequestId ? lastRequestId : "—"}</div>
              <div>LLM calls: {llmCallCount ?? 0}</div>
              <div>fallback: {fallbackUsed ? "yes" : "no"}</div>
              <div>cache: {cacheHit ? "hit" : "miss"}</div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">AI Core</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>healthy: {aiCore?.healthy ? "yes" : "no"}</div>
              <div>server requestId: {aiCore?.request_id ? String(aiCore.request_id).slice(0, 8) : "—"}</div>
              <div>
                rpm tokens: {rateLimiter?.minute_tokens_available !== undefined ? rateLimiter.minute_tokens_available : "—"}
              </div>
              <div>
                rpd tokens: {rateLimiter?.day_tokens_available !== undefined ? rateLimiter.day_tokens_available : "—"}
              </div>
            </div>

            {!aiCore?.healthy ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Retry later: AI Core is unavailable or still starting up.
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Server circuit breaker</p>
            <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap text-muted-foreground">
              {JSON.stringify(server?.ai_core_client ?? {}, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => statusQuery.refetch()} disabled={!open || statusQuery.isFetching}>
            Refresh
          </Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

