import { z } from "zod";

// Validates query string parameters for fetching personalized follow-through recommendations.
// Enforces positive integer bounds between 1 and 50 with a standard default limit of 10.
// Prevents excessive result sets from degrading follow-through recommendation performance.
export const getRecommendationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Validates user feedback submissions regarding recommended financial tasks or guidance.
// Checks allowed target domains, permitted user actions, and optional explanation reasons.
// Records telemetry used by the recommendation engine to refine subsequent suggestions.
export const recordFeedbackBodySchema = z.object({
  signalId: z.string().min(1).max(200),
  domain: z.enum(["task", "goal", "budget", "reminder", "recurring", "debt", "account"]),
  action: z.enum(["upvote", "dismiss", "complete"]),
  reason: z.string().max(280).optional(),
});

// Validates modification payloads for user-level follow-through behavioral preferences.
// Enforces domain weighting bounds, supported risk tolerance levels, and cadence frequencies.
// Allows end-users to customize action prompts to match their financial priorities.
export const updatePreferencesBodySchema = z.object({
  focusDomains: z.record(z.string(), z.number().min(0).max(3)).optional(),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  preferredCadence: z.enum(["daily", "weekly", "biweekly"]).optional(),
});

// Inferred TypeScript interface representing parsed recommendations query arguments.
// Used for type-safe query parameter handling within recommendation controller handlers.
// Ensures endpoint handlers receive typed query bounds for recommendation limits.
export type GetRecommendationsQuery = z.infer<typeof getRecommendationsQuerySchema>;

// Inferred TypeScript interface representing user recommendation feedback payloads.
// Passed into feedback persistence routines to record user decisions and model weights.
// Provides strongly-typed payload attributes for user feedback ingestion.
export type RecordFeedbackBody = z.infer<typeof recordFeedbackBodySchema>;

// Inferred TypeScript interface representing preference update request payloads.
// Applied when updating domain affinity multipliers and notification schedule preferences.
// Facilitates static typing across preference update request lifecycles.
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBodySchema>;
