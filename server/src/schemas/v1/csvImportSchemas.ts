import { z } from "zod";

const parseJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const transactionsCsvImportBodySchema = z
  .object({
    mapping: z.preprocess(
      parseJson,
      z
        .object({
          amount: z.string().trim().min(1).max(120),
          date: z.string().trim().min(1).max(120),
          description: z.string().trim().min(1).max(120).optional(),
          category: z.string().trim().min(1).max(120).optional(),
          type: z.string().trim().min(1).max(120).optional(),
          merchant: z.string().trim().min(1).max(120).optional(),
        })
        .strict()
    ),
    account_id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    dry_run: z.preprocess((v) => (typeof v === "string" ? v === "true" || v === "1" : v), z.boolean().optional()),
  })
  .strict();

