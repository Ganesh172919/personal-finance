/**
 * @fileoverview Zod validation schemas for AI-generated financial plans.
 *
 * Exported schemas:
 *   actionItemSchema  - Validates an individual action item (title, why, steps, priority, expected_impact)
 *   planSchema        - Validates a full AI plan with executive summary, key metrics, actions
 *                       (7-day, 30-day, 12-month buckets), assumptions, and data warnings
 *
 * Exported types:
 *   AiPlan            - Inferred TypeScript type from planSchema
 *
 * Exported helpers:
 *   buildPlanValidationFallback  - Creates a safe fallback plan when validation fails
 *   normalizeAiPlan              - Parses and normalizes raw AI plan output; returns { plan, valid }
 *
 * Used by: aiController (plan normalization), taskSchemas (tasks-from-plan body validation)
 *
 * Key validation rules:
 *   - All numeric metrics are nullable and optional (handles missing AI data gracefully)
 *   - Action items have priority enum: low | medium | high
 *   - Plan structure uses .passthrough() to allow extra fields from the AI without failing
 */
import { z } from "zod";

const nullableNumber = z.number().nullable().optional();

export const actionItemSchema = z
  .object({
    title: z.string(),
    why: z.string(),
    steps: z.array(z.string()).default([]),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    expected_impact: z.string()
  })
  .passthrough();

export const planSchema = z
  .object({
    executive_summary: z.string(),
    key_metrics: z
      .object({
        monthly_net_cash_flow: nullableNumber,
        savings_rate: nullableNumber,
        debt_to_income: nullableNumber,
        emergency_fund_months: nullableNumber,
        total_debt: nullableNumber
      })
      .default({}),
    actions: z
      .object({
        next_7_days: z.array(actionItemSchema).default([]),
        next_30_days: z.array(actionItemSchema).default([]),
        next_12_months: z.array(actionItemSchema).default([])
      })
      .default({ next_7_days: [], next_30_days: [], next_12_months: [] }),
    assumptions: z.array(z.string()).default([]),
    data_warnings: z.array(z.string()).default([])
  })
  .passthrough();

export type AiPlan = z.infer<typeof planSchema>;

export const buildPlanValidationFallback = (reason = "plan_validation_failed"): AiPlan => ({
  executive_summary: "Plan unavailable due to validation error.",
  key_metrics: {
    monthly_net_cash_flow: null,
    savings_rate: null,
    debt_to_income: null,
    emergency_fund_months: null,
    total_debt: null
  },
  actions: {
    next_7_days: [],
    next_30_days: [],
    next_12_months: []
  },
  assumptions: [],
  data_warnings: [reason]
});

export const normalizeAiPlan = (plan: unknown): { plan: AiPlan; valid: boolean } => {
  const parsed = planSchema.safeParse(plan);
  if (parsed.success) {
    return { plan: parsed.data, valid: true };
  }
  return { plan: buildPlanValidationFallback(), valid: false };
};

