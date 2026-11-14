/**
 * @fileoverview Deterministic Semantic Vector Embedding & Analysis Service
 *
 * Provides a 64-dimensional normalized vector embedding for personal finance
 * journal notes, combining canonical domain-specific semantic concept clusters
 * with token n-gram hash projection, cosine similarity calculation, automatic
 * tag classification, and sentiment detection.
 *
 * Architecture:
 * - Dimensions 0-7: High-weight semantic concept clusters (Savings, Budget, Debt,
 *   Investing, Income, Goals, Taxes, Discretionary/Lifestyle).
 * - Dimensions 8-63: Sub-token and n-gram hash projections with term-frequency weighting.
 * - L2-normalization ensures dot product equals exact cosine similarity bounded in [0, 1].
 */

// Length of the dense numerical vector space for note embeddings.
// Allocates partitioned semantic concept dimensions and n-gram hash bins.
// Standardizes feature dimensionality across similarity indexing routines.
export const EMBEDDING_DIMENSION = 64;

// Categorical sentiment states derived from financial journal entries.
// Distinguishes optimistic, concerned, neutral, and urgent tones.
// Enhances AI reasoning with emotional context surrounding user finances.
export type JournalSentiment = "optimistic" | "concerned" | "neutral" | "urgent";

// Structural contract defining core financial domain concepts for vector projection.
// Specifies fixed dimension indices, taxonomy tags, keyword lists, and scalar weights.
// Used to project textual keyword matches into high-weight semantic vector slots.
interface ConceptDefinition {
  dimension: number;
  tag: string;
  weight: number;
  keywords: string[];
}

// Curated catalog of primary personal finance conceptual domains.
// Maps savings, budgeting, debt, investing, income, goals, taxes, and lifestyle.
// Assigns prioritized dimension indices and weights for vector embeddings.
const FINANCIAL_CONCEPTS: ConceptDefinition[] = [
  {
    dimension: 0,
    tag: "savings",
    weight: 2.5,
    keywords: ["savings", "save", "emergency fund", "deposit", "reserve", "hysa", "cushion", "nest egg"],
  },
  {
    dimension: 1,
    tag: "budget",
    weight: 2.2,
    keywords: ["budget", "expenses", "spend", "bills", "rent", "utilities", "groceries", "subscription", "dining", "cost"],
  },
  {
    dimension: 2,
    tag: "debt",
    weight: 2.4,
    keywords: ["debt", "loan", "credit card", "mortgage", "interest", "payoff", "principal", "apr", "emi", "borrow"],
  },
  {
    dimension: 3,
    tag: "investing",
    weight: 2.4,
    keywords: ["invest", "stocks", "etf", "portfolio", "retirement", "401k", "ira", "dividend", "equity", "crypto", "shares"],
  },
  {
    dimension: 4,
    tag: "income",
    weight: 2.3,
    keywords: ["income", "salary", "bonus", "revenue", "paycheck", "earnings", "wage", "side hustle", "raise"],
  },
  {
    dimension: 5,
    tag: "goals",
    weight: 2.0,
    keywords: ["goal", "target", "milestone", "plan", "timeline", "horizon", "future", "objective"],
  },
  {
    dimension: 6,
    tag: "taxes",
    weight: 2.1,
    keywords: ["tax", "wht", "deduction", "writeoff", "irs", "bracket", "withholding", "refund"],
  },
  {
    dimension: 7,
    tag: "lifestyle",
    weight: 1.8,
    keywords: ["travel", "vacation", "holiday", "shopping", "entertainment", "gadget", "trip", "luxury"],
  },
];

// Lexicon of high-priority distress and deadline markers in financial prose.
// Matches critical events like late fees, collections, default, and panic.
// Triggers urgent sentiment classification during journal analysis runs.
const URGENT_WORDS = [
  "urgent", "crisis", "overdue", "default", "late fee", "penalty", "struggling", "collections",
  "drowning", "panic", "behind on",
];

// Lexical triggers indicating financial distress, risk, or budget shortfall.
// Identifies vocabulary associated with inflation, deficits, debt, and stress.
// Signals negative sentiment trajectories across user financial journals.
const CONCERNED_WORDS = [
  "stress", "worried", "anxious", "deficit", "shortfall", "cut back", "high interest", "inflation",
  "expensive", "debt", "risk",
];

// Vocabulary denoting financial success, promotions, milestones, and surplus.
// Detects positive milestones, bonus earnings, celebrations, and achievements.
// Maps upbeat user narrative entries to optimistic sentiment classifications.
const OPTIMISTIC_WORDS = [
  "growth", "bonus", "achieved", "ahead", "surplus", "celebrate", "saved", "milestone", "thriving",
  "raise", "promotion", "win", "target reached",
];

/**
 * 32-bit FNV-1a hash algorithm for deterministic token projection.
 */
// Fast 32-bit Fowler-Noll-Vo hash algorithm implementation for token hashing.
// Produces uniform deterministic integer distributions from input strings.
// Projects n-gram tokens into fixed dimension slots within embedding vectors.
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/**
 * Normalizes text to lowercase alphanumeric tokens.
 */
// Breaks raw text into normalized, lowercase alphanumeric word tokens.
// Strips punctuation and delimiters while filtering out single-character tokens.
// Prepares clean word arrays for n-gram feature generation and hash projection.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Computes a 64-dimensional L2-normalized vector embedding for a financial note.
 */
// Generates an L2-normalized 64-dimensional vector embedding from journal text.
// Blends high-weight concept domain activations with token n-gram hash bins.
// Normalizes vector length to unit magnitude to support fast cosine similarity.
export function generateTextEmbedding(text: string, manualTags: string[] = []): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const normalizedText = (text || "").toLowerCase();
  const tokens = tokenize(normalizedText);

  if (tokens.length === 0 && manualTags.length === 0) {
    return vector;
  }

  // 1. Concept Cluster Projections (Dimensions 0-7)
  for (const concept of FINANCIAL_CONCEPTS) {
    let conceptHits = 0;
    for (const kw of concept.keywords) {
      if (normalizedText.includes(kw)) {
        conceptHits += 1;
      }
    }
    // Boost if manual tags include concept
    if (manualTags.some((t) => t.toLowerCase() === concept.tag || concept.keywords.includes(t.toLowerCase()))) {
      conceptHits += 2;
    }
    if (conceptHits > 0) {
      vector[concept.dimension] = Math.min(10, conceptHits * concept.weight);
    }
  }

  // 2. Token & N-Gram Hash Projections (Dimensions 8-63)
  const hashRange = EMBEDDING_DIMENSION - 8; // 56 dimensions
  for (let i = 0; i < tokens.length; i++) {
    const unigram = tokens[i];
    const unigramHash = fnv1a(unigram);
    const unigramDim = 8 + (unigramHash % hashRange);
    vector[unigramDim] += 1.0;

    // Bigram for phrase context
    if (i < tokens.length - 1) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const bigramHash = fnv1a(bigram);
      const bigramDim = 8 + (bigramHash % hashRange);
      vector[bigramDim] += 1.5;
    }
  }

  // 3. L2 Normalization (Unit Length)
  let normSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    normSq += vector[i] * vector[i];
  }

  if (normSq > 0) {
    const norm = Math.sqrt(normSq);
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  }

  return vector;
}

/**
 * Calculates cosine similarity between two normalized vectors.
 * Since vectors are L2-normalized, cosine similarity is the dot product.
 */
// Computes cosine similarity between two unit-normalized embedding vectors.
// Calculates the inner dot product bounded within the range of zero to one.
// Used for semantic document retrieval and clustering across journal notes.
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
    return 0;
  }
  const minLen = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  for (let i = 0; i < minLen; i++) {
    dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
  }
  // Clamp between 0.0 and 1.0
  return Math.max(0, Math.min(1, Number(dotProduct.toFixed(4))));
}

/**
 * Extracts canonical financial tags from recognized text and hashtags.
 */
// Extracts relevant financial taxonomy tags from journal text and hashtags.
// Identifies explicit hashtag tokens and matches domain concept keywords.
// Returns a deduplicated array containing up to ten canonical tag strings.
export function extractJournalTags(text: string, existingTags: string[] = []): string[] {
  const normalized = (text || "").toLowerCase();
  const tagSet = new Set<string>();

  // Preserve manual tags
  for (const t of existingTags) {
    const clean = t.trim().toLowerCase().replace(/^#/, "");
    if (clean) tagSet.add(clean);
  }

  // Check hashtags like #emergency #vacation
  const hashtagMatches = (text || "").match(/#[a-zA-Z0-9_-]+/g);
  if (hashtagMatches) {
    for (const h of hashtagMatches) {
      tagSet.add(h.slice(1).toLowerCase());
    }
  }

  // Check financial concept keywords
  for (const concept of FINANCIAL_CONCEPTS) {
    for (const kw of concept.keywords) {
      if (normalized.includes(kw)) {
        tagSet.add(concept.tag);
        break;
      }
    }
  }

  return Array.from(tagSet).slice(0, 10);
}

/**
 * Analyzes the emotional/urgency sentiment of a financial journal note.
 */
// Evaluates the prevailing emotional tone and urgency of financial journal entries.
// Tests text content sequentially against urgent, concerned, and optimistic lexicons.
// Defaults to neutral sentiment when no emotional indicator keywords match.
export function analyzeJournalSentiment(text: string): JournalSentiment {
  const normalized = (text || "").toLowerCase();

  for (const word of URGENT_WORDS) {
    if (normalized.includes(word)) {
      return "urgent";
    }
  }

  for (const word of CONCERNED_WORDS) {
    if (normalized.includes(word)) {
      return "concerned";
    }
  }

  for (const word of OPTIMISTIC_WORDS) {
    if (normalized.includes(word)) {
      return "optimistic";
    }
  }

  return "neutral";
}
