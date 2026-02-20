import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const trim = (value: string) => value.trim();
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const normalizeBaseUrl = (rawValue: string) => {
  try {
    const url = new URL(rawValue);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return url.origin;
  } catch {
    return String(rawValue || "").replace(/\/$/, "");
  }
};

const boolFromEnv = z.preprocess(value => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}, z.boolean());

const optionalBoolFromEnv = z.preprocess(emptyStringToUndefined, boolFromEnv.optional());
const optionalNonEmptyString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional()
);
const optionalPortFromEnv = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().min(1).max(65535).optional()
);

const csv = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform(value =>
      value
        .split(",")
        .map(trim)
        .filter(Boolean)
    );

const csvArray = (defaultValue: string) =>
  csv(defaultValue).transform(values => values.map(value => value.trim()));

const parseTrustProxy = (rawValue: string | undefined) => {
  if (rawValue === undefined) {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  throw new Error("TRUST_PROXY must be a boolean-like value or a non-negative integer.");
};

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    PORT: z.coerce.number().int().positive().default(3000),
    MONGO_URI: optionalNonEmptyString,
    JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
    TRUST_PROXY: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),

    PYTHON_API_URL: z.string().url().default("http://localhost:8001").transform(normalizeBaseUrl),
    CLIENT_URL: z.string().url().default("http://localhost:5173"),
    CORS_ORIGINS: csv("http://localhost:5173"),
    COOKIE_SECURE: optionalBoolFromEnv,
    COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    COOKIE_DOMAIN: optionalNonEmptyString,

    REQUEST_SIZE_LIMIT: z.string().trim().min(1).default("1mb"),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    CSRF_ENABLED: boolFromEnv.default(false),
    CSRF_COOKIE_NAME: z.string().trim().min(1).default("csrf_token"),

    RECEIPTS_OCR_ENABLED: boolFromEnv.default(true),
    JOURNAL_ENABLED: boolFromEnv.default(true),

    ORG_LEGACY_BACKFILL_ENABLED: optionalBoolFromEnv,

    UPLOAD_ALLOWED_MIME: csvArray("image/jpeg,image/png,image/webp"),
    RECEIPT_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
    JOURNAL_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(4 * 1024 * 1024),
    CSV_UPLOAD_ALLOWED_MIME: csvArray("text/csv,application/vnd.ms-excel,application/csv"),
    CSV_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),

    METRICS_ENABLED: boolFromEnv.default(false),
    METRICS_TOKEN: optionalNonEmptyString,

    DIGEST_EMAIL_DAYS_BACK: z.coerce.number().int().min(1).max(31).default(7),

    TASKS_ENABLED: boolFromEnv.default(false),
    MONETIZATION_ENABLED: boolFromEnv.default(true),
    USAGE_EVENTS_INTERNAL_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(8).optional()
    ),

    API_KEY_PEPPER: optionalNonEmptyString,

    AI_CORE_TOOLS_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(16).max(256).optional()
    ),

    BILLING_PROVIDER: z.enum(["stub", "stripe"]).optional(),
    STRIPE_SECRET_KEY: optionalNonEmptyString,
    STRIPE_WEBHOOK_SECRET: optionalNonEmptyString,
    STRIPE_PRICE_PRO_MONTHLY: optionalNonEmptyString,
    STRIPE_PRICE_TEAM_SEAT: optionalNonEmptyString,
    STRIPE_PRICE_ENTERPRISE: optionalNonEmptyString,

    AI_CORE_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),
    AI_CORE_MAX_CONCURRENCY_PER_USER: z.coerce.number().int().positive().default(2),

    AI_CORE_STATUS_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
    AI_CORE_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
    AI_CORE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
    AI_CORE_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
    AI_CORE_CIRCUIT_OPEN_MS: z.coerce.number().int().positive().default(30_000),
    AI_CORE_HEALTH_CACHE_MS: z.coerce.number().int().positive().default(5000),

    PLUGIN_RUNTIME_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    PLUGIN_RUNTIME_ALLOW_INSECURE: optionalBoolFromEnv,
    PLUGIN_RUNTIME_ALLOW_LOCALHOST: optionalBoolFromEnv,
    PLUGIN_RUNTIME_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    PLUGIN_RUNTIME_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(8).max(256).optional()
    ),

    TOOL_POLICY_TX_CONFIRM_ABOVE: z.coerce.number().positive().default(200),

    GOOGLE_CLIENT_ID: optionalNonEmptyString,
    GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
    GOOGLE_CALLBACK_URL: optionalNonEmptyString,

    EMAIL_USER: optionalNonEmptyString,
    EMAIL_PASSWORD: optionalNonEmptyString,
    EMAIL_FROM: optionalNonEmptyString,
    EMAIL_SERVICE: optionalNonEmptyString,
    EMAIL_HOST: optionalNonEmptyString,
    EMAIL_PORT: optionalPortFromEnv,
    EMAIL_SECURE: optionalBoolFromEnv,
    EMAIL_REQUIRE_TLS: optionalBoolFromEnv,
  });

export type Env = Omit<z.infer<typeof envSchema>, "COOKIE_SECURE" | "TRUST_PROXY"> & {
  COOKIE_SECURE: boolean;
  TRUST_PROXY: boolean | number;
};

const formatEnvIssues = (issues: z.ZodIssue[]) => {
  return issues
    .map(issue => {
      const path = issue.path.join(".") || "root";
      return `${path}: ${issue.message}`;
    })
    .join(", ");
};

export const getEnv = (): Env => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatEnvIssues(parsed.error.issues)}`);
  }

  if (parsed.data.METRICS_ENABLED && !parsed.data.METRICS_TOKEN) {
    throw new Error("METRICS_TOKEN is required when METRICS_ENABLED=true");
  }

  const tasksEnabled =
    typeof process.env.TASKS_ENABLED === "string" ? parsed.data.TASKS_ENABLED : parsed.data.NODE_ENV !== "production";
  const monetizationEnabled =
    typeof process.env.MONETIZATION_ENABLED === "string"
      ? parsed.data.MONETIZATION_ENABLED
      : parsed.data.NODE_ENV !== "production";

  const csrfEnabledExplicit = typeof process.env.CSRF_ENABLED === "string" ? parsed.data.CSRF_ENABLED : undefined;
  const csrfEnabledComputed = csrfEnabledExplicit ?? parsed.data.NODE_ENV === "production";

  const cookieSecureExplicit = typeof process.env.COOKIE_SECURE === "string" ? parsed.data.COOKIE_SECURE : undefined;
  const cookieSecureComputed =
    cookieSecureExplicit ?? (parsed.data.NODE_ENV === "production" && parsed.data.CLIENT_URL.startsWith("https://"));

  if (parsed.data.COOKIE_SAME_SITE === "none" && !cookieSecureComputed) {
    throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true (or production https CLIENT_URL).");
  }

  const trustProxyRaw = parseTrustProxy(parsed.data.TRUST_PROXY);
  const trustProxyComputed =
    trustProxyRaw !== undefined ? trustProxyRaw : parsed.data.NODE_ENV === "production";

  const pluginAllowInsecureExplicit =
    typeof process.env.PLUGIN_RUNTIME_ALLOW_INSECURE === "string" ? parsed.data.PLUGIN_RUNTIME_ALLOW_INSECURE : undefined;
  const pluginAllowInsecureComputed = pluginAllowInsecureExplicit ?? parsed.data.NODE_ENV !== "production";

  const pluginAllowLocalhostExplicit =
    typeof process.env.PLUGIN_RUNTIME_ALLOW_LOCALHOST === "string" ? parsed.data.PLUGIN_RUNTIME_ALLOW_LOCALHOST : undefined;
  const pluginAllowLocalhostComputed = pluginAllowLocalhostExplicit ?? parsed.data.NODE_ENV !== "production";

  const billingProviderExplicit =
    typeof process.env.BILLING_PROVIDER === "string" ? parsed.data.BILLING_PROVIDER : undefined;
  const billingProviderComputed =
    billingProviderExplicit ?? (parsed.data.STRIPE_SECRET_KEY ? "stripe" : "stub");

  if (billingProviderComputed === "stripe" && !parsed.data.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required when BILLING_PROVIDER=stripe");
  }

  const orgLegacyBackfillExplicit =
    typeof process.env.ORG_LEGACY_BACKFILL_ENABLED === "string" ? parsed.data.ORG_LEGACY_BACKFILL_ENABLED : undefined;
  const orgLegacyBackfillComputed = orgLegacyBackfillExplicit ?? parsed.data.NODE_ENV !== "production";

  const hasCoreEmailCredentials = Boolean(parsed.data.EMAIL_USER && parsed.data.EMAIL_PASSWORD && parsed.data.EMAIL_FROM);
  const hasPartialCoreEmailCredentials = Boolean(
    parsed.data.EMAIL_USER || parsed.data.EMAIL_PASSWORD || parsed.data.EMAIL_FROM
  );
  if (hasPartialCoreEmailCredentials && !hasCoreEmailCredentials) {
    throw new Error("Email config requires EMAIL_USER, EMAIL_PASSWORD, and EMAIL_FROM together.");
  }

  if (hasCoreEmailCredentials && parsed.data.EMAIL_HOST && !parsed.data.EMAIL_PORT) {
    throw new Error("EMAIL_PORT is required when EMAIL_HOST is configured.");
  }

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
  };
};
