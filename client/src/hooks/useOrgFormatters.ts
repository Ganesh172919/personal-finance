import { useMemo } from "react";

import { useAppConfig } from "@/hooks/useAppConfig";

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_TIMEZONE = "UTC";

const coerceString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const useOrgFormatters = (options: { enabled?: boolean } = {}) => {
  const configQuery = useAppConfig({ enabled: options.enabled });

  const localeRaw = coerceString((configQuery.data as any)?.org?.locale);
  const currencyRaw = coerceString((configQuery.data as any)?.org?.currency);
  const timezoneRaw = coerceString((configQuery.data as any)?.org?.timezone);

  const locale = localeRaw || DEFAULT_LOCALE;
  const currency = currencyRaw || DEFAULT_CURRENCY;
  const timezone = timezoneRaw || DEFAULT_TIMEZONE;

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [currency, locale]
  );

  const formatNumber = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return numberFormatter.format(num);
  };

  const formatMoney = (value: unknown, format?: Intl.NumberFormatOptions) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";

    if (format && Object.keys(format).length > 0) {
      return new Intl.NumberFormat(locale, { style: "currency", currency, ...format }).format(num);
    }

    return moneyFormatter.format(num);
  };

  const formatDate = (value: string | Date | null | undefined, format?: Intl.DateTimeFormatOptions) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const fmt =
      format && Object.keys(format).length > 0
        ? new Intl.DateTimeFormat(locale, { timeZone: timezone, ...format })
        : new Intl.DateTimeFormat(locale, { timeZone: timezone, year: "numeric", month: "short", day: "numeric" });
    return fmt.format(d);
  };

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
