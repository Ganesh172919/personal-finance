import { describe, expect, it } from "vitest";
import { createExportBodySchema } from "../schemas/v1/exportSchemas";

describe("createExportBodySchema transactions_csv date window", () => {
  const csv = (params: Record<string, unknown>) => createExportBodySchema.safeParse({ type: "transactions_csv", params });

  it("accepts open-ended and forward date windows", () => {
    expect(csv({}).success).toBe(true);
    expect(csv({ date_from: "2026-11-01T00:00:00.000Z" }).success).toBe(true);
    expect(csv({ date_from: "2026-11-01T00:00:00.000Z", date_to: "2026-11-02T00:00:00.000Z" }).success).toBe(true);
  });

  it("rejects inverted or empty windows that can only produce an empty export", () => {
    const inverted = csv({ date_from: "2026-12-01T00:00:00.000Z", date_to: "2026-01-01T00:00:00.000Z" });
    expect(inverted.success).toBe(false);
    expect(inverted.error?.issues[0]?.path).toEqual(["params", "date_to"]);
    expect(csv({ date_from: "2026-11-01T00:00:00.000Z", date_to: "2026-11-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("leaves monthly PDF exports unaffected", () => {
    expect(createExportBodySchema.safeParse({ type: "monthly_summary_pdf", params: { period_key: "2026-11" } }).success).toBe(true);
  });
});
