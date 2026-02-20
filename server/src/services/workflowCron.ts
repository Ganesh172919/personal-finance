import { CronExpressionParser } from "cron-parser";

const DEFAULT_TIMEZONE = "UTC";

export const isValidIanaTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const normalizeTimeZone = (value: unknown, fallback = DEFAULT_TIMEZONE) => {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz) return fallback;
  return isValidIanaTimeZone(tz) ? tz : fallback;
};

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
