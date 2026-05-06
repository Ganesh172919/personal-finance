/**
 * @fileoverview Zod validation schemas for automation event emission.
 *
 * Exported schemas:
 *   emitAutomationEventBodySchema - Validates emitting an automation/domain event
 *
 * Used by: v1Routes (POST /automation/events/emit)
 *
 * Key validation rules:
 *   - event_type: required, 2-120 characters (e.g., "transaction.created")
 *   - aggregate_type: optional, 2-120 chars (the entity type this event relates to)
 *   - aggregate_id: optional, 2-200 chars (the entity ID this event relates to)
 *   - payload: optional arbitrary key-value metadata object
 *   - Schema uses .strict() to reject unknown fields
 */
import { z } from "zod";

export const emitAutomationEventBodySchema = z
  .object({
    event_type: z.string().trim().min(2).max(120),
    aggregate_type: z.string().trim().min(2).max(120).optional(),
    aggregate_id: z.string().trim().min(2).max(200).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
