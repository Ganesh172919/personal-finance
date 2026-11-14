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

// Validates request payload submitted when verifying a two-factor authentication TOTP code.
// Enforces trimmed token string presence bounded between 1 and 20 characters.
// Prevents unpermitted properties from bypassing strict verification rules.
export const verify2FABodySchema = z
  .object({
    token: z.string().trim().min(1).max(20),
  })
  .strict();

// Validates request payload submitted to deactivate two-factor authentication.
// Requires security token or one-time backup code verifying user authorization.
// Restricts extra parameters to maintain secure credential deactivation interfaces.
export const disable2FABodySchema = z
  .object({
    token: z.string().trim().min(1).max(20),
  })
  .strict();
