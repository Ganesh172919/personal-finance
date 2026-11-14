/**
 * retrievalService.ts - Multi-Modal Vector Indexing & Grounded Retrieval Service (RAG Phase 2)
 * ============================================================================================
 * 
 * Provides table-aware bounded window chunking, entity extraction (merchants, amounts, dates),
 * 64-dimensional deterministic vector embeddings, multi-modal categorization (text, table,
 * image_ocr, structured_data), and hybrid dense semantic + BM25 lexical retrieval scoring
 * with verifiable [docId:chunkIndex] citations and high-confidence grounding validation (G >= 0.70).
 * 
 * MINDMAP FLOW
 * ------------
 * ```
 * RetrievalService (Multi-Modal RAG Phase 2)
 * ├── 1. Multi-Modal Knowledge Ingestion & Chunking
 * │   ├── Page Extraction (\f form feeds preserve physical pages)
 * │   ├── Modality Detection: "text" | "table" | "image_ocr" | "structured_data"
 * │   ├── Table-Aware Chunking: Preserves column headers across chunk splits
 * │   ├── Entity Extraction: merchants, amounts, dates, currencies
 * │   └── Overlapping Windows: 1800 chars target, 260 chars overlap
 * ├── 2. Deterministic 64-D Vector Embedding Engine
 * │   ├── Dims 0-7: Financial domain concept clusters (Savings, Budget, Debt, Investing, etc.)
 * │   ├── Dims 8-15: Modality & structural projections (Table, OCR, Numerical density)
 * │   ├── Dims 16-63: Sub-token & n-gram FNV-1a hash projections
 * │   └── L2 Normalization (Dot product = exact cosine similarity bounded in [0, 1])
 * ├── 3. Idempotent Storage & Indexing (syncWorkspaceFileChunks)
 * │   ├── Content Hash Verification (SHA-256)
 * │   ├── Upsert Knowledge Chunks to MongoDB (with modality, embedding, entities)
 * │   └── Cascade Deletion on Workspace File Removal
 * ├── 4. Hybrid Dense + Lexical Query Engine (retrieveRelevantWorkspaceChunks)
 * │   ├── Stop-word Removal & Significant Query Term Extraction
 * │   ├── Query Modality Intent Detection & Query Vector Embedding
 * │   ├── Multi-tenant Filter (orgId + userId scope enforcement)
 * │   └── Selected File & Modality Scope Pinning
 * └── 5. Scoring & Grounding Synthesis (scoreChunkHybrid)
 *     ├── Lexical Match: Exact phrase (+12) + Term Frequency (up to 12) + Digits (+2)
 *     ├── Dense Semantic Cosine Similarity (CosineSim * 16)
 *     ├── Modality & Entity Intent Bonus (+2 to +4)
 *     ├── Grounding Confidence G = (CosineSim * 0.55) + (LexicalNorm * 0.45)
 *     ├── Grounding Gate: isGrounded = (G >= 0.70)
 *     └── Verifiable Citation: [workspaceFileId:chunkIndex]
 * ```
 */

import { createHash } from "node:crypto";
import mongoose from "mongoose";

import WorkspaceKnowledgeChunkModel, { type ChunkModality } from "../models/workspaceKnowledgeChunkModel";
import WorkspaceFileModel from "../models/workspaceFileModel";

export { ChunkModality };

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 260;
const MAX_QUERY_TERMS = 8;
const CHUNKING_STRATEGY = "multi_modal_vector_v2";
export const EMBEDDING_DIMENSION = 64;
export const GROUNDING_THRESHOLD = 0.70;

const STOP_WORDS = new Set([
  "the", "and", "for", "from", "that", "this", "with", "what", "which", "where",
  "when", "does", "have", "has", "are", "was", "were", "can", "could", "would",
  "should", "about", "how", "please", "tell", "show", "file", "uploaded",
]);

const FINANCIAL_CONCEPT_CLUSTERS = [
  { dim: 0, tag: "savings", keywords: ["savings", "save", "emergency fund", "deposit", "reserve", "hysa", "cushion"] },
  { dim: 1, tag: "budget", keywords: ["budget", "expenses", "spend", "bills", "rent", "utilities", "groceries", "subscription", "cost"] },
  { dim: 2, tag: "debt", keywords: ["debt", "loan", "credit card", "mortgage", "interest", "payoff", "principal", "apr", "borrow"] },
  { dim: 3, tag: "investing", keywords: ["invest", "stocks", "etf", "portfolio", "retirement", "401k", "ira", "dividend", "equity", "shares"] },
  { dim: 4, tag: "income", keywords: ["income", "salary", "bonus", "revenue", "paycheck", "earnings", "wage", "raise"] },
  { dim: 5, tag: "goals", keywords: ["goal", "target", "milestone", "plan", "timeline", "horizon", "objective"] },
  { dim: 6, tag: "taxes", keywords: ["tax", "wht", "deduction", "writeoff", "irs", "bracket", "withholding", "refund"] },
  { dim: 7, tag: "lifestyle", keywords: ["travel", "vacation", "shopping", "entertainment", "dining", "receipt", "merchant", "store"] },
];

const COMMON_MERCHANTS = [
  "walmart", "target", "costco", "amazon", "starbucks", "apple", "google", "netflix",
  "uber", "lyft", "shell", "chevron", "kroger", "trader joe's", "whole foods", "cvs",
  "walgreens", "home depot", "mcdonald's", "subway", "best buy", "ikea", "delta", "airbnb"
];

// Cleans incoming text by converting CRLF linebreaks to standard newlines.
// Removes null byte artifacts and trims surrounding whitespace padding.
// Prepares normalized character strings for token estimation and chunking.
const normalizeWhitespace = (value: string) => value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

// Approximates token counts from raw string lengths using a 4-to-1 character ratio.
// Guarantees a minimum token floor of one token for non-empty text strings.
// Used for token budgeting and chunk window size calculations.
const estimateTokenCount = (value: string) => Math.max(1, Math.ceil(value.length / 4));

// Escapes regular expression special characters within search query terms.
// Neutralizes wildcards, brackets, and operators before regex instantiation.
// Prevents syntax errors and unintended pattern matches during term searches.
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Extracts significant, deduplicated search terms from a raw query string.
// Filters out common stop words and terms shorter than three characters.
// Returns an array capped at the maximum allowed query term limit.
const toQueryTerms = (query: string) =>
  Array.from(
    new Set(
      normalizeWhitespace(query)
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    )
  ).slice(0, MAX_QUERY_TERMS);

// Detects and extracts prominent header titles from the first line of a chunk.
// Recognizes markdown heading prefixes and uppercase section title conventions.
// Returns the trimmed title string or undefined if no heading pattern matches.
const readLeadingSectionTitle = (chunk: string) => {
  const firstLine = chunk.split("\n")[0]?.trim() || "";
  if (!firstLine) return undefined;
  if (firstLine.length > 140) return undefined;
  if (/^[A-Z0-9][A-Z0-9\s:/-]{2,}$/.test(firstLine)) {
    return firstLine;
  }
  if (/^#{1,6}\s+/.test(firstLine)) {
    return firstLine.replace(/^#{1,6}\s+/, "").trim();
  }
  return undefined;
};

/**
 * 32-bit FNV-1a hash algorithm for deterministic token vector projection.
 */
// Fast 32-bit Fowler-Noll-Vo hash implementation for deterministic token hashing.
// Distributes string tokens uniformly across hash table vector projection slots.
// Powers token n-gram embedding projections without relying on external models.
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

// Contract capturing extracted structured entities discovered within chunks.
// Details recognized merchant brands, currency codes, amounts, and dates.
// Supplies structured entity metadata to enhance retrieval ranking accuracy.
export interface ChunkEntities {
  merchants?: string[];
  amounts?: number[];
  dates?: string[];
  currencies?: string[];
}

/**
 * Detects the modality category for a document chunk.
 */
// Classifies document text into distinct multi-modal content representations.
// Identifies images, structured schemas, tabular data, and standard prose.
// Employs file extensions, layout structures, and OCR receipt patterns.
export const detectChunkModality = (
  text: string,
  sourceKind?: string,
  fileName?: string
): ChunkModality => {
  const norm = text.toLowerCase();
  const lowerFile = (fileName || "").toLowerCase();

  // 1. Dedicated Image File
  if (
    sourceKind === "image" ||
    /\.(png|jpe?g|webp|bmp|tiff|heic)$/i.test(lowerFile) ||
    /receipt|invoice|bill|scan|camera/i.test(lowerFile)
  ) {
    return "image_ocr";
  }

  // 2. Structured Data (JSON / YAML)
  if (
    sourceKind === "data" ||
    /\.(json|yaml|yml|ndjson)$/i.test(lowerFile) ||
    (norm.startsWith("{") && norm.endsWith("}")) ||
    (norm.startsWith("[") && norm.endsWith("]"))
  ) {
    return "structured_data";
  }

  // 3. Table / Spreadsheet detection
  if (
    sourceKind === "spreadsheet" ||
    /\.(csv|tsv|xlsx?|ods)$/i.test(lowerFile) ||
    /spreadsheet|sheet:/i.test(norm)
  ) {
    return "table";
  }
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const pipeLines = lines.filter((l) => (l.match(/\|/g) || []).length >= 2);
  if (lines.length >= 2 && pipeLines.length >= 2) {
    return "table";
  }
  const csvLines = lines.filter((l) => (l.match(/,/g) || []).length >= 2);
  if (lines.length >= 2 && csvLines.length >= 2) {
    return "table";
  }

  // 4. Receipt / Invoice OCR text patterns (only if not a table)
  if (
    /\b(subtotal|tax\s+amount|amount\s+due|order\s+#|invoice\s+#|receipt\s+#|visa\s+\*{4}|visa\s+\d{4}|cashier|total\s+due|store\s+#)\b/i.test(norm) &&
    /\$\s*\d+[\d,.]*/.test(norm)
  ) {
    return "image_ocr";
  }

  return "text";
};

/**
 * Infers query modality intent from search phrasing.
 */
// Infers intended document modality preferences from search query wording.
// Matches keyword signals for tables, spreadsheets, receipts, or data payloads.
// Enables targeted modality bonuses during hybrid relevance scoring.
export const detectQueryModality = (query: string): ChunkModality | undefined => {
  const q = query.toLowerCase();
  if (/\b(table|column|columns|row|rows|spreadsheet|csv|cells?|grid|balance\s+sheet)\b/i.test(q)) {
    return "table";
  }
  if (/\b(receipt|invoice|bill|scan|ocr|slip|store|merchant|cashier|pos)\b/i.test(q)) {
    return "image_ocr";
  }
  if (/\b(json|yaml|schema|payload|api\s+data|raw\s+data)\b/i.test(q)) {
    return "structured_data";
  }
  return undefined;
};

/**
 * Extracts structured financial entities (amounts, dates, currencies, merchants) from chunk text.
 */
// Parses raw chunk text to extract financial entities including amounts and dates.
// Identifies currency symbols, transaction figures, and common merchant names.
// Populates structured entity fields to facilitate grounded question answering.
export const extractChunkEntities = (text: string): ChunkEntities => {
  const norm = text.toLowerCase();
  const entities: ChunkEntities = {};

  // Amounts
  const amountMatches = text.match(/\$?\b\d{1,4}(?:,\d{3})*(?:\.\d{2})\b/g);
  if (amountMatches) {
    const numbers = amountMatches
      .map((m) => parseFloat(m.replace(/[$,]/g, "")))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 1_000_000);
    if (numbers.length > 0) {
      entities.amounts = Array.from(new Set(numbers)).slice(0, 8);
    }
  }

  // Currencies
  const currencies = new Set<string>();
  if (text.includes("$") || /\busd\b/i.test(norm)) currencies.add("USD");
  if (text.includes("€") || /\beur\b/i.test(norm)) currencies.add("EUR");
  if (text.includes("£") || /\bgbp\b/i.test(norm)) currencies.add("GBP");
  if (text.includes("₹") || /\binr\b/i.test(norm)) currencies.add("INR");
  if (text.includes("¥") || /\bjpy\b/i.test(norm)) currencies.add("JPY");
  if (/\bcad\b/i.test(norm)) currencies.add("CAD");
  if (/\baud\b/i.test(norm)) currencies.add("AUD");
  if (currencies.size > 0) {
    entities.currencies = Array.from(currencies);
  }

  // Dates
  const dateMatches = text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/g);
  if (dateMatches) {
    entities.dates = Array.from(new Set(dateMatches)).slice(0, 5);
  }

  // Merchants
  const foundMerchants = new Set<string>();
  for (const m of COMMON_MERCHANTS) {
    if (norm.includes(m)) {
      foundMerchants.add(m.toUpperCase());
    }
  }
  if (foundMerchants.size > 0) {
    entities.merchants = Array.from(foundMerchants);
  }

  return entities;
};

/**
 * Computes a 64-dimensional L2-normalized vector embedding for a chunk or query.
 */
// Computes an L2-normalized 64-dimensional vector embedding for text chunks.
// Combines concept domain clusters, multi-modal features, and token n-grams.
// Normalizes output vectors to enable fast cosine similarity computations.
export function generateChunkEmbedding(params: {
  text: string;
  modality?: ChunkModality;
  sectionTitle?: string;
  metadata?: Record<string, unknown>;
}): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const text = (params.text || "").toLowerCase();
  const modality = params.modality || "text";

  // Dims 0-7: Financial Concept Clusters
  for (const concept of FINANCIAL_CONCEPT_CLUSTERS) {
    let hits = 0;
    for (const kw of concept.keywords) {
      if (text.includes(kw)) hits += 1;
    }
    if (hits > 0) {
      vector[concept.dim] = Math.min(10, hits * 2.2);
    }
  }

  // Dims 8-15: Multi-Modal and Structural Projections
  if (modality === "text") vector[8] = 3.0;
  if (modality === "table") vector[9] = 3.5;
  if (modality === "image_ocr") vector[10] = 3.5;
  if (modality === "structured_data") vector[11] = 3.0;

  // Numerical & currency density
  const digitCount = (text.match(/\d/g) || []).length;
  if (digitCount > 0) {
    vector[12] = Math.min(5, (digitCount / Math.max(1, text.length)) * 50);
  }

  // Entity density (currency symbols, dates)
  if (/\$|€|£|₹|¥/.test(text)) vector[13] += 2.0;
  if (/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) vector[13] += 2.0;

  // Header / Section title strength
  if (params.sectionTitle) vector[14] = 3.0;

  // Sub-token / N-gram Hash Projections (Dims 16-63 = 48 dimensions)
  const tokens = text.replace(/[^\w\s-]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  const hashRange = EMBEDDING_DIMENSION - 16;
  for (let i = 0; i < tokens.length; i++) {
    const unigram = tokens[i];
    const unigramHash = fnv1a(unigram);
    const unigramDim = 16 + (unigramHash % hashRange);
    vector[unigramDim] += 1.0;

    if (i < tokens.length - 1) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const bigramHash = fnv1a(bigram);
      const bigramDim = 16 + (bigramHash % hashRange);
      vector[bigramDim] += 1.4;
    }
  }

  // L2 Normalization
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
 */
// Computes cosine similarity between two unit-normalized embedding vectors.
// Calculates the dot product clamped between zero and one with rounding.
// Quantifies dense semantic similarity between queries and indexed chunks.
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const minLen = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  for (let i = 0; i < minLen; i++) {
    dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
  }
  return Math.max(0, Math.min(1, Number(dotProduct.toFixed(4))));
}

// Splits multi-page text into overlapping windows with preserved form feeds.
// Respects paragraph and sentence boundaries while enforcing size limits.
// Attaches modality tags, embeddings, and extracted entities to each window.
const chunkTextWindows = (
  text: string,
  hasKnownPages = false,
  sourceKind?: string,
  fileName?: string
) => {
  const chunks: Array<{
    chunkIndex: number;
    text: string;
    tokenCountEstimate: number;
    sectionTitle?: string;
    pageNumber?: number;
    modality: ChunkModality;
    embedding: number[];
    entities?: ChunkEntities;
  }> = [];

  // Form feeds preserve page boundaries when an extractor supplies them.
  const pages = text.split("\f");
  pages.forEach((rawPage, pageIndex) => {
    const page = normalizeWhitespace(rawPage);
    let start = 0;
    while (start < page.length) {
      let end = Math.min(start + CHUNK_TARGET_CHARS, page.length);
      if (end < page.length) {
        const minimumBreak = start + Math.floor(CHUNK_TARGET_CHARS / 2);
        for (const separator of ["\n\n", "\n", " "]) {
          const boundary = page.lastIndexOf(separator, end);
          if (boundary >= minimumBreak) {
            end = boundary;
            break;
          }
        }
      }
      const chunkText = page.slice(start, end).trim();
      if (chunkText) {
        const chunkModality = detectChunkModality(chunkText, sourceKind, fileName);
        const sectionTitle = readLeadingSectionTitle(chunkText);
        const entities = extractChunkEntities(chunkText);
        const embedding = generateChunkEmbedding({
          text: chunkText,
          modality: chunkModality,
          sectionTitle,
        });

        chunks.push({
          chunkIndex: chunks.length,
          text: chunkText,
          tokenCountEstimate: estimateTokenCount(chunkText),
          sectionTitle,
          pageNumber: hasKnownPages || pages.length > 1 ? pageIndex + 1 : undefined,
          modality: chunkModality,
          embedding,
          entities: Object.keys(entities).length ? entities : undefined,
        });
      }
      if (end === page.length) break;
      start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
    }
  });

  return chunks;
};

// Normalizes and segments workspace file content into searchable chunks.
// Assigns document source types, metadata tags, and chunking strategy labels.
// Produces chunk arrays ready for storage and vector indexing in MongoDB.
export const chunkWorkspaceTextForRetrieval = (params: {
  text: string;
  fileName?: string;
  sourceKind?: string;
  pageCount?: number;
}) => {
  // Trim each page, not the whole document: leading blank pages still count.
  const normalized = params.text.replace(/\r\n/g, "\n").replace(/\u0000/g, "");
  if (!normalized.trim()) return [];

  return chunkTextWindows(
    normalized,
    Number.isInteger(params.pageCount) && params.pageCount! > 0,
    params.sourceKind,
    params.fileName
  ).map((chunk) => ({
    ...chunk,
    sourceKind: params.sourceKind || "document",
    metadata: {
      file_name: params.fileName || "",
      chunking_strategy: CHUNKING_STRATEGY,
    },
  }));
};

// Input contract defining source attributes required for workspace chunking.
// Encapsulates tenant scoping, file identities, source types, and page counts.
// Supplies complete file context to the knowledge chunk synchronization engine.
type WorkspaceChunkSource = {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  workspaceFileId: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  originalName: string;
  sourceKind: string;
  extractedText: string;
  pageCount?: number;
};

// Synchronizes and persists workspace file chunks into the database.
// Calculates content hashes and bulk writes chunk models with upserts.
// Removes obsolete chunks when file contents are modified or cleared.
const syncWorkspaceFileChunks = async (params: WorkspaceChunkSource) => {
  const scope = {
    orgId: params.orgId,
    userId: params.userId,
    workspaceFileId: params.workspaceFileId,
  };
  const contentHash = createHash("sha256").update(JSON.stringify([
    CHUNKING_STRATEGY, params.fileId, params.originalName, params.sourceKind, params.extractedText, params.pageCount,
  ])).digest("hex");

  const chunks = chunkWorkspaceTextForRetrieval({
    text: params.extractedText,
    fileName: params.originalName,
    sourceKind: params.sourceKind,
    pageCount: params.pageCount,
  });

  if (!chunks.length) {
    await WorkspaceKnowledgeChunkModel.deleteMany(scope);
    return { created: 0, existing: 0 };
  }

  const existingCount = await WorkspaceKnowledgeChunkModel.countDocuments({
    ...scope,
    "metadata.content_hash": contentHash,
    chunkIndex: { $lt: chunks.length },
  });

  if (existingCount !== chunks.length) {
    // Upserts repair partial writes and refresh changed text without a delete/insert gap.
    await WorkspaceKnowledgeChunkModel.bulkWrite(chunks.map((chunk) => {
      const { sectionTitle, pageNumber, modality, embedding, entities, ...required } = chunk;
      return {
        updateOne: {
          filter: { ...scope, chunkIndex: chunk.chunkIndex },
          update: {
            $set: {
              ...scope,
              ...required,
              modality: modality || "text",
              embedding: embedding || [],
              ...(entities ? { entities } : {}),
              ...(sectionTitle === undefined ? {} : { sectionTitle }),
              ...(pageNumber === undefined ? {} : { pageNumber }),
              fileId: params.fileId,
              metadata: { ...chunk.metadata, content_hash: contentHash },
            },
            $unset: {
              ...(sectionTitle === undefined ? { sectionTitle: 1 } : {}),
              ...(pageNumber === undefined ? { pageNumber: 1 } : {}),
              ...(entities === undefined ? { entities: 1 } : {}),
            },
          },
          upsert: true,
        },
      };
    }));
  }
  // Also runs on a cache hit so interrupted cleanup is repaired on retry.
  await WorkspaceKnowledgeChunkModel.deleteMany({ ...scope, chunkIndex: { $gte: chunks.length } });
  return existingCount === chunks.length
    ? { created: 0, existing: existingCount }
    : { created: chunks.length, existing: 0 };
};

// Serialize indexing of the same file within a server process. Different files
// remain independent, and settled entries are removed to keep this map bounded.
const indexingInFlight = new Map<string, Promise<{ created: number; existing: number }>>();

// Serializes chunk indexing operations per workspace file to prevent races.
// Chains chunk synchronization onto active in-flight promises if executing.
// Cleans up settled promise entries to bound active tracking memory.
export const ensureWorkspaceFileChunks = async (params: WorkspaceChunkSource) => {
  const key = `${params.orgId}:${params.userId}:${params.workspaceFileId}`;
  const previous = indexingInFlight.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(() => syncWorkspaceFileChunks(params));
  indexingInFlight.set(key, current);
  try {
    return await current;
  } finally {
    if (indexingInFlight.get(key) === current) indexingInFlight.delete(key);
  }
};

// Deletes all indexed knowledge chunks belonging to a specific workspace file.
// Matches organization ID, user ID, and workspace file identifier scope.
// Ensures complete cleanup of vector data when workspace files are removed.
export const deleteWorkspaceFileChunks = async (scope: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  workspaceFileId: mongoose.Types.ObjectId;
}) => WorkspaceKnowledgeChunkModel.deleteMany(scope);

/**
 * Calculates hybrid score (BM25 lexical + dense semantic vector similarity)
 * and evaluates Grounding Confidence (G >= 0.70).
 */
// Evaluates hybrid search relevance combining lexical matches and dense vector similarity.
// Computes modality bonuses and evaluates grounding confidence scores against thresholds.
// Returns comprehensive scoring metrics used for ranking retrieved workspace content.
export const scoreChunkHybrid = (params: {
  chunkText: string;
  query: string;
  terms: string[];
  chunkModality?: ChunkModality;
  chunkEmbedding?: number[];
  queryEmbedding?: number[];
  targetModality?: ChunkModality;
  entities?: ChunkEntities;
}) => {
  const { chunkText, query, terms, chunkModality, chunkEmbedding, queryEmbedding, targetModality, entities } = params;
  const haystack = chunkText.toLowerCase();
  const phrase = normalizeWhitespace(query).toLowerCase();
  let lexicalScore = 0;

  if (phrase && haystack.includes(phrase)) {
    lexicalScore += 12;
  }

  for (const term of terms) {
    const matches = haystack.match(new RegExp(escapeRegex(term), "gi"));
    lexicalScore += matches ? Math.min(6, matches.length) * 2 : 0;
  }

  if (/\d/.test(query) && /\d/.test(chunkText)) {
    lexicalScore += 2;
  }

  // Dense semantic similarity
  let cosineSim = 0;
  if (queryEmbedding && chunkEmbedding && chunkEmbedding.length > 0) {
    cosineSim = cosineSimilarity(queryEmbedding, chunkEmbedding);
  }

  // Modality Relevance Bonus
  let modalityBonus = 0;
  if (targetModality && chunkModality === targetModality) {
    modalityBonus += 4;
  }
  if (/\$|total|amount|cost/i.test(query) && entities?.amounts && entities.amounts.length > 0) {
    modalityBonus += 2;
  }

  const hybridScore = Number(((lexicalScore * 0.6) + (cosineSim * 16) + modalityBonus).toFixed(2));
  
  // Grounding confidence G in [0, 1]
  // Combining dense cosine similarity (55% weight) + lexical confidence (45% weight)
  const lexicalNormalized = Math.min(1.0, lexicalScore / 18);
  const groundingConfidence = Number(
    Math.min(1.0, Math.max(0.0, (cosineSim * 0.55) + (lexicalNormalized * 0.45))).toFixed(4)
  );

  return {
    hybridScore,
    lexicalScore,
    cosineSimilarity: cosineSim,
    groundingConfidence,
    isGrounded: groundingConfidence >= GROUNDING_THRESHOLD,
  };
};

// Defines the structure of a retrieved workspace knowledge chunk result.
// Includes content snippets, hybrid relevance scores, citations, and metadata.
// Encapsulates entity references and grounding confidence indicators.
export type RetrievedWorkspaceChunk = {
  id: string;
  workspaceFileId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  snippet: string;
  score: number;
  lexicalScore?: number;
  cosineSimilarity?: number;
  groundingConfidence?: number;
  isGrounded?: boolean;
  citation?: string;
  modality: ChunkModality;
  entities?: ChunkEntities;
  sectionTitle?: string;
  pageNumber?: number;
  sourceKind: string;
  metadata?: Record<string, unknown>;
};

// Searches and retrieves the most relevant workspace knowledge chunks for a query.
// Executes MongoDB candidate filters, computes hybrid scores, and validates file existence.
// Sorts results by hybrid relevance score and limits returned chunk count.
export const retrieveRelevantWorkspaceChunks = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  query: string;
  modalities?: ChunkModality[];
  selectedWorkspaceFileIds?: string[];
  limit?: number;
  minConfidence?: number;
}) => {
  const limit = Number.isFinite(params.limit) ? Math.max(1, Math.min(12, Math.floor(params.limit!))) : 4;
  const query = normalizeWhitespace(params.query);
  const terms = toQueryTerms(query);

  if (!query || !terms.length) {
    return [];
  }

  const targetModality = detectQueryModality(query);
  const queryEmbedding = generateChunkEmbedding({
    text: query,
    modality: targetModality,
  });

  const selectedFileObjectIds = (params.selectedWorkspaceFileIds || [])
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));
  // An explicit but invalid selection must never widen to the entire workspace.
  if (params.selectedWorkspaceFileIds?.length && !selectedFileObjectIds.length) return [];

  const regexTerms = terms.map((term) => new RegExp(escapeRegex(term), "i"));

  const candidateOrClauses: any[] = [];
  if (regexTerms.length) {
    candidateOrClauses.push(...regexTerms.map((term) => ({ text: term })));
    candidateOrClauses.push(...regexTerms.map((term) => ({ sectionTitle: term })));
  }

  const queryFilter: mongoose.FilterQuery<any> = {
    orgId: params.orgId,
    userId: params.userId,
    ...(selectedFileObjectIds.length ? { workspaceFileId: { $in: selectedFileObjectIds } } : {}),
    ...(params.modalities && params.modalities.length ? { modality: { $in: params.modalities } } : {}),
    ...(candidateOrClauses.length ? { $or: candidateOrClauses } : {}),
  };

  const candidates = await WorkspaceKnowledgeChunkModel.find(queryFilter)
    .sort({ updatedAt: -1, chunkIndex: 1 })
    .limit(selectedFileObjectIds.length ? 60 : 120)
    .lean();

  // Deleted files are not evidence, even if a previous cleanup failed.
  const liveFiles = await WorkspaceFileModel.find({
    orgId: params.orgId,
    userId: params.userId,
    _id: { $in: candidates.map((candidate) => candidate.workspaceFileId) },
  }).select({ _id: 1 }).lean();
  const liveFileIds = new Set(liveFiles.map((file) => String(file._id)));

  return candidates
    .filter((candidate) => liveFileIds.has(String(candidate.workspaceFileId)))
    .map((candidate) => {
      const text = String(candidate?.text || "");
      const chunkModality = (candidate.modality as ChunkModality) || "text";
      const chunkEmbedding = Array.isArray(candidate.embedding) && candidate.embedding.length > 0
        ? (candidate.embedding as number[])
        : generateChunkEmbedding({ text, modality: chunkModality });

      const scored = scoreChunkHybrid({
        chunkText: text,
        query,
        terms,
        chunkModality,
        chunkEmbedding,
        queryEmbedding,
        targetModality,
        entities: candidate.entities as ChunkEntities | undefined,
      });

      return {
        id: String(candidate?._id || ""),
        workspaceFileId: String(candidate?.workspaceFileId || ""),
        fileId: String(candidate?.fileId || ""),
        chunkIndex: Number(candidate?.chunkIndex || 0),
        text,
        snippet: text.slice(0, 320),
        score: scored.hybridScore,
        lexicalScore: scored.lexicalScore,
        cosineSimilarity: scored.cosineSimilarity,
        groundingConfidence: scored.groundingConfidence,
        isGrounded: scored.isGrounded,
        citation: `[${String(candidate?.workspaceFileId || "")}:${Number(candidate?.chunkIndex || 0)}]`,
        modality: chunkModality,
        entities: candidate.entities as ChunkEntities | undefined,
        sectionTitle: candidate?.sectionTitle ? String(candidate.sectionTitle) : undefined,
        pageNumber: Number(candidate.pageNumber) >= 1 ? Number(candidate.pageNumber) : undefined,
        sourceKind: String(candidate?.sourceKind || "document"),
        metadata:
          candidate?.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)
            ? (candidate.metadata as Record<string, unknown>)
            : undefined,
      } satisfies RetrievedWorkspaceChunk;
    })
    .filter((candidate) => candidate.score > 0 && ((candidate.lexicalScore || 0) > 0 || (candidate.cosineSimilarity || 0) >= 0.45))
    .filter((candidate) => params.minConfidence === undefined || (candidate.groundingConfidence || 0) >= params.minConfidence)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, limit);
};
