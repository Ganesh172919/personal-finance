/**
 * @fileoverview AI learning-loop admin API (org admins only).
 *
 * Wraps the gateway endpoints that proxy AI Core's artifact registry and expose the
 * org-scoped feedback review queue. Promotion honours the AI Core `promotionMode`
 * (`suggest` = humans apply changes out-of-band, the server answers 409
 * PROMOTION_SUGGEST_ONLY; `human` = promote allowed once the eval gate passes).
 *
 * @module lib/api/aiLearning
 */
import { apiClient } from "./core";

// Enumerates deployment lifecycle stages for self-improving prompt and agent artifacts.
// Tracks items moving through draft, shadow testing, canary rollout, active, and retirement.
// Enforces structured staging boundaries before promoting learned weights or system prompts.
export type ArtifactStatus = "draft" | "shadow" | "canary" | "active" | "retired";

// Represents a versioned optimization artifact produced by the continuous learning engine.
// Holds evaluation gate criteria, performance score metrics, promotion notes, and status.
// Serves as the primary entity inspected by administrators before promoting updates.
export type LearningArtifact = {
  id: string;
  kind?: string;
  name?: string;
  version?: string | number;
  status?: ArtifactStatus | string;
  createdAt?: string;
  promotedAt?: string;
  note?: string;
  gate?: { passed?: boolean; reasons?: string[] } | null;
  metrics?: Record<string, number | string | null> | null;
  [key: string]: unknown;
};

// Models an offline evaluation report measuring candidate artifact performance.
// Captures quantitative benchmark scores, pass/fail thresholds, and summary rationales.
// Supplies evidence for automated gating checks prior to initiating canary rollouts.
export type LearningReport = {
  id?: string;
  kind?: string;
  artifactId?: string;
  createdAt?: string;
  passed?: boolean;
  score?: number | null;
  summary?: string;
  [key: string]: unknown;
};

// Records automated routing decisions made during canary traffic evaluation periods.
// Documents decision outcomes, rationale explanations, timestamps, and target artifacts.
// Preserves historical audit records of traffic shift adjustments and rollbacks.
export type CanaryDecision = {
  artifactId?: string;
  decision?: string;
  reason?: string;
  at?: string;
  [key: string]: unknown;
};

// Encapsulates comprehensive operational status for the AI continuous learning loop.
// Combines active canary deployments, recent evaluation reports, and optimizer runs.
// Powers administrative learning loop dashboards and system promotion controls.
export type LearningStatus = {
  promotionMode?: string;
  canary?: {
    active?: { artifactId?: string; id?: string; progress?: number; trafficPct?: number; startedAt?: string } | null;
    lastDecisions?: CanaryDecision[];
  };
  reports?: LearningReport[];
  optimizer?: { lastRunAt?: string | null; lastCandidates?: unknown[] | number | null };
  request_id?: string;
};

// Models a user-submitted feedback entry queued for human administrative review.
// Carries rating thumbs, prompt versions, model identifiers, and prompt-response previews.
// Enables human-in-the-loop validation of agent outputs to drive model improvements.
export type ReviewQueueItem = {
  id: string;
  feedback_at: string | null;
  rating: "up" | "down" | null;
  reason_code: string | null;
  correction: string | null;
  review_status: "pending" | "accepted" | "rejected" | null;
  route: string | null;
  agent_name: string | null;
  prompt_version: string | null;
  routing_version: string | null;
  model_name: string | null;
  provider: string | null;
  cache_hit: boolean | null;
  fallback_used: boolean;
  input_preview: string;
  response_preview: string;
};

// Represents the paginated feedback review queue response returned to admins.
// Supplies the list of queued review items alongside pagination cursors and counters.
// Powers infinite scrolling and status filtering within the feedback curation UI.
export type ReviewQueueResponse = {
  items: ReviewQueueItem[];
  next_cursor: string | null;
  pending_count: number;
};

// Query key factories for TanStack React Query caching of learning loop data.
// Generates standardized query cache keys for learning status, artifacts, and queues.
// Enables targeted query invalidation when artifacts are promoted or reviewed.
export const learningKeys = {
  status: ["v1/ai/learning/status"] as const,
  artifacts: (kind?: string, status?: string) => ["v1/ai/learning/artifacts", kind ?? "", status ?? ""] as const,
  reports: (limit?: number) => ["v1/ai/learning/reports", limit ?? 20] as const,
  reviewQueue: (status: string) => ["v1/agent-outputs/review-queue", status] as const,
};

// Serializes an object dictionary of optional query arguments into a URL query string.
// Omits undefined or empty parameters while properly encoding present key-value pairs.
// Prepend question marks when parameters exist or returns an empty string fallback.
const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

// Queries top-level health, promotion modes, and canary stats for the learning loop.
// Retrieves the active promotion mode and recent automated evaluation milestones.
// Informs administrative overview panels tracking agent evolution workflows.
export async function getLearningStatus(): Promise<LearningStatus> {
  return apiClient("/ai/learning/status");
}

// Fetches registered learning artifacts filtered by functional kind and rollout status.
// Supports discovery of candidate prompt templates, routing policies, and classifiers.
// Renders artifact management inventory tables within the administrator console.
export async function listLearningArtifacts(params: { kind?: string; status?: string } = {}): Promise<{ items: LearningArtifact[] }> {
  return apiClient(`/ai/learning/artifacts${qs(params)}`);
}

// Retrieves recent offline evaluation and benchmark reports up to a specified limit.
// Returns evaluation scores, test dates, and pass/fail gate conclusions.
// Enables inspection of model performance trends across successive iterations.
export async function listLearningReports(limit = 20): Promise<{ items: LearningReport[] }> {
  return apiClient(`/ai/learning/reports${qs({ limit })}`);
}

// Requests promotion of an evaluation-cleared artifact to the next deployment tier.
// Transmits optional reviewer notes and enforces server-side promotion safety gates.
// Advances approved prompt templates or model candidates into active traffic stages.
export async function promoteArtifact(id: string, note?: string): Promise<LearningArtifact> {
  return apiClient(`/ai/artifacts/${encodeURIComponent(id)}/promote`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

// Immediately rolls back a promoted artifact to its previous baseline version.
// Dispatches an administrative rollback instruction accompanied by incident notes.
// Mitigates unexpected regressions detected during active or canary traffic routing.
export async function rollbackArtifact(id: string, note?: string): Promise<LearningArtifact> {
  return apiClient(`/ai/artifacts/${encodeURIComponent(id)}/rollback`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

// Triggers an asynchronous optimization cycle to synthesize candidate enhancements.
// Initiates automated prompt refinement jobs based on curated feedback queue datasets.
// Returns an asynchronous background job identifier to track optimization progress.
export async function runLearningOptimizer(): Promise<{ jobId?: string }> {
  return apiClient("/ai/learning/optimize", { method: "POST", body: JSON.stringify({}) });
}

// Fetches user feedback items awaiting administrative approval or rejection.
// Supports status filtering by pending, accepted, or rejected review states.
// Supplies human curators the records needed to assemble verified tuning datasets.
export async function getFeedbackReviewQueue(
  params: { status?: "pending" | "accepted" | "rejected"; limit?: number; cursor?: string } = {}
): Promise<ReviewQueueResponse> {
  return apiClient(`/agent-outputs/review-queue${qs(params)}`);
}

// Records an administrator's review decision for a specific user feedback submission.
// Flags items as accepted for fine-tuning inclusion or rejected as irrelevant.
// Advances curated items into the high-confidence learning loop evaluation pool.
export async function reviewFeedbackItem(id: string, decision: "accepted" | "rejected"): Promise<{ item: ReviewQueueItem }> {
  return apiClient(`/agent-outputs/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}
