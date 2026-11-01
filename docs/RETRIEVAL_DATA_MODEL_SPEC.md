# FinWise Retrieval Data Model Spec

This document proposes the retrieval-oriented data model needed to move
FinWise from "grounded AI with file summaries" to a real chunk-based knowledge
and RAG system.

It is intentionally a documentation artifact first, so the team can agree on
shape and ownership before implementation.

## 1. Current model gap

Today, the repository stores file-level extracted content in
`WorkspaceFileModel`, which is enough for:

- previews
- summaries
- basic search by file name or preview text
- prompt stuffing for small documents

It is not enough for:

- chunk-level retrieval
- ranked citations
- scalable prompt assembly for large documents
- hybrid vector + lexical retrieval

## 2. Proposed new model

### `WorkspaceKnowledgeChunk`

Purpose:

- stores retrievable chunks derived from uploaded workspace files

Suggested fields:

| Field | Type | Notes |
| -- | -- | -- |
| `orgId` | ObjectId | Required for tenant isolation |
| `userId` | ObjectId | Required for ownership scoping |
| `workspaceFileId` | ObjectId | Link to `WorkspaceFileModel` document |
| `fileId` | ObjectId | Link to underlying GridFS file id |
| `chunkIndex` | number | Stable order inside one file |
| `text` | string | Canonical retrievable chunk text |
| `textPreview` | string | Shortened preview for UI/debugging |
| `tokenCountEstimate` | number | Useful for prompt budgeting |
| `charCount` | number | Cheap fallback metric |
| `sectionTitle` | string optional | Best-effort heading or sheet name |
| `pageNumber` | number optional | Important for PDFs |
| `sourceKind` | enum | `document`, `spreadsheet`, `image`, `code`, `data`, `archive`, `other` |
| `embedding` | number[] optional | Vector embedding when available |
| `embeddingModel` | string optional | Embedding model identifier |
| `embeddingStatus` | enum | `pending`, `ready`, `failed`, `skipped` |
| `lexicalTerms` | string[] optional | Optional helper terms for retrieval/debugging |
| `metadata` | mixed | Extra extraction context |
| `createdAt` | date | Standard timestamp |
| `updatedAt` | date | Standard timestamp |

## 3. Suggested indexes

### Minimum indexes

- `{ orgId: 1, userId: 1, workspaceFileId: 1, chunkIndex: 1 }`
- `{ orgId: 1, userId: 1, updatedAt: -1 }`
- text index on `text`, possibly with `sectionTitle`

### Optional indexes

- `{ orgId: 1, userId: 1, embeddingStatus: 1 }`
- `{ workspaceFileId: 1, pageNumber: 1 }`
- vector index or vector-store-specific equivalent if embeddings are added

## 4. Relationship to existing models

### `WorkspaceFileModel`

Retains responsibility for:

- upload metadata
- extracted full text
- extraction warnings
- file-level AI analysis

### `WorkspaceKnowledgeChunk`

Would own:

- retrieval granularity
- chunk ordering
- citation references
- embedding lifecycle

### Why not overload `WorkspaceFileModel`

Because chunk data:

- grows much larger than file-level metadata
- has different query patterns
- benefits from dedicated indexes
- may need separate lifecycle and async processing

## 5. Lifecycle proposal

### On upload

1. File uploads successfully.
2. Text extraction runs.
3. Chunk records are created from extracted text.
4. File status remains usable even if embeddings are not ready yet.

### On retrieval

1. Server queries chunk records scoped by org and user.
2. Retrieval service ranks candidate chunks.
3. Selected chunks become evidence items in AI context.

### On delete

Deleting a workspace file should cascade to:

- chunk records
- embedding metadata
- any retrieval cache keyed to that file

## 6. Evidence mapping

Each retrieved chunk should be convertible into a normalized evidence item.

Suggested evidence shape:

- `id`
- `type`
- `label`
- `snippet`
- `entity_id`
- `workspace_file_id`
- `chunk_index`
- `page_number`
- `retrieval_score`

This would extend the current evidence model without breaking the general
pattern already used by grounded AI responses.

## 7. Chunking notes by content type

### PDF and prose documents

- chunk by paragraph and section where possible
- preserve page number if available

### Spreadsheets

- chunk by sheet and logical row ranges
- preserve sheet name in `sectionTitle`

### JSON and data files

- chunk by top-level sections or object groups
- avoid giant raw dumps in one chunk

### Code and text files

- chunk by headings, functions, or stable block boundaries

## 8. Future extensions

This model can also support:

- saved highlights
- user annotations
- human-verified chunk labels
- retrieval analytics
- document comparison features

## 9. Suggested implementation ownership

### Server

- chunk persistence
- retrieval queries
- file deletion cascade
- evidence normalization

### AI Core

- optional embedding generation
- reranking
- retrieval-aware prompt assembly

### Client

- citation rendering
- source inspection
- chunk-aware file navigation

## 10. Companion docs

- `docs/RAG_IMPLEMENTATION_PLAN.md`
- `docs/FEATURE_EXPANSION_BLUEPRINT.md`
- `docs/AI_EVIDENCE_UX_GUIDE.md`

## Workspace Knowledge Retrieval Architecture Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#059669', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#047857', 'lineColor': '#8b5cf6', 'secondaryColor': '#0284c7', 'tertiaryColor': '#f59e0b'}}}%%
mindmap
  root((📚 Workspace Retrieval Engine))
    📁 Document Ingestion
      WorkspaceFile (PDF statements, CSV receipts, tax docs)
      OCR Text Extraction (PaddleOCR / Tesseract)
      Metadata Extraction (Page counts, mime types, file hash)
    🧩 Knowledge Chunking
      WorkspaceKnowledgeChunk schema
      Chunk size: 500 tokens with 50-token sliding overlap
      Document page number & bounding box coordinates
      Strict orgId tenant isolation
    🔍 Search & Vector Indexing
      Vector Embeddings (text-embedding-3-small / Gemini)
      Compound Indexes: { orgId: 1, fileId: 1, chunkIndex: 1 }
      Hybrid Retrieval: Vector Cosine + Full-Text Search
    🎯 Grounded Citation Delivery
      Chunk source attribution in AI responses
      Evidence card previews in FinanceOS UI
      Verified source verification hashes
```

## Document Chunking, Embedding & RAG Search ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 FILE UPLOAD: Financial Statement / Receipt (PDF / Image)            │
│    POST /api/v1/files/upload (Multi-Tenant Org Context)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📄 STAGE 1: INGESTION & TEXT EXTRACTION                                │
│    ├─► Save file record to WorkspaceFile collection                    │
│    ├─► Run OCR / PDF Text Parser on document pages                     │
│    └─► Emit background event for chunk backfill worker                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧩 STAGE 2: RECURSIVE CHUNKING & EMBEDDINGS                            │
│    ├─► Split raw text into semantic chunks (~500 tokens, 10% overlap)  │
│    ├─► Generate vector embeddings via Embedding Provider               │
│    └─► Bulk insert into WorkspaceKnowledgeChunk with tenant orgId 🟢   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🔍 STAGE 3: HYBRID RAG QUERY RETRIEVAL (retrievalService.ts)           │
│    ├─► Query: "What was my deductible business expense in March?"      │
│    ├─► Filter candidate chunks strictly by { orgId }                   │
│    ├─► Cosine Similarity Top-K Match (k = 5 relevant chunks)           │
│    └─► Inject retrieved chunks into AI Prompt context with citations 🟢│
└────────────────────────────────────────────────────────────────────────┘
```


---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Production Implementation Blueprint: Workspace Knowledge Chunk Model (`server/src/models/workspaceKnowledgeChunkModel.ts`)

```typescript
import mongoose, { Schema, Document, Model } from "mongoose";
import { orgScopePlugin } from "../utils/orgScopePlugin";

export interface IWorkspaceKnowledgeChunk extends Document {
  orgId: string;
  userId: string;
  fileId: mongoose.Types.ObjectId;
  filename: string;
  chunkIndex: number;
  pageNumber: number;
  text: string;
  charLength: number;
  tokenEstimate: number;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceKnowledgeChunkSchema = new Schema<IWorkspaceKnowledgeChunk>(
  {
    orgId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    fileId: { type: Schema.Types.ObjectId, ref: "WorkspaceFile", required: true, index: true },
    filename: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    pageNumber: { type: Number, required: true },
    text: { type: String, required: true },
    charLength: { type: Number, required: true },
    tokenEstimate: { type: Number, required: true },
  },
  {
    timestamps: true,
    collection: "workspace_knowledge_chunks",
  }
);

// Compound indexes for sub-10ms scoped queries and lexical retrieval
WorkspaceKnowledgeChunkSchema.index({ orgId: 1, fileId: 1, chunkIndex: 1 }, { unique: true });
WorkspaceKnowledgeChunkSchema.index({ orgId: 1, text: "text" });

WorkspaceKnowledgeChunkSchema.plugin(orgScopePlugin);

export const WorkspaceKnowledgeChunkModel: Model<IWorkspaceKnowledgeChunk> =
  mongoose.model<IWorkspaceKnowledgeChunk>("WorkspaceKnowledgeChunk", WorkspaceKnowledgeChunkSchema);
```