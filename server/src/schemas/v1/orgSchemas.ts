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

// Regular expression pattern validating 24-character hexadecimal MongoDB ObjectIds.
// Used across organization validation schemas to verify entity identifier structure.
// Case-insensitively matches standard alphanumeric ObjectId strings.
const objectIdRegex = /^[a-f\d]{24}$/i;

// Validates request payload submitted when creating a new organization.
// Enforces trimmed organization names and optional lower-case hyphenated slug keys.
// Ensures slug adheres to URL-friendly formatting without disallowed characters.
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

// Validates route parameter containing an organization identifier.
// Verifies orgId route parameter matches 24-character hexadecimal ObjectId format.
// Rejects malformed or non-hex string parameters before controller handling.
export const orgIdParamSchema = z
  .object({
    orgId: z.string().regex(objectIdRegex, "Invalid org id"),
  })
  .strict();

// Validates payload attributes when adding or inviting a new organization member.
// Enforces trimmed lowercase valid email address format and member role permissions.
// Defaults membership role to standard member when role is omitted.
export const addOrgMemberBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    role: z.enum(["owner", "admin", "member"]).default("member"),
  })
  .strict();

// Validates configuration updates for organization-wide localization and privacy settings.
// Checks ISO 4217 currency format, locale string lengths, and timezone identifiers.
// Includes privacy toggle allowing organizations to opt out of AI learning data retention.
export const updateOrgSettingsBodySchema = z
  .object({
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Invalid currency (expected ISO 4217)").optional(),
    locale: z.string().trim().min(2).max(50).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    // Privacy: opt the org out of the AI learning loop (no feedback forwarding / trace storage).
    aiLearningOptOut: z.boolean().optional(),
  })
  .strict();
