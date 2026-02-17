const PERCENT_RE = /(?:^|[^\d])(\d+(?:\.\d+)?)\s*%/g;
const DATE_LIKE_RE = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/g;
const AMOUNT_RE =
  /(?:(?<sym>[₹$€£])\s*)?(?<num>\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?<suf>[kKmM])?/g;

const normalizeWs = (value: string) => String(value || "").replace(/\s+/g, " ").trim();

const parseAmounts = (text: string) => {
  const results: Array<{ value: number; currency: string | null; raw: string }> = [];
  for (const match of text.matchAll(AMOUNT_RE)) {
    const raw = String(match[0] || "").trim();
    const sym = match.groups?.sym;
    const numRaw = String(match.groups?.num || "").replace(/\s/g, "").replace(/,/g, "");
    const suf = String(match.groups?.suf || "").toLowerCase();

    const num = Number(numRaw);
    if (!Number.isFinite(num)) continue;

    let value = num;
    if (suf === "k") value *= 1000;
    if (suf === "m") value *= 1_000_000;

    let currency: string | null = null;
    if (sym === "₹") currency = "INR";
    if (sym === "$") currency = "USD";
    if (sym === "€") currency = "EUR";
    if (sym === "£") currency = "GBP";

    results.push({ value: Number(value), currency, raw });
  }
  return results;
};

const parsePercentages = (text: string) => {
  const out: number[] = [];
  for (const match of text.matchAll(PERCENT_RE)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    out.push(value);
  }
  return out;
};

const parseDateLike = (raw: string) => {
  const normalized = raw.replace(/[\.]/g, "-").replace(/[\/]/g, "-");
  const parts = normalized.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return null;

  const isYearFirst = parts[0].length === 4;
  let year = Number(isYearFirst ? parts[0] : parts[2]);
  let month = Number(parts[1]);
  let day = Number(isYearFirst ? parts[2] : parts[0]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  if (year < 100) {
    year += 2000;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const parseDates = (text: string) => {
  const out: string[] = [];
  for (const match of text.matchAll(DATE_LIKE_RE)) {
    const raw = String(match[1] || match[0] || "");
    const parsed = parseDateLike(raw);
    if (parsed) out.push(parsed);
  }
  return Array.from(new Set(out));
};

const extractGoalCandidates = (text: string, amounts: Array<{ value: number; currency: string | null }>) => {
  const lowered = text.toLowerCase();
  const patterns: Array<{ name: string; keywords: string[] }> = [
    { name: "Emergency Fund", keywords: ["emergency", "buffer"] },
    { name: "Savings Target", keywords: ["savings target", "save", "saving target", "savings goal", "goal"] },
    { name: "Debt Paydown", keywords: ["payoff", "debt", "loan"] },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some((k) => lowered.includes(k))) {
      const target = amounts.length ? amounts[0].value : null;
      const currency = amounts.length ? amounts[0].currency : null;
      return [{ name: pattern.name, target, currency }];
    }
  }
  return [];
};

const extractBudgetAdjustments = (text: string, amounts: Array<{ value: number; currency: string | null }>) => {
  const lowered = text.toLowerCase();
  if (!lowered.includes("budget") && !lowered.includes("expense") && !lowered.includes("spend")) {
    return [];
  }

  return amounts.slice(0, 3).map((amount) => ({
    description: "Budget-related amount detected",
    amount: amount.value,
    currency: amount.currency,
  }));
};

export const parseJournalIntent = (recognizedText: string) => {
  const lines = String(recognizedText || "")
    .split("\n")
    .map(normalizeWs)
    .filter(Boolean);
  const rawText = lines.join("\n").trim();
  const flat = rawText.replace(/\n/g, " ");

  const amounts = parseAmounts(flat);
  const percentages = parsePercentages(flat);
  const dates = parseDates(flat);
  const goal_candidates = extractGoalCandidates(flat, amounts);
  const budget_adjustments = extractBudgetAdjustments(flat, amounts);

  return {
    amounts,
    percentages,
    dates,
    goal_candidates,
    budget_adjustments,
  };
};

