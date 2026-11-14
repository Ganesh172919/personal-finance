/**
 * @fileoverview AI learning-loop admin endpoints (org admins only).
 *
 * Review queue (gateway-owned, org-scoped, modelled on the transaction review queue):
 *   GET  /api/v1/agent-outputs/review-queue      - negative feedback awaiting review, with corrections
 *   POST /api/v1/agent-outputs/:id/review        - accept / reject a queued item
 *
 * AI Core registry proxy (admin RBAC, audited; AI Core enforces AI_PROMOTION_MODE and the eval gate):
 *   GET  /api/v1/ai/learning/status
 *   GET  /api/v1/ai/learning/artifacts
 *   GET  /api/v1/ai/learning/reports
 *   POST /api/v1/ai/artifacts/:id/promote
 *   POST /api/v1/ai/artifacts/:id/rollback
 *   POST /api/v1/ai/learning/optimize
 *
 * Every proxied call carries X-Internal-Org-Id / X-Internal-User-Id / X-Internal-Role: admin.
 * AI Core 409 PROMOTION_SUGGEST_ONLY / GATE_NOT_PASSED surface as clean 409s.
 *
 * @module controllers/aiLearningController
 */
import type { Request, Response } from "express";
import mongoose from "mongoose";

import { HttpError } from "../middleware/httpError";
import AgentOutputModel from "../models/agentOutputModel";
import type { IUserDocument } from "../models/userModel";
import { recordAuditEvent } from "../services/auditLog";
import { callAiCore, redactFreeText } from "../services/aiLearningClient";
import {
  learningArtifactsQuerySchema,
  learningReportsQuerySchema,
  reviewQueueQuerySchema,
} from "../schemas/aiFeedback";

const ADMIN_PROXY_TIMEOUT_MS = 15_000;

const roleRank: Record<string, number> = { member: 1, admin: 2, owner: 3 };

// Validates that the active request originated from an authenticated organization administrator.
// Checks organization tenant context and enforces minimum administrative role ranking.
// Returns resolved organization and user identifiers or raises appropriate HTTP errors.
const requireOrgAdmin = (req: Request) => {
  if (!req.org) throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  if ((roleRank[req.org.role] ?? 0) < roleRank.admin) {
    throw new HttpError(403, "ORG_ACCESS_DENIED", "Admin role required");
  }
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required");
  return { orgId: String(req.org.orgId), userId: String(user._id), user };
};

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

// Transforms an AgentOutput database document into a sanitized feedback review queue item.
// Redacts sensitive raw input prompts and AI responses to protect tenant privacy.
// Maps model attribution, prompt versions, and human correction data for administrative review.
const toReviewItem = (doc: any) => ({
  id: String(doc._id),
  feedback_at: doc.feedback?.createdAt || doc.updatedAt || doc.createdAt || null,
  rating: doc.feedback?.rating || null,
  reason_code: doc.feedback?.reasonCode || null,
  correction: doc.feedback?.correction || null,
  review_status: doc.reviewStatus || null,
  reviewed_at: doc.reviewedAt || null,
  route: doc.analysis_type || doc.agentType || null,
  agent_name: doc.agentName || doc.agentType || null,
  prompt_version: doc.promptVersion || null,
  routing_version: doc.routingVersion || null,
  model_name: doc.modelName || doc.active_model || null,
  provider: doc.provider || doc.active_provider || null,
  cache_hit: typeof doc.cacheHit === "boolean" ? doc.cacheHit : null,
  fallback_used: Boolean(doc.fallback_used),
  // Redacted previews only: an org admin reviews quality, not another member's raw data.
  input_preview: redactFreeText(doc.userInput, 200),
  response_preview: redactFreeText(doc.outputData?.response, 300),
});

// Lists queued negative feedback items awaiting administrative evaluation within an organization.
// Supports cursor-based pagination and filtering by review status and specific feedback reason codes.
// Returns redacted prompt previews, human corrections, and total pending item counts.
export const listFeedbackReviewQueue = async (req: Request, res: Response) => {
  const { orgId } = requireOrgAdmin(req);
  // Express 5 exposes req.query as a getter, so validate() cannot replace it; parse here to get defaults/coercion.
  const query = reviewQueueQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = {
    orgId: new mongoose.Types.ObjectId(orgId),
    "feedback.rating": "down",
    reviewStatus: query.status,
  };
  if (query.reasonCode) filter["feedback.reasonCode"] = query.reasonCode;
  if (query.cursor) {
    if (!mongoose.Types.ObjectId.isValid(query.cursor)) {
      throw new HttpError(400, "INVALID_CURSOR", "Invalid cursor");
    }
    filter._id = { $lt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const docs = await AgentOutputModel.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .select({
      userInput: 1, "outputData.response": 1, analysis_type: 1, agentType: 1, agentName: 1, promptVersion: 1,
      routingVersion: 1, modelName: 1, provider: 1, cacheHit: 1, fallback_used: 1, feedback: 1, reviewStatus: 1,
      reviewedAt: 1, createdAt: 1, updatedAt: 1, active_model: 1, active_provider: 1,
    })
    .lean();

  const hasMore = docs.length > query.limit;
  const page = hasMore ? docs.slice(0, query.limit) : docs;
  const pendingCount = await AgentOutputModel.countDocuments({
    orgId: new mongoose.Types.ObjectId(orgId),
    "feedback.rating": "down",
    reviewStatus: "pending",
  });

  return res.json({
    items: page.map(toReviewItem),
    next_cursor: hasMore ? String((page[page.length - 1] as any)._id) : null,
    pending_count: pendingCount,
    request_id: req.requestId,
  });
};

// Records an administrative decision accepting or rejecting queued AI feedback items.
// Updates review statuses and records reviewer attribution timestamps on the agent output.
// Emits an immutable audit log event capturing the administrative review action.
export const reviewFeedbackItem = async (req: Request, res: Response) => {
  const { orgId, user } = requireOrgAdmin(req);
  const { id } = req.params as { id: string };
  const { decision } = req.body as { decision: "accepted" | "rejected" };

  const updated = await AgentOutputModel.findOneAndUpdate(
    { _id: id, orgId: new mongoose.Types.ObjectId(orgId), "feedback.rating": "down" },
    { $set: { reviewStatus: decision, reviewedAt: new Date(), reviewedBy: user._id } },
    { new: true }
  ).lean();

  if (!updated) throw new HttpError(404, "NOT_FOUND", "Feedback item not found");

  await recordAuditEvent({
    orgId: new mongoose.Types.ObjectId(orgId),
    actorType: "user",
    actorUserId: user._id,
    action: "ai_feedback_reviewed",
    targetType: "agent_output",
    targetId: id,
    requestId: req.requestId,
    metadata: { decision, reasonCode: (updated as any).feedback?.reasonCode },
  });

  return res.json({ item: toReviewItem(updated), request_id: req.requestId });
};

// ---------------------------------------------------------------------------
// AI Core registry proxy
// ---------------------------------------------------------------------------

type UpstreamResult = { status: number; data: any };

// Extracts a standardized error code string from upstream AI Core service responses.
// Inspects top-level code properties as well as nested error detail structures.
// Supplies fallback code identifiers when upstream error payloads omit explicit codes.
const upstreamCode = (data: any): string | undefined => {
  const code = data?.code ?? data?.detail?.code;
  return typeof code === "string" ? code : undefined;
};

// Resolves descriptive human-readable error messages from upstream AI Core error responses.
// Safely inspects various error envelope shapes including detail strings and message objects.
// Returns a provided fallback description if the upstream service returns empty details.
const upstreamMessage = (data: any, fallback: string): string => {
  const detail = data?.message ?? data?.detail?.message ?? data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
};

// Maps upstream AI Core response status codes into sanitized client HTTP gateway responses.
// Translates evaluation gate failures and suggest-only promotion modes into HTTP 409 responses.
// Protects internal service architecture details while returning clean client errors.
/** Sends an upstream result to the client, mapping AI Core errors to clean gateway errors. */
const respondFromUpstream = (req: Request, res: Response, result: UpstreamResult) => {
  const { status, data } = result;
  if (status >= 200 && status < 300) {
    const body = data && typeof data === "object" && !Array.isArray(data) ? data : { data };
    return res.status(status === 202 ? 202 : 200).json({ ...body, request_id: req.requestId });
  }
  if (status === 409) {
    const code = upstreamCode(data) ?? "CONFLICT";
    const fallback =
      code === "PROMOTION_SUGGEST_ONLY"
        ? "Promotion is in suggest-only mode; changes must be applied by a deployment owner."
        : code === "GATE_NOT_PASSED"
          ? "The artifact has not passed the evaluation gate."
          : "Conflict";
    return res.status(409).json({ message: upstreamMessage(data, fallback), code, request_id: req.requestId });
  }
  if (status === 404) {
    return res.status(404).json({
      message: upstreamMessage(data, "Not found"),
      code: upstreamCode(data) ?? "AI_LEARNING_NOT_FOUND",
      request_id: req.requestId,
    });
  }
  if (status === 400 || status === 422) {
    return res.status(400).json({
      message: upstreamMessage(data, "Invalid request"),
      code: upstreamCode(data) ?? "INVALID_REQUEST",
      request_id: req.requestId,
    });
  }
  // 401/403/5xx from AI Core are gateway-to-core problems, not the caller's.
  return res.status(502).json({
    message: "AI Core learning service returned an error",
    code: "AI_CORE_UNAVAILABLE",
    request_id: req.requestId,
  });
};

// Proxies administrative requests to the internal AI Core service with timeout controls.
// Injects authenticated organization, user, and administrative security headers into calls.
// Invokes optional audit logging hooks before delivering mapped HTTP responses to the client.
const proxyToAiCore = async (
  req: Request,
  res: Response,
  call: Parameters<typeof callAiCore>[0],
  actor: { orgId: string; userId: string },
  audit?: (result: UpstreamResult | null) => Promise<void>
) => {
  let result: UpstreamResult;
  try {
    result = await callAiCore(
      { ...call, timeoutMs: ADMIN_PROXY_TIMEOUT_MS },
      { requestId: req.requestId, orgId: actor.orgId, userId: actor.userId, admin: true }
    );
  } catch {
    if (audit) await audit(null);
    res.status(502).json({
      message: "AI Core learning service unreachable",
      code: "AI_CORE_UNAVAILABLE",
      request_id: req.requestId,
    });
    return null;
  }
  if (audit) await audit(result);
  respondFromUpstream(req, res, result);
  return result;
};

// Retrieves current operational status and evaluation statistics for the AI learning loop.
// Proxies query requests to AI Core to inspect active prompt versions and optimizer metrics.
// Restricted strictly to organization administrators via tenant RBAC validation.
export const getLearningStatus = async (req: Request, res: Response) => {
  const actor = requireOrgAdmin(req);
  await proxyToAiCore(req, res, { method: "GET", path: "/api/learning/status" }, actor);
};

// Lists candidate and promoted prompt or routing artifacts from the learning loop registry.
// Supports filtering by artifact kind and promotion status via validated query schemas.
// Allows administrators to track active prompt engineering iterations across models.
export const listLearningArtifacts = async (req: Request, res: Response) => {
  const actor = requireOrgAdmin(req);
  const { kind, status } = learningArtifactsQuerySchema.parse(req.query);
  await proxyToAiCore(req, res, { method: "GET", path: "/api/learning/artifacts", query: { kind, status } }, actor);
};

// Fetches historical evaluation and optimizer run reports from the AI Core service.
// Returns benchmark accuracy metrics, regression comparisons, and optimization summaries.
// Supplies administrators with empirical performance data to guide model promotion decisions.
export const listLearningReports = async (req: Request, res: Response) => {
  const actor = requireOrgAdmin(req);
  const { limit } = learningReportsQuerySchema.parse(req.query);
  await proxyToAiCore(req, res, { method: "GET", path: "/api/learning/reports", query: { limit } }, actor);
};

// Factory generating HTTP handlers for artifact promotion and rollback operations.
// Dispatches state change commands to AI Core while enforcing evaluation gate rules.
// Emits detailed audit log entries capturing administrator actions, notes, and outcomes.
const artifactAction = (action: "promote" | "rollback") => async (req: Request, res: Response) => {
  const actor = requireOrgAdmin(req);
  const { id } = req.params as { id: string };
  const { note } = (req.body || {}) as { note?: string };

  await proxyToAiCore(
    req,
    res,
    {
      method: "POST",
      path: `/api/learning/artifacts/${encodeURIComponent(id)}/${action}`,
      body: { actorUserId: actor.userId, ...(note ? { note } : {}) },
    },
    actor,
    // Commit the audit before returning success or a refusal to the caller.
    (result) => recordAuditEvent({
      orgId: new mongoose.Types.ObjectId(actor.orgId),
      actorType: "user",
      actorUserId: actor.user._id,
      action: `ai_artifact_${action}`,
      targetType: "ai_artifact",
      targetId: id,
      requestId: req.requestId,
      metadata: {
        note,
        upstreamStatus: result?.status ?? null,
        code: result && result.status >= 400 ? upstreamCode(result.data) ?? null : null,
      },
    }).then(() => undefined)
  );
};

// Promotes an evaluated AI learning artifact to active production status.
// Enforces promotion gate evaluation checks and verifies suggest-only configuration modes.
// Records an audited administrative promotion event upon successful deployment.
export const promoteLearningArtifact = artifactAction("promote");

// Reverts a promoted AI learning artifact back to a previously stable version.
// Dispatches immediate rollback instructions to AI Core to mitigate prompt regressions.
// Logs an immutable audit trace capturing rollback reasons and target identifiers.
export const rollbackLearningArtifact = artifactAction("rollback");

// Triggers an asynchronous optimization cycle across organization feedback datasets.
// Dispatches training jobs to evaluate corrections and generate candidate prompt artifacts.
// Records audit events documenting optimizer execution requests and assigned job IDs.
export const runLearningOptimizer = async (req: Request, res: Response) => {
  const actor = requireOrgAdmin(req);
  await proxyToAiCore(
    req,
    res,
    { method: "POST", path: "/api/learning/optimize/run", body: { scope: "org" } },
    actor,
    (result) => recordAuditEvent({
      orgId: new mongoose.Types.ObjectId(actor.orgId),
      actorType: "user",
      actorUserId: actor.user._id,
      action: "ai_optimize_run",
      targetType: "ai_learning",
      requestId: req.requestId,
      metadata: { upstreamStatus: result?.status ?? null, jobId: result?.data?.jobId ?? null },
    }).then(() => undefined)
  );
};
