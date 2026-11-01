/**
 * @fileoverview Zod validation schemas for two-factor authentication endpoints.
 *
 * Exported schemas:
 *   verify2FABodySchema   - Validates body for verifying a TOTP token (setup or disable)
 *   disable2FABodySchema  - Validates body for disabling 2FA
 *
 * Used by: v1Routes (POST /auth/2fa/verify, /auth/2fa/disable)
 *
 * Key validation rules:
 *   - token: required string, 1-20 chars (TOTP code or backup code)
 *   - Schema uses .strict() to reject unknown fields
 *
 * Note: POST /auth/2fa/setup and GET /auth/2fa/status require no body/query validation.
 */
import { z } from "zod";

export const verify2FABodySchema = z
  .object({
    token: z.string().trim().min(1).max(20),
  })
  .strict();

export const disable2FABodySchema = z
  .object({
    token: z.string().trim().min(1).max(20),
  })
  .strict();
