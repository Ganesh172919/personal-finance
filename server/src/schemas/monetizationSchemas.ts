/**
 * @fileoverview Zod validation schemas for monetization usage event ingestion.
 *
 * Exported schemas:
 *   usageEventBodySchema - Validates a usage event for metering/billing purposes
 *
 * Used by: monetizationRoutes (POST /usage-events)
 *
 * Key validation rules:
 *   - user_id: required, must be a valid 24-char hex ObjectId
 *   - org_id: optional, must be a valid ObjectId when provided
 *   - feature: required enum covering tracked features (monthly_ai_calls, scenario_depth,
 *     ocr_quota, export_access, api_requests, workflow_runs, connector_sync_records, marketplace_installs)
 *   - units: positive number, max 1,000,000
 *   - idempotency_key: optional, 8-128 chars for deduplication
 *   - context: optional arbitrary key-value metadata
 */
import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

export const usageEventBodySchema = z
  .object({
    org_id: z.string().regex(objectIdRegex, "Invalid org id").optional(),
    user_id: z.string().regex(objectIdRegex, "Invalid user id"),
    feature: z.enum([
      "monthly_ai_calls",
      "scenario_depth",
      "ocr_quota",
      "export_access",
      "api_requests",
      "workflow_runs",
      "connector_sync_records",
      "marketplace_installs",
    ]),
    units: z.number().positive().max(1_000_000),
    idempotency_key: z.string().trim().min(8).max(128).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
