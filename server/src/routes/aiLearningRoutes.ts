/**
 * @fileoverview AI learning-loop routes: feedback review queue (org admin) and the
 * AI Core artifact registry proxy (admin RBAC, audited). Mounted by aiRoutes (after
 * its JWT gate) so they are served at both /api and /api/v1.
 *
 *   GET  /agent-outputs/review-queue
 *   POST /agent-outputs/:id/review
 *   GET  /ai/learning/status
 *   GET  /ai/learning/artifacts
 *   GET  /ai/learning/reports
 *   POST /ai/learning/optimize
 *   POST /ai/artifacts/:id/promote
 *   POST /ai/artifacts/:id/rollback
 *
 * Must be mounted before aiRoutes' `/agent-outputs/:id` so `review-queue` is not read as an id.
 */
import { Router } from "express";

import {
  getLearningStatus,
  listFeedbackReviewQueue,
  listLearningArtifacts,
  listLearningReports,
  promoteLearningArtifact,
  reviewFeedbackItem,
  rollbackLearningArtifact,
  runLearningOptimizer,
} from "../controllers/aiLearningController";
import { validate } from "../middleware/validate";
import {
  artifactActionBodySchema,
  learningArtifactIdParamSchema,
  learningArtifactsQuerySchema,
  learningOptimizeBodySchema,
  learningReportsQuerySchema,
  reviewDecisionBodySchema,
  reviewQueueQuerySchema,
} from "../schemas/aiFeedback";
import { objectIdSchema } from "../schemas/common";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes Express router instance for continuous AI learning loop routes.
// Manages feedback review queues, artifact promotion, rollbacks, and optimization runs.
// Mounts route handlers protected by upstream JWT auth and Zod schemas.
const router = Router();

// Retrieves queued agent outputs flagged by users for administrative review.
// Validates pagination and status query parameters against reviewQueueQuerySchema.
// Invokes listFeedbackReviewQueue controller returning reviewable artifacts.
router.get("/agent-outputs/review-queue", validate({ query: reviewQueueQuerySchema }), asyncRoute(listFeedbackReviewQueue));

// Submits human reviewer decision on flagged agent output for training signals.
// Validates target artifact ID parameter and reviewDecisionBodySchema choices.
// Calls reviewFeedbackItem controller to commit decision and queue adjustments.
router.post(
  "/agent-outputs/:id/review",
  validate({ params: objectIdSchema, body: reviewDecisionBodySchema }),
  asyncRoute(reviewFeedbackItem)
);

// Fetches active operational status and metrics of continuous learning pipelines.
// Inspects active optimization jobs, pending evaluations, and promotion states.
// Dispatches status inspection via getLearningStatus controller handler.
router.get("/ai/learning/status", asyncRoute(getLearningStatus));

// Queries registered learning artifacts such as prompts, weights, and fine-tuned models.
// Validates query parameters determining artifact type, lineage, and status.
// Invokes listLearningArtifacts controller returning registered artifact metadata.
router.get("/ai/learning/artifacts", validate({ query: learningArtifactsQuerySchema }), asyncRoute(listLearningArtifacts));

// Lists evaluation benchmark reports measuring agent accuracy and performance drift.
// Validates query parameters such as model version and evaluation benchmarks.
// Calls listLearningReports controller returning comparative metrics summaries.
router.get("/ai/learning/reports", validate({ query: learningReportsQuerySchema }), asyncRoute(listLearningReports));

// Initiates an automated prompt optimization or fine-tuning run across feedback data.
// Validates optimization configuration schema against learningOptimizeBodySchema.
// Dispatches optimization worker job via runLearningOptimizer controller.
router.post("/ai/learning/optimize", validate({ body: learningOptimizeBodySchema }), asyncRoute(runLearningOptimizer));

// Promotes an evaluated learning artifact to candidate or active production status.
// Validates artifact ID parameter and promotion authorization in request body.
// Invokes promoteLearningArtifact controller handler to update deployment pointer.
router.post(
  "/ai/artifacts/:id/promote",
  validate({ params: learningArtifactIdParamSchema, body: artifactActionBodySchema }),
  asyncRoute(promoteLearningArtifact)
);

// Rolls back an active production AI artifact to a previous stable revision.
// Validates artifact identifier parameter and rollback reason payload schema.
// Executes rollback operation using rollbackLearningArtifact controller.
router.post(
  "/ai/artifacts/:id/rollback",
  validate({ params: learningArtifactIdParamSchema, body: artifactActionBodySchema }),
  asyncRoute(rollbackLearningArtifact)
);

// Exports configured AI learning routes as default module router export.
// Mounts into parent AI router before parameterized artifact output paths.
// Exposes complete REST interface for continuous AI model alignment and review.
export default router;
