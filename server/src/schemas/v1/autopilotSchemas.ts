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

