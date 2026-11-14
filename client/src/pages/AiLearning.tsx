/**
 * @fileoverview AI Learning (org admins): artifact registry, eval reports, canary progress,
 * promote / rollback, and the negative-feedback review queue.
 *
 * Promotion honours AI Core's `promotionMode` (from /ai/learning/status):
 *  - "suggest": promotion is disabled; changes are applied by a deployment owner.
 *  - "human": an admin may promote an artifact once it has passed the eval gate.
 *  - "auto_prompts": prompts auto-promote; admins can still promote or roll back manually.
 * The server is the authority: a 409 PROMOTION_SUGGEST_ONLY / GATE_NOT_PASSED is shown as a message.
 *
 * @module pages/AiLearning
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  getFeedbackReviewQueue,
  getLearningStatus,
  learningKeys,
  listLearningArtifacts,
  listLearningReports,
  promoteArtifact,
  reviewFeedbackItem,
  rollbackArtifact,
  runLearningOptimizer,
  type LearningArtifact,
} from "@/lib/api/aiLearning";
import { ApiError } from "@/lib/apiError";

// Extracts user-friendly error messages tailored to AI learning operations.
// Maps specific server error codes like PROMOTION_SUGGEST_ONLY to explanatory prose.
// Falls back to standard error messages or the provided fallback string.
const errorText = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.code === "PROMOTION_SUGGEST_ONLY") {
      return "Promotion is in suggest-only mode. A deployment owner must apply this change.";
    }
    if (error.code === "GATE_NOT_PASSED") return "This artifact has not passed the evaluation gate yet.";
    return error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

// Resolves badge color styling variant based on AI model artifact status.
// Maps active models to default, canary/shadow to secondary, and retired to outline.
// Standardizes status tag visual indicators across learning management tables.
const statusVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "active") return "default";
  if (status === "canary" || status === "shadow") return "secondary";
  if (status === "retired") return "outline";
  return "outline";
};

// Formats an ISO date string into localized date and time representation.
// Safely handles null, undefined, or malformed date inputs with dash fallbacks.
// Renders human-readable timestamps for artifact deployment records.
const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

// Admin dashboard page managing AI model artifacts, evaluation reports, and canary rollouts.
// Supports promoting, rolling back, and reviewing negative feedback queues.
// Gated to organization admins and owners with real-time optimization triggers.
export default function AiLearning() {
  const queryClient = useQueryClient();
  const configQuery = useAppConfig();
  const role = configQuery.data?.org?.role;
  const isAdmin = role === "owner" || role === "admin";
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const statusQuery = useQuery({ queryKey: learningKeys.status, queryFn: getLearningStatus, enabled: isAdmin, retry: false });
  const artifactsQuery = useQuery({
    queryKey: learningKeys.artifacts(),
    queryFn: () => listLearningArtifacts(),
    enabled: isAdmin,
    retry: false,
  });
  const reportsQuery = useQuery({
    queryKey: learningKeys.reports(10),
    queryFn: () => listLearningReports(10),
    enabled: isAdmin,
    retry: false,
  });
  const queueQuery = useQuery({
    queryKey: learningKeys.reviewQueue("pending"),
    queryFn: () => getFeedbackReviewQueue({ status: "pending", limit: 25 }),
    enabled: isAdmin,
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["v1/ai/learning/status"] });
    void queryClient.invalidateQueries({ queryKey: ["v1/ai/learning/artifacts"] });
    void queryClient.invalidateQueries({ queryKey: ["v1/ai/learning/reports"] });
  };

  const artifactMutation = useMutation({
    mutationFn: (input: { id: string; action: "promote" | "rollback" }) =>
      input.action === "promote" ? promoteArtifact(input.id) : rollbackArtifact(input.id),
    onSuccess: (_d, input) => {
      setMessage({ kind: "ok", text: `Artifact ${input.action === "promote" ? "promoted" : "rolled back"}.` });
      refresh();
    },
    onError: (e) => setMessage({ kind: "error", text: errorText(e, "Action failed.") }),
  });

  const optimizeMutation = useMutation({
    mutationFn: runLearningOptimizer,
    onSuccess: (data) => {
      setMessage({ kind: "ok", text: `Optimizer started${data?.jobId ? ` (job ${data.jobId})` : ""}.` });
      refresh();
    },
    onError: (e) => setMessage({ kind: "error", text: errorText(e, "Couldn't start the optimizer.") }),
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; decision: "accepted" | "rejected" }) => reviewFeedbackItem(input.id, input.decision),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v1/agent-outputs/review-queue"] });
    },
    onError: (e) => setMessage({ kind: "error", text: errorText(e, "Review failed.") }),
  });

  if (configQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6" data-testid="ai-learning-denied">
        <h1 className="text-xl font-semibold text-foreground">AI Learning</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page is available to organization admins.</p>
      </div>
    );
  }

  const status = statusQuery.data;
  const mode = status?.promotionMode ?? "human";
  const suggestOnly = mode === "suggest";
  const activeCanary = status?.canary?.active;
  const artifacts = artifactsQuery.data?.items ?? [];
  const reports = reportsQuery.data?.items ?? status?.reports ?? [];
  const queue = queueQuery.data;

  const canPromote = (artifact: LearningArtifact) =>
    !suggestOnly && artifact.status !== "active" && artifact.status !== "retired";
  const canRollback = (artifact: LearningArtifact) => artifact.status === "active" || artifact.status === "canary";

  return (
    <div className="space-y-4 p-6" data-testid="ai-learning-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">AI Learning</h1>
          <p className="text-sm text-muted-foreground">
            Review how prompts and routing are improving, and approve changes.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={optimizeMutation.isPending}
          onClick={() => optimizeMutation.mutate()}
          data-testid="run-optimizer"
        >
          {optimizeMutation.isPending ? "Starting..." : "Run optimizer (this org)"}
        </Button>
      </div>

      {message ? (
        <div
          role={message.kind === "error" ? "alert" : "status"}
          className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
        >
          {message.text}
        </div>
      ) : null}

      {statusQuery.isError ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
          {errorText(statusQuery.error, "AI Core learning service is unavailable.")}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
          <CardDescription>Promotion policy and canary rollout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Promotion mode:</span>
            <Badge variant={suggestOnly ? "outline" : "secondary"} data-testid="promotion-mode">
              {mode}
            </Badge>
            {suggestOnly ? (
              <span className="text-xs text-muted-foreground">
                Suggest-only: promotion is disabled; a deployment owner applies changes.
              </span>
            ) : null}
          </div>
          <div data-testid="canary-progress">
            <span className="text-muted-foreground">Canary: </span>
            {activeCanary ? (
              <span>
                {activeCanary.artifactId ?? activeCanary.id ?? "active"}
                {typeof activeCanary.progress === "number" ? ` - ${Math.round(activeCanary.progress * 100)}% complete` : ""}
                {typeof activeCanary.trafficPct === "number" ? ` - ${activeCanary.trafficPct}% traffic` : ""}
              </span>
            ) : (
              <span>none active</span>
            )}
          </div>
          {(status?.canary?.lastDecisions ?? []).slice(0, 5).map((d, idx) => (
            <div key={idx} className="text-xs text-muted-foreground">
              {d.artifactId ?? "artifact"}: {d.decision ?? "-"}
              {d.reason ? ` - ${d.reason}` : ""} {d.at ? `(${formatDate(d.at)})` : ""}
            </div>
          ))}
          <div className="text-xs text-muted-foreground">Optimizer last run: {formatDate(status?.optimizer?.lastRunAt)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Artifacts</CardTitle>
          <CardDescription>Prompt, routing and policy versions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {artifactsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {!artifactsQuery.isLoading && artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No artifacts yet.</p>
          ) : null}
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
              data-testid={`artifact-${artifact.id}`}
            >
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{artifact.name ?? artifact.kind ?? artifact.id}</span>
                  {artifact.version !== undefined ? (
                    <span className="text-xs text-muted-foreground">v{String(artifact.version)}</span>
                  ) : null}
                  <Badge variant={statusVariant(String(artifact.status))}>{String(artifact.status ?? "unknown")}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {artifact.kind ? `${artifact.kind} - ` : ""}id {artifact.id}
                  {artifact.gate ? ` - gate ${artifact.gate.passed ? "passed" : "not passed"}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!canPromote(artifact) || artifactMutation.isPending}
                  title={suggestOnly ? "Promotion is in suggest-only mode" : undefined}
                  onClick={() => artifactMutation.mutate({ id: artifact.id, action: "promote" })}
                >
                  Promote
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canRollback(artifact) || artifactMutation.isPending}
                  onClick={() => artifactMutation.mutate({ id: artifact.id, action: "rollback" })}
                >
                  Roll back
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Eval reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {reports.length === 0 ? <p className="text-muted-foreground">No reports yet.</p> : null}
          {reports.map((report, idx) => (
            <div key={report.id ?? idx} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-foreground">
                {report.kind ?? "report"} {report.artifactId ? `- ${report.artifactId}` : ""}
              </span>
              <span className="text-muted-foreground">
                {report.passed === undefined ? "" : report.passed ? "passed" : "failed"}
                {typeof report.score === "number" ? ` - score ${report.score}` : ""} {formatDate(report.createdAt)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feedback review queue</CardTitle>
          <CardDescription>
            Thumbs-down feedback awaiting review{queue ? ` (${queue.pending_count} pending)` : ""}. Previews are redacted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {queueQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {queue && queue.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to review.</p> : null}
          {(queue?.items ?? []).map((item) => (
            <div key={item.id} className="space-y-1 rounded-md border border-border p-2 text-sm" data-testid={`review-${item.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {item.reason_code ? <Badge variant="secondary">{item.reason_code}</Badge> : null}
                <span>{item.route ?? "-"}</span>
                {item.prompt_version ? <span>prompt {item.prompt_version}</span> : null}
                {item.model_name ? <span>{item.model_name}</span> : null}
                <span>{formatDate(item.feedback_at)}</span>
              </div>
              <p className="text-foreground">Q: {item.input_preview || "-"}</p>
              <p className="text-muted-foreground">A: {item.response_preview || "-"}</p>
              {item.correction ? <p className="text-foreground">Suggested correction: {item.correction}</p> : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: item.id, decision: "accepted" })}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: item.id, decision: "rejected" })}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
