# FinWise: Comprehensive Project Flow & Runtime Lifecycles

> **Complete Visual & Technical Mapping of Data, Control, and State Lifecycles**  
> *Production Engineering Flow Catalog, Colourful Mindmaps, ASCII Sequence Topologies, and Concrete Code Snippets*  
> **Release Target:** 2026 Enterprise Edition | **Runtime Specification:** Node.js `>=24.14.1 <25` · Python `3.11+` · React `18.3` · MongoDB `7.0` · Redis `7.0`

---

> [!TIP]
> **Extending System Lifecycles?**  
> Follow the end-to-end request, controller, service, and LangGraph execution patterns detailed in the [**Master Developer Handbook: Building on This Project**](docs/BUILDING_ON_THIS_PROJECT.md).

## Master Flow Navigation

```text
FINWISE RUNTIME LIFECYCLES CATALOG
├── Flow 1: Authentication, JWT Dual-Token Issuance & Organization Scoping
├── Flow 2: Transaction Ingestion, AI Heuristic Categorization & Review Queue Triage
├── Flow 3: Workspace File Upload, RAG Phase 2 Overlapping Chunking & BM25 Retrieval
├── Flow 4: Conversational Chat, Multi-Agent Intent Routing & Subtask DAG Scheduling
├── Flow 5: Pure Python Deterministic Plan Math & Number Safety Invariant Verification
├── Flow 6: Server-Sent Events (SSE) Streaming Pipeline & Citation Badges
├── Flow 7: Server-Side PDFKit Vectorized Generation & MongoDB GridFS Streaming
├── Flow 8: Timezone-Aware Scheduled Newsletter Engine & BullMQ Worker Dispatch
├── Flow 9: LLM KeyPool Multi-Key Rotation, Cooldowns & 6-Tier Provider Failover
├── Flow 10: Automated Invariant Evaluation Harness, Latency SLAs & Regression Testing
├── Flow 11: Portfolio Target Allocation, Drift Analysis & Smart Cash Inflow Rebalancing
├── Flow 12: What-If Multi-Scenario Simulation & Monte Carlo Stochastic Risk Bounds
├── Flow 13: Dead Letter Queue (DLQ) Silent Failure Quarantining & Administrative Replay
├── Flow 14: Private Session Boundary Switch & Monotonic Query Cache Isolation
└── Flow 15: Assembled Conversation Insights Caching & Coalescing Engine
```

---

## Flow 1: Authentication, JWT & Organization Scoping

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#0284c7', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#38bdf8', 'lineColor': '#0ea5e9', 'secondaryColor': '#0f766e', 'tertiaryColor': '#6366f1'}}}%%
mindmap
  root((Flow 1: Authentication & Scoping))
    Ingress Channels
      Password Credentials Bcrypt 12 Rounds
      Google OAuth2 Passport Strategy
      SHA-256 Peppered API Keys
      TOTP 2FA Verification
    Token Issuance
      JWT Access Token 15-Minute Expiry
      HttpOnly Secure Refresh Cookie
      CSRF Double-Submit Secret Cookie
    Edge Middleware Pipeline
      optionalJwtAuth / authAny
      orgContext Header Resolution
      AsyncLocalStorage Context Binding
    Data Layer Scoping
      OrgScopePlugin Invariant Injection
      Tenant-Isolated MongoDB Queries
      Scoped Redis Keyspaces
```

### 2. High-Density ASCII Sequence Diagram

```text
  Client (React 18 SPA)                  Express Gateway (Port 3000)                  MongoDB 7.0
           │                                          │                                    │
    [1]    │──── POST /api/v1/auth/login ────────────►│                                    │
           │     { email, password }                  │──── findOne({ email }) ───────────►│
           │                                          │◄─── UserDocument (with salt/hash) ─│
    [2]    │                                          │                                    │
           │                                          │ [Compare bcrypt password hash]     │
           │                                          │ [Check TOTP 2FA status]            │
           │                                          │──── findOne({ members.userId }) ──►│
           │                                          │◄─── OrgDocument (default org) ─────│
    [3]    │                                          │                                    │
           │                                          │ [Sign JWT: sub=userId, orgId]      │
           │                                          │ [Generate CSRF Token & Salt]       │
           │◄─── HTTP 200 OK ─────────────────────────│                                    │
           │     Body: { token, user, org }           │                                    │
           │     Set-Cookie: refreshToken (HttpOnly)  │                                    │
           │     Set-Cookie: XSRF-TOKEN (Secure)      │                                    │
           │                                          │                                    │
    [4]    │=== Subsequent Business API Calls =======>│                                    │
           │    Headers: Authorization: Bearer <JWT>  │                                    │
           │    Headers: X-Org-ID: <orgId>            │ [Verify JWT signature]             │
           │    Headers: X-CSRF-Token: <token>        │ [Validate User org membership]     │
           │                                          │ [Bind AsyncLocalStorage(orgId)]   │
           │                                          │──── Mongoose query (OrgScopePlugin)│
           │                                          │     auto-injects: { orgId } ──────►│
           │                                          │◄─── Tenant-Isolated Documents ─────│
           │◄─── HTTP 200 OK (Scoped Response) ───────│                                    │
```

### 3. Concrete Implementation Snippet: `server/src/middleware/auth.ts`

```typescript
// Excerpt from server/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/envConfig";
import UserModel from "../models/userModel";
import OrgMemberModel from "../models/orgMemberModel";

export async function authAny(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid authorization header" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string; orgId?: string };

    const user = await UserModel.findById(decoded.userId).lean();
    if (!user) {
      return res.status(401).json({ success: false, error: "User session revoked or invalid" });
    }

    req.user = user;
    // Resolve active organization: explicit header takes precedence over token
    const requestedOrgId = (req.headers["x-org-id"] as string) || decoded.orgId;
    if (requestedOrgId) {
      const membership = await OrgMemberModel.findOne({ orgId: requestedOrgId, userId: user._id }).lean();
      if (!membership) {
        return res.status(403).json({ success: false, error: "Forbidden: user is not a member of target org" });
      }
      req.orgId = requestedOrgId;
      req.orgRole = membership.role;
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid or expired session token" });
  }
}
```

---

## Flow 2: Transaction Ingestion, AI Categorization & Review Queue

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#16a34a', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#4ade80', 'lineColor': '#22c55e', 'secondaryColor': '#d97706', 'tertiaryColor': '#dc2626'}}}%%
mindmap
  root((Flow 2: Transactions & Review))
    Ingestion Vectors
      Multi-File CSV Bulk Import
      PaddleOCR Receipt Document Parser
      Manual Web Entry & Mobile PWA
    Normalization & Rules
      Date UTC & Negative Outflow Normalization
      Merchant String Cleaning Regex
      CategoryRule Exact Substring Match
    AI Confidence Scoring
      High Confidence ge 0.70 Auto-Approve
      Low Confidence lt 0.70 Quarantine
      Duplicate Detection Window 48h
    Review Queue Cockpit
      One-Click Batch Approval
      Always Categorize Rule Creation
      Dynamic Budget Health Impact
```

### 2. High-Density ASCII Flowchart

```text
    Source Channels: [CSV File] / [Receipt Scan] / [Manual Input]
                          │
                          ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ 1. normalizeTransactionRecord()                             │
    │    • Standardize ISO UTC date string                        │
    │    • Normalize amounts (Debits < 0, Credits > 0)            │
    │    • Merchant regex sanitizer (e.g. "SQ *COFFEE" -> "Coffee")│
    └─────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ 2. CategoryRule Engine Evaluation                           │
    │    • Query CategoryRuleModel for merchant regex match       │
    └─────────────────────────────┬───────────────────────────────┘
                                  │
                    [Merchant Matches User Rule?]
                                /   \
                             YES     NO
                             /         \
                            v           v
           ┌─────────────────────┐   ┌────────────────────────────┐
           │ Assign Rule Category│   │ 3. AI Categorization Model │
           │ Set confidence=1.00 │   │    • Calculate confidence  │
           │ Set needsReview=fals│   │    • Run duplicate detector│
           └──────────┬──────────┘   └──────────────┬─────────────┘
                      │                             │
                      │               [Confidence >= 0.70 & No Dupe?]
                      │                          /      \
                      │                       YES        NO
                      │                       /            \
                      │                      v              v
                      │            ┌─────────────────┐  ┌─────────────────────┐
                      │            │ needsReview =   │  │ needsReview = true  │
                      │            │ false (Approved)│  │ Enqueue to Review   │
                      │            └────────┬────────┘  └──────────┬──────────┘
                      │                     │                      │
                      ▼                     ▼                      ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │ 4. Atomic Batch Persistence (MongoDB Transaction Collection)    │
    │    • Bulk write operations with unique transaction hashes       │
    │    • Cascade update month-to-date spending cache in Redis       │
    └─────────────────────────────────────────────────────────────────┘
```

### 3. Concrete Implementation Snippet: `server/src/services/transactionReview.ts`

```typescript
// Excerpt from server/src/services/transactionReview.ts
import TransactionModel, { ITransaction } from "../models/transactionModel";
import CategoryRuleModel from "../models/categoryRuleModel";

export async function processTransactionReviewStatus(
  orgId: string,
  transactionData: Partial<ITransaction>
): Promise<{ category: string; confidence: number; needsReview: boolean }> {
  // Step 1: Check user-defined deterministic rules first
  const cleanMerchant = (transactionData.merchant || "").trim().toLowerCase();
  const matchedRule = await CategoryRuleModel.findOne({
    orgId,
    merchantPattern: { $regex: cleanMerchant, $options: "i" }
  }).lean();

  if (matchedRule) {
    return { category: matchedRule.targetCategory, confidence: 1.0, needsReview: false };
  }

  // Step 2: Heuristic AI Confidence Scoring
  let confidence = 0.50; // Default baseline
  if (transactionData.category && transactionData.category !== "Uncategorized") {
    confidence = 0.75;
  }

  // Step 3: Duplicate Transaction Suspicion Check (within 48 hours & identical amount)
  const duplicateWindow = 48 * 60 * 60 * 1000;
  const potentialDupe = await TransactionModel.findOne({
    orgId,
    amount: transactionData.amount,
    date: {
      $gte: new Date(new Date(transactionData.date!).getTime() - duplicateWindow),
      $lte: new Date(new Date(transactionData.date!).getTime() + duplicateWindow),
    },
  }).lean();

  const isDuplicateSuspected = Boolean(potentialDupe);
  const needsReview = confidence < 0.70 || isDuplicateSuspected;

  return {
    category: transactionData.category || "Uncategorized",
    confidence: isDuplicateSuspected ? 0.35 : confidence,
    needsReview,
  };
}
```

---

## Flow 3: Workspace File Upload, RAG Phase 2 Chunking & BM25 Retrieval

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#7c3aed', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#a78bfa', 'lineColor': '#8b5cf6', 'secondaryColor': '#0891b2', 'tertiaryColor': '#059669'}}}%%
mindmap
  root((Flow 3: RAG Phase 2 Knowledge))
    Ingestion Engine
      Multer Memory Buffer Ingress
      PDF Parser Page Delimiters FormFeed
      DOCX XLSX CSV Plaintext Extractors
    Bounded Window Chunking
      1800 Characters Window Size
      260 Characters Sliding Overlap
      SHA-256 Idempotency Hash Fingerprint
    Storage Invariants
      WorkspaceKnowledgeChunkModel
      Cascade Deletion on File Edit
      Tenant Scoped orgId and fileId
    Lexical BM25 Retrieval
      English Stop-Word Sanitizer
      Exact Phrase Match Bonus +12
      Term Frequency Hits +2 Each
      Numeric Match Bonus +2
```

### 2. High-Density ASCII Sequence Diagram

```text
  Client (Browser)                 Express Gateway (Node.js)                  MongoDB 7.0
         │                                     │                                   │
  [1]    │── POST /api/v1/files/upload ───────►│                                   │
         │   (Multipart Form: BankStmt.pdf)    │                                   │
         │                                     │ [Extract text with \f page mark]  │
  [2]    │                                     │ [Run syncWorkspaceFileChunks()]   │
         │                                     │  • Window: 1800 ch / 260 ch ovlp  │
         │                                     │  • Hash: SHA256(chunk_text)       │
         │                                     │──── bulkWrite(KnowledgeChunks) ──►│
         │                                     │     Index: { orgId, fileId }      │
  [3]    │◄── HTTP 201 Created ────────────────│                                   │
         │                                     │                                   │
  [4]    │=== User Queries Financial Copilot =>│                                   │
         │    "What was my interest in Q3?"    │                                   │
         │                                     │ [retrieveRelevantWorkspaceChunks] │
         │                                     │  • Strip stopwords                │
         │                                     │  • Formulate Regex search terms   │
         │                                     │──── find({ orgId, terms }) ──────►│
         │                                     │◄─── Candidate Raw Chunks ─────────│
  [5]    │                                     │                                   │
         │                                     │ [scoreChunkAgainstQuery()]        │
         │                                     │  • Phrase match: +12 pts          │
         │                                     │  • Term count: +2 pts / hit       │
         │                                     │  • Numeric match bonus: +2 pts    │
         │                                     │ [Sort Top-K descending]           │
         │                                     │                                   │
  [6]    │                                     │──── Pass to aiCoreClient ────────►│
         │                                     │     as grounded evidence context  │
```

### 3. Concrete Implementation Snippet: `server/src/services/retrievalService.ts`

```typescript
// Excerpt from server/src/services/retrievalService.ts
export function chunkDocumentText(text: string, options = { windowSize: 1800, overlap: 260 }): Array<{ chunkText: string; pageNumber: number }> {
  const pages = text.split("\f");
  const chunks: Array<{ chunkText: string; pageNumber: number }> = [];

  pages.forEach((pageContent, pageIndex) => {
    const pageNum = pageIndex + 1;
    let cursor = 0;

    while (cursor < pageContent.length) {
      const end = Math.min(cursor + options.windowSize, pageContent.length);
      const chunkText = pageContent.substring(cursor, end).trim();

      if (chunkText.length > 50) {
        chunks.push({ chunkText, pageNumber: pageNum });
      }

      if (end >= pageContent.length) break;
      cursor += options.windowSize - options.overlap;
    }
  });

  return chunks;
}

export function scoreChunkAgainstQuery(chunkText: string, query: string): number {
  const cleanChunk = chunkText.toLowerCase();
  const cleanQuery = query.toLowerCase().trim();
  let score = 0;

  // Exact phrase bonus
  if (cleanChunk.includes(cleanQuery)) {
    score += 12;
  }

  // Individual keyword frequency bonuses
  const terms = cleanQuery.split(/\s+/).filter((t) => t.length > 3);
  terms.forEach((term) => {
    const occurrences = cleanChunk.split(term).length - 1;
    score += Math.min(occurrences, 6) * 2;
  });

  // Numeric alignment bonus
  const hasQueryNumbers = /\d+/.test(cleanQuery);
  const hasChunkNumbers = /\d+/.test(cleanChunk);
  if (hasQueryNumbers && hasChunkNumbers) {
    score += 2;
  }

  return score;
}
```

---

## Flow 4: Conversational Chat, Routing & Subagent Task DAG

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ea580c', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#fb923c', 'lineColor': '#f97316', 'secondaryColor': '#0284c7', 'tertiaryColor': '#16a34a'}}}%%
mindmap
  root((Flow 4: Chat & Subagent DAG))
    Ingress & Grounding
      ChatController Ingress
      financeGrounding Live Profile
      Top-Ranked Workspace Knowledge
    AI Core Intent Triage
      MasterFinancialStrategist
      Deterministic Keyword Routing
      TaskDecomposer Complexity Metric
    Topological Execution
      Kahn Algorithm Level Assignment
      ThreadPoolExecutor max_workers 4
      Upstream Result Passing
    Synthesis & Safety
      Lightweight Verification QA
      Aggregator Plan Synthesis
      Number Safety Invariant Check
```

### 2. High-Density ASCII Sequence Diagram

```text
  React Client               Express Gateway            Python AI Core (FastAPI)           LangGraph Specialists
       │                            │                               │                                 │
  [1]  │── POST /api/chat/messages ─►│                               │                                 │
       │   { prompt, sessionId }    │ [financeGrounding Service]    │                                 │
       │                            │  • Accounts, Debts, Budgets   │                                 │
       │                            │  • RAG Knowledge Chunks       │                                 │
  [2]  │                            │──── POST /api/agents/process ─►│                                 │
       │                            │     Payload with full context │ [MasterAgent: Classify Intent]  │
       │                            │                               │ [TaskDecomposer: Build Subtasks]│
  [3]  │                            │                               │                                 │
       │                            │                               │──── Level 0: IncomeAnalyzer ───►│
       │                            │                               │     Computes $800/mo surplus    │
       │                            │                               │◄─── Returns IncomeAnalysis ─────│
  [4]  │                            │                               │                                 │
       │                            │                               │──── Level 1: DebtOptimizer ────►│
       │                            │                               │     (Consumes Surplus Context)  │
       │                            │                               │◄─── Returns Avalanche Schedule ─│
  [5]  │                            │                               │                                 │
       │                            │                               │ [Verification QA Node]          │
       │                            │                               │ [Aggregator: tools.build_plan()]│
       │                            │                               │ [Number Safety Subset Invariant]│
  [6]  │                            │◄─── HTTP 200 Plan JSON ───────│                                 │
       │◄── HTTP 200 Stream Message │                               │                                 │
       │    Formatted Markdown +    │                               │                                 │
       │    Interactive Tool Buttons│                               │                                 │
```

---

## Flow 5: Pure Python Plan Math & Number Safety Verification

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#dc2626', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#f87171', 'lineColor': '#ef4444', 'secondaryColor': '#059669', 'tertiaryColor': '#2563eb'}}}%%
mindmap
  root((Flow 5: Number Safety Math))
    Pure Calculators
      tools.financial_calculators.py
      Standard Banking Decimal Precision
      Compound Growth & Amortization
    Deterministic Synthesis
      tools.plan_builder.build_plan()
      Categorized Action Buckets 7d 30d 12m
      render_plan_markdown()
    Number Safety Guard
      _numbers_are_subset Method
      Candidate Digits in Reference Digits
      Zero Tolerance for Hallucinations
    Automated Fallback
      Instant Discard of Hallucinated Text
      Reversion to Deterministic Markdown
```

### 2. High-Density ASCII Flowchart

```text
    Specialist Agents Outputs: [IncomeAnalysis] [DebtOptimization] [BudgetPlan]
                                      │
                                      ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │ 1. tools.build_plan(PlanInputs(...))                            │
    │    • Deterministically calculates savings capacity              │
    │    • Enforces Conservation of Funds: Sum(Delta Budgets) == 0    │
    │    • Generates 7-day, 30-day, and 12-month action milestones    │
    └─────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │ 2. tools.render_plan_markdown(plan, currency)                   │
    │    • Renders byte-for-byte pure mathematical markdown           │
    │    • Reference Digits = Set of all numbers in this markdown     │
    └─────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
                   [Is LLM Narrative Polish Enabled?]
                               /              \
                             YES               NO
                             /                  \
                            v                    v
         ┌────────────────────────────┐    (Skip Polish & Use
         │ 3. _polish_with_llm()      │     Deterministic Text)
         │    Invoke LLM with strict  │            │
         │    instruction to keep all │            │
         │    numerical digits frozen │            │
         └──────────────┬─────────────┘            │
                        │                          │
                        ▼                          │
         ┌────────────────────────────┐            │
         │ 4. _numbers_are_subset()   │            │
         │    Audit: Cand ⊆ Reference │            │
         └──────────────┬─────────────┘            │
                        │                          │
          [Candidate Numbers == Subset?]           │
                    /        \                     │
                 TRUE        FALSE                 │
                 /              \                  │
                v                v                 │
      ┌──────────────────┐  ┌──────────────────┐   │
      │ Use LLM Polished │  │ Reject Narrative!│   │
      │ Response Text    │  │ Revert to Pure   │   │
      │                  │  │ Deterministic MD │   │
      └─────────┬────────┘  └────────┬─────────┘   │
                │                    │             │
                ▼                    ▼             ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │ 5. Assemble Unified Plan Payload Envelope                       │
    │    • Return verified markdown plan to Express & Client UI       │
    └─────────────────────────────────────────────────────────────────┘
```

---

## Flow 6: Server-Sent Events (SSE) Streaming Pipeline

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#2563eb', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#60a5fa', 'lineColor': '#3b82f6', 'secondaryColor': '#0d9488', 'tertiaryColor': '#d97706'}}}%%
mindmap
  root((Flow 6: Real-time SSE Stream))
    FastAPI Stream Producer
      EventSourceResponse StreamingResponse
      Token Chunks yield data json
      Lifecycle Events start progress end
    Express SSE Proxy Gateway
      Headers text event-stream no-cache
      Keep-Alive 15-second Heartbeats
      Client Disconnect Detection
    Client Stream Consumer
      ReadableStream DefaultReader
      TextDecoder utf-8 Chunk Buffer
      Zustand chatStore Incremental Append
```

### 2. High-Density ASCII Sequence Diagram

```text
  React Client (useAIStream)               Express Server                     FastAPI AI Core
              │                                   │                                  │
       [1]    │── POST /api/ai/process/stream ───►│                                  │
              │   { prompt, sessionId }           │── POST /api/agents/process/stream►│
              │                                   │                                  │
       [2]    │◄── 200 OK (text/event-stream) ────│◄── 200 OK (text/event-stream) ───│
              │                                   │                                  │
       [3]    │◄── data: {"event":"phase","name":"decomposing"}───────────────────────│
              │    [UI displays: Decomposing subtasks...]                            │
              │                                   │                                  │
       [4]    │◄── data: {"event":"phase","name":"executing","agent":"debt"}─────────│
              │    [UI displays: Analyzing debt avalanche...]                         │
              │                                   │                                  │
       [5]    │◄── data: {"event":"token","token":"Based "}──────────────────────────│
              │◄── data: {"event":"token","token":"on your "}────────────────────────│
              │◄── data: {"event":"token","token":"Q3 statement..."}─────────────────│
              │                                   │                                  │
       [6]    │◄── data: {"event":"citations","citations":[{"file":"Q3.pdf"}]}───────│
              │◄── data: {"event":"complete","metadata":{"latency":482}}─────────────│
              │                                   │                                  │
       [7]    │ [Stream reader gracefully closes] │                                  │
```

---

## Flow 7: Server-Side PDFKit Vectorized Generation & GridFS

### 1. High-Density ASCII Flowchart

```text
  Client Request: POST /api/v1/files/generate-pdf
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. pdfController.ts & pdfRequestServer.ts                   │
  │    • Validate document title, theme, and markdown sections  │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 2. Vectorized PDFKit Canvas Pipeline                        │
  │    • Header & Footer pagination hooks                       │
  │    • Standard typography: Helvetica & Helvetica-Bold        │
  │    • Financial balance tables with dynamic cell widths      │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 3. Direct Streaming to MongoDB GridFS Bucket                │
  │    • Create GridFSBucketWriteStream ({ filename, orgId })   │
  │    • Pipe pdfDoc.pipe(gridFsStream) without touching disk   │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 4. WorkspaceFile Record Upsert & Chunk Re-index             │
  │    • Create WorkspaceFileModel document                     │
  │    • Trigger asynchronous BullMQ job to extract text chunks │
  └─────────────────────────────────────────────────────────────┘
```

---

## Flow 8: Timezone-Aware Scheduled Newsletter Engine

### 1. High-Density ASCII Flowchart

```text
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. newsletterScheduler.ts (Cron interval: Every 60 seconds)  │
  │    • Current UTC timestamp evaluated                        │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 2. User Timezone Target Match Query                         │
  │    • Match users where (Current UTC in user.timezone) ==    │
  │      preference.deliveryTime (e.g. "08:00 AM")              │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 3. Enqueue Newsletter Job to BullMQ Queue                   │
  │    • Queue: "newsletter-dispatch-queue"                     │
  │    • Job payload: { orgId, userId, preferences }            │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 4. Worker Execution (worker.ts)                             │
  │    • Gather 7-day spend, upcoming bills, budget burn rate   │
  │    • Call AI Core NewsletterAgent for tailored advice       │
  │    • Render responsive inline-styled HTML template          │
  │    • Dispatch via Nodemailer SMTP                           │
  │    • Poison pill jobs quarantined to Dead Letter Queue (DLQ)│
  └─────────────────────────────────────────────────────────────┘
```

---

## Flow 9: LLM KeyPool Multi-Key Rotation & 6-Tier Failover

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#0d9488', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#2dd4bf', 'lineColor': '#14b8a6', 'secondaryColor': '#b45309', 'tertiaryColor': '#be123c'}}}%%
mindmap
  root((Flow 9: KeyPool & Failover))
    KeyPool Self-Healing
      Discovery Provider_API_KEY_1..20
      Rotation Strategies Round-Robin Least-Used
      Cooldown Management 60s for 429
      Circuit Breaker 5 Failures -> OPEN
    Cross-Vendor Sequence
      Tier 1 Gemini 2.0 Flash Primary
      Tier 2 OpenRouter Claude 3.5 Sonnet
      Tier 3 Groq Llama 3.3 70B
      Tier 4 xAI Grok / Mistral
      Tier 5 Self-Hosted Local Ollama
      Tier 6 Pure Deterministic Math
    Zero Downtime SLA
      Guaranteed Mathematical Response
      Automatic Fallback Under Global Outage
```

### 2. High-Density ASCII Sequence Diagram

```text
  AI Request ────► [KeyPool: Select Healthy Key]
                         │
           [Key hits HTTP 429 Rate Limit?]
                      /     \
                    YES      NO ──► Return Successful LLM Response
                    /
                   v
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. Mark Key Cooldown (60s timer) & Increment Failure Count  │
  │ 2. Rotate to Next Key in Provider Pool                      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                 [All Keys in Provider Exhausted?]
                            /         \
                          YES          NO ──► Retry with Key #2
                          /
                         v
  ┌─────────────────────────────────────────────────────────────┐
  │ 3. Provider Circuit Breaker Trips to OPEN                   │
  │ 4. Step Down to Tier 2: OpenRouter Dynamic KeyPool          │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                 [OpenRouter Hits Provider Outage?]
                            /         \
                          YES          NO ──► Complete with OpenRouter
                          /
                         v
  ┌─────────────────────────────────────────────────────────────┐
  │ 5. Step Down to Tier 3: Groq High-Speed Llama 3.3 70B       │
  │    ... through Tier 4 and Tier 5 ...                        │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   [All External Cloud APIs Offline?]
                                 │
                                 v
  ┌─────────────────────────────────────────────────────────────┐
  │ 6. Ultimate Tier 6: Deterministic Pure Python Calculators   │
  │    • Generate 100% mathematically correct plan              │
  │    • Zero downtime guaranteed under total cloud blackouts   │
  └─────────────────────────────────────────────────────────────┘
```

---

## Flow 10: Automated Invariant Evaluation Loop & Latency SLAs

### 1. High-Density ASCII Flowchart

```text
  Developer / CI Pipeline: pytest evals/runner.py
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. Ingest Golden Reference Suites (server/AI_Core/evals/)   │
  │    • 100+ Curated Financial Intent Ingress Prompts          │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 2. Concurrent Benchmark Suite Execution                     │
  │    ├─► test_routing_accuracy: Precision >= 98.0%            │
  │    ├─► test_number_safety: 0 Hallucinated Digits (100% Pass)│
  │    ├─► test_determinism: Byte-for-byte reproducibility      │
  │    ├─► test_plan_quality: Structural completeness (7d/30d)  │
  │    └─► test_latency: P50 < 18ms, P95 < 45ms (Routing)       │
  └─────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
                 [Did any Test Invariant Fail?]
                            /        \
                          YES         NO
                          /             \
                         v               v
  ┌─────────────────────────────┐  ┌────────────────────────────┐
  │ ❌ Block Build & Emit       │  │ ✅ All Invariants Satisfied│
  │ Detailed Metric Regression  │  │ Production Artifact Ready  │
  │ Log with Offending Output   │  └────────────────────────────┘
  └─────────────────────────────┘
```


---

## Flow 11: Portfolio Target Allocation, Drift Analysis & Smart Rebalancing

### 1. Colourful Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#0284c7', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#38bdf8', 'lineColor': '#0ea5e9', 'secondaryColor': '#0f766e', 'tertiaryColor': '#6366f1'}}}%%
mindmap
  root((Flow 11: Portfolio Drift & Rebalance))
    Asset Classification
      inferAssetClass in financialDataController
      Categorizes Equity, Fixed Income, Cash, Crypto, Real Estate
    Target Allocation Models
      Moderate 60/40 Balanced Growth
      Aggressive 80/20 Capital Appreciation
      Conservative Preservation of Capital
      All-Weather Ray Dalio Risk Parity
    Drift Evaluation
      Actual% vs Target% per Asset Class
      Delta = Actual% - Target%
      Threshold Alert (> 5% drift triggers warning banner)
      Status Badges: Balanced, Overweight, Underweight
    Execution Strategies
      Smart Cash Inflow: Deploys new capital to underweight assets without selling
      Full Rebalance: Simulates buy & sell trade orders
      One-Click Schedule Rebalance Action Plan into Tasks
```

### 2. High-Density ASCII Sequence Diagram

```text
  User Browser (:5173)              Express Gateway (:3000)          Database (MongoDB)
         │                                    │                               │
         │── 1. GET /api/v1/finance/summary ─>│                               │
         │                                    │── 2. Query Asset Accounts ───>│
         │                                    │<── Account Documents ─────────│
         │                                    │                               │
         │                                    │── 3. inferAssetClass()        │
         │                                    │   (Equity, Crypto, REIT, etc.)│
         │<── 4. Return Summary Aggregates ───│                               │
         │                                                                    │
         │── 5. Client Portfolio Engine:                                      │
         │   • Fetch selected Target Model (e.g. 60/40 or All-Weather)        │
         │   • Compute Drift: Delta_i = Actual%_i - Target%_i                 │
         │   • Check if any |Delta_i| >= 5.0% ──► Surface Drift Alert Banner  │
         │                                                                    │
         │── 6. User enters Deploy Capital ($1,000) & selects "Smart Inflow": │
         │   • Allocation_i = Capital * (Deficit_i / Total_Deficits)          │
         │   • Generates tax-efficient buys without triggering asset sales    │
         │                                                                    │
         │── 7. User clicks "Schedule Rebalance Action Plan" ────────────────>│
         │   • Creates actionable task via POST /api/v1/tasks                 │
         │<── 8. Task Confirmed & Linked to Calendar ─────────────────────────│
```

---

## Flow 12: What-If Multi-Scenario Simulation & Monte Carlo Bounds

### 1. High-Density ASCII Flowchart

```text
  User Pins up to 4 Scenarios in Scenarios.tsx (e.g. Job Switch, House Purchase, Early Sabbatical)
         │
         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 1. Aggregate Baseline Profile (Income, Discretionary Spend, Assets)   │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 2. Side-by-Side Comparison Matrix Computation                          │
  │    ├─► Delta Monthly Surplus = (Scenario Surplus - Baseline Surplus)   │
  │    ├─► Cumulative Savings Impact over Forecast Horizon (e.g. 5 Years)  │
  │    ├─► Emergency Runway Impact = Liquid Assets / New Burn Rate         │
  │    └─► Goal Velocity Shift (Accelerated vs Delayed by N months)        │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 3. Monte Carlo Stochastic Simulation (15% Volatility & Frictions)      │
  │    ├─► P10 (Bearish): 10th percentile adverse shock trajectory         │
  │    ├─► P50 (Expected): Median trajectory based on average return       │
  │    └─► P90 (Bullish): 90th percentile upside compounding               │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 4. Marginal Tax Bracket Estimation (Income Scenarios)                  │
  │    • Apply progressive tax rate (0%, 15%, 22%, 25%, 32%, 37%)          │
  │    • Calculate Estimated Tax Withholding vs Net Take-Home Retained     │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 5. Actionable Outputs: Export Comparison CSV • Copy Markdown Table     │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 13: Dead Letter Queue (DLQ) Quarantining & Administrative Replay

### 1. High-Density ASCII Flowchart

```text
  Background Task Execution (e.g., sendNewsletter, syncChunks, updateTimestamp)
         │
         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 1. catchToDeadLetter(promise, operationTag, metadata)                  │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                         Did Background Operation Reject?
                                      /                                            NO          YES
                                    /                                                v               v
  ┌──────────────────────────────┐   ┌─────────────────────────────────────┐
  │ Task completes successfully  │   │ 2. DLQ Interception (deadLetterQueue)│
  │ (No overhead incurred)       │   │    • Capture error.message & stack  │
  └──────────────────────────────┘   │    • Generate unique job ID         │
                                     │    • Bind { orgId, operation, time }│
                                     └──────────────────┬──────────────────┘
                                                        │
                                                        ▼
                                     ┌─────────────────────────────────────┐
                                     │ 3. Push to Redis Ring Buffer        │
                                     │    KEY: bull:finwise-dlq            │
                                     │    Bounded capacity: 500 entries    │
                                     │    Emit Pino warning alert          │
                                     └──────────────────┬──────────────────┘
                                                        │
                                                        ▼
                                     ┌─────────────────────────────────────┐
                                     │ 4. SRE & Admin Inspection APIs      │
                                     │    • GET /api/v1/dlq/stats          │
                                     │    • POST /api/v1/dlq/replay/:id    │
                                     └─────────────────────────────────────┘
```

---

## Flow 14: Private Session Boundary Switch & Cache Isolation

### 1. High-Density ASCII Flowchart

```text
  User Triggers: Logout OR Organization Switch OR Account Switch
         │
         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 1. Invalidate Current TanStack QueryClient                             │
  │    • Destroy shared cache to prevent private data leakage              │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 2. Increment Monotonic Context Revision Counter                        │
  │    • Obsoletes all in-flight asynchronous HTTP responses               │
  │    • Late-arriving responses cannot overwrite newer context            │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 3. Abort Active Streams & Clear State Stores                           │
  │    • AbortController.abort() on active Server-Sent Events (SSE)        │
  │    • Reset Zustand chatStore, aiStore, and commandBarStore             │
  │    • Clear local drafts and command palette history                    │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 4. Re-mount Screen Tree with Fresh Tenant QueryClient                  │
  │    • Guaranteed tenant data separation across browser sessions         │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 15: Assembled Conversation Insights Caching & Coalescing Engine

### 1. High-Density ASCII Flowchart

```text
  Client Dashboard Mounts ──► Requests Conversation Insights
         │
         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 1. Compute Request Key Hash: SHA256(userId + orgId + utcDate + context)│
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 2. Check conversationInsightsCache (MongoDB Snapshot Cache)            │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                          Cache Hit & Valid TTL?
                                /                                       YES          NO
                              /                                           v                v
  ┌──────────────────────────────┐   ┌─────────────────────────────────────┐
  │ Return Saved Summary         │   │ 3. In-Process Coalescing Guard      │
  │ • Latency: ~60ms             │   │    • Check active Promise map       │
  │ • 0 AI tokens consumed       │   │    • Coalesce duplicate requests    │
  │ • Marked as "Saved Summary"  │   └──────────────────┬──────────────────┘
  └──────────────────────────────┘                      │
                                                        ▼
                                     ┌─────────────────────────────────────┐
                                     │ 4. Compute Insights via AI Core     │
                                     │    • Invoke ConversationSummarizer  │
                                     │    • Fallback to honest factual recap│
                                     └──────────────────┬──────────────────┘
                                                        │
                                                        ▼
                                     ┌─────────────────────────────────────┐
                                     │ 5. Persist Snapshot with TTL        │
                                     │    • Normal response: TTL = 120s    │
                                     │    • Degraded response: TTL = 15s   │
                                     └─────────────────────────────────────┘
```
