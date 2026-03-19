import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getAiCoreStatus } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";

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
  cacheHit,
}: AiStatusDialogProps) {
  const [open, setOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["/api/ai-core/status"],
    queryFn: getAiCoreStatus,
    enabled: open,
  });

  const aiCore = statusQuery.data?.ai_core;
  const server = statusQuery.data?.server;
  const providers = aiCore?.providers?.providers || [];

  const rateLimiter = (aiCore?.rate_limit_status as any)?.rate_limit_status;
  const providerChain = Array.isArray(aiCore?.health?.provider_chain) ? aiCore.health.provider_chain : [];

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
              <div>requestId: {lastRequestId || "-"}</div>
              <div>LLM calls: {llmCallCount ?? 0}</div>
              <div>fallback: {fallbackUsed ? "yes" : "no"}</div>
              <div>cache: {cacheHit ? "hit" : "miss"}</div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">AI Core</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>healthy: {aiCore?.healthy ? "yes" : "no"}</div>
              <div>server requestId: {aiCore?.request_id ? String(aiCore.request_id).slice(0, 8) : "-"}</div>
              <div>
                rpm tokens: {rateLimiter?.minute_tokens_available !== undefined ? rateLimiter.minute_tokens_available : "-"}
              </div>
              <div>
                rpd tokens: {rateLimiter?.day_tokens_available !== undefined ? rateLimiter.day_tokens_available : "-"}
              </div>
            </div>

            {providerChain.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">failover chain: {providerChain.join(" -> ")}</p>
            ) : null}

            {!aiCore?.healthy ? (
              <p className="mt-2 text-xs text-muted-foreground">
                AI Core is unavailable{aiCore?.base_url ? ` (${aiCore.base_url})` : ""}.
                {aiCore?.health_error ? ` ${aiCore.health_error}` : ""}
                {aiCore?.rate_limit_error ? ` ${aiCore.rate_limit_error}` : ""}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Providers</p>
            {providers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No provider metadata available.
                {aiCore?.providers_error ? ` ${aiCore.providers_error}` : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <div key={provider.name} className="rounded border border-border/70 bg-background/70 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{provider.display_name}</span>
                      <span className="text-muted-foreground">
                        {provider.active ? "active" : provider.in_failover_chain ? "standby" : "idle"}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {provider.configured ? provider.default_model : "Not configured"}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
