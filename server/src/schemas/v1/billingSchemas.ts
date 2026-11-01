/**
 * @fileoverview Zod validation schemas for Stripe billing/checkout endpoints.
 *
 * Exported schemas:
 *   billingCheckoutBodySchema  - Validates creating a Stripe checkout session
 *   billingPortalQuerySchema   - Validates billing portal redirect query parameters
 *
 * Used by: v1Routes (POST /billing/checkout, GET /billing/portal)
 *
 * Key validation rules:
 *   - plan_tier: required enum "pro" | "team"
 *   - seats: optional positive integer, max 10,000 (for team plans)
 *   - success_url / cancel_url: optional valid URLs
 *   - return_url: optional valid URL for portal redirect
 *   - Both schemas use .strict() to reject unknown fields
 */
import { z } from "zod";

export const billingCheckoutBodySchema = z
  .object({
    plan_tier: z.enum(["pro", "team"]),
    billing_cycle: z.enum(["monthly", "annual"]).optional().default("monthly"),
    seats: z.number().int().positive().max(10_000).optional(),
    success_url: z.string().url().optional(),
    cancel_url: z.string().url().optional(),
  })
  .strict();

export const billingPortalQuerySchema = z
  .object({
    return_url: z.string().url().optional(),
  })
  .strict();

export const purchaseCreditsBodySchema = z
  .object({
    pack_id: z.enum(["ai_pack_250", "ocr_pack_100", "scenarios_pack_100", "flex_bundle"]),
  })
  .strict();

export const simulateDunningFailureBodySchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const listInvoicesQuerySchema = z
  .object({
    currency: z.string().trim().max(10).optional(),
  })
  .strict();

export type PurchaseCreditsBody = z.infer<typeof purchaseCreditsBodySchema>;
export type SimulateDunningFailureBody = z.infer<typeof simulateDunningFailureBodySchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

