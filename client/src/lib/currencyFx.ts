/**
 * @fileoverview Client-side multi-currency foreign exchange rates and formatting utility.
 */

// Enumerates ISO currency codes supported for monetary calculations and displays.
// Defines allowed currency symbols across billing, wallets, and financial reporting.
// Restricts supported international currency conversions within frontend views.
export type SupportedCurrency = "USD" | "EUR" | "GBP" | "INR" | "CAD" | "AUD" | "JPY";

// Array of all actively supported currency codes available for user selection.
// Feeds currency picker dropdown components and form selection inputs.
// Guarantees consistent currency ordering across multi-currency account menus.
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"];

// Maps supported currency codes to static baseline foreign exchange rates against USD.
// Serves as an offline reference conversion table for estimated monetary projections.
// Supplies default conversion multipliers when live market exchange feeds are absent.
export const FX_RATES_TO_USD: Record<SupportedCurrency, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  INR: 83.5,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
};

// Maps each supported currency code to its respective unicode typographic symbol.
// Powers visual prefix rendering across pricing displays, invoices, and summaries.
// Guarantees appropriate regional currency symbol presentation for users.
export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  CAD: "CA$",
  AUD: "A$",
  JPY: "¥",
};

// Associates currency codes with formatted descriptive labels including symbols.
// Enhances dropdown options by providing explicit disambiguation between dollars.
// Standardizes currency selector presentations across user preference panels.
export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  USD: "USD ($)",
  EUR: "EUR (€)",
  GBP: "GBP (£)",
  INR: "INR (₹)",
  CAD: "CAD (CA$)",
  AUD: "AUD (A$)",
  JPY: "JPY (¥)",
};

// Sanitizes and standardizes arbitrary currency code strings to valid supported types.
// Converts input text to uppercase and defaults gracefully to USD when unrecognized.
// Prevents runtime errors when processing incoming currency values from API data.
export const normalizeCurrency = (curr?: string): SupportedCurrency => {
  const upper = (curr || "USD").trim().toUpperCase();
  if (upper in FX_RATES_TO_USD) {
    return upper as SupportedCurrency;
  }
  return "USD";
};

// Converts a base USD amount into a targeted foreign currency using defined FX rates.
// Applies currency-specific rounding conventions, such as zero decimals for JPY.
// Computes estimated localized monetary figures for internationalized displays.
export const convertUsdToCurrency = (amountUsd: number, targetCurrency: string): number => {
  const curr = normalizeCurrency(targetCurrency);
  const rate = FX_RATES_TO_USD[curr] ?? 1.0;
  const converted = amountUsd * rate;
  if (curr === "JPY") {
    return Math.round(converted);
  }
  return Math.round(converted * 100) / 100;
};

// Formats an underlying USD amount into a localized currency string with proper symbols.
// Converts values and applies standard locale number formatting with correct decimals.
// Generates publication-ready formatted pricing strings for subscription views.
export const formatBillingCurrency = (amountUsd: number, currency: string): string => {
  const curr = normalizeCurrency(currency);
  const converted = convertUsdToCurrency(amountUsd, curr);
  const symbol = CURRENCY_SYMBOLS[curr] ?? "$";
  if (curr === "JPY") {
    return `${symbol}${converted.toLocaleString("en-US")}`;
  }
  return `${symbol}${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
