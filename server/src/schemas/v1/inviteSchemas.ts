/**
 * @fileoverview Zod validation schemas for organization invite acceptance.
 *
 * Exported schemas:
 *   acceptOrgInviteBodySchema - Validates accepting an organization invitation by token
 *
 * Used by: v1Routes (POST /org-invites/accept)
 *
 * Key validation rules:
 *   - token: required, 20-256 characters (the invite token sent via email)
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

// Validates payload submitted when accepting an organization membership invite.
// Enforces security token presence with length requirements between 20 and 256 characters.
// Disallows unrecognized payload properties using strict schema constraints.
export const acceptOrgInviteBodySchema = z
  .object({
    token: z.string().trim().min(20).max(256),
  })
  .strict();

