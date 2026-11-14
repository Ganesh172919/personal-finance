/**
 * @fileoverview Zod schemas for the dead-letter job admin endpoints.
 *   GET  /api/v1/admin/dead-letter-jobs         (cursor paginated)
 *   POST /api/v1/admin/dead-letter-jobs/:id/replay
 */
import { z } from "zod";

import { DEAD_LETTER_JOB_KINDS } from "../models/deadLetterJobModel";

// Validates administrative query filters for browsing dead-letter queue records.
// Supports status filtering across pending and replayed jobs and specific job kinds.
// Enforces cursor-based pagination with bounds constrained between 1 and 100 entries.
export const listDeadLetterJobsQuerySchema = z
  .object({
    status: z.enum(["pending", "replayed", "all"]).default("pending"),
    kind: z.enum(DEAD_LETTER_JOB_KINDS).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().regex(/^[a-f\d]{24}$/i, "Invalid cursor").optional(),
  })
  .strict();

// Validates the request body payload when replaying an individual dead-letter job.
// Requires an empty object payload in strict mode to disallow parameter injection.
// Enforces default empty object instantiation when request bodies are omitted.
export const replayDeadLetterJobBodySchema = z.object({}).strict().default({});
