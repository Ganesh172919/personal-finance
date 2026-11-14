/**
 * Idempotency-Key helpers for billable requests (AI calls).
 *
 * Generate ONE key per user action and reuse it for every network retry of that
 * action; the server then replays the stored response instead of re-running the
 * work and billing again. Never generate the key inside a function that a retry
 * layer re-invokes, or each retry gets a fresh key and protection is lost.
 */

// Standardized HTTP request header key used for transmitting idempotency tokens.
// Tells downstream API servers to deduplicate mutations and cache billable replies.
// Enforces consistent idempotency contract naming across all frontend HTTP callers.
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

// Generates a unique, collision-resistant string token for a discrete client operation.
// Prefers the native web crypto randomUUID API with a timestamp-based random fallback.
// Guarantees stable request identification when re-attempting failed network requests.
/** The server accepts 8-128 chars of [A-Za-z0-9_-:.]. */
export function newIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();

  // Fallback for very old runtimes: not cryptographically strong, but only
  // needs to be unique per user action.
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Assembles the HTTP header record containing the provided idempotency token.
// Returns undefined when no key is specified to avoid sending empty header fields.
// Facilitates clean spread syntax injection inside fetch request configuration blocks.
/** Returns request headers carrying the key, or undefined when there is none. */
export function idempotencyHeaders(key?: string): Record<string, string> | undefined {
  return key ? { [IDEMPOTENCY_HEADER]: key } : undefined;
}
