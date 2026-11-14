/**
 * @fileoverview Zod validation schemas for referral code redemption.
 *
 * Exported schemas:
 *   redeemReferralBodySchema - Validates redeeming a referral code
 *
 * Used by: v1Routes (POST /referrals/redeem)
 *
 * Key validation rules:
 *   - code: required, trimmed, uppercased, must be 6-16 alphanumeric characters
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

// Validates user request payload submitted when redeeming an invite referral code.
// Enforces uppercase alphanumeric string structure constrained between 6 and 16 characters.
// Prevents invalid or malformed promo codes from triggering promotional credit logic.
export const redeemReferralBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, "Referral code must be 6-16 alphanumeric characters"),
  })
  .strict();

