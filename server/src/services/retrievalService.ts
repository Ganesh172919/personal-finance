/**
 * retrievalService.ts - Lexical RAG Retrieval & Knowledge Chunking Service
 * =========================================================================
 * 
 * Provides bounded overlapping window chunking, SHA-256 idempotency hashing,
 * page-boundary preservation, and tenant-isolated lexical retrieval over
 * uploaded workspace documents.
 * 
 * MINDMAP FLOW
 * ------------
 * ```
 * RetrievalService (RAG Phase 2)
 * ├── 1. Knowledge Ingestion & Chunking
 * │   ├── Page Extraction (\f form feeds preserve physical pages)
 * │   ├── Overlapping Windows: 1800 chars target, 260 chars overlap
 * │   ├── Section Header Heuristics (markdown headings & capitalized banners)
 * │   └── Token Count Estimation (~4 chars/token)
 * ├── 2. Idempotent Storage & Indexing (syncWorkspaceFileChunks)
 * │   ├── Content Hash Verification (SHA-256)
 * │   ├── Upsert Knowledge Chunks to MongoDB
 * │   ├── Automatic Stale Chunk Cleanup on document edit
 * │   └── Cascade Deletion on Workspace File Removal
 * ├── 3. Lexical Query Engine (retrieveRelevantWorkspaceChunks)
 * │   ├── Stop-word Removal (25+ standard English stop words)
 * │   ├── Regex Query Term Generation (up to 8 significant terms)
 * │   ├── Multi-tenant Filter (orgId + userId scope enforcement)
 * │   └── Selected File Scope Pinning
 * └── 4. Scoring & Grounding Synthesis (scoreChunkAgainstQuery)
 *     ├── Exact Query Phrase Match Bonus (+12)
 *     ├── Term Frequency Bonus (up to 6 hits * 2 pts)
 *     ├── Numeric Alignment Bonus (+2 when query & chunk contain digits)
 *     ├── Live File Existence Validation (prunes orphan chunks)
 *     └── Sorted Output by Score descending
 * ```
 * 
 * ASCII FLOW
 * ----------
 * ```
 *   +-------------------------------------------------------------+
 *   |               User File Upload / Query Input                |
 *   +------------------------------+------------------------------+
 *                                  |
 *           +----------------------+----------------------+
 *           |                                             |
 *           v (On Document Upload)                        v (On User Query)
 *   +------------------------------+              +------------------------------+
 *   | syncWorkspaceFileChunks()    |              | retrieveRelevantWorkspace    |
 *   |  - Split by form feed (\f)   |              |  Chunks()                    |
 *   |  - Bounded windows (1800 ch) |              |  - Sanitize & strip stopwords|
 *   |  - 260 ch sliding overlap    |              |  - Build regex search terms  |
 *   +--------------+---------------+              +--------------+---------------+
 *                  |                                             |
 *                  v                                             v
 *   +------------------------------+              +------------------------------+
 *   | SHA-256 Hash Comparison      |              | MongoDB Lean Search          |
 *   |  - Detect content drift      |              |  - orgId & userId scoped     |
 *   |  - Upsert new chunks         |              |  - Filter by selected files  |
 *   |  - Delete orphaned chunks    |              +--------------+---------------+
 *   +--------------+---------------+                             |
 *                  |                                             v
 *                  v                              +------------------------------+
 *   +------------------------------+              | scoreChunkAgainstQuery()     |
 *   | Persisted in MongoDB:        |              |  - Phrase match (+12)        |
 *   | WorkspaceKnowledgeChunkModel |              |  - Term frequencies (+2 ea)  |
 *   +------------------------------+              |  - Verify file still alive   |
 *                                                 +--------------+---------------+
 *                                                                |
 *                                                                v
 *                                                 +------------------------------+
 *                                                 | Return Top-K Ranked Chunks   |
 *                                                 | to FinanceGrounding Service  |
 *                                                 +------------------------------+
 * ```
 */

import { createHash } from "node:crypto";
import mongoose from "mongoose";

import WorkspaceKnowledgeChunkModel from "../models/workspaceKnowledgeChunkModel";
import WorkspaceFileModel from "../models/workspaceFileModel";

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 260;
const MAX_QUERY_TERMS = 8;
const CHUNKING_STRATEGY = "bounded_window_v2";
const STOP_WORDS = new Set([
  "the", "and", "for", "from", "that", "this", "with", "what", "which", "where",
  "when", "does", "have", "has", "are", "was", "were", "can", "could", "would",
  "should", "about", "how", "please", "tell", "show", "file", "uploaded",
]);

const normalizeWhitespace = (value: string) => value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

const estimateTokenCount = (value: string) => Math.max(1, Math.ceil(value.length / 4));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const chunkTextWindows = (text: string, hasKnownPages = false) => {
  const chunks: Array<{
    chunkIndex: number;
    text: string;
    tokenCountEstimate: number;
    sectionTitle?: string;
    pageNumber?: number;
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
      const chunk = page.slice(start, end).trim();
      if (chunk) {
        chunks.push({
          chunkIndex: chunks.length,
          text: chunk,
          tokenCountEstimate: estimateTokenCount(chunk),
          sectionTitle: readLeadingSectionTitle(chunk),
          pageNumber: hasKnownPages || pages.length > 1 ? pageIndex + 1 : undefined,
        });
      }
      if (end === page.length) break;
      start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
    }
  });

  return chunks;
};

export const chunkWorkspaceTextForRetrieval = (params: {
  text: string;
  fileName?: string;
  sourceKind?: string;
  pageCount?: number;
}) => {
  // Trim each page, not the whole document: leading blank pages still count.
  const normalized = params.text.replace(/\r\n/g, "\n").replace(/\u0000/g, "");
  if (!normalized.trim()) return [];

  return chunkTextWindows(normalized, Number.isInteger(params.pageCount) && params.pageCount! > 0).map((chunk) => ({
    ...chunk,
    sourceKind: params.sourceKind || "document",
    metadata: {
      file_name: params.fileName || "",
      chunking_strategy: CHUNKING_STRATEGY,
    },
  }));
};

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
      const { sectionTitle, pageNumber, ...required } = chunk;
      return {
        updateOne: {
          filter: { ...scope, chunkIndex: chunk.chunkIndex },
          update: {
            $set: {
              ...scope,
              ...required,
              ...(sectionTitle === undefined ? {} : { sectionTitle }),
              ...(pageNumber === undefined ? {} : { pageNumber }),
              fileId: params.fileId,
              metadata: { ...chunk.metadata, content_hash: contentHash },
            },
            $unset: {
              ...(sectionTitle === undefined ? { sectionTitle: 1 } : {}),
              ...(pageNumber === undefined ? { pageNumber: 1 } : {}),
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

export const deleteWorkspaceFileChunks = async (scope: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  workspaceFileId: mongoose.Types.ObjectId;
}) => WorkspaceKnowledgeChunkModel.deleteMany(scope);

const scoreChunkAgainstQuery = (chunkText: string, query: string, terms: string[]) => {
  const haystack = chunkText.toLowerCase();
  const phrase = normalizeWhitespace(query).toLowerCase();
  let score = 0;

  if (phrase && haystack.includes(phrase)) {
    score += 12;
  }

  for (const term of terms) {
    const matches = haystack.match(new RegExp(escapeRegex(term), "gi"));
    score += matches ? Math.min(6, matches.length) * 2 : 0;
  }

  if (/\d/.test(query) && /\d/.test(chunkText)) {
    score += 2;
  }

  return score;
};

export type RetrievedWorkspaceChunk = {
  id: string;
  workspaceFileId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  snippet: string;
  score: number;
  sectionTitle?: string;
  pageNumber?: number;
  sourceKind: string;
  metadata?: Record<string, unknown>;
};

export const retrieveRelevantWorkspaceChunks = async (params: {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  query: string;
  selectedWorkspaceFileIds?: string[];
  limit?: number;
}) => {
  const limit = Number.isFinite(params.limit) ? Math.max(1, Math.min(8, Math.floor(params.limit!))) : 4;
  const query = normalizeWhitespace(params.query);
  const terms = toQueryTerms(query);

  if (!query || !terms.length) {
    return [];
  }

  const selectedFileObjectIds = (params.selectedWorkspaceFileIds || [])
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));
  // An explicit but invalid selection must never widen to the entire workspace.
  if (params.selectedWorkspaceFileIds?.length && !selectedFileObjectIds.length) return [];

  const regexTerms = terms.map((term) => new RegExp(escapeRegex(term), "i"));

  const candidates = await WorkspaceKnowledgeChunkModel.find({
    orgId: params.orgId,
    userId: params.userId,
    ...(selectedFileObjectIds.length ? { workspaceFileId: { $in: selectedFileObjectIds } } : {}),
    ...(regexTerms.length ? { $or: regexTerms.map((term) => ({ text: term })) } : {}),
  })
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
      const score = scoreChunkAgainstQuery(text, query, terms);
      return {
        id: String(candidate?._id || ""),
        workspaceFileId: String(candidate?.workspaceFileId || ""),
        fileId: String(candidate?.fileId || ""),
        chunkIndex: Number(candidate?.chunkIndex || 0),
        text,
        snippet: text.slice(0, 320),
        score,
        sectionTitle: candidate?.sectionTitle ? String(candidate.sectionTitle) : undefined,
        pageNumber: Number(candidate.pageNumber) >= 1 ? Number(candidate.pageNumber) : undefined,
        sourceKind: String(candidate?.sourceKind || "document"),
        metadata:
          candidate?.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)
            ? (candidate.metadata as Record<string, unknown>)
            : undefined,
      } satisfies RetrievedWorkspaceChunk;
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, limit);
};
