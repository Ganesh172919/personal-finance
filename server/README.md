# FinWise Server — Express 5 API Gateway & Task Worker

> **Production-Grade Multi-Tenant API Gateway, Job Scheduler & Business Logic Engine**  
> *Express 5 Routing, Mongoose 8 Tenant Isolation (`orgScopePlugin`), optional Redis caching, MongoDB-backed workers, and OpenTelemetry Tracing*

> [!IMPORTANT]
> This guide has historical examples. The live worker is `src/worker/worker.ts`, which claims MongoDB job records; `bullmq` is not a runtime dependency. Use `PYTHON_API_URL`, not `AI_CORE_URL`.
> **API Gateway Port:** `http://localhost:3000` · **Python AI Core Target:** `http://localhost:8001` · **MongoDB:** `:27017` · **Redis:** `:6379`

---

> [!TIP]
> **Developer Guide: Building on FinWise**  
> For complete end-to-end full-stack feature recipes, Mongoose models, Zod schemas, Express controllers, and Python LangGraph subagents, consult the [**Master Developer Handbook: Building on This Project**](../docs/BUILDING_ON_THIS_PROJECT.md).

## 1. Gateway & Worker Architecture Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#38bdf8', 'lineColor': '#818cf8', 'secondaryColor': '#0f172a', 'tertiaryColor': '#1e1e38'}}}%%
mindmap
  root((🔷 Gateway Architecture :3000))
    Edge Ingress & Middleware
      Helmet Security Headers & CORS
      Sliding Window Rate Limiter
      Dual Authentication JWT & API Keys
      Multi-Tenant Scoping orgScopePlugin
      Zod Request Payload Sanitization
      RFC 7807 Global Error Boundary
    Domain Routing & APIs
      Canonical /api/v1 Surface
      Transactions & Ledgers
      Budget Envelopes & Health
      Analytics & Financial Stories
      PDF & Statement Exports
    Business Services Layer
      60 Domain Service Modules
      Deterministic Arithmetic Logic
      EventBus Redis Fanout Pub/Sub
      Idempotency Locking (Redlock)
    Asynchronous Worker
      MongoDB Job Processor
      Dead Letter Queue (DLQ) Quarantine
      Cron Schedulers Agenda
    Persistence
      MongoDB 7.0 52 Models
      Compound Indexes { orgId: 1, date: -1 }
      Redis 7.0 Cache-Aside (TTL 60s)
```

---

## 2. Server Request Pipeline ASCII Flow

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🟢 INCOMING HTTP REQUEST (From Client :5173 / External API)                                     │
│    POST /api/v1/transactions • Headers: { Authorization, x-org-id }                             │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ EDGE INGRESS MIDDLEWARE STACK                                                                │
│    1. helmet() ──► 2. cors() ──► 3. express.json() ──► 4. rateLimiter (Redis Sliding Window)    │
│    5. authAny (Verifies JWT or SHA-256 API Key) ──► 6. orgContext (Resolves active req.orgId)   │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📋 CONTROLLER & VALIDATION LAYER                                                                │
│    createTransactionSchema.parse(req.body)                                                      │
│    Controller extracts { orgId, userId } ──► calls transactionService.createTransaction()       │
└───────────────────────────────────────┬─────────────────────────────────┬───────────────────────┘
                                        │                                 │
                                        ▼ Database Write                  ▼ Asynchronous Job
┌───────────────────────────────────────────────┐ ┌───────────────────────────────────────────────┐
│ 💾 MONGOOSE 8 ORM (Port 27017)                │ │ ⚙️ MONGODB BACKGROUND WORKER                  │
│    TransactionModel.create({ ...data, orgId })│ │    queue.add('process-statement', { orgId })  │
│    - orgScopePlugin automatically filters     │ │    - Distributed Mutex Lock                   │
│    - Compound index: { orgId: 1, date: -1 }   │ │    - Automatic Dead Letter Queue on error     │
└───────────────────────────────────────────────┘ └───────────────────────────────────────────────┘
```

---

## 3. Developer Guide: Building on the Server

### 3.1 Creating a New API Controller & Route

Create `server/src/controllers/v1/sampleController.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const samplePayloadSchema = z.object({
  title: z.string().min(1).max(100),
  value: z.number().positive(),
});

export async function createSampleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.orgId!;
    const validated = samplePayloadSchema.parse(req.body);

    res.status(201).json({
      success: true,
      data: {
        id: `sample_${Date.now()}`,
        orgId,
        ...validated,
      },
    });
  } catch (error) {
    next(error); // Caught by global error handler
  }
}
```

### 3.2 Dispatching Background Tasks to the MongoDB Worker

```typescript
import WorkflowRunModel from "../models/workflowRunModel";

export async function queueWorkflowRun(orgId: string, workflowId: string, userId: string, requestId: string) {
  return WorkflowRunModel.create({
    orgId,
    workflowId,
    triggeredByUserId: userId,
    requestId,
    status: "queued",
  });
}
```

---


---

## 4. 2026 Enterprise Server Capabilities

The backend gateway and background worker deliver enterprise financial operations:
1. **RAG Phase 2 Bounded Window Ingestion & BM25 Retrieval (`server/src/services/retrievalService.ts`)**: 1,800-character bounded chunks with 260-character sliding overlap and physical page preservation (``), indexed into `WorkspaceKnowledgeChunkModel`.
2. **Automated newsletter scheduler (`server/src/services/newsletterScheduler.ts`, `server/src/services/newsletterService.ts`)**: Timezone-aware 60-second scheduler delivering responsive weekly financial digests with spending analytics, 7-day bill horizons, and health score snapshots.
3. **Server-Side PDFKit Vector Compiler (`server/src/services/pdfRequestServer.ts`)**: Compiles high-fidelity PDF financial statements directly into MongoDB GridFS (`fs.files`, `fs.chunks`) without intermediate temporary disk files.
4. **Failure records & job recovery (`server/src/services/deadLetterQueue.ts`, `server/src/services/jobRecovery.ts`)**: Keeps a bounded in-process diagnostic record for fire-and-forget failures and recovers orphaned MongoDB job records.
5. **MongoDB Compound Index Health Audit (`server/src/services/transactionIndexes.ts`)**: Verifies on startup that essential compound B-tree indexes (`{ orgId: 1, date: -1 }`) are active to prevent unindexed collection scans.
6. **Conversation Insights TTL Cache & Coalescing Engine (`server/src/services/conversationInsightsCache.ts`)**: Multi-tenant MongoDB snapshot cache with TTL invalidation (120s normal, 15s degraded) and in-process duplicate request coalescing.
7. **Composite Financial Health Score Engine (`server/src/services/healthScoreService.ts`)**: Tracks historical health scores across 4 pillars with trend categorization (improving, stable, declining).

---
## 5. Local Execution & Testing Commands

> **Verification Status (4 November 2026):** **74 test files / 318 tests passed** (Vitest + Supertest) · TypeScript strict (0 errors) · Node.js `>=24.14.1 <25`.

```bash
# 1. Install server dependencies
npm install

# 2. Launch Express 5 in development watch mode (Port 3000)
npm run dev

# 3. Launch background worker (when ASYNC_JOBS_ENABLED=true)
npm run worker:dev

# 4. Execute integration test suites
npm test

# 5. Typecheck & lint verification
npm run check
```

---

## Latest Gateway & Worker Innovations (2026 Enterprise Release)

### 1. Machine Learning Merchant Embedding & Clustering Service (`merchantEmbeddingClustering.ts`)
- Dense 64-dimensional L2-normalized vector space: Sector Taxonomies (dims 0–11), Brand Anchors (dims 12–27), and FastText subword character n-gram FNV-1a hashing (dims 28–63).
- Hierarchical agglomerative centroid-based clustering groups messy descriptions into canonical entities when cosine similarity satisfies $C_{\text{sim}} \ge 0.70$.
- Exposes `GET /api/transactions/merchant-clusters` and `POST /api/transactions/merchant-clusters/apply`.

### 2. Multi-Modal Grounded RAG 64-D Vector Indexing (`retrievalService.ts`)
- Form-feed aware chunking (1,800 characters target / 260 characters overlap) preserving physical PDF statement pages (`\f`).
- Deterministic 64-D vector generation stored in MongoDB `workspaceKnowledgeChunks` collection.
- Hybrid dense semantic + BM25 lexical ranking ($G = 0.55 \cdot S_{\text{cosine}} + 0.45 \cdot R_{\text{lexical\_norm}}$) enforcing grounding threshold $G \ge 0.70$.

### 3. Authenticated Bank-Feed Import Simulator (`financialDataRoutes.ts`)
- Ingests user-authenticated Plaid/Teller-style test payloads via `POST /api/transactions/bank-feed`. It is not a public provider callback and does not implement HMAC verification.
- Enforces strict deduplication via sparse compound index `{ orgId: 1, externalId: 1 }`.
- Evaluates algorithmic confidence scores ($0.10 \le C \le 1.00$) and routes unclassified items ($C < 0.70$) to review queue.

### 4. Visual Workflow Webhooks & Delayed Timers (`workflows.ts`)
- Inbound webhook trigger ingress via `POST /api/workflows/webhook/:token` authenticated by 48-character cryptographic token.
- Multi-step delay timer execution (1 second to 30 days) with `WorkflowRun.delays_executed` logging.
- Conditional branch filtering with runtime template variable interpolation (`{{field}}`).

### 5. Multi-Channel Scheduled Exports (`scheduledExportService.ts`)
- Recurring transaction ledger and statement exports dispatched to Email, Webhook Push, or Cloud Storage (AWS S3 & Google Cloud Storage GCS).
- Integrates SHA-256 cryptographic checksum calculation (`X-FinWise-Checksum`) on generated report buffers.

### 6. Subscription Dunning Recovery & Multi-Currency Billing (`dunningService.ts`, `currencyFx.ts`)
- Automated dunning retry workflows recovering failed subscription payments with 7-day grace period enforcement.
- ISO 4217 multi-currency billing localization across 7 currencies with JPY integer rounding.

### 7. Continuous Production AI Canary Invariant Validation Engine (`aiCanaryService.ts`, `aiCanaryController.ts`)
- Dual-layer invariant validation: Primary invocation to Python FastAPI microservice (`POST /canary/validate`) with automatic local TypeScript decimal math fallback.
- Enforces 5 mathematical identities: Number safety ($D_{\text{cand}} \subseteq D_{\text{ref}} \cup D_{\text{allowlist}}$), zero-sum budget conservation ($\sum \Delta B_i = 0$), balance sheet identity, cash flow identity, and debt amortization.
- Canonical routes: `GET /api/v1/ai/canary/status`, `POST /api/v1/ai/canary/validate`.

### 8. Financial Calendar RFC 5545 iCal Streaming Feed & Reminders (`calendarReminderController.ts`)
- Streams standardized RFC 5545 `VCALENDAR` feeds via `GET /api/v1/calendar-reminders/export.ics` authenticated by cryptographic tokens.
- Supports creation, update, and cadence tracking for bill reminders, debt payoff milestones, and tax filings in `CalendarReminderModel`.

### 9. Offline-First Financial Journal Batch Synchronization (`financialJournalController.ts`, `journalEmbeddingService.ts`)
- Ingests bulk offline drafts via `POST /api/financial-journal/entries/batch-sync`.
- Guarantees zero duplicate entries via compound unique index `{ orgId: 1, userId: 1, clientKey: 1 }`.
- Projects notes into 64-dimensional semantic embedding space for conceptual vector search.
