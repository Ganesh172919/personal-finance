import { z } from "zod";

// Validates configuration options for running summary staging capacity benchmark simulations.
// Constrains concurrency limits, test iteration counts, and duplicate generation ratios.
// Enables passthrough mode to support custom benchmark stress-test parameter overrides.
export const summaryCapacityBenchmarkBodySchema = z
  .object({
    concurrency: z.number().int().min(1).max(50).optional(),
    iterations: z.number().int().min(1).max(100).optional(),
    duplicateRatio: z.number().min(0).max(1).optional(),
  })
  .passthrough();

// TypeScript type representing benchmark input options inferred from summaryCapacityBenchmarkBodySchema.
// Passed into summary capacity benchmark runner functions to configure simulation stress levels.
// Ensures strong compile-time types across synthetic workload generation utilities.
export type SummaryCapacityBenchmarkBody = z.infer<typeof summaryCapacityBenchmarkBodySchema>;
