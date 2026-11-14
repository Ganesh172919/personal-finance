/**
 * @fileoverview Gateway-side client for the AI Core learning API (`/api/learning/*`).
 *
 * Two jobs:
 *  1. Fire-and-forget, retrying delivery of SANITISED feedback events
 *     (`forwardFeedbackEvent`). It never throws and never blocks a user request,
 *     and tolerates AI Core not having the endpoint yet (404).
 *  2. A thin proxy call (`callAiCore`) used by the admin learning endpoints. It
 *     returns the upstream status instead of throwing on non-2xx so callers can
 *     map 409 PROMOTION_SUGGEST_ONLY / GATE_NOT_PASSED to clean responses.
 *
 * Privacy: `redactFreeText` strips emails, currency amounts and long digit runs
 * (account / card / phone numbers) from anything that leaves the gateway.
 */
import axios from "axios";

import { getEnv } from "../config/env";
import { createServiceLogger } from "../utils/serviceLogger";
import { aiCoreHeaders } from "./aiCoreTransport";

const log = createServiceLogger("aiLearningClient");

// --------------------------------------------------------------------------
// Redaction
// --------------------------------------------------------------------------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Amounts with a currency symbol or ISO code/Rs prefix: "$1,200.50", "INR 5000", "Rs. 300", "EUR 12k".
const AMOUNT_RE =
  /(?:[$€£¥₹]\s?|\b(?:USD|EUR|GBP|INR|JPY|AUD|CAD|Rs\.?)\s?)\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|lakhs?|crores?)\b)?/gi;
// Six or more digits, optionally separated by single spaces/dashes: account, card, phone numbers.
const DIGIT_RUN_RE = /\d(?:[ -]?\d){5,}/g;

// Maximum allowed character length for user-submitted feedback corrections.
// Constrains text payload sizes to prevent database bloating and denial of service.
// Used as the default character truncation limit during text sanitization.
export const FEEDBACK_CORRECTION_MAX = 500;

/** Redacts PII-like tokens and caps length. Safe to call on any user text. */
// Strips personally identifiable information including email addresses, phone numbers, and amounts.
// Collapses excessive whitespace and enforces a strict maximum string length.
// Ensures that user feedback forwarded to upstream model learning loops preserves privacy.
export const redactFreeText = (text: unknown, maxLength = FEEDBACK_CORRECTION_MAX): string => {
  if (typeof text !== "string") return "";
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(AMOUNT_RE, "[amount]")
    .replace(DIGIT_RUN_RE, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

// --------------------------------------------------------------------------
// Feedback event
// --------------------------------------------------------------------------

// Data transfer object representing a privacy-sanitized feedback event for AI Core.
// Encapsulates rating indications, reason codes, prompt versions, and routing keys.
// Facilitates reinforcement learning and prompt refinement without exposing user PII.
export interface SanitizedFeedbackEvent {
  agentOutputId: string;
  rating: "up" | "down";
  reasonCode?: string;
  correction?: string;
  route?: string;
  promptVersion?: string;
  routingVersion?: string;
  modelName?: string;
  provider?: string;
  cacheHit?: boolean;
}

// Sanitizes and clamps raw string parameters to a specified maximum length constraint.
// Trims surrounding whitespace and converts empty strings into undefined values.
// Ensures uniform string attributes across structured telemetry payloads.
const str = (value: unknown, max = 160): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
};

/**
 * Builds the event sent to AI Core from a stored AgentOutput plus the
 * validated feedback. The user's free-text `note` is never forwarded; the
 * correction is redacted and capped.
 */
// Assembles a sanitized feedback submission payload from agent outputs and user ratings.
// Strips sensitive text from user corrections and attaches prompt and model versions.
// Returns an event payload filtered to exclude undefined properties.
export const buildSanitizedFeedbackEvent = (
  output: Record<string, any>,
  feedback: { rating: "up" | "down"; reasonCode?: string; correction?: string }
): SanitizedFeedbackEvent => {
  const correction = feedback.correction ? redactFreeText(feedback.correction) : "";
  const event: SanitizedFeedbackEvent = {
    agentOutputId: String(output._id),
    rating: feedback.rating,
    reasonCode: str(feedback.reasonCode, 40),
    correction: correction || undefined,
    route: str(output.analysis_type, 80) || str(output.agentType, 80),
    promptVersion: str(output.promptVersion, 80),
    routingVersion: str(output.routingVersion, 80),
    modelName: str(output.modelName ?? output.active_model, 160),
    provider: str(output.provider ?? output.active_provider, 80),
    cacheHit: typeof output.cacheHit === "boolean" ? output.cacheHit : undefined,
  };
  return Object.fromEntries(Object.entries(event).filter(([, v]) => v !== undefined)) as unknown as SanitizedFeedbackEvent;
};

// --------------------------------------------------------------------------
// Transport
// --------------------------------------------------------------------------

// Specification for a low-level HTTP invocation targeting the AI Core service.
// Outlines request method, endpoint path, body payload, queries, and timeout settings.
// Consumed by internal transport adapters to execute microservice calls.
export interface AiCoreCall {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

// Represents the HTTP status code and response payload returned by AI Core.
// Decouples HTTP status reporting from exception throwing to allow non-2xx status handling.
// Enables calling services to inspect error statuses cleanly without try-catch blocks.
export interface AiCoreCallResult {
  status: number;
  data: any;
}

// Signature contract for transport functions responsible for executing AI Core requests.
// Accepts call options augmented with target base URLs and resolves with call results.
// Enables dependency injection for testing and mock network simulation.
export type AiCoreTransport = (call: AiCoreCall & { baseUrl: string }) => Promise<AiCoreCallResult>;

// Default HTTP transport implementation using Axios for communicating with AI Core.
// Configures custom status validators to prevent Axios from throwing on 4xx/5xx codes.
// Returns resolved HTTP statuses and deserialized JSON response bodies.
const defaultTransport: AiCoreTransport = async (call) => {
  const response = await axios.request({
    baseURL: call.baseUrl,
    url: call.path,
    method: call.method,
    data: call.body,
    params: call.query,
    headers: call.headers,
    timeout: call.timeoutMs,
    // Surface 4xx/5xx to the caller as a result; only network errors throw.
    validateStatus: () => true,
  });
  return { status: response.status, data: response.data };
};

let transport: AiCoreTransport = defaultTransport;

/** Test seam: replace (or restore with `null`) the HTTP transport. */
// Test hook allowing unit and integration suites to swap the active transport layer.
// Replaces the HTTP dispatcher with mock implementations or resets it to default.
// Facilitates isolated testing of retry logic and failure resilience.
export const __setAiLearningTransportForTests = (next: AiCoreTransport | null) => {
  transport = next ?? defaultTransport;
};

/** Calls an AI Core route with internal-token headers. Throws only on network errors. */
// Dispatches an HTTP call to AI Core with internal gateway security headers attached.
// Injects correlation request IDs, tenant identification, and admin authorization flags.
// Returns upstream responses directly without throwing exceptions on non-2xx statuses.
export const callAiCore = async (
  call: AiCoreCall,
  context: { requestId?: string; orgId?: string; userId?: string; admin?: boolean } = {}
): Promise<AiCoreCallResult> => {
  const env = getEnv();
  const actor = context.orgId && context.userId ? { orgId: context.orgId, userId: context.userId } : undefined;
  const headers = {
    ...aiCoreHeaders({
      requestId: context.requestId,
      actor,
      contentType: call.body !== undefined ? "application/json" : undefined,
    }),
    ...(context.admin ? { "X-Internal-Role": "admin" } : {}),
    ...call.headers,
  };
  return transport({
    ...call,
    headers,
    baseUrl: env.PYTHON_API_URL,
    timeoutMs: call.timeoutMs ?? env.AI_CORE_STATUS_TIMEOUT_MS,
  });
};

// --------------------------------------------------------------------------
// Fire-and-forget feedback forwarding
// --------------------------------------------------------------------------

const DEFAULT_RETRY_DELAYS_MS = [300, 1500];

// Outcome summary describing the result of an asynchronous feedback forwarding attempt.
// Indicates whether delivery succeeded, the number of attempts made, and rejection reasons.
// Used for internal tracing and logging of telemetry delivery success rates.
export interface ForwardFeedbackResult {
  delivered: boolean;
  attempts: number;
  status?: number;
  reason?: "accepted" | "endpoint_missing" | "rejected" | "exhausted";
}

// Utility helper providing asynchronous delay execution using Node.js setTimeout timers.
// Returns a Promise that resolves after the specified number of milliseconds.
// Employed in feedback forwarding retry loops to implement backoff delays.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Delivers a sanitised feedback event to AI Core `POST /api/learning/feedback`.
 * Retries network errors / 5xx / 429 with backoff; stops on 404 (endpoint not
 * deployed) and on other 4xx. Never throws.
 */
// Dispatches sanitized user feedback to AI Core asynchronously with retry backoff.
// Retries transient failures gracefully while terminating early on 404 missing routes.
// Designed as non-blocking fire-and-forget to avoid delaying client response cycles.
export const forwardFeedbackEvent = async (
  event: SanitizedFeedbackEvent,
  context: { orgId: string; userId: string; requestId?: string },
  options: { retryDelaysMs?: number[] } = {}
): Promise<ForwardFeedbackResult> => {
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = delays.length + 1;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await callAiCore({ method: "POST", path: "/api/learning/feedback", body: event }, context);
      lastStatus = result.status;
      if (result.status >= 200 && result.status < 300) {
        return { delivered: true, attempts: attempt, status: result.status, reason: "accepted" };
      }
      if (result.status === 404) {
        log.debug({ requestId: context.requestId }, "AI Core learning endpoint not available; feedback not forwarded");
        return { delivered: false, attempts: attempt, status: 404, reason: "endpoint_missing" };
      }
      if (result.status < 500 && result.status !== 429) {
        log.warn({ requestId: context.requestId, status: result.status }, "AI Core rejected feedback event");
        return { delivered: false, attempts: attempt, status: result.status, reason: "rejected" };
      }
    } catch (error: any) {
      log.debug({ requestId: context.requestId, error: error?.message }, "feedback forward attempt failed");
    }
    if (attempt < maxAttempts) {
      const base = delays[attempt - 1] ?? 0;
      await sleep(base + Math.floor(Math.random() * Math.max(1, base * 0.2)));
    }
  }

  log.warn({ requestId: context.requestId, status: lastStatus }, "feedback event dropped after retries");
  return { delivered: false, attempts: maxAttempts, status: lastStatus, reason: "exhausted" };
};

// --------------------------------------------------------------------------
// AgentOutput attribution from an AI Core response
// --------------------------------------------------------------------------

// Metadata structure detailing model and prompt attribution for an AI agent response.
// Tracks prompt versions, routing versions, active model names, and provider IDs.
// Saved alongside agent outputs to enable lineage tracking and regression analysis.
export interface LearningMeta {
  promptVersion?: string;
  routingVersion?: string;
  agentName?: string;
  modelName?: string;
  provider?: string;
  cacheHit?: boolean;
}

/** Reads artifact/model attribution from an AI Core response; every field is optional. */
// Extracts model, prompt, and routing attribution parameters from an AI Core response.
// Inspects nested artifact version dictionaries and extracts active model configurations.
// Returns a sanitized LearningMeta object containing populated metadata attributes.
export const extractLearningMeta = (response: unknown): LearningMeta => {
  const r = (response && typeof response === "object" ? response : {}) as Record<string, any>;
  const versions = (r.artifact_versions && typeof r.artifact_versions === "object" ? r.artifact_versions : {}) as Record<string, any>;
  const meta: LearningMeta = {
    promptVersion: str(r.prompt_version ?? r.promptVersion ?? versions.prompt, 80),
    routingVersion: str(r.routing_version ?? r.routingVersion ?? versions.routing, 80),
    agentName: str(r.agent, 120),
    modelName: str(r.active_model, 160),
    provider: str(r.active_provider, 80),
    cacheHit: typeof r.cache_hit === "boolean" ? r.cache_hit : undefined,
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) as LearningMeta;
};
