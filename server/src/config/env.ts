/**
 * @fileoverview Environment Configuration Module
 *
 * This module handles environment variable validation and configuration for the Personal Finance
 * application. It uses Zod schema validation to ensure all required environment variables are
 * present and properly formatted.
 *
 * KEY FEATURES:
 * - Environment variable validation using Zod schemas
 * - Type-safe configuration with TypeScript
 * - Default values for optional configuration
 * - Support for boolean, numeric, and string array environment variables
 * - CORS origin normalization and aliasing
 * - Trust proxy configuration
 * - Comprehensive error messages for invalid configuration
 *
 * @module config/env
 */

import dotenv from "dotenv"; // Load environment variables from .env file
import { z } from "zod"; // Zod schema validation library

// Load environment variables from .env file
dotenv.config();

/**
 * Trims whitespace from a string value.
 *
 * @param {string} value - String to trim
 * @returns {string} Trimmed string
 */
const trim = (value: string) => value.trim();

/**
 * Converts empty strings to undefined.
 *
 * This is used to handle optional environment variables that may be set to
 * empty strings in the .env file.
 *
 * @param {unknown} value - Value to check
 * @returns {unknown} Original value or undefined if empty string
 */
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

/**
 * Normalizes a base URL string.
 *
 * This function:
 * - Converts localhost to 127.0.0.1 for consistency
 * - Returns the origin (protocol + hostname + port)
 * - Strips trailing slashes for invalid URLs
 *
 * @param {string} rawValue - Raw URL string to normalize
 * @returns {string} Normalized URL origin
 */
const normalizeBaseUrl = (rawValue: string) => {
  try {
    const url = new URL(rawValue);
    // Convert localhost to 127.0.0.1 for consistency
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return url.origin; // Return protocol + hostname + port
  } catch {
    // For invalid URLs, strip trailing slashes
    return String(rawValue || "").replace(/\/$/, "");
  }
};

/**
 * Generates aliases for local origins (localhost <-> 127.0.0.1).
 *
 * This function creates a set of origin aliases to handle both localhost
 * and 127.0.0.1 variants of the same origin.
 *
 * @param {string} origin - Origin URL to generate aliases for
 * @returns {string[]} Array of origin aliases
 */
const localOriginAliases = (origin: string) => {
  try {
    const url = new URL(origin);
    const aliases = new Set<string>([url.origin]);

    // Generate aliases for localhost <-> 127.0.0.1
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      aliases.add(url.origin);
    } else if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      aliases.add(url.origin);
    }

    return [...aliases];
  } catch {
    // For invalid URLs, strip trailing slashes
    return [String(origin || "").replace(/\/$/, "")];
  }
};

/**
 * Zod schema for parsing boolean values from environment variables.
 *
 * Accepts various boolean representations:
 * - true: "1", "true", "yes", "on"
 * - false: "0", "false", "no", "off"
 */
const boolFromEnv = z.preprocess(value => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  // Truthy values
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  // Falsy values
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}, z.boolean());

/**
 * Optional boolean schema that treats empty strings as undefined.
 */
const optionalBoolFromEnv = z.preprocess(emptyStringToUndefined, boolFromEnv.optional());

/**
 * Optional non-empty string schema that treats empty strings as undefined.
 */
const optionalNonEmptyString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional()
);

/**
 * Optional port number schema (1-65535) that treats empty strings as undefined.
 */
const optionalPortFromEnv = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().min(1).max(65535).optional()
);

/**
 * Creates a Zod schema for parsing comma-separated values.
 *
 * @param {string} defaultValue - Default comma-separated string
 * @returns {z.ZodType} Zod schema that transforms CSV string to array
 */
const csv = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform(value =>
      value
        .split(",") // Split by comma
        .map(trim) // Trim each value
        .filter(Boolean) // Remove empty strings
    );

/**
 * Creates a Zod schema for parsing comma-separated values with trimming.
 *
 * @param {string} defaultValue - Default comma-separated string
 * @returns {z.ZodType} Zod schema that transforms CSV string to trimmed array
 */
const csvArray = (defaultValue: string) =>
  csv(defaultValue).transform(values => values.map(value => value.trim()));

/**
 * Parses the TRUST_PROXY environment variable.
 *
 * Accepts:
 * - Boolean-like values: "1", "true", "yes", "on" (true) or "0", "false", "no", "off" (false)
 * - Non-negative integers (number of proxies to trust)
 *
 * @param {string | undefined} rawValue - Raw TRUST_PROXY value
 * @returns {boolean | number | undefined} Parsed trust proxy value
 * @throws {Error} If value is not a valid boolean or non-negative integer
 */
const parseTrustProxy = (rawValue: string | undefined) => {
  if (rawValue === undefined) {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  // Boolean true values
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  // Boolean false values
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  // Non-negative integer (number of proxies)
  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  throw new Error("TRUST_PROXY must be a boolean-like value or a non-negative integer.");
};

/**
 * Environment Configuration Schema
 *
 * This Zod schema defines all environment variables used by the application.
 * Each variable has:
 * - Type validation
 * - Default values (where applicable)
 * - Transformation logic (where needed)
 *
 * CATEGORIES:
 * - Server: NODE_ENV, PORT, TRUST_PROXY
 * - Database: MONGO_URI
 * - Authentication: JWT_SECRET, COOKIE_SECRET
 * - CORS: CORS_ORIGINS, CLIENT_URL
 * - Rate Limiting: RATE_LIMIT_*, AUTH_RATE_LIMIT_*
 * - Security: CSRF_*, COOKIE_*
 * - File Upload: UPLOAD_*, RECEIPT_*, JOURNAL_*, CSV_*
 * - AI Service: PYTHON_API_URL, AI_CORE_*
 * - Billing: BILLING_PROVIDER, STRIPE_*
 * - Email: EMAIL_*
 * - Monitoring: METRICS_*, OTEL_*
 */
const envSchema = z
  .object({
    // Server Configuration
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),

    // Database Configuration
    MONGO_URI: optionalNonEmptyString,

    // Authentication Configuration
    JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
    COOKIE_SECRET: optionalNonEmptyString,
    TRUST_PROXY: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),

    // Async Jobs Configuration
    ASYNC_JOBS_ENABLED: optionalBoolFromEnv.default(false),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(200).max(60_000).default(1000),

    // Domain Event Fanout Configuration
    DOMAIN_EVENT_FANOUT_ENABLED: optionalBoolFromEnv.default(true),
    DOMAIN_EVENT_FANOUT_MODE: z.enum(["auto", "poll", "change_stream"]).default("auto"),
    DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS: z.coerce.number().int().min(200).max(60_000).default(1000),

    // Python AI Service Configuration
    PYTHON_API_URL: z.string().url().default("http://localhost:8001").transform(normalizeBaseUrl),
    CLIENT_URL: z.string().url().default("http://localhost:5173"),

    // CORS Configuration
    CORS_ORIGINS: csv("http://localhost:5173"),
    COOKIE_SECURE: optionalBoolFromEnv,
    COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    COOKIE_DOMAIN: optionalNonEmptyString,

    // Request Configuration
    REQUEST_SIZE_LIMIT: z.string().trim().min(1).default("1mb"),

    // Rate Limiting Configuration
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    // CSRF Protection Configuration
    CSRF_ENABLED: boolFromEnv.default(false),
    CSRF_COOKIE_NAME: z.string().trim().min(1).default("csrf_token"),

    // Feature Flags
    RECEIPTS_OCR_ENABLED: boolFromEnv.default(true),
    JOURNAL_ENABLED: boolFromEnv.default(true),
    ORG_LEGACY_BACKFILL_ENABLED: optionalBoolFromEnv,

    // File Upload Configuration
    UPLOAD_ALLOWED_MIME: csvArray("image/jpeg,image/png,image/webp"),
    RECEIPT_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024), // 8MB
    JOURNAL_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(4 * 1024 * 1024), // 4MB
    FILE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024), // 25MB
    CSV_UPLOAD_ALLOWED_MIME: csvArray("text/csv,application/vnd.ms-excel,application/csv"),
    CSV_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024), // 15MB

    // Monitoring Configuration
    METRICS_ENABLED: boolFromEnv.default(false),
    METRICS_TOKEN: optionalNonEmptyString,

    // Email Digest Configuration
    DIGEST_EMAIL_DAYS_BACK: z.coerce.number().int().min(1).max(31).default(7),

    // Task and Monetization Configuration
    TASKS_ENABLED: boolFromEnv.default(false),
    MONETIZATION_ENABLED: boolFromEnv.default(true),
    USAGE_EVENTS_INTERNAL_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(8).optional()
    ),

    // API Key Configuration
    API_KEY_PEPPER: optionalNonEmptyString,

    // AI Core Service Configuration
    AI_CORE_TOOLS_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(16).max(256).optional()
    ),

    // Billing Configuration
    BILLING_PROVIDER: z.enum(["stub", "stripe"]).optional(),
    STRIPE_SECRET_KEY: optionalNonEmptyString,
    STRIPE_WEBHOOK_SECRET: optionalNonEmptyString,
    STRIPE_PRICE_PRO_MONTHLY: optionalNonEmptyString,
    STRIPE_PRICE_TEAM_SEAT: optionalNonEmptyString,
    STRIPE_PRICE_ENTERPRISE: optionalNonEmptyString,

    // AI Core Concurrency Configuration
    AI_CORE_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),
    AI_CORE_MAX_CONCURRENCY_PER_USER: z.coerce.number().int().positive().default(2),

    // AI Core Timeout Configuration
    AI_CORE_STATUS_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
    AI_CORE_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
    AI_CORE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),

    // AI Core Circuit Breaker Configuration
    AI_CORE_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
    AI_CORE_CIRCUIT_OPEN_MS: z.coerce.number().int().positive().default(30_000),
    AI_CORE_HEALTH_CACHE_MS: z.coerce.number().int().positive().default(5000),

    // Plugin Runtime Configuration
    PLUGIN_RUNTIME_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    PLUGIN_RUNTIME_ALLOW_INSECURE: optionalBoolFromEnv,
    PLUGIN_RUNTIME_ALLOW_LOCALHOST: optionalBoolFromEnv,
    PLUGIN_RUNTIME_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    PLUGIN_RUNTIME_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(8).max(256).optional()
    ),

    // Tool Policy Configuration
    TOOL_POLICY_TX_CONFIRM_ABOVE: z.coerce.number().positive().default(200),

    // Google OAuth Configuration
    GOOGLE_CLIENT_ID: optionalNonEmptyString,
    GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
    GOOGLE_CALLBACK_URL: optionalNonEmptyString,

    // Email Configuration
    EMAIL_USER: optionalNonEmptyString,
    EMAIL_PASSWORD: optionalNonEmptyString,
    EMAIL_FROM: optionalNonEmptyString,
    EMAIL_SERVICE: optionalNonEmptyString,
    EMAIL_HOST: optionalNonEmptyString,
    EMAIL_PORT: optionalPortFromEnv,
    EMAIL_SECURE: optionalBoolFromEnv,
    EMAIL_REQUIRE_TLS: optionalBoolFromEnv,

    // Infrastructure Configuration (optional)
    REDIS_URL: optionalNonEmptyString,
    OTEL_ENDPOINT: optionalNonEmptyString,
  });

/**
 * Type definition for the validated environment configuration.
 *
 * This type is derived from the Zod schema with additional type refinements:
 * - COOKIE_SECURE is always a boolean (not optional)
 * - TRUST_PROXY is either a boolean or number (not string)
 */
export type Env = Omit<z.infer<typeof envSchema>, "COOKIE_SECURE" | "TRUST_PROXY"> & {
  COOKIE_SECURE: boolean;
  TRUST_PROXY: boolean | number;
};

/**
 * Formats Zod validation issues into a human-readable string.
 *
 * @param {z.ZodIssue[]} issues - Array of Zod validation issues
 * @returns {string} Formatted error message
 */
const formatEnvIssues = (issues: z.ZodIssue[]) => {
  return issues
    .map(issue => {
      const path = issue.path.join(".") || "root";
      return `${path}: ${issue.message}`;
    })
    .join(", ");
};

/**
 * Gets the validated environment configuration.
 *
 * This function:
 * 1. Validates all environment variables against the schema
 * 2. Applies computed values for optional settings
 * 3. Validates cross-field dependencies
 * 4. Returns a fully typed configuration object
 *
 * COMPUTED VALUES:
 * - TASKS_ENABLED: Defaults to true in development, false in production
 * - MONETIZATION_ENABLED: Defaults to true in development, false in production
 * - CSRF_ENABLED: Defaults to true in production
 * - COOKIE_SECURE: Defaults to true in production with HTTPS
 * - TRUST_PROXY: Defaults to true in production
 * - PLUGIN_RUNTIME_ALLOW_INSECURE: Defaults to true in development
 * - PLUGIN_RUNTIME_ALLOW_LOCALHOST: Defaults to true in development
 * - BILLING_PROVIDER: Defaults to "stripe" if STRIPE_SECRET_KEY is set
 *
 * @returns {Env} Validated environment configuration
 * @throws {Error} If configuration is invalid or dependencies are not met
 */
export const getEnv = (): Env => {
  // Validate environment variables against schema
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatEnvIssues(parsed.error.issues)}`);
  }

  // Validate metrics configuration
  if (parsed.data.METRICS_ENABLED && !parsed.data.METRICS_TOKEN) {
    throw new Error("METRICS_TOKEN is required when METRICS_ENABLED=true");
  }

  // Compute TASKS_ENABLED (default: true in development, false in production)
  const tasksEnabled =
    typeof process.env.TASKS_ENABLED === "string" ? parsed.data.TASKS_ENABLED : parsed.data.NODE_ENV !== "production";

  // Compute MONETIZATION_ENABLED (default: true in development, false in production)
  const monetizationEnabled =
    typeof process.env.MONETIZATION_ENABLED === "string"
      ? parsed.data.MONETIZATION_ENABLED
      : parsed.data.NODE_ENV !== "production";

  // Compute CSRF_ENABLED (default: true in production)
  const csrfEnabledExplicit = typeof process.env.CSRF_ENABLED === "string" ? parsed.data.CSRF_ENABLED : undefined;
  const csrfEnabledComputed = csrfEnabledExplicit ?? parsed.data.NODE_ENV === "production";

  // Compute COOKIE_SECURE (default: true in production with HTTPS)
  const cookieSecureExplicit = typeof process.env.COOKIE_SECURE === "string" ? parsed.data.COOKIE_SECURE : undefined;
  const cookieSecureComputed =
    cookieSecureExplicit ?? (parsed.data.NODE_ENV === "production" && parsed.data.CLIENT_URL.startsWith("https://"));

  // Validate COOKIE_SAME_SITE requires COOKIE_SECURE
  if (parsed.data.COOKIE_SAME_SITE === "none" && !cookieSecureComputed) {
    throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true (or production https CLIENT_URL).");
  }

  // Compute TRUST_PROXY (default: true in production)
  const trustProxyRaw = parseTrustProxy(parsed.data.TRUST_PROXY);
  const trustProxyComputed =
    trustProxyRaw !== undefined ? trustProxyRaw : parsed.data.NODE_ENV === "production";

  // Compute PLUGIN_RUNTIME_ALLOW_INSECURE (default: true in development)
  const pluginAllowInsecureExplicit =
    typeof process.env.PLUGIN_RUNTIME_ALLOW_INSECURE === "string" ? parsed.data.PLUGIN_RUNTIME_ALLOW_INSECURE : undefined;
  const pluginAllowInsecureComputed = pluginAllowInsecureExplicit ?? parsed.data.NODE_ENV !== "production";

  // Compute PLUGIN_RUNTIME_ALLOW_LOCALHOST (default: true in development)
  const pluginAllowLocalhostExplicit =
    typeof process.env.PLUGIN_RUNTIME_ALLOW_LOCALHOST === "string" ? parsed.data.PLUGIN_RUNTIME_ALLOW_LOCALHOST : undefined;
  const pluginAllowLocalhostComputed = pluginAllowLocalhostExplicit ?? parsed.data.NODE_ENV !== "production";

  // Compute BILLING_PROVIDER (default: "stripe" if STRIPE_SECRET_KEY is set)
  const billingProviderExplicit =
    typeof process.env.BILLING_PROVIDER === "string" ? parsed.data.BILLING_PROVIDER : undefined;
  const billingProviderComputed =
    billingProviderExplicit ?? (parsed.data.STRIPE_SECRET_KEY ? "stripe" : "stub");

  // Validate BILLING_PROVIDER requires STRIPE_SECRET_KEY
  if (billingProviderComputed === "stripe" && !parsed.data.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required when BILLING_PROVIDER=stripe");
  }

  // Compute ORG_LEGACY_BACKFILL_ENABLED (default: true in development)
  const orgLegacyBackfillExplicit =
    typeof process.env.ORG_LEGACY_BACKFILL_ENABLED === "string" ? parsed.data.ORG_LEGACY_BACKFILL_ENABLED : undefined;
  const orgLegacyBackfillComputed = orgLegacyBackfillExplicit ?? parsed.data.NODE_ENV !== "production";

  // Validate email configuration completeness
  const hasCoreEmailCredentials = Boolean(parsed.data.EMAIL_USER && parsed.data.EMAIL_PASSWORD && parsed.data.EMAIL_FROM);
  const hasPartialCoreEmailCredentials = Boolean(
    parsed.data.EMAIL_USER || parsed.data.EMAIL_PASSWORD || parsed.data.EMAIL_FROM
  );
  if (hasPartialCoreEmailCredentials && !hasCoreEmailCredentials) {
    throw new Error("Email config requires EMAIL_USER, EMAIL_PASSWORD, and EMAIL_FROM together.");
  }

  // Validate EMAIL_PORT is required when EMAIL_HOST is configured
  if (hasCoreEmailCredentials && parsed.data.EMAIL_HOST && !parsed.data.EMAIL_PORT) {
    throw new Error("EMAIL_PORT is required when EMAIL_HOST is configured.");
  }

  // Compute CORS origins (including localhost aliases)
  const corsOrigins = Array.from(
    new Set(
      [
        ...parsed.data.CORS_ORIGINS,
        parsed.data.CLIENT_URL,
      ].flatMap(origin => (origin === "*" ? ["*"] : localOriginAliases(origin)))
    )
  );

  // Return validated and computed configuration
  return {
    ...parsed.data,
    TASKS_ENABLED: tasksEnabled,
    MONETIZATION_ENABLED: monetizationEnabled,
    CSRF_ENABLED: csrfEnabledComputed,
    COOKIE_SECURE: cookieSecureComputed,
    TRUST_PROXY: trustProxyComputed,
    PLUGIN_RUNTIME_ALLOW_INSECURE: pluginAllowInsecureComputed,
    PLUGIN_RUNTIME_ALLOW_LOCALHOST: pluginAllowLocalhostComputed,
    BILLING_PROVIDER: billingProviderComputed,
    ORG_LEGACY_BACKFILL_ENABLED: orgLegacyBackfillComputed,
    CORS_ORIGINS: corsOrigins,
  };
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Zod for Config Validation**: Using Zod schemas for environment variables
 *    provides type safety, default values, and clear error messages. This is
 *    far superior to manual process.env parsing with type assertions.
 *
 * 2. **Computed Defaults**: Many config values have intelligent defaults based
 *    on NODE_ENV (e.g., CSRF_ENABLED defaults to true in production, false in
 *    development). This reduces configuration burden while maintaining security.
 *
 * 3. **Cross-Field Validation**: The schema validates dependencies between
 *    variables (e.g., COOKIE_SAME_SITE=none requires COOKIE_SECURE=true).
 *    This catches misconfiguration at startup rather than at runtime.
 *
 * 4. **Localhost Aliasing**: CORS origins automatically include both localhost
 *    and 127.0.0.1 variants. This prevents "origin not allowed" errors during
 *    local development.
 *
 * 5. **Fail-Fast Pattern**: Invalid configuration throws immediately at startup
 *    rather than causing mysterious runtime errors. This is a production best practice.
 *
 * PATTERNS TO LEARN:
 * ─────────────────
 * - `z.preprocess()`: Transform input before validation (e.g., empty string → undefined)
 * - `z.coerce.number()`: Convert string env vars to numbers
 * - `z.enum()`: Restrict values to a known set
 * - Computed defaults: derive values from other validated values
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * env.ts → imported by every config module (database, redis, passport, telemetry)
 * env.ts → imported by app.ts for CORS, rate limiting, and security configuration
 * env.ts → the single source of truth for all configuration
 * ══════════════════════════════════════════════════════════════════════
 */
