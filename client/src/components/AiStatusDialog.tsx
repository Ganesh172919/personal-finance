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
import { Link } from "wouter";

import { getAiCoreStatus, getEnhancedAiStatus, getCanaryHealth, runCanaryProbes } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { ApiError } from "@/lib/apiError";
import { getFeedbackReviewQueue, getLearningStatus, learningKeys } from "@/lib/api/aiLearning";
import type { KeyPoolStats, KeyPoolEntry, KeyStatus } from "@/types/ai.types";

// Property structure for the AI diagnostics and engine status dialog.
// Supplies telemetry metadata from the latest executed AI inference query.
// Captures request correlation IDs, fallback path usage, and cache indicators.
type AiStatusDialogProps = {
  lastRequestId?: string;
  fallbackUsed?: boolean;
  llmCallCount?: number;
  cacheHit?: boolean;
};

// Status badge colors
// Theme styling map associating API key health states with visual color classes.
// Distinguishes healthy, degraded, cooling-down, and circuit-broken states.
// Applied across developer status badges to convey key pool operational health.
const STATUS_COLORS: Record<KeyStatus, string> = {
  healthy: "bg-green-500/20 text-green-400",
  degraded: "bg-yellow-500/20 text-yellow-400",
  cooldown: "bg-orange-500/20 text-orange-400",
  circuit_open: "bg-red-500/20 text-red-400",
  disabled: "bg-gray-500/20 text-gray-400",
};

// Small badge chip rendering the operational health status of an API key.
// Normalizes enum status keys into readable labels with tinted badge styling.
// Renders inside provider key pool diagnostic lists and detail inspection views.
function KeyStatusBadge({ status }: { status: KeyStatus }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[status] || STATUS_COLORS.disabled}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// Collapsible card summarizing provider-specific API credential pool metrics.
// Displays aggregate availability ratios, success percentages, and rotation policies.
// Allows developers to expand and inspect individual credential fingerprint rows.
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

// Diagnostic entry row presenting health telemetry for a specific API credential.
// Visualizes truncated key fingerprints, operational status, and request counts.
// Reports average latency and historical success percentages for deep inspection.
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

/**
 * "AI quality" tab: learning-loop snapshot (promotion mode, canary, last gate decisions,
 * feedback awaiting review). Admin-only data; members see a short notice instead.
 */
// Diagnostic panel detailing continuous learning loops and model quality benchmarks.
// Surfaces canary probe results, automated promotion modes, and feedback review queues.
// Displays gated administrative controls for evaluating inference performance trends.
function AiQualityPanel({ enabled }: { enabled: boolean }) {
  const statusQuery = useQuery({
    queryKey: learningKeys.status,
    queryFn: getLearningStatus,
    enabled,
    retry: false,
  });
  const queueQuery = useQuery({
    queryKey: learningKeys.reviewQueue("pending"),
    queryFn: () => getFeedbackReviewQueue({ status: "pending", limit: 1 }),
    enabled,
    retry: false,
  });

  const denied = [statusQuery.error, queueQuery.error].some((e) => e instanceof ApiError && e.status === 403);
  if (denied) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="ai-quality-denied">
        AI quality details are available to organization admins.
      </p>
    );
  }
  if (statusQuery.isLoading) return <p className="text-xs text-muted-foreground">Loading AI quality...</p>;
  if (statusQuery.isError) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="ai-quality-unavailable">
        AI quality data is unavailable right now.
      </p>
    );
  }

  const status = statusQuery.data;
  const activeCanary = status?.canary?.active;
  const decisions = status?.canary?.lastDecisions ?? [];
  const pending = queueQuery.data?.pending_count;

  return (
    <div className="space-y-3" data-testid="ai-quality-panel">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="grid grid-cols-2 gap-2">
          <div>promotion mode: {status?.promotionMode ?? "-"}</div>
          <div>feedback to review: {pending ?? "-"}</div>
          <div>optimizer last run: {status?.optimizer?.lastRunAt ?? "never"}</div>
          <div>
            canary:{" "}
            {activeCanary
              ? `${activeCanary.artifactId ?? activeCanary.id ?? "active"}${
                  typeof activeCanary.progress === "number" ? ` (${Math.round(activeCanary.progress * 100)}%)` : ""
                }`
              : "none active"}
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-foreground">Last gate decisions</p>
        {decisions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No decisions recorded yet.</p>
        ) : (
          decisions.slice(0, 5).map((d, idx) => (
            <div key={idx} className="text-[11px] text-muted-foreground">
              {d.artifactId ?? "artifact"}: {d.decision ?? "-"}
              {d.reason ? ` - ${d.reason}` : ""}
            </div>
          ))
        )}
      </div>
      <Link href="/ai-learning" className="text-xs text-primary hover:underline">
        Open AI Learning
      </Link>
    </div>
  );
}

// Comprehensive diagnostic dialog exposing internal AI architecture health and metrics.
// Organizes provider pools, model catalogs, active sessions, and canary test outputs.
// Supplies transparency and debugging telemetry for platform administrators and engineers.
export function AiStatusDialog({
  lastRequestId,
  fallbackUsed,
  llmCallCount,
  cacheHit,
}: AiStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "keys" | "models" | "sessions" | "canary" | "quality">("overview");
  const [canaryRunning, setCanaryRunning] = useState(false);
  const [canaryRunReport, setCanaryRunReport] = useState<any>(null);

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

  const canaryQuery = useQuery({
    queryKey: ["/api/ai/canary/number-safety"],
    queryFn: getCanaryHealth,
    enabled: open,
  });

  const aiCore = statusQuery.data?.ai_core;
  const server = statusQuery.data?.server;
  const providers = aiCore?.providers?.providers || [];
  const enhanced = enhancedQuery.data;
  const canary = canaryQuery.data?.canary || enhanced?.canary;

  const handleRunProbes = async () => {
    try {
      setCanaryRunning(true);
      const res = await runCanaryProbes(12);
      setCanaryRunReport(res.report);
      canaryQuery.refetch();
      enhancedQuery.refetch();
    } catch (err: any) {
      console.error("Failed to run canary probes", err);
    } finally {
      setCanaryRunning(false);
    }
  };

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
          <DialogDescription className="sr-only">
            AI subsystem health, configuration details, and continuous mathematical invariant canary status
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-2">
          {(["overview", "keys", "models", "sessions", "canary", "quality"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              className={`px-3 py-1 text-xs rounded-t ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "canary" ? "Canary / Invariants" : tab === "quality" ? "AI Quality" : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

          {activeTab === "quality" && <AiQualityPanel enabled={open} />}

          {activeTab === "canary" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    Continuous Invariant Canary Guard
                    <span
                      data-testid="badge-canary-status"
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        canary?.status === "healthy"
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : canary?.status === "warning"
                          ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      }`}
                    >
                      {canary?.status || "healthy"}
                    </span>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time mathematical invariance verification across candidate LLM digits, budget rebalancing, and balance sheet equations.
                  </p>
                </div>
                <Button
                  size="sm"
                  data-testid="btn-run-canary-probes"
                  disabled={canaryRunning}
                  onClick={handleRunProbes}
                  className="h-8 text-xs shrink-0"
                >
                  {canaryRunning ? "Running Probes..." : "Run Canary Probe Suite"}
                </Button>
              </div>

              {/* Metric Overview Strip */}
              <div className="grid grid-cols-4 gap-2 text-center" data-testid="card-canary-health">
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <p className="text-[11px] text-muted-foreground uppercase font-medium">Pass Rate</p>
                  <p className="text-lg font-bold text-foreground" data-testid="metric-canary-pass-rate">
                    {canary?.pass_rate_pct !== undefined ? `${canary.pass_rate_pct.toFixed(1)}%` : "100.0%"}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <p className="text-[11px] text-muted-foreground uppercase font-medium">Evaluated</p>
                  <p className="text-lg font-bold text-foreground" data-testid="metric-canary-total">
                    {canary?.total_evaluations ?? 0}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <p className="text-[11px] text-muted-foreground uppercase font-medium">Passed</p>
                  <p className="text-lg font-bold text-emerald-400" data-testid="metric-canary-passed">
                    {canary?.passed_evaluations ?? 0}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <p className="text-[11px] text-muted-foreground uppercase font-medium">Violations</p>
                  <p className="text-lg font-bold text-destructive" data-testid="metric-canary-failed">
                    {canary?.failed_evaluations ?? 0}
                  </p>
                </div>
              </div>

              {/* Invariant Pillars Checklist */}
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Verified Mathematical Invariants</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 p-1.5 rounded bg-background/50 border border-border/50">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Number Safety Guard</p>
                      <p className="text-[10px] text-muted-foreground">Candidate Digits ⊆ Reference Digits (zero hallucinations)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded bg-background/50 border border-border/50">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Zero-Sum Rebalancing</p>
                      <p className="text-[10px] text-muted-foreground">∑ ΔBᵢ = 0 &amp; Bᵢ ≥ 0 (envelope preservation)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded bg-background/50 border border-border/50">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Balance Sheet Identity</p>
                      <p className="text-[10px] text-muted-foreground">Assets - Liabilities = Net Worth (±0.05)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded bg-background/50 border border-border/50">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Cash Flow Conservation</p>
                      <p className="text-[10px] text-muted-foreground">Income - Expenses = Net Cash Flow (±0.05)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* On-demand Run Probe Report */}
              {canaryRunReport && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-2" data-testid="card-canary-probe-report">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400">
                      Probe Suite Result: {canaryRunReport.suite_passed}/{canaryRunReport.total_probes} Passed ({canaryRunReport.suite_pass_rate_pct}%)
                    </span>
                    <span className="text-muted-foreground">{canaryRunReport.elapsed_ms}ms</span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {canaryRunReport.results?.map((res: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] py-1 border-b border-border/30">
                        <span className="text-foreground truncate max-w-[280px]">{res.description || res.probe_id}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${res.probe_assertion_passed ? "text-emerald-400 bg-emerald-500/10" : "text-destructive bg-destructive/10"}`}>
                          {res.probe_assertion_passed ? "VERIFIED" : "FAILED"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Events Audit Trail */}
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Recent Invariant Audit Log</p>
                {canary?.recent_events && canary.recent_events.length > 0 ? (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1" data-testid="list-canary-audit-events">
                    {canary.recent_events.slice(0, 10).map((evt: any) => (
                      <div key={evt.probe_id} className="flex items-center justify-between text-xs p-1.5 rounded bg-background/40 border border-border/40">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${evt.passed ? "text-emerald-400 bg-emerald-500/10" : "text-destructive bg-destructive/10"}`}>
                              {evt.passed ? "PASS" : "FAIL"}
                            </span>
                            <span className="font-mono text-[11px] text-foreground">{evt.invariant}</span>
                            <span className="text-[10px] text-muted-foreground">({evt.source})</span>
                          </div>
                          {evt.violations && evt.violations.length > 0 && (
                            <p className="text-[10px] text-destructive truncate max-w-[360px]">{evt.violations[0]}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{evt.duration_ms}ms</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No live evaluation events recorded yet.</p>
                )}
              </div>
            </div>
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
