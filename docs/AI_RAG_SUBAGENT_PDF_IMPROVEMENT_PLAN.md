# AI, RAG, and PDF Improvement Plan

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

Date: 2026-05-08

Update: 2026-10-24. The lifecycle portion of RAG Phase 2 is implemented:
bounded overlapping chunks, content-aware reindexing, partial-write repair,
on-demand backfill during grounding, an organization-scoped backfill command,
and deletion cleanup. Retrieval also verifies that source files still exist
and belong to the requesting organization and user. Form-feed page boundaries
are retained when supplied by an extractor. PDF-specific page extraction was
subsequently added on 2026-10-27, with real
blank-page fixtures, stored page counts, and page-aware text review. Embeddings
and hybrid ranking remain future work. See
[implementation progress](IMPROVEMENT_PROGRESS.md).

## Goal

This plan focuses on three additive improvements:

1. Introduce practical retrieval-augmented generation over uploaded files.
2. Improve AI agent performance by making subagent use more targeted and better grounded.
3. Add a server-side TXT-to-PDF generation path for user-authored request files.

## What Was Implemented Now

- Chunk storage for uploaded workspace files via `WorkspaceKnowledgeChunk`.
- Lexical retrieval service for relevant workspace file chunks.
- Grounding enrichment that injects retrieved chunks into `finance_context`.
- AI Core support for consuming `finance_context` instead of silently ignoring it.
- Evidence and confidence passthrough in AI Core responses.
- TXT-to-PDF render endpoints for:
  - direct prompt text requests
  - existing workspace text files
- Download endpoint for generated PDFs stored in GridFS.

## Tradeoffs

### RAG Phase 1 Tradeoff

Chosen approach:
- lexical chunk retrieval first

Benefits:
- low complexity
- easy to debug
- no new embedding infrastructure
- cheaper and safer for an existing codebase

Costs:
- weaker semantic matching than embeddings
- may miss relevant passages when the user asks with very different wording

Decision:
- good first production step because it creates citation-ready evidence quickly

### AI Subagent Tradeoff

Chosen approach:
- keep deterministic routing and parallel specialists
- improve the quality of the shared grounding context first

Benefits:
- preserves current reliability
- reduces hallucination risk
- improves specialist output quality without multiplying LLM calls immediately

Costs:
- not the maximum possible intelligence uplift
- deeper delegation still needs explicit planner and verifier tuning later

Decision:
- better to improve context quality before increasing orchestration complexity

### PDF Server Tradeoff

Chosen approach:
- add authenticated API routes inside the existing Node server

Benefits:
- simpler deployment
- reuses auth, org scoping, and GridFS ownership checks
- no separate microservice to monitor

Costs:
- PDF rendering load stays inside the main server process
- advanced layout or queue isolation can come later if volume grows

Decision:
- right scope for current architecture and user workflow

## Recommended Next Phase

### RAG Phase 2

- add chunk deletion/backfill lifecycle on workspace file delete or reprocess
- add embeddings and hybrid ranking
- add chunk-level page metadata for PDFs where available (implemented 2026-10-27)
- add retrieval evaluation fixtures for real finance documents

### RAG Phase 3

- unify retrieval across files, memory, journal, and transactions
- add reranking tuned for finance questions and numeric comparisons
- expose richer citations in the client UI (file/page links and complete source lists implemented 2026-10-28)

## Subagent Performance Upgrade Path

### Phase A

- route all complex requests with retrieval-enriched `session_summary`
- attach retrieved evidence to final responses consistently
- monitor which specialists activate most often and where latency clusters

### Phase B

2026-10-24 progress: targeted deterministic planning and selective parallelism
are implemented. Comprehensive and decomposed requests share bounded specialist
execution, and verification is followed by a single synthesis step. Per-agent
timing, token/call usage, fallback, and cache metrics are preserved in responses.
Retrieval-coverage decisions and stricter verification driven by coverage are
still pending.

- add a dedicated planner node that decides:
  - which specialists are needed
  - whether retrieval coverage is sufficient
  - whether verification should be stricter
- add selective parallelism based on detected query domains instead of always fanning out

### Phase C

- add specialist-specific retrieval slices
  - debt agent gets debt clauses and loan statements
  - investment agent gets portfolio and policy chunks
  - budget agent gets recurring bills and spending evidence
- add answer quality scoring from:
  - retrieval coverage
  - cross-agent agreement
  - missing-data warnings

## TXT-to-PDF Server Design

### Current Endpoints

- `POST /api/workspace-files/render-pdf`
  - body-driven PDF render from `prompt_text`
- `POST /api/workspace-files/:id/render-pdf`
  - PDF render from an existing workspace text file
- `GET /api/workspace-files/rendered/:fileId/download`
  - download generated PDF from GridFS

### Why This Shape Works

- keeps PDF generation authenticated and org-scoped
- lets users upload a `.txt` file once and reuse it
- fits worker/export evolution later if throughput increases

## Example Usage

### Direct text request

```json
{
  "prompt_text": "# Monthly Summary\n\n- Highlight major expenses\n- Call out unusual transfers\n- End with next actions",
  "title": "May Summary"
}
```

### Workspace file request

1. Upload a `.txt` file to workspace files.
2. Call `POST /api/workspace-files/:id/render-pdf`.
3. Download from the returned `download_path`.

## Rollout Notes

- This implementation is additive and keeps existing routes intact.
- Current retrieval is intentionally simple and explainable.
- The most important follow-up is lifecycle cleanup for chunk records plus hybrid search.

## AI, RAG, Subagent & PDF Architecture Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#7c3aed', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#6d28d9', 'lineColor': '#0891b2', 'secondaryColor': '#059669', 'tertiaryColor': '#ec4899'}}}%%
mindmap
  root((🚀 AI, RAG & PDF Engine))
    👥 Sub-Agent Decomposition
      TaskDecomposer (Intent splitting & subtasks)
      SubAgentManager (Async parallel agent execution)
      Specialist Agents: Debt, Budget, Investment
      Aggregator (Evidence-aware synthesis)
    📚 Workspace Knowledge RAG
      WorkspaceKnowledgeChunk data model
      Backfill script for legacy documents
      retrievalService (Hybrid search & top-K)
      Provenance citation tags [1], [2]
    📄 PDF Generation Service
      PDFKit Server-side compiler
      SOP Document templates (Standard Operating Procedures)
      Workspace file rendering: POST /api/workspace-files/:id/render-pdf
      Secure authenticated download endpoint
    🧪 Evaluation & Reliability Gates
      test_agent_currency.py (Current date/financial realities)
      test_agent_efficiency.py (Token budgeting & latency)
      test_sub_agent_manager.py (Isolated parallel runs)
```

## Combined RAG, Subagent Decomposition & PDF Export ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 USER SUBMITS COMPLEX REQUEST                                        │
│    "Analyze our uploaded tax policy PDF and produce a summary report"  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📚 STAGE 1: WORKSPACE RAG RETRIEVAL (retrievalService.ts)              │
│    ├─► Match top chunks from tax policy WorkspaceKnowledgeChunk        │
│    ├─► Extract key deduction clauses & income thresholds               │
│    └─► Attach chunks as structured evidence in agent state             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧠 STAGE 2: SUBAGENT ORCHESTRATION & ANALYSIS                          │
│    ├─► Task Decomposer divides work: Tax Impact + Budget Adjustment    │
│    ├─► Specialist agents execute in parallel with tool calculation     │
│    └─► Aggregator reconciles insights into unified structured plan     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📄 STAGE 3: PDF ARTIFACT COMPILATION (pdfRequestServer.ts)             │
│    ├─► Build formatted SOP report with charts & citation footnotes     │
│    ├─► Compile via PDFKit into secure workspace artifact               │
│    └─► Deliver download link to user with verified checksum 🟢         │
└────────────────────────────────────────────────────────────────────────┘
```


---

## Concrete Implementation Blueprints

### Blueprint 1: Workspace Knowledge Chunk Schema (`server/src/models/workspaceKnowledgeChunkModel.ts`)

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkspaceKnowledgeChunk extends Document {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  fileName: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  startChar: number;
  endChar: number;
  pageNumber?: number;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceKnowledgeChunkSchema = new Schema<IWorkspaceKnowledgeChunk>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    fileId: { type: Schema.Types.ObjectId, required: true, index: true },
    fileName: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    tokenCount: { type: Number, required: true },
    startChar: { type: Number, required: true },
    endChar: { type: Number, required: true },
    pageNumber: { type: Number },
  },
  { timestamps: true }
);

// Compound indexes for multi-tenant isolation and text ranking
WorkspaceKnowledgeChunkSchema.index({ orgId: 1, fileId: 1, chunkIndex: 1 }, { unique: true });
WorkspaceKnowledgeChunkSchema.index({ content: 'text', fileName: 'text' });

export const WorkspaceKnowledgeChunkModel = mongoose.model<IWorkspaceKnowledgeChunk>(
  'WorkspaceKnowledgeChunk',
  WorkspaceKnowledgeChunkSchema
);
```

### Blueprint 2: Bounded-Window Chunking & Retrieval (`server/src/services/retrievalService.ts`)

```typescript
import { WorkspaceKnowledgeChunkModel } from '../models/workspaceKnowledgeChunkModel.js';
import mongoose from 'mongoose';

const CHUNK_SIZE = 1800; // ~500 tokens
const CHUNK_OVERLAP = 260;

export function sliceBoundedText(rawText: string): Array<{ text: string; start: number; end: number; page?: number }> {
  const chunks: Array<{ text: string; start: number; end: number; page?: number }> = [];
  let cursor = 0;
  let pageCounter = 1;

  while (cursor < rawText.length) {
    const end = Math.min(cursor + CHUNK_SIZE, rawText.length);
    const chunkText = rawText.slice(cursor, end);
    const formFeedCount = (chunkText.match(/\f/g) || []).length;
    
    chunks.push({
      text: chunkText.replace(/\f/g, ' '),
      start: cursor,
      end,
      page: pageCounter,
    });

    pageCounter += formFeedCount;
    if (end === rawText.length) break;
    cursor += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function retrieveRelevantChunks(
  orgId: string,
  query: string,
  limit = 5
) {
  return await WorkspaceKnowledgeChunkModel.find(
    {
      orgId: new mongoose.Types.ObjectId(orgId),
      $text: { $search: query },
    },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();
}
```

### Blueprint 3: PDFKit Direct GridFS Stream Pipe (`server/src/services/pdfRequestServer.ts`)

```typescript
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

export async function compilePdfToGridFS(
  filename: string,
  content: string,
  metadata: Record<string, any>
): Promise<string> {
  const db = mongoose.connection.db!;
  const bucket = new GridFSBucket(db, { bucketName: 'fs' });
  
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: { ...metadata, contentType: 'application/pdf', generatedAt: new Date() },
  });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(uploadStream);

  // Styling header
  doc.fontSize(22).fillColor('#1e293b').text(metadata.title || 'Financial Report', { underline: true });
  doc.moveDown(1.5);

  // Content body
  doc.fontSize(11).fillColor('#334155').lineGap(4).text(content);
  doc.end();

  return new Promise((resolve, reject) => {
    uploadStream.on('finish', () => resolve(uploadStream.id.toString()));
    uploadStream.on('error', reject);
  });
}
```
