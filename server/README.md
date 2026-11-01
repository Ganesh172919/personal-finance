# FinWise Server — Express 5 API Gateway & Task Worker

> **Production-Grade Multi-Tenant API Gateway, Job Scheduler & Business Logic Engine**  
> *Express 5 Routing, Mongoose 8 Tenant Isolation (`orgScopePlugin`), Redis 7 Distributed Caching, BullMQ Async Workers, and OpenTelemetry Tracing*  
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
      BullMQ Job Processor
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
│ 💾 MONGOOSE 8 ORM (Port 27017)                │ │ ⚙️ BULLMQ & REDIS 7 WORKER (Port 6379)        │
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

### 3.2 Dispatching Background Tasks via BullMQ

```typescript
import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

export const statementQueue = new Queue('statement-processing', { connection: redis });

export async function enqueueStatementJob(orgId: string, fileId: string) {
  await statementQueue.add(
    'extract-transactions',
    { orgId, fileId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    }
  );
}
```

---


---

## 4. 2026 Enterprise Server Capabilities

The backend gateway and background worker deliver enterprise financial operations:
1. **RAG Phase 2 Bounded Window Ingestion & BM25 Retrieval (`server/src/services/retrievalService.ts`)**: 1,800-character bounded chunks with 260-character sliding overlap and physical page preservation (``), indexed into `WorkspaceKnowledgeChunkModel`.
2. **Automated BullMQ Newsletter Engine (`server/src/services/newsletterScheduler.ts`, `server/src/services/newsletterService.ts`)**: Timezone-aware 60-second cron runner delivering responsive weekly financial digests with spending analytics, 7-day bill horizons, and health score snapshots.
3. **Server-Side PDFKit Vector Compiler (`server/src/services/pdfRequestServer.ts`)**: Compiles high-fidelity PDF financial statements directly into MongoDB GridFS (`fs.files`, `fs.chunks`) without intermediate temporary disk files.
4. **Dead Letter Queue (DLQ) & Job Resilience (`server/src/services/deadLetterQueue.ts`, `server/src/services/jobRecovery.ts`)**: Traps silent fire-and-forget failures, stores stack traces in Redis ring buffer `bull:finwise-dlq`, and recovers orphaned background jobs.
5. **MongoDB Compound Index Health Audit (`server/src/services/transactionIndexes.ts`)**: Verifies on startup that essential compound B-tree indexes (`{ orgId: 1, date: -1 }`) are active to prevent unindexed collection scans.
6. **Conversation Insights TTL Cache & Coalescing Engine (`server/src/services/conversationInsightsCache.ts`)**: Multi-tenant MongoDB snapshot cache with TTL invalidation (120s normal, 15s degraded) and in-process duplicate request coalescing.
7. **Composite Financial Health Score Engine (`server/src/services/healthScoreService.ts`)**: Tracks historical health scores across 4 pillars with trend categorization (improving, stable, declining).

---
## 5. Local Execution & Testing Commands

> **Verification Status:** **49 test suites / 193 tests passed** (Vitest + Supertest) · TypeScript strict (0 errors) · Node.js `>=24.14.1 <25`.

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
