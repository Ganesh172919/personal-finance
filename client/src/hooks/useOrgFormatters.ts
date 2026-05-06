/**
 * @fileoverview Organization-aware Formatting Hook
 *
 * Provides locale-aware formatting functions for numbers, currencies, dates,
 * and times based on the user's organization settings (locale, currency, timezone).
 *
 * WHY ORG-AWARE FORMATTING?
 * A user in India (en-IN, INR) should see "₹1,23,456.00" while a user in
 * the US (en-US, USD) sees "$1,23,456.00". The org config determines the
 * formatting rules for all monetary and numeric displays.
 *
 * INTERNATIONALIZATION (i18n):
 * Uses the browser's Intl.NumberFormat and Intl.DateTimeFormat APIs, which
 * handle locale-specific formatting (thousands separators, decimal marks,
 * date order, currency symbols, etc.).
 *
 * DEFENSIVE DEFAULTS:
 * If org config is missing or incomplete, sensible defaults are used
 * (en-US, USD, UTC) so the app always works.
 *
 * @example
 * const { formatMoney, formatDate } = useOrgFormatters();
 * formatMoney(1234.56);    // "$1,234.56" (en-US) or "₹1,234.56" (en-IN)
 * formatDate("2025-01-15"); // "Jan 15, 2025" (en-US) or "15 Jan 2025" (en-GB)
 *
 * @module hooks/useOrgFormatters
 */

import { useMemo } from "react";

import { useAppConfig } from "@/hooks/useAppConfig";

/** Fallback locale when org config doesn't specify one */
const DEFAULT_LOCALE = "en-US";
/** Fallback currency when org config doesn't specify one */
const DEFAULT_CURRENCY = "USD";
/** Fallback timezone when org config doesn't specify one */
const DEFAULT_TIMEZONE = "UTC";

/** Safely extracts a trimmed string from an unknown value */
const coerceString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Provides locale-aware formatting functions based on the user's org settings.
 *
 * @param options.enabled - Whether to fetch config (default: true)
 * @returns Object with formatNumber, formatMoney, formatDate, formatDateTime, formatTime
 */
export const useOrgFormatters = (options: { enabled?: boolean } = {}) => {
  const configQuery = useAppConfig({ enabled: options.enabled });

  // Extract org-level locale, currency, and timezone from config
  const localeRaw = coerceString((configQuery.data as any)?.org?.locale);
  const currencyRaw = coerceString((configQuery.data as any)?.org?.currency);
  const timezoneRaw = coerceString((configQuery.data as any)?.org?.timezone);

  // Apply defaults if org config values are missing
  const locale = localeRaw || DEFAULT_LOCALE;
  const currency = currencyRaw || DEFAULT_CURRENCY;
  const timezone = timezoneRaw || DEFAULT_TIMEZONE;

  // Memoize formatters — only recreate when locale/currency changes
  // Intl.NumberFormat is expensive to create, so reuse instances
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [currency, locale]
  );

  // Format a number using locale-specific separators (e.g., 1,234.56 or 1.234,56)
  const formatNumber = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—"; // Em dash for invalid values
    return numberFormatter.format(num);
  };

  // Format a monetary value with currency symbol and locale-specific formatting
  const formatMoney = (value: unknown, format?: Intl.NumberFormatOptions) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";

    // Allow per-call format overrides (e.g., minimumFractionDigits)
    if (format && Object.keys(format).length > 0) {
      return new Intl.NumberFormat(locale, { style: "currency", currency, ...format }).format(num);
    }

    return moneyFormatter.format(num);
  };

  // Format a date using locale-specific date order and month names
  const formatDate = (value: string | Date | null | undefined, format?: Intl.DateTimeFormatOptions) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—"; // Invalid date
    const fmt =
      format && Object.keys(format).length > 0
        ? new Intl.DateTimeFormat(locale, { timeZone: timezone, ...format })
        : new Intl.DateTimeFormat(locale, { timeZone: timezone, year: "numeric", month: "short", day: "numeric" });
    return fmt.format(d);
  };

  // Format a date+time using locale-specific formatting
  const formatDateTime = (value: string | Date | null | undefined, format?: Intl.DateTimeFormatOptions) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const fmt =
      format && Object.keys(format).length > 0
        ? new Intl.DateTimeFormat(locale, { timeZone: timezone, ...format })
        : new Intl.DateTimeFormat(locale, {
            timeZone: timezone,
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
    return fmt.format(d);
  };

  // Format time only (no date) using locale-specific formatting
  const formatTime = (value: string | Date | null | undefined, format?: Intl.DateTimeFormatOptions) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const fmt =
      format && Object.keys(format).length > 0
        ? new Intl.DateTimeFormat(locale, { timeZone: timezone, ...format })
        : new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
    return fmt.format(d);
  };

  return {
    configQuery,
    locale,
    currency,
    timezone,
    formatNumber,
    formatMoney,
    formatDate,
    formatDateTime,
    formatTime,
  };
};
