/**
 * @fileoverview Zod validation schemas for organization management.
 *
 * Exported schemas:
 *   createOrgBodySchema         - Validates creating a new organization (name, optional slug)
 *   orgIdParamSchema            - Validates :orgId route param as a 24-char hex ObjectId
 *   addOrgMemberBodySchema      - Validates adding a member to an organization (email, role)
 *   updateOrgSettingsBodySchema - Validates updating organization settings (currency, locale, timezone)
 *
 * Used by: v1Routes (GET /orgs/me, POST /orgs, POST /orgs/:orgId/members, PATCH /orgs/:orgId/settings)
 *
 * Key validation rules:
 *   - name: required, 2-120 chars
 *   - slug: optional, 3-80 chars, lowercase alphanumeric with hyphens, must start/end with alphanumeric
 *   - Member email: valid email, lowercased, max 200 chars
 *   - Member role: enum owner | admin | member (default "member")
 *   - Currency: optional, 3 uppercase letters (ISO 4217)
 *   - Locale: optional, 2-50 chars
 *   - Timezone: optional, 1-80 chars (e.g., "America/New_York")
 *   - All schemas use .strict() to reject unknown fields
 */
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
