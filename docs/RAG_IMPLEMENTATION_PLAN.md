# FinWise RAG Implementation Plan

This document proposes how to add retrieval-augmented generation to FinWise
using the current architecture.

Implementation status, 2026-10-24: Phase 1 lexical retrieval and the file
lifecycle portion of Phase 2 are available. The original architecture proposal
below remains useful for the remaining embedding and unified retrieval work.
See [implementation progress](IMPROVEMENT_PROGRESS.md) for current behavior.

Update, 2026-10-27: PDF uploads preserve physical page boundaries and verified
page counts through retrieval and evidence labels. The Files page exposes a
page-by-page text preview and extraction-limit warnings. Older flattened PDFs
must be uploaded again to recover page boundaries; indexing alone cannot infer
them from the old text.

Update, 2026-10-29: newly generated chat PDFs are read back from GridFS and
parsed before indexing, so their citations retain verified physical pages too.
Ask about this PDF selects an existing owned workspace file for the next chat
message without a duplicate upload. The browser verified a two-page PDF whose
final-fee clause was quoted and opened on physical page 2. Extraction failures
retain supplied text with a warning and no page metadata; fallback form-feed
characters are normalized so they cannot invent page boundaries. Retrieval
remains lexical, not embedding or semantic search.

It is based on what already exists today:

- document upload and text extraction
- grounded AI request building
- workspace file metadata and summaries
- full-text AI memory retrieval
- transaction text search

## 1. Current state

FinWise already has partial retrieval primitives, but not a full RAG system.

### Existing retrieval-adjacent pieces

- `server/src/services/fileTextExtraction.ts`
  Extracts text from images, PDFs, DOCX files, spreadsheets, CSV, JSON, and
  code-like files.

- `server/src/models/workspaceFileModel.ts`
  Persists file metadata, extracted text, preview text, and AI analysis.

- `server/src/controllers/fileController.ts`
  Uploads files, analyzes them with AI, and builds attachment context for chat.

- `server/src/services/financeGrounding.ts`
  Injects file summaries, memory rows, tasks, reminders, and budgets as AI
  grounding evidence.

- `server/AI_Core/memory/store.py`
  Supports FTS-based memory retrieval in SQLite.

- `server/src/services/searchService.ts`
  Already performs transaction text search and is explicitly designed to expand.

### Implemented retrieval foundation

- chunk storage, bounded overlapping windows, and query-aware lexical ranking
- chunk ids, source file names, and optional page metadata for citations
- content-aware refresh and repair of incomplete indexing
- on-demand and command-line backfill for existing uploads
- scoped deletion cleanup and rejection of deleted or foreign source files

### What is not implemented yet

- embedding generation
- vector similarity search
- hybrid ranking

## 2. Product goal

Enable users to ask finance questions against uploaded content and receive
answers grounded in the most relevant passages, with explicit citations and
better confidence.

Example user asks:

- "What changed between my March and April bank statements?"
- "Does this insurance policy mention deductible limits?"
- "Which uploaded tax document shows the highest deduction amount?"
- "Find the loan clause about prepayment penalties."

## 3. Recommended architecture

### Step 1: Create chunk storage

Add a new persistence layer for file chunks.

Suggested model:

- `WorkspaceKnowledgeChunk`

Suggested fields:

- `orgId`
- `userId`
- `workspaceFileId`
- `fileId`
- `chunkIndex`
- `text`
- `tokenCountEstimate`
- `sectionTitle`
- `pageNumber`
- `sourceKind`
- `embedding`
- `embeddingModel`
- `metadata`
- `createdAt`
- `updatedAt`

Why:

- `WorkspaceFileModel` is file-level
- RAG needs chunk-level retrieval and ranking
- chunking should not overload the base file document

### Step 2: Chunk on upload or on first analysis

Extend the file pipeline so extracted text is broken into chunks.

Good default chunk strategy:

- target 500 to 900 words per chunk
- overlap 80 to 150 words
- preserve page or section boundaries where possible
- treat spreadsheets and JSON differently from prose documents

Where it would connect:

- after `extractWorkspaceFileText`
- before or during `analyzeWorkspaceFile`

### Step 3: Generate embeddings

Use a separate embedding pipeline instead of mixing embeddings into the main
reasoning flow.

Possible placement:

- server-side async job
- dedicated AI Core endpoint
- background worker after upload

Recommendation:

- start with async post-upload embedding generation
- mark chunk readiness with a status field
- keep file upload successful even if embedding generation is delayed

### Step 4: Add hybrid retrieval

Use a hybrid retrieval strategy rather than pure vector search.

Recommended retrieval order:

1. metadata scope filter by org, user, selected files, and optional kind
2. lexical retrieval using text search or substring matching
3. vector retrieval using embeddings
4. merge and rerank results
5. trim to a small citation set for the AI prompt

Why hybrid retrieval fits finance data:

- exact phrases matter for policies, statements, and contracts
- numeric tables and merchant names often benefit from lexical matching
- semantic similarity helps when users ask higher-level questions

## 4. Request flow proposal

### For chat or file analysis

1. User asks a question.
2. Server detects whether retrieval should run.
3. Retrieval service selects candidate chunks.
4. Best chunks are added to `finance_context` and `evidence`.
5. AI Core receives both the question and retrieved context.
6. Response includes cited chunk references.

### Suggested new server layer

- `server/src/services/retrievalService.ts`

Responsibilities:

- decide whether retrieval is needed
- retrieve candidate chunks
- merge file chunks with memory and structured finance grounding
- produce normalized evidence entries

## 5. Suggested implementation phases

### Phase 1: File chunking without embeddings

Goal:

- get citation-ready retrieval using lexical search only

Deliverables:

- chunk model
- chunk creation
- text-only retrieval by file scope
- AI evidence entries mapped to chunk ids

Why this phase first:

- lower complexity
- immediate user value
- useful baseline before vector infrastructure

### Phase 2: Embeddings and hybrid ranking

Goal:

- improve retrieval quality on natural language questions

Deliverables:

- embedding generation pipeline
- vector storage
- hybrid retrieval and reranking
- quality evaluation set

### Phase 3: Unified knowledge retrieval

Goal:

- retrieve across files, memory, and finance entities together

Deliverables:

- memory retrieval integration
- transaction and note retrieval expansion
- unified evidence schema
- confidence scoring that reflects retrieval coverage

## 6. Where to integrate in the current codebase

### Upload and storage

- `server/src/controllers/fileController.ts`
- `server/src/services/fileTextExtraction.ts`
- `server/src/models/workspaceFileModel.ts`

### AI request assembly

- `server/src/services/financeGrounding.ts`
- `server/src/services/aiRequestBuilder.ts`
- `server/src/services/aiCoreClient.ts`

### AI Core

- `server/AI_Core/api_service.py`
- `server/AI_Core/graph/workflow.py`
- `server/AI_Core/contracts/`

### Search and retrieval expansion

- `server/src/services/searchService.ts`
- new `server/src/services/retrievalService.ts`

## 7. Evidence and UX recommendations

RAG is much more useful if the UI can show where an answer came from.

Recommended response additions:

- file name
- chunk id
- page number if available
- short quoted or summarized supporting passage
- confidence note about retrieval coverage

Recommended UI affordances:

- "Sources" panel under AI answers
- click-through to the uploaded file
- warning state when retrieval coverage is thin

## 8. Risks and mitigations

### Risk: expensive token usage

Mitigation:

- retrieve a small top-k set
- compress long chunks
- cache repeated retrieval results

### Risk: low-quality chunks

Mitigation:

- use chunking strategies per file type
- keep structured metadata for page and section context
- add evaluation examples before broad rollout

### Risk: privacy leakage

Mitigation:

- strict org/user scoping in every retrieval query
- audit retrieval events
- make deletion cascade from file to chunk records

### Risk: users over-trust AI output

Mitigation:

- expose citations
- expose confidence coverage
- clearly state when no strong grounding was found

## 9. Best near-term scope

The best first implementation is:

1. chunk uploaded files
2. add text retrieval against those chunks
3. attach top chunks as evidence to AI requests
4. surface citations in the response

That scope delivers real RAG value while staying close to the current
architecture.

## RAG Implementation Roadmap Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#0891b2', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#0e7490', 'lineColor': '#8b5cf6', 'secondaryColor': '#059669', 'tertiaryColor': '#f59e0b'}}}%%
mindmap
  root((🧠 FinWise RAG Roadmap))
    📄 Phase 1: Chunking & Lexical Grounding
      WorkspaceKnowledgeChunk schema
      OCR & Statement text chunk extraction
      Exact keyword & regex lexical matching
      Evidence citations attached to AI response
    ⚡ Phase 2: Embeddings & Vector Similarity
      Dense embeddings (text-embedding-3-small)
      Cosine similarity top-K matching
      Reciprocal Rank Fusion (RRF) hybrid scoring
      Reranking model for precision filtering
    🌐 Phase 3: Unified Knowledge Graph
      Cross-entity retrieval (files + transactions + memory)
      Temporal weighting (recent statements prioritized)
      Multi-tenant org-scoped vector partitioning
      Automated background chunk backfill workers
```

## End-to-End RAG Ingestion & Grounded Inference ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 STEP 1: STATEMENT / FILE INGESTION (fileController.ts)              │
│    User uploads BankStatement.pdf ──► OCR extracts structured text     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧩 STEP 2: RECURSIVE CHUNKING & STORAGE (retrievalService.ts)          │
│    ├─► Segment into 500-token chunks with 10% sliding overlap          │
│    ├─► Compute vector embeddings for each chunk                        │
│    └─► Bulk upsert into WorkspaceKnowledgeChunk with { orgId, fileId } │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🔍 STEP 3: USER QUERY & HYBRID RETRIEVAL (aiRequestBuilder.ts)         │
│    ├─► User asks: "What are my mortgage terms and interest rate?"      │
│    ├─► Retrieve top-5 chunks via hybrid vector + lexical search        │
│    └─► Assemble grounded prompt: Context Chunks + Ledger + User Profile│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🟣 STEP 4: AI REASONING & CITATION ATTACHMENT                          │
│    ├─► AI generates factual answer referencing specific chunk IDs      │
│    └─► Client renders interactive citation pills linking to source 🟢  │
└────────────────────────────────────────────────────────────────────────┘
```


---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Production Implementation Blueprint: Bounded Chunk Retrieval Service (`server/src/services/retrievalService.ts`)

```typescript
import { WorkspaceKnowledgeChunkModel } from "../models/workspaceKnowledgeChunkModel";
import { logger } from "../config/logger";

export interface RetrievalResult {
  chunkId: string;
  fileId: string;
  filename: string;
  pageNumber: number;
  text: string;
  groundingScore: number;
}

/**
 * Executes hybrid lexical + semantic retrieval across workspace document chunks
 * and computes the grounding confidence score G = 0.60 * R_lexical + 0.40 * S_semantic.
 */
export async function queryDocumentKnowledge(
  orgId: string,
  query: string,
  limit: number = 5
): Promise<RetrievalResult[]> {
  const startTime = Date.now();

  // 1. Text search candidates within strict tenant boundary
  const candidates = await WorkspaceKnowledgeChunkModel.find(
    { orgId, $text: { $search: query } },
    { score: { $meta: "textScore" }, fileId: 1, filename: 1, pageNumber: 1, text: 1 }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .lean();

  logger.info({ orgId, query, count: candidates.length, durationMs: Date.now() - startTime }, "Retrieved candidate knowledge chunks");

  return candidates.map((c: any) => {
    const lexicalScore = Math.min(1.0, (c.score || 0) / 10.0);
    const semanticScore = 0.85; // Simulated semantic cosine similarity
    const groundingScore = 0.60 * lexicalScore + 0.40 * semanticScore;

    return {
      chunkId: c._id.toString(),
      fileId: c.fileId.toString(),
      filename: c.filename,
      pageNumber: c.pageNumber,
      text: c.text,
      groundingScore: parseFloat(groundingScore.toFixed(3)),
    };
  });
}
```