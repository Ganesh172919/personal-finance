/**
 * @fileoverview Client-side multi-currency foreign exchange rates and formatting utility.
 */

export type SupportedCurrency = "USD" | "EUR" | "GBP" | "INR" | "CAD" | "AUD" | "JPY";

export const FX_RATES_TO_USD: Record<SupportedCurrency, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  INR: 83.5,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
};

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  CAD: "CA$",
  AUD: "A$",
  JPY: "¥",
};

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  USD: "USD ($)",
  EUR: "EUR (€)",
  GBP: "GBP (£)",
  INR: "INR (₹)",
  CAD: "CAD (CA$)",
  AUD: "AUD (A$)",
  JPY: "JPY (¥)",
};

export const normalizeCurrency = (curr?: string): SupportedCurrency => {
  const upper = (curr || "USD").trim().toUpperCase();
  if (upper in FX_RATES_TO_USD) {
    return upper as SupportedCurrency;
  }
  return "USD";
};

export const convertUsdToCurrency = (amountUsd: number, targetCurrency: string): number => {
  const curr = normalizeCurrency(targetCurrency);
  const rate = FX_RATES_TO_USD[curr] ?? 1.0;
  const converted = amountUsd * rate;
  if (curr === "JPY") {
    return Math.round(converted);
  }
  return Math.round(converted * 100) / 100;
};

export const formatBillingCurrency = (amountUsd: number, currency: string): string => {
  const curr = normalizeCurrency(currency);
  const converted = convertUsdToCurrency(amountUsd, curr);
  const symbol = CURRENCY_SYMBOLS[curr] ?? "$";
  if (curr === "JPY") {
    return `${symbol}${converted.toLocaleString("en-US")}`;
  }
  return `${symbol}${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
