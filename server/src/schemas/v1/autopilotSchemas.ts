/**
 * @fileoverview Zod validation schemas for the autopilot (AI-driven automation) feature.
 *
 * Exported schemas:
 *   autopilotPlanBodySchema     - Validates creating an autopilot plan from a natural-language goal
 *   autopilotRunIdBodySchema    - Validates referencing an autopilot run by ID
 *   autopilotApproveBodySchema  - Validates approving tool calls in an autopilot run
 *
 * Used by: v1Routes (POST /autopilot/plan, /simulate, /approve, /execute)
 *
 * Key validation rules:
 *   - goal: required, 1-4000 chars (the user's financial goal in natural language)
 *   - run_id: required, must be a valid 24-char hex ObjectId
 *   - Approve body: must provide either approve_all=true or a non-empty tool_call_ids array
 *     (enforced by .superRefine cross-field validation)
 *   - tool_call_ids: max 200 items, each 4-128 chars
 *   - options.narrative: optional boolean for AI response style
 */
import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

// Validates request payloads initiating an autonomous AI financial planning run.
// Accepts natural language user goals bounded between 1 and 4000 characters.
// Supports optional narrative flags controlling formatting verbosity in responses.
export const autopilotPlanBodySchema = z
  .object({
    goal: z.string().trim().min(1).max(4000),
    options: z
      .object({
        narrative: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// Validates request payloads referencing an active autopilot execution run.
// Enforces standard 24-character hexadecimal MongoDB ObjectId string syntax.
// Ensures consistent run identifier validation across execution and simulation steps.
export const autopilotRunIdBodySchema = z
  .object({
    run_id: z.string().regex(objectIdRegex, "Invalid run_id"),
  })
  .strict();

// Validates user approval payloads authorizing proposed autopilot tool calls.
// Requires either an explicit approve_all flag or a non-empty array of tool call IDs.
// Enforces cross-field constraints using superRefine to prevent ambiguous approvals.
export const autopilotApproveBodySchema = z
  .object({
    run_id: z.string().regex(objectIdRegex, "Invalid run_id"),
    approve_all: z.boolean().optional(),
    tool_call_ids: z.array(z.string().trim().min(4).max(128)).max(200).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasIds = Array.isArray(value.tool_call_ids) && value.tool_call_ids.length > 0;
    const approveAll = Boolean(value.approve_all);
    if (!hasIds && !approveAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approve_all=true or tool_call_ids is required",
        path: ["tool_call_ids"],
      });
    }
  });

