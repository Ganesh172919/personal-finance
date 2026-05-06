/**
 * @fileoverview AiStatusDialog — developer/debug dialog showing the health and configuration
 * of the AI subsystem: active provider, model catalog, key pool status, rate limiter,
 * session checkpoints, and the last response metadata.
 *
 * WHAT IT DOES
 *  - Renders a tabbed dialog with four tabs: Overview, Keys, Models, Sessions.
 *  - Overview: last request ID, LLM call count, fallback/cache status, active provider/model,
 *    failover chain, rate limiter tokens, system stats (vision, memory, free models), and
 *    server circuit breaker state.
 *  - Keys: key pool cards with per-key health (success rate, latency, status badge),
 *    rotation strategy, and expandable key entry rows.
 *  - Models: model catalog broken down by provider, capability, cost tier, and reasoning
 *    strength, plus recent model health entries.
 *  - Sessions: session checkpoint stats with status breakdown (completed, in_progress, failed).
 *
 * KEY PROPS & DATA FLOW
 *  - `lastRequestId`, `fallbackUsed`, `llmCallCount`, `cacheHit` — metadata from the last
 *    AI response, passed in by the parent (AiCommandBar).
 *  - Fetches `/api/ai-core/status` and `/api/ai-core/ai/status` on dialog open.
 *
 * ARCHITECTURE NOTES
 *  - Embedded in `AiCommandBar` response header; primarily a developer/power-user tool.
 *  - Uses two parallel queries (`statusQuery`, `enhancedQuery`) that only fire when `open=true`.
 *  - Sub-components: `KeyStatusBadge`, `KeyPoolCard`, `KeyEntryRow` for key pool rendering.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getAiCoreStatus, getEnhancedAiStatus } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import type { KeyPoolStats, KeyPoolEntry, KeyStatus } from "@/types/ai.types";

type AiStatusDialogProps = {
  lastRequestId?: string;
  fallbackUsed?: boolean;
  llmCallCount?: number;
  cacheHit?: boolean;
};

// Status badge colors
const STATUS_COLORS: Record<KeyStatus, string> = {
  healthy: "bg-green-500/20 text-green-400",
  degraded: "bg-yellow-500/20 text-yellow-400",
  cooldown: "bg-orange-500/20 text-orange-400",
  circuit_open: "bg-red-500/20 text-red-400",
  disabled: "bg-gray-500/20 text-gray-400",
};

function KeyStatusBadge({ status }: { status: KeyStatus }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[status] || STATUS_COLORS.disabled}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function KeyPoolCard({ pool }: { pool: KeyPoolStats }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border border-border/70 bg-background/70 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground capitalize">{pool.provider}</span>
        <span className="text-muted-foreground">
          {pool.available_keys}/{pool.total_keys} keys available
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-muted-foreground">
        <div>success: {pool.overall_success_rate.toFixed(1)}%</div>
        <div>reqs: {pool.total_requests}</div>
        <div>strategy: {pool.rotation_strategy}</div>
      </div>

      {pool.total_keys > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] text-primary hover:underline"
        >
          {expanded ? "Hide keys" : "Show keys"}
        </button>
      )}

      {expanded && pool.keys.length > 0 && (
        <div className="mt-2 space-y-1">
          {pool.keys.map((key) => (
            <KeyEntryRow key={key.key_id} entry={key} />
          ))}
        </div>
      )}
    </div>
  );
}

function KeyEntryRow({ entry }: { entry: KeyPoolEntry }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1 text-[10px]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground">fp:{entry.key_fingerprint}</span>
        <KeyStatusBadge status={entry.status} />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{entry.health.success_rate.toFixed(0)}%</span>
        <span>{entry.health.total_requests} reqs</span>
        {entry.health.avg_latency_ms > 0 && (
          <span>{entry.health.avg_latency_ms.toFixed(0)}ms</span>
        )}
      </div>
    </div>
  );
}

export function AiStatusDialog({
  lastRequestId,
  fallbackUsed,
  llmCallCount,
  cacheHit,
}: AiStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "keys" | "models" | "sessions">("overview");

  const statusQuery = useQuery({
    queryKey: ["/api/ai-core/status"],
    queryFn: getAiCoreStatus,
    enabled: open,
  });

  const enhancedQuery = useQuery({
    queryKey: ["/api/ai-core/ai/status"],
    queryFn: getEnhancedAiStatus,
    enabled: open,
  });

  const aiCore = statusQuery.data?.ai_core;
  const server = statusQuery.data?.server;
  const providers = aiCore?.providers?.providers || [];
  const enhanced = enhancedQuery.data;

  const rateLimiter = (aiCore?.rate_limit_status as any)?.rate_limit_status;
  const providerChain = enhanced?.provider?.fallback_chain || 
    (Array.isArray(aiCore?.health?.provider_chain) ? aiCore.health.provider_chain : []);

  const keyPools = enhanced?.key_pools || {};
  const modelCatalog = enhanced?.model_catalog;
  const modelHealth = enhanced?.model_health || {};
  const sessions = enhanced?.sessions;
  const lastRoute = enhanced?.last_route;
  const activeProviderLabel = lastRoute?.active_provider || enhanced?.provider?.display_name || String(aiCore?.health?.llm_provider ?? "-");
  const activeModelLabel = lastRoute?.active_model || enhanced?.provider?.default_model || String(aiCore?.health?.llm_model ?? "-");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          AI Status
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>AI System Status</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-2">
          {(["overview", "keys", "models", "sessions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded-t ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 text-sm pr-2">
          {activeTab === "overview" && (
            <>
              {/* Last Response */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Last Response</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>requestId: {lastRequestId || "-"}</div>
                  <div>LLM calls: {llmCallCount ?? 0}</div>
                  <div>fallback: {fallbackUsed ? "yes" : "no"}</div>
                  <div>cache: {cacheHit ? "hit" : "miss"}</div>
                </div>
              </div>

              {/* Provider Info */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Active Provider</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>provider: {activeProviderLabel}</div>
                  <div>model: {activeModelLabel}</div>
                  <div>healthy: {aiCore?.healthy ? "yes" : "no"}</div>
                  <div>requestId: {enhanced?.request_id?.slice(0, 8) || aiCore?.request_id?.slice(0, 8) || "-"}</div>
                  <div>key: {lastRoute?.active_key_id || "-"}</div>
                  <div>latency: {lastRoute?.last_latency_ms ? `${lastRoute.last_latency_ms}ms` : "-"}</div>
                </div>

                {providerChain.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    failover chain: {providerChain.join(" -> ")}
                  </p>
                )}

                {(lastRoute?.fallback_path?.length || 0) > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    last route: {lastRoute?.fallback_path?.join(" -> ")}
                  </p>
                )}

                {(lastRoute?.recovered_failures?.length || 0) > 0 && (
                  <p className="mt-2 text-xs text-yellow-400">
                    recovered failures: {lastRoute?.recovered_failures?.length}
                  </p>
                )}

                {!aiCore?.healthy && (
                  <p className="mt-2 text-xs text-destructive">
                    AI Core is unavailable{aiCore?.base_url ? ` (${aiCore.base_url})` : ""}.
                    {aiCore?.health_error ? ` ${aiCore.health_error}` : ""}
                  </p>
                )}
              </div>

              {/* Rate Limiter */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Rate Limiter</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    rpm tokens: {rateLimiter?.minute_tokens_available ?? enhanced?.rate_limiter?.minute_tokens_available ?? "-"}
                  </div>
                  <div>
                    rpd tokens: {rateLimiter?.day_tokens_available ?? enhanced?.rate_limiter?.day_tokens_available ?? "-"}
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">System Stats</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>models: {modelCatalog?.enabled_models ?? modelCatalog?.total_models ?? "-"}</div>
                  <div>providers: {Object.keys(keyPools).length || "-"}</div>
                  <div>sessions: {"total_sessions" in (sessions || {}) ? (sessions as any).total_sessions : "-"}</div>
                  <div>vision: {enhanced?.vision?.tesseract_available ? "yes" : "no"}</div>
                  <div>memory: {enhanced?.memory?.enabled ? "yes" : "no"}</div>
                  <div>free models: {modelCatalog?.free_models ?? "-"}</div>
                </div>
              </div>

              {/* Server Circuit Breaker */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Server Circuit Breaker</p>
                <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(server?.ai_core_client ?? {}, null, 2)}
                </pre>
              </div>
            </>
          )}

          {activeTab === "keys" && (
            <>
              <p className="text-xs text-muted-foreground">
                Key pools with health tracking, rotation, and circuit breaker status.
              </p>
              {Object.keys(keyPools).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No key pools initialized.</p>
              ) : (
                <div className="space-y-2">
                  {Object.values(keyPools).map((pool) => (
                    <KeyPoolCard key={pool.provider} pool={pool} />
                  ))}
                </div>
              )}

              {/* Legacy providers list */}
              {providers.length > 0 && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Provider Configuration</p>
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
                </div>
              )}
            </>
          )}

          {activeTab === "models" && (
            <>
              <p className="text-xs text-muted-foreground">
                Model catalog with {modelCatalog?.total_models ?? 0} models ({modelCatalog?.enabled_models ?? 0} enabled).
              </p>

              {modelCatalog && (
                <div className="space-y-3">
                  {/* By Provider */}
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">By Provider</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(modelCatalog.by_provider || {}).map(([prov, count]) => (
                        <span key={prov} className="px-2 py-1 rounded bg-primary/10 text-primary text-[10px]">
                          {prov}: {count as number}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* By Capability */}
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">By Capability</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(modelCatalog.by_capability || {}).map(([cap, count]) => (
                        <span key={cap} className="px-2 py-1 rounded bg-secondary/10 text-secondary-foreground text-[10px]">
                          {cap}: {count as number}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* By Cost Tier */}
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">By Cost Tier</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(modelCatalog.by_cost_tier || {}).map(([tier, count]) => (
                        <span key={tier} className="px-2 py-1 rounded bg-muted text-muted-foreground text-[10px]">
                          {tier}: {count as number}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">By Reasoning Strength</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(modelCatalog.by_reasoning_strength || {}).map(([tier, count]) => (
                        <span key={tier} className="px-2 py-1 rounded bg-muted text-muted-foreground text-[10px]">
                          {tier}: {count as number}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Special Models */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Vision models: {modelCatalog.vision_models ?? 0}</div>
                    <div>Free models: {modelCatalog.free_models ?? 0}</div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Recent Model Health</p>
                    <div className="space-y-1">
                      {Object.entries(modelHealth).slice(0, 8).map(([modelId, health]) => (
                        <div key={modelId} className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                          <span className="truncate">{modelId}</span>
                          <span>{String((health as any)?.status || "-")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "sessions" && (
            <>
              <p className="text-xs text-muted-foreground">
                Session checkpointing and resumable state for long-running workflows.
              </p>

              {sessions && "total_sessions" in sessions ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Session Stats</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Total sessions: {(sessions as any).total_sessions}</div>
                      <div>Total checkpoints: {(sessions as any).total_checkpoints}</div>
                    </div>
                  </div>

                  {(sessions as any).by_status && Object.keys((sessions as any).by_status).length > 0 && (
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-xs font-semibold text-foreground mb-2">By Status</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries((sessions as any).by_status).map(([status, count]) => (
                          <span
                            key={status}
                            className={`px-2 py-1 rounded text-[10px] ${
                              status === "completed"
                                ? "bg-green-500/20 text-green-400"
                                : status === "in_progress"
                                ? "bg-blue-500/20 text-blue-400"
                                : status === "failed"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status}: {count as number}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : sessions && "error" in sessions ? (
                <p className="text-xs text-destructive">Error: {(sessions as any).error}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">No session data available.</p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => {
              statusQuery.refetch();
              enhancedQuery.refetch();
            }}
            disabled={!open || statusQuery.isFetching || enhancedQuery.isFetching}
          >
            {statusQuery.isFetching || enhancedQuery.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
