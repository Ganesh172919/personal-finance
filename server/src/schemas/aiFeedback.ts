/**
 * @fileoverview Zod schemas for the AI self-improvement loop (feedback capture,
 * admin review queue, and the AI Core learning-registry proxy endpoints).
 *
 * Exported schemas:
 *   agentOutputFeedbackBodySchema - thumbs up/down + optional reason code and capped correction
 *   reviewQueueQuerySchema        - list negative feedback awaiting review (org-scoped, admin)
 *   reviewDecisionBodySchema      - accept / reject a queued feedback item
 *   learningArtifactIdParamSchema - `:id` of a registry artifact (opaque AI Core id)
 *   learningArtifactsQuerySchema  - filters for GET /ai/learning/artifacts
 *   learningReportsQuerySchema    - GET /ai/learning/reports
 *   artifactActionBodySchema      - promote / rollback body (optional audit note)
 *   learningOptimizeBodySchema    - POST /ai/learning/optimize
 *
 * All schemas use .strict() to reject unknown fields.
 */
import { z } from "zod";

import {
  AGENT_FEEDBACK_CORRECTION_MAX,
  AGENT_FEEDBACK_REASON_CODES,
  AGENT_OUTPUT_REVIEW_STATUSES,
} from "../models/agentOutputModel";

// Validates standardized categorical reason codes for AI feedback.
// Leverages predefined agent feedback reason codes from the model layer.
// Ensures user-reported model inaccuracies map to recognized taxonomy terms.
export const feedbackReasonCodeSchema = z.enum(AGENT_FEEDBACK_REASON_CODES);

// Validates incoming HTTP payloads submitting user feedback on AI responses.
// Enforces binary rating choices alongside optional qualitative notes and corrections.
// Rejects extraneous unknown request attributes using strict schema evaluation.
export const agentOutputFeedbackBodySchema = z
  .object({
    rating: z.enum(["up", "down"]),
    note: z.string().trim().max(1000).optional(),
    reasonCode: feedbackReasonCodeSchema.optional(),
    correction: z.string().trim().max(AGENT_FEEDBACK_CORRECTION_MAX).optional(),
  })
  .strict();

// TypeScript type inferred from the agent output feedback request schema.
// Defines structured fields for user ratings, reason codes, and corrections.
// Used across controller handlers to type validated feedback submissions.
export type AgentOutputFeedbackBody = z.infer<typeof agentOutputFeedbackBodySchema>;

// Validates administrative query parameters for browsing queued AI feedback items.
// Supports status filtering, reason code lookups, page limits, and cursor pagination.
// Sanitizes input bounds to ensure consistent admin review queue browsing.
export const reviewQueueQuerySchema = z
  .object({
    status: z.enum(AGENT_OUTPUT_REVIEW_STATUSES).optional().default("pending"),
    reasonCode: feedbackReasonCodeSchema.optional(),
    limit: z.coerce.number().int().positive().max(100).optional().default(25),
    cursor: z.string().trim().max(64).optional(),
  })
  .strict();

// Validates an administrative review decision regarding flagged AI feedback.
// Restricts allowed decision values strictly to accepted or rejected statuses.
// Ensures admin review endpoints receive unambiguous resolution instructions.
export const reviewDecisionBodySchema = z
  .object({
    decision: z.enum(["accepted", "rejected"]),
  })
  .strict();

// AI Core artifact ids are opaque strings (not Mongo ObjectIds).
// Validates route parameters containing an external AI Core learning artifact ID.
// Enforces length constraints and strict alphanumeric regular expression syntax.
// Prevents invalid or malformed artifact identifier strings from querying the proxy.
export const learningArtifactIdParamSchema = z
  .object({
    id: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_.:@+-]+$/, "Invalid artifact id"),
  })
  .strict();

// Validates query parameters used to list and filter AI learning artifacts.
// Restricts queries by artifact functional kind and deployment lifecycle status.
// Enforces strict pattern validation for lowercase artifact classification tags.
export const learningArtifactsQuerySchema = z
  .object({
    kind: z.string().trim().min(1).max(40).regex(/^[a-z_]+$/).optional(),
    status: z.enum(["draft", "shadow", "canary", "active", "retired"]).optional(),
  })
  .strict();

// Validates request query parameters for retrieving AI learning evaluation reports.
// Coerces and constrains integer result count limits up to a maximum of 100 items.
// Provides safe pagination defaults when query parameters are omitted.
export const learningReportsQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
  })
  .strict();

// Express 5 leaves req.body undefined when no body is sent; treat that as `{}`.
// Preprocessing helper that converts undefined HTTP request bodies into empty objects.
// Normalizes Express body-parser edge cases where empty POST requests omit bodies.
// Ensures downstream Zod object schemas can validate default and optional properties.
const emptyBodyAsObject = (value: unknown) => value ?? {};

// Validates request payloads performing lifecycle transitions on learning artifacts.
// Accommodates empty bodies and permits an optional administrative audit note.
// Enforces length bounds to prevent oversized comment strings in audit records.
export const artifactActionBodySchema = z.preprocess(
  emptyBodyAsObject,
  z
    .object({
      note: z.string().trim().max(500).optional(),
    })
    .strict()
);

// Validates request parameters triggering an on-demand AI prompt optimization pass.
// Restricts organizational administrators to self-scoped optimization runs.
// Sanitizes incoming payload structures using strict schema validation.
export const learningOptimizeBodySchema = z.preprocess(
  emptyBodyAsObject,
  z
    .object({
      // Org admins can only optimise their own org; global runs belong to the nightly worker.
      scope: z.literal("org").optional(),
    })
    .strict()
);
