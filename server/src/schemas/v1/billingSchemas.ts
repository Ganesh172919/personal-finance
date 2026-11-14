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

// Validates request payloads creating a new Stripe subscription checkout session.
// Configures subscription tier, monthly or annual cycles, and seat limits.
// Validates redirect destination URLs and rejects unrecognized request parameters.
export const billingCheckoutBodySchema = z
  .object({
    plan_tier: z.enum(["pro", "team"]),
    billing_cycle: z.enum(["monthly", "annual"]).optional().default("monthly"),
    seats: z.number().int().positive().max(10_000).optional(),
    success_url: z.string().url().optional(),
    cancel_url: z.string().url().optional(),
  })
  .strict();

// Validates query parameters initiating a redirect to the Stripe customer portal.
// Accepts an optional return destination URL for seamless post-billing navigation.
// Rejects unexpected query parameters using strict schema evaluation.
export const billingPortalQuerySchema = z
  .object({
    return_url: z.string().url().optional(),
  })
  .strict();

// Validates request payloads for one-time purchases of usage credit packs.
// Restricts allowed pack IDs to recognized packages like AI, OCR, or flex bundles.
// Ensures strict property validation across credit purchasing endpoints.
export const purchaseCreditsBodySchema = z
  .object({
    pack_id: z.enum(["ai_pack_250", "ocr_pack_100", "scenarios_pack_100", "flex_bundle"]),
  })
  .strict();

// Validates administrative test payloads simulating invoice payment failures.
// Accepts an optional failure reason string bounded within 200 characters.
// Used in sandbox environments to verify dunning retry and notification workflows.
export const simulateDunningFailureBodySchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

// Validates query parameters for browsing historical tenant billing invoices.
// Accepts an optional currency filter code bounded to a maximum of 10 characters.
// Enforces strict schema constraints to keep invoice listing queries sanitized.
export const listInvoicesQuerySchema = z
  .object({
    currency: z.string().trim().max(10).optional(),
  })
  .strict();

// Inferred TypeScript type representing a validated credit pack purchase request.
// Contains the identifier for the specific usage credit package being acquired.
// Used across billing controller handlers to type incoming credit purchase calls.
export type PurchaseCreditsBody = z.infer<typeof purchaseCreditsBodySchema>;

// Inferred TypeScript type representing a simulated dunning failure test payload.
// Houses optional failure reason descriptions for diagnostic simulation passes.
// Used in testing and development controllers to exercise dunning recovery flows.
export type SimulateDunningFailureBody = z.infer<typeof simulateDunningFailureBodySchema>;

// Inferred TypeScript type representing validated invoice query filter parameters.
// Encapsulates optional currency filtering options for invoice retrieval.
// Used across billing service handlers to provide typed invoice query access.
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

