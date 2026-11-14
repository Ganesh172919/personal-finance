import { describe, expect, it } from "vitest";
import {
  createRecurringRuleBodySchema,
  periodKeySchema,
  updateRecurringRuleBodySchema,
} from "../schemas/v1/financeSchemas";
import { forecastQuerySchema } from "../schemas/v1/financeIntelligenceSchemas";

describe("finance period keys", () => {
  it("accepts real months and rejects month 00/13", () => {
    expect(periodKeySchema.safeParse("2026-01").success).toBe(true);
    expect(periodKeySchema.safeParse("2026-12").success).toBe(true);
    expect(periodKeySchema.safeParse("2026-13").success).toBe(false);
    expect(periodKeySchema.safeParse("2026-00").success).toBe(false);
    expect(forecastQuerySchema.safeParse({ period_key: "2026-13" }).success).toBe(false);
  });
});

describe("recurring rule bodies", () => {
  it("rejects unparsable cron expressions", () => {
    expect(createRecurringRuleBodySchema.safeParse({ name: "Bad cron", cron: "not a cron" }).success).toBe(false);
    expect(createRecurringRuleBodySchema.safeParse({ name: "Rent", cron: "0 9 1 * *" }).success).toBe(true);
    expect(createRecurringRuleBodySchema.safeParse({ name: "Twice", cron: "0 0 1,15 * *" }).success).toBe(true);
    expect(updateRecurringRuleBodySchema.safeParse({ cron: "every day" }).success).toBe(false);
  });

  it("rejects amount_min greater than amount_max", () => {
    expect(
      createRecurringRuleBodySchema.safeParse({ name: "Range", cron: "0 9 1 * *", amount_min: 50, amount_max: 10 }).success
    ).toBe(false);
    expect(
      createRecurringRuleBodySchema.safeParse({ name: "Range", cron: "0 9 1 * *", amount_min: 29.99, amount_max: 30.01 }).success
    ).toBe(true);
    expect(updateRecurringRuleBodySchema.safeParse({ status: "disabled" }).success).toBe(true);
  });
});
