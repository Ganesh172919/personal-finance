import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

export const createOrgBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/, "Invalid slug")
      .optional(),
  })
  .strict();

export const orgIdParamSchema = z
  .object({
    orgId: z.string().regex(objectIdRegex, "Invalid org id"),
  })
  .strict();

export const addOrgMemberBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    role: z.enum(["owner", "admin", "member"]).default("member"),
  })
  .strict();

export const updateOrgSettingsBodySchema = z
  .object({
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Invalid currency (expected ISO 4217)").optional(),
    locale: z.string().trim().min(2).max(50).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
