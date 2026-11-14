/**
 * @fileoverview Deterministic multi-currency foreign exchange rates and formatting utility.
 *
 * Supported currencies for billing localization:
 * - USD ($) [Base]
 * - EUR (€)
 * - GBP (£)
 * - INR (₹)
 * - CAD (CA$)
 * - AUD (A$)
 * - JPY (¥)
 */

// Defines the union of ISO currency codes supported across the application.
// Used for localized billing displays, multi-currency conversions, and formatting.
export type SupportedCurrency = "USD" | "EUR" | "GBP" | "INR" | "CAD" | "AUD" | "JPY";

// Lists all supported currency codes as an array for iteration and validation.
// Provides an authoritative source of available options in UI selectors and API validators.
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"];

// Maps each supported currency to its baseline foreign exchange rate relative to USD.
// Provides deterministic conversion multipliers across financial analytics and billing.
export const FX_RATES_TO_USD: Record<SupportedCurrency, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  INR: 83.5,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
};

// Maps each supported currency code to its respective graphical currency symbol.
// Used to decorate formatted monetary outputs with standardized typographic glyphs.
export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  CAD: "CA$",
  AUD: "A$",
  JPY: "¥",
};

// Normalizes an incoming currency identifier string into a supported ISO code.
// Trims whitespace, uppercases the input, and safely defaults to USD if invalid.
export const normalizeCurrency = (curr?: string): SupportedCurrency => {
  const upper = (curr || "USD").trim().toUpperCase();
  if (upper in FX_RATES_TO_USD) {
    return upper as SupportedCurrency;
  }
  return "USD";
};

// Converts a given USD monetary amount into a specified target currency.
// Applies currency-specific rounding, formatting JPY to whole units and others to two decimals.
export const convertUsdToCurrency = (amountUsd: number, targetCurrency: string): number => {
  const curr = normalizeCurrency(targetCurrency);
  const rate = FX_RATES_TO_USD[curr] ?? 1.0;
  const converted = amountUsd * rate;
  if (curr === "JPY") {
    return Math.round(converted);
  }
  return Math.round(converted * 100) / 100;
};

// Formats a USD monetary amount into a localized display string with the appropriate currency symbol.
// Handles currency conversion and renders with standard locale-aware decimal formatting.
export const formatBillingCurrency = (amountUsd: number, currency: string): string => {
  const curr = normalizeCurrency(currency);
  const converted = convertUsdToCurrency(amountUsd, curr);
  const symbol = CURRENCY_SYMBOLS[curr] ?? "$";
  if (curr === "JPY") {
    return `${symbol}${converted.toLocaleString("en-US")}`;
  }
  return `${symbol}${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
