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

export const autopilotRunIdBodySchema = z
  .object({
    run_id: z.string().regex(objectIdRegex, "Invalid run_id"),
  })
  .strict();

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

