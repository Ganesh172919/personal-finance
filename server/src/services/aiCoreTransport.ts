import { getEnv } from "../config/env";
import { buildTraceparent } from "../observability/tracing";
import { LEARNING_OPT_OUT_HEADER, isLearningOptOutCached } from "./aiLearningOptOut";

// Configures transport metadata and authentication attributes for gateway requests.
// Builds security and context headers required for internal HTTP communication with AI Core.
// Injects correlation request IDs, actor tenant identities, and internal pre-shared tokens.
export const aiCoreHeaders = (options: {
  requestId?: string;
  actor?: { orgId: string; userId: string };
  contentType?: string;
} = {}): Record<string, string> => {
  const token = getEnv().AI_CORE_INTERNAL_TOKEN;
  const traceparent = buildTraceparent(options.requestId);

  return {
    ...(options.contentType ? { "Content-Type": options.contentType } : {}),
    ...(options.requestId ? { "X-Request-Id": options.requestId } : {}),
    // W3C trace context: AI Core logs the trace id next to the request id.
    ...(traceparent ? { traceparent } : {}),
    ...(options.actor
      ? {
          "X-Internal-Org-Id": options.actor.orgId,
          "X-Internal-User-Id": options.actor.userId,
        }
      : {}),
    ...(token ? { "X-Internal-Token": token } : {}),
  };
};

// Resolves authoritative tenant and user identification headers from request payloads.
// Propagates organization, user, and AI learning opt-out flags to AI Core endpoints.
// Ensures strict tenant isolation and prevents cross-organization context contamination.
// Derives the tenant actor headers from a request payload that already carries
// `org_id` / `user_id` (set by aiRequestBuilder). Because the headers come from
// the same values as the body, AI Core's actor check always agrees; it simply
// lets AI Core treat the headers as authoritative. Returns {} when the payload
// has no complete actor, so callers without one keep working until AI Core's
// strict mode (AI_CORE_REQUIRE_ACTOR_HEADERS) is switched on.
export const aiCoreActorHeaders = (
  payload: { org_id?: unknown; user_id?: unknown } | null | undefined,
  options: { learningOptedOut?: boolean } = {}
): Record<string, string> => {
  const orgId = typeof payload?.org_id === "string" ? payload.org_id.trim() : "";
  const userId = typeof payload?.user_id === "string" ? payload.user_id.trim() : "";
  if (!orgId || !userId) return {};
  return {
    "X-Internal-Org-Id": orgId,
    "X-Internal-User-Id": userId,
    // The request-local result overrides the cache, including when the lookup
    // failed and the caller chose to fail closed for privacy.
    ...((options.learningOptedOut ?? isLearningOptOutCached(orgId)) ? { [LEARNING_OPT_OUT_HEADER]: "1" } : {}),
  };
};
