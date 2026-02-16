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

