import { describe, expect, it } from "vitest";
import { createGoalBodySchema, updateGoalBodySchema } from "../schemas/financialDataSchemas";

const base = { name: "Emergency Fund", target: 1000.5, current: 0, priority: 5 };

describe("goal deadline validation", () => {
  it("accepts calendar dates and ISO timestamps", () => {
    expect(createGoalBodySchema.safeParse({ ...base, deadline: "2027-11-08" }).success).toBe(true);
    expect(createGoalBodySchema.safeParse({ ...base, deadline: "2027-11-08T00:00:00.000Z" }).success).toBe(true);
    expect(updateGoalBodySchema.safeParse({ deadline: "2030-12-31" }).success).toBe(true);
  });

  it("rejects strings that are not dates", () => {
    expect(createGoalBodySchema.safeParse({ ...base, deadline: "not-a-date" }).success).toBe(false);
    expect(createGoalBodySchema.safeParse({ ...base, deadline: "2027-13-45" }).success).toBe(false);
    expect(createGoalBodySchema.safeParse({ ...base, deadline: "next year" }).success).toBe(false);
    expect(updateGoalBodySchema.safeParse({ deadline: "soon" }).success).toBe(false);
  });
});
