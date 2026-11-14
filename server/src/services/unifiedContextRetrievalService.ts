/**
 * unifiedContextRetrievalService.ts - Unified Ranked Memory, Document & Transaction Retrieval Engine
 * ====================================================================================================
 * 
 * Provides cross-silo unified retrieval across:
 * 1. User Memory Facts (MemoryRecordModel) - Preferences, financial rules, user constraints
 * 2. Workspace Document Chunks (WorkspaceKnowledgeChunkModel) - Scanned receipts, statements, PDFs
 * 3. Ledger Transactions (TransactionModel) - Real banking transactions, merchants, categories
 * 
 * Fusion Architecture:
 * - Deterministic 64-Dimensional Semantic Vector Embeddings (L2-normalized)
 * - Reciprocal Rank Fusion (RRF) with smoothing parameter k = 60
 * - Query-intent dynamic source weighting (memory vs file vs transaction)
 * - Exponential recency decay for financial ledger transactions (half-life 90 days)
 * - Grounded Context Prompt synthesis for direct injection into LLM prompts
 */

import mongoose from "mongoose";
import MemoryRecordModel from "../models/memoryRecordModel";
import WorkspaceKnowledgeChunkModel, { type ChunkModality } from "../models/workspaceKnowledgeChunkModel";
import WorkspaceFileModel from "../models/workspaceFileModel";
import TransactionModel from "../models/transactionModel";
import { generateChunkEmbedding, cosineSimilarity, scoreChunkHybrid } from "./retrievalService";

// Union representing the tripartite data source silos supported by unified retrieval.
// Encompasses user memory facts, workspace document chunks, and banking transaction records.
export type UnifiedContextSourceType = "memory" | "file" | "transaction";

// Normalized data contract representing a single retrieved item regardless of source silo.
// Carries composite relevance scores, reciprocal rank fusion ratings, citations, and metadata.
export interface UnifiedRetrievedItem {
  id: string;
  sourceType: UnifiedContextSourceType;
  title: string;
  snippet: string;
  score: number; // Normalized composite score [0 - 100]
  rrfScore: number;
  rank: number;
  sourceScore: number;
  citation?: string;
  metadata: {
    key?: string;
    confidence?: number;
    source?: string;
    workspaceFileId?: string;
    pageNumber?: number;
    modality?: string;
    amount?: number;
    currency?: string;
    category?: string;
    merchantName?: string;
    date?: string;
    transactionType?: string;
  };
}

// Input parameter interface governing unified cross-silo context search operations.
// Specifies tenant scopes, user identity, search query text, source filters, and score thresholds.
export interface UnifiedContextParams {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  query: string;
  sources?: UnifiedContextSourceType[];
  limit?: number;
  minScore?: number;
}

// Encapsulates comprehensive query results across all three searchable enterprise data silos.
// Contains source item counts, ranked result lists, and synthesized prompt injection text.
export interface UnifiedContextResult {
  query: string;
  total: number;
  breakdown: {
    memory: number;
    file: number;
    transaction: number;
  };
  results: UnifiedRetrievedItem[];
  groundedContextPrompt: string;
}

// Set of common natural language stop words filtered out during query tokenization.
// Prevents high-frequency functional words from diluting keyword search precision.
const STOP_WORDS = new Set([
  "the", "and", "for", "from", "that", "this", "with", "what", "which", "where",
  "when", "does", "have", "has", "are", "was", "were", "can", "could", "would",
  "should", "about", "how", "please", "tell", "show", "give", "find",
]);

// Breaks a natural language query into lowercased alphanumeric search tokens.
// Eliminates punctuation and stop words, returning up to ten unique meaningful terms.
const tokenizeQuery = (query: string): string[] =>
  Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    )
  ).slice(0, 10);

// Analyzes natural language search terms to boost corresponding source weights dynamically.
// Applies higher importance weights to memory, file, or transaction silos matching intent.
const detectSourceWeights = (query: string): Record<UnifiedContextSourceType, number> => {
  const q = query.toLowerCase();
  const weights: Record<UnifiedContextSourceType, number> = {
    memory: 1.0,
    file: 1.0,
    transaction: 1.0,
  };

  if (/\b(prefer|preference|rule|goal|budget rule|constraint|target|habit|profile|setting)\b/i.test(q)) {
    weights.memory = 1.35;
  }
  if (/\b(file|pdf|document|statement|invoice|receipt|contract|page|clause|tax return)\b/i.test(q)) {
    weights.file = 1.35;
  }
  if (/\b(spent|spend|bought|cost|charge|charged|paid|transaction|purchase|store|vendor|merchant|coffee|uber|groceries)\b/i.test(q)) {
    weights.transaction = 1.35;
  }

  return weights;
};

// Coordinates hybrid vector search and Reciprocal Rank Fusion across memories, files, and transactions.
// Normalizes relevance scores, filters by minimum threshold, and generates a formatted LLM prompt.
export async function retrieveUnifiedContext(params: UnifiedContextParams): Promise<UnifiedContextResult> {
  const query = (params.query || "").trim();
  const limit = Math.max(1, Math.min(50, params.limit ?? 15));
  const minScore = Math.max(0, Math.min(100, params.minScore ?? 0));
  const allowedSources = new Set<UnifiedContextSourceType>(
    params.sources && params.sources.length > 0
      ? params.sources
      : ["memory", "file", "transaction"]
  );

  if (!query) {
    return {
      query: "",
      total: 0,
      breakdown: { memory: 0, file: 0, transaction: 0 },
      results: [],
      groundedContextPrompt: "No query provided for unified context retrieval.",
    };
  }

  const queryTerms = tokenizeQuery(query);
  const queryEmbedding = generateChunkEmbedding({ text: query });
  const weights = detectSourceWeights(query);

  // Candidate lists per source
  const memoryCandidates: { item: UnifiedRetrievedItem; sourceScore: number }[] = [];
  const fileCandidates: { item: UnifiedRetrievedItem; sourceScore: number }[] = [];
  const transactionCandidates: { item: UnifiedRetrievedItem; sourceScore: number }[] = [];

  // =========================================================================
  // 1. Silo: User Memory Facts (MemoryRecordModel)
  // =========================================================================
  if (allowedSources.has("memory")) {
    const memoryRecords = await MemoryRecordModel.find({
      orgId: params.orgId,
      userId: params.userId,
    })
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean();

    for (const mem of memoryRecords) {
      const key = String(mem.key || "").toLowerCase();
      const val = String(mem.value || "").toLowerCase();
      const combined = `${key}: ${val}`;

      let lexicalScore = 0;
      if (query.toLowerCase() && combined.includes(query.toLowerCase())) {
        lexicalScore += 18;
      }
      for (const term of queryTerms) {
        if (key.includes(term)) lexicalScore += 6;
        if (val.includes(term)) lexicalScore += 4;
      }

      const memEmbedding = generateChunkEmbedding({ text: combined });
      const cosineSim = cosineSimilarity(queryEmbedding, memEmbedding);
      const confidence = typeof mem.confidence === "number" ? mem.confidence : 0.7;

      const sourceScore = Number(
        ((lexicalScore * 1.2 + cosineSim * 20) * (0.7 + 0.3 * Math.min(1.0, confidence))).toFixed(2)
      );

      if (sourceScore > 1.0) {
        memoryCandidates.push({
          sourceScore,
          item: {
            id: String(mem._id),
            sourceType: "memory",
            title: `Memory: ${mem.key}`,
            snippet: mem.value,
            score: 0,
            rrfScore: 0,
            rank: 0,
            sourceScore,
            citation: `memory:${mem.key}`,
            metadata: {
              key: mem.key,
              confidence: mem.confidence,
              source: mem.source,
            },
          },
        });
      }
    }
  }

  // =========================================================================
  // 2. Silo: Workspace Document Chunks (WorkspaceKnowledgeChunkModel)
  // =========================================================================
  if (allowedSources.has("file")) {
    const regexTerms = queryTerms.map((t) => new RegExp(t, "i"));
    const rawChunks = await WorkspaceKnowledgeChunkModel.find({
      orgId: params.orgId,
      userId: params.userId,
      ...(regexTerms.length ? { $or: regexTerms.map((t) => ({ text: t })) } : {}),
    })
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean();

    // Verify workspace files still exist
    const liveFiles = await WorkspaceFileModel.find({
      orgId: params.orgId,
      userId: params.userId,
      _id: { $in: rawChunks.map((c) => c.workspaceFileId) },
    })
      .select({ _id: 1, originalName: 1 })
      .lean();

    const liveFileMap = new Map(liveFiles.map((f) => [String(f._id), f.originalName || "Document"]));

    for (const chunk of rawChunks) {
      const fileIdStr = String(chunk.workspaceFileId);
      if (!liveFileMap.has(fileIdStr)) continue;

      const chunkText = String(chunk.text || "");
      const chunkModality = (chunk.modality as ChunkModality) || "text";
      const chunkEmbedding =
        Array.isArray(chunk.embedding) && chunk.embedding.length > 0
          ? (chunk.embedding as number[])
          : generateChunkEmbedding({ text: chunkText, modality: chunkModality });

      const scored = scoreChunkHybrid({
        chunkText,
        query,
        terms: queryTerms,
        chunkModality,
        chunkEmbedding,
        queryEmbedding,
        entities: chunk.entities,
      });

      if (scored.hybridScore > 1.0) {
        const fileName = liveFileMap.get(fileIdStr);
        const section = chunk.sectionTitle ? ` (${chunk.sectionTitle})` : "";
        const page = chunk.pageNumber ? ` p.${chunk.pageNumber}` : "";

        fileCandidates.push({
          sourceScore: scored.hybridScore,
          item: {
            id: String(chunk._id),
            sourceType: "file",
            title: `${fileName}${section}${page}`,
            snippet: chunkText.slice(0, 280),
            score: 0,
            rrfScore: 0,
            rank: 0,
            sourceScore: scored.hybridScore,
            citation: `[${fileIdStr}:${chunk.chunkIndex}]`,
            metadata: {
              workspaceFileId: fileIdStr,
              pageNumber: chunk.pageNumber,
              modality: chunkModality,
            },
          },
        });
      }
    }
  }

  // =========================================================================
  // 3. Silo: Ledger Transactions (TransactionModel)
  // =========================================================================
  if (allowedSources.has("transaction")) {
    const transactions = await TransactionModel.find({
      orgId: params.orgId,
      userId: params.userId,
    })
      .sort({ date: -1 })
      .limit(100)
      .lean();

    const numbersInQuery = (query.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const nowMs = Date.now();

    for (const txn of transactions) {
      const anyTxn = txn as any;
      const desc = String(anyTxn.description || "").toLowerCase();
      const merchant = String(anyTxn.merchantName || "").toLowerCase();
      const category = String(anyTxn.category || "").toLowerCase();
      const textToMatch = `${merchant} ${desc} ${category}`.trim();

      let lexicalScore = 0;
      if (query.toLowerCase() && textToMatch.includes(query.toLowerCase())) {
        lexicalScore += 16;
      }
      for (const term of queryTerms) {
        if (merchant.includes(term)) lexicalScore += 7;
        if (category.includes(term)) lexicalScore += 5;
        if (desc.includes(term)) lexicalScore += 3;
      }

      // Proximity bonus if dollar amount in query matches transaction amount
      let amountBonus = 0;
      const txnAmt = Math.abs(txn.amount);
      for (const n of numbersInQuery) {
        if (Math.abs(txnAmt - n) < 0.05) {
          amountBonus += 12;
        } else if (Math.abs(txnAmt - n) < 1.0) {
          amountBonus += 6;
        }
      }

      // Dense semantic similarity
      const txnEmbedding = generateChunkEmbedding({ text: textToMatch });
      const cosineSim = cosineSimilarity(queryEmbedding, txnEmbedding);

      // Exponential recency decay (90-day half life)
      const txnDateMs = txn.date ? new Date(txn.date).getTime() : nowMs;
      const daysAgo = Math.max(0, (nowMs - txnDateMs) / (1000 * 60 * 60 * 24));
      const recencyWeight = Math.exp(-daysAgo / 90);

      const sourceScore = Number(
        ((lexicalScore + amountBonus + cosineSim * 14) * (0.6 + 0.4 * recencyWeight)).toFixed(2)
      );

      if (sourceScore > 1.0) {
        const sign = txn.type === "income" ? "+" : "-";
        const formattedAmt = `${sign}$${Math.abs(txn.amount).toFixed(2)}`;
        const dateStr = txn.date ? new Date(txn.date).toISOString().slice(0, 10) : "";

        transactionCandidates.push({
          sourceScore,
          item: {
            id: String(txn._id),
            sourceType: "transaction",
            title: `${anyTxn.merchantName || anyTxn.description || "Transaction"} (${formattedAmt})`,
            snippet: `${formattedAmt} · ${anyTxn.category} · ${dateStr}${anyTxn.description ? ` · "${anyTxn.description}"` : ""}`,
            score: 0,
            rrfScore: 0,
            rank: 0,
            sourceScore,
            citation: `txn:${String(txn._id).slice(-6)}`,
            metadata: {
              amount: txn.amount,
              currency: anyTxn.currency || "USD",
              category: txn.category,
              merchantName: anyTxn.merchantName,
              date: dateStr,
              transactionType: txn.type,
            },
          },
        });
      }
    }
  }

  // =========================================================================
  // 4. Reciprocal Rank Fusion (RRF) & Normalization
  // =========================================================================
  const k = 60;
  const allCandidates: UnifiedRetrievedItem[] = [];

  // Sort each source independently
  const rankSource = (
    candidates: { item: UnifiedRetrievedItem; sourceScore: number }[],
    sourceType: UnifiedContextSourceType
  ) => {
    candidates.sort((a, b) => b.sourceScore - a.sourceScore);
    const weight = weights[sourceType] || 1.0;

    candidates.forEach((cand, idx) => {
      const sourceRank = idx + 1;
      const rrf = Number((weight / (k + sourceRank)).toFixed(6));
      cand.item.rrfScore = rrf;
      cand.item.rank = sourceRank;
      cand.item.sourceScore = cand.sourceScore;
      allCandidates.push(cand.item);
    });
  };

  rankSource(memoryCandidates, "memory");
  rankSource(fileCandidates, "file");
  rankSource(transactionCandidates, "transaction");

  if (!allCandidates.length) {
    return {
      query,
      total: 0,
      breakdown: { memory: 0, file: 0, transaction: 0 },
      results: [],
      groundedContextPrompt: `No matching memory, document, or transaction context found for "${query}".`,
    };
  }

  // Global sort by RRF score descending
  allCandidates.sort((a, b) => b.rrfScore - a.rrfScore);

  const maxRrf = Math.max(...allCandidates.map((c) => c.rrfScore), 0.0001);

  // Assign global ranks and normalized 0 - 100 scores
  const finalized = allCandidates.map((cand, idx) => {
    const normalizedScore = Math.min(100, Math.round((cand.rrfScore / maxRrf) * 100));
    return {
      ...cand,
      score: normalizedScore,
      rank: idx + 1,
    };
  });

  const filtered = finalized.filter((item) => item.score >= minScore).slice(0, limit);

  // Calculate breakdown
  const breakdown = {
    memory: filtered.filter((r) => r.sourceType === "memory").length,
    file: filtered.filter((r) => r.sourceType === "file").length,
    transaction: filtered.filter((r) => r.sourceType === "transaction").length,
  };

  // =========================================================================
  // 5. Grounded Context Prompt Synthesis for AI Agents
  // =========================================================================
  const promptLines: string[] = [
    `### UNIFIED RANKED CONTEXT (Query: "${query}")`,
    `Aggregated ${filtered.length} relevant items across User Memories (${breakdown.memory}), Workspace Documents (${breakdown.file}), and Ledger Transactions (${breakdown.transaction}):\n`,
  ];

  filtered.forEach((item) => {
    const typeLabel = item.sourceType.toUpperCase();
    promptLines.push(
      `[Rank #${item.rank} | ${typeLabel} | Relevance: ${item.score}/100 | Citation: ${item.citation || "N/A"}]`
    );
    promptLines.push(`Title: ${item.title}`);
    promptLines.push(`Context: ${item.snippet}\n`);
  });

  return {
    query,
    total: filtered.length,
    breakdown,
    results: filtered,
    groundedContextPrompt: promptLines.join("\n"),
  };
}
