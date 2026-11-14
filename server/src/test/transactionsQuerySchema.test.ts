import { describe, expect, it } from "vitest";
import { listTransactionsQuerySchema } from "../schemas/financialDataSchemas";

describe("listTransactionsQuerySchema needs_review", () => {
  it("parses query-string booleans without treating \"false\" as true", () => {
    expect(listTransactionsQuerySchema.parse({ needs_review: "true" }).needs_review).toBe(true);
    expect(listTransactionsQuerySchema.parse({ needs_review: "1" }).needs_review).toBe(true);
    expect(listTransactionsQuerySchema.parse({ needs_review: "false" }).needs_review).toBe(false);
    expect(listTransactionsQuerySchema.parse({ needs_review: "0" }).needs_review).toBe(false);
    expect(listTransactionsQuerySchema.parse({}).needs_review).toBeUndefined();
  });

  it("rejects non-boolean needs_review values", () => {
    expect(listTransactionsQuerySchema.safeParse({ needs_review: "maybe" }).success).toBe(false);
  });
});
