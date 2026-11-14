import { CronExpressionParser } from "cron-parser";

const DEFAULT_TIMEZONE = "UTC";

// Validates whether a provided string corresponds to a valid IANA timezone identifier.
// Tests timezone strings by instantiating an Intl.DateTimeFormat formatter.
// Returns boolean indicators of timezone validity across calendar operations.
export const isValidIanaTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

// Sanitizes and normalizes an input timezone value against IANA specifications.
// Validates candidate strings and falls back to UTC when inputs are invalid.
// Prevents scheduling crashes caused by malformed or unknown timezone strings.
export const normalizeTimeZone = (value: unknown, fallback = DEFAULT_TIMEZONE) => {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz) return fallback;
  return isValidIanaTimeZone(tz) ? tz : fallback;
};

// Calculates the next execution Date for a cron expression relative to a reference time.
// Parses standard 5-part cron syntax adjusted for the organization's timezone.
// Returns a JavaScript Date representing the upcoming scheduled trigger point.
export const computeNextCronRunAt = (params: { cron: string; from?: Date; timeZone?: string }) => {
  const cron = String(params.cron || "").trim();
  if (!cron) {
    throw new Error("Cron expression is required");
  }

  const timeZone = normalizeTimeZone(params.timeZone);
  const from = params.from ? new Date(params.from) : new Date();

  const interval = CronExpressionParser.parse(cron, {
    currentDate: from,
    tz: timeZone,
  });

  const next = interval.next() as any;
  if (next && typeof next.toDate === "function") {
    return next.toDate() as Date;
  }
  return new Date(next.getTime());
};
