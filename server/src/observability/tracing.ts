/**
 * @fileoverview Request-id validation and W3C trace-context helpers.
 *
 * - `isValidRequestId` / `sanitizeRequestId`: inbound `X-Request-Id` values are
 *   attacker-influenced strings that reach logs and response headers, so only a
 *   conservative character set is accepted (same rule as AI Core
 *   `utils/request_ids.py`); anything else is replaced.
 * - `buildTraceparent`: header propagated to AI Core. Uses the active
 *   OpenTelemetry span when one exists (OTEL_ENDPOINT set), otherwise derives a
 *   stable trace id from the request id so gateway and AI Core logs still
 *   correlate without a collector.
 *
 * @module observability/tracing
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isSpanContextValid, trace } from "@opentelemetry/api";

// Starts alphanumeric; letters, digits and ._:- ; 8-128 chars.
// Regular expression pattern validating inbound X-Request-Id header formats.
// Enforces 8 to 128 alphanumeric characters with safe delimiters (. _ - :).
// Rejects malformed or unsafe header values that could pollute logging systems.
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

// Type guard testing whether an incoming value represents a valid request identifier.
// Verifies string type and conforms to REQUEST_ID_PATTERN format criteria.
// Protects downstream logging and tracing middleware against header injection.
export const isValidRequestId = (value: unknown): value is string =>
  typeof value === "string" && REQUEST_ID_PATTERN.test(value.trim());

/** Returns the trimmed inbound id when valid, otherwise a fresh UUID. */
// Returns trimmed request identifier when valid or generates a fresh random UUID v4.
// Guarantees that every request handled by the server has a valid correlation identifier.
// Strips external input when it fails strict alphanumeric pattern validation.
export const sanitizeRequestId = (value: unknown): string =>
  isValidRequestId(value) ? value.trim() : randomUUID();

// Formats a numeric value into a zero-padded lowercase hexadecimal string.
// Ensures uniform byte and flag string widths in W3C trace context headers.
// Formats trace flags and span parameters to standard specifications.
const hex = (value: number, width: number) => value.toString(16).padStart(width, "0");

/**
 * Builds a W3C `traceparent` header value, or undefined when there is neither an
 * active span nor a request id to derive one from.
 */
// Constructs standard W3C traceparent header for distributed telemetry propagation.
// Uses active OpenTelemetry span context when available or derives trace ID from request ID.
// Guarantees distributed trace correlation between server endpoints and AI Core workers.
export const buildTraceparent = (requestId?: string): string | undefined => {
  const active = trace.getActiveSpan()?.spanContext();
  if (active && isSpanContextValid(active)) {
    return `00-${active.traceId}-${active.spanId}-${hex(active.traceFlags & 0xff, 2)}`;
  }
  if (!requestId) return undefined;
  const traceId = createHash("sha256").update(requestId).digest("hex").slice(0, 32);
  let spanId = randomBytes(8).toString("hex");
  if (/^0+$/.test(spanId)) spanId = "0000000000000001";
  return `00-${traceId}-${spanId}-01`;
};
