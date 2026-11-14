import { z } from "zod";

// Defines the validation schema for candidate payloads evaluated by invariant canary checks.
// Allows optional numeric fields for budget allocations, balance sheets, cashflow, and debt terms.
// Validates candidate and reference outputs to verify mathematical consistency.
export const canaryValidateBodySchema = z
  .object({
    candidate: z.string().optional(),
    reference: z.string().optional(),
    initial_allocations: z.record(z.string(), z.number()).optional(),
    proposed_allocations: z.record(z.string(), z.number()).optional(),
    assets: z.number().optional(),
    liabilities: z.number().optional(),
    net_worth: z.number().optional(),
    income: z.number().optional(),
    expenses: z.number().optional(),
    net_cashflow: z.number().optional(),
    payment: z.number().optional(),
    principal: z.number().optional(),
    interest: z.number().optional(),
    source: z.string().optional(),
  })
  .passthrough();

// Validates parameters passed to trigger synthetic canary probe evaluation runs.
// Accepts an optional positive integer specifying the maximum sample size to execute.
// Controls execution bounds for simulated financial scenarios and verification suites.
export const canaryRunProbesBodySchema = z
  .object({
    sample_size: z.number().int().positive().optional(),
  })
  .passthrough();

// Inferred TypeScript type representing a validated invariant validation payload.
// Used across controller handlers and canary evaluation service invocations.
// Supplies structured financial metrics and candidate text for invariant validation.
export type CanaryValidateBody = z.infer<typeof canaryValidateBodySchema>;

// Inferred TypeScript type representing probe execution options.
// Dictates the execution parameters passed to synthetic probe suite runs.
// Defines sample limits for simulated evaluation checks on canary releases.
export type CanaryRunProbesBody = z.infer<typeof canaryRunProbesBodySchema>;
