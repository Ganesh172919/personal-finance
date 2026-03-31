# Architecture

FinWise is a full-stack personal finance platform built as a monorepo with three primary tiers: a React SPA client, a Node.js/Express API server, and a Python-based AI Core. This document describes the system architecture, module responsibilities, data flows, and design patterns used throughout the codebase.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FinWise Monorepo                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐         ┌──────────────┐         ┌───────────────┐   │
│  │   CLIENT     │         │    SERVER    │         │   AI CORE     │   │
│  │  (React/Vite)│ ──────▶ │ (Express/TS) │ ──────▶ │  (Python/LG)  │   │
│  │              │  HTTP   │              │  HTTP   │               │   │
│  │  34 routes   │  SSE    │  14 root     │  JSON   │  6 agents     │   │
│  │  Zustand     │ ◀────── │  30 v1       │ ◀────── │  LangGraph    │   │
│  │  React Query │         │  controllers │         │  Tools/Memory │   │
│  │  Wouter      │         │  49 models   │         │  Vision       │   │
│  │  PWA         │         │  49 services │         │               │   │
│  └──────────────┘         └──────┬───────┘         └───────────────┘   │
│                                  │                                      │
│                           ┌──────▼───────┐                              │
│                           │   MongoDB    │                              │
│                           │  (49 schemas)│                              │
│                           └──────────────┘                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Background Worker (separate process)                            │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │ Workflow   │  │ Integration  │  │ Export       │             │   │
│  │  │ Runs       │  │ Sync Runs    │  │ Jobs         │             │   │
│  │  └────────────┘  └──────────────┘  └──────────────┘             │   │
│  │  p-queue + MongoDB polling                                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Request Flow Overview

```
Browser                    Client App                 Express Server              AI Core (Python)
   │                           │                           │                          │
   │─── User Action ──────────▶│                           │                          │
   │                           │─── API Call ──────────────▶│                          │
   │                           │   (fetch)                  │                          │
   │                           │                           │─── Route + Middleware ──▶│
   │                           │                           │   (auth, org, validate)  │
   │                           │                           │                          │
   │                           │                           │─── Controller ──────────▶│
   │                           │                           │   (parse, delegate)      │
   │                           │                           │                          │
   │                           │                           │─── Service ─────────────▶│
   │                           │                           │   (business logic)       │
   │                           │                           │                          │
   │                           │                           │─── Model ───────────────▶│
   │                           │                           │   (Mongoose ODM)         │
   │                           │                           │                          │
   │                           │                           │◀── DB Response ──────────│
   │                           │                           │   (MongoDB)              │
   │                           │◀── JSON Response ─────────│                          │
   │◀── UI Update ─────────────│                           │                          │
   │   (React Query / Zustand) │                           │                          │
```

---

## 2. Folder Structure

```
personal-finance/
├── client/                          # React SPA frontend
│   ├── public/                      # Static assets (manifest, icons, etc.)
│   ├── src/
│   │   ├── app/
│   │   │   └── providers/           # React context providers (QueryClient, etc.)
│   │   ├── assets/                  # Images, fonts, static resources
│   │   ├── components/              # Reusable UI components (36 files)
│   │   │   ├── layout/              # Layout-specific components (header, sidebar, etc.)
│   │   │   ├── ui/                  # Primitive UI primitives (buttons, inputs, modals)
│   │   │   └── forms/               # Form-specific components
│   │   ├── context/                 # React contexts (AuthContext)
│   │   ├── features/                # Feature-specific component trees
│   │   │   ├── chat/                # Chat UI components and logic
│   │   │   ├── journaling/          # Financial journaling feature
│   │   │   └── workflows/           # Workflow builder/runner UI
│   │   ├── hooks/                   # Custom React hooks (13 files)
│   │   ├── layouts/                 # Page layout wrappers (AppShell, ChatLayout)
│   │   ├── lib/                     # Shared utilities and API client
│   │   │   ├── api/                 # Typed API client functions (17 files)
│   │   │   │   └── v1/              # V1-specific API client functions
│   │   │   ├── apiBase.ts           # Base URL configuration
│   │   │   ├── apiClient.ts         # Fetch wrapper with auth headers
│   │   │   ├── apiError.ts          # API error class and parsing
│   │   │   ├── queryClient.ts       # React Query client configuration
│   │   │   └── utils.ts             # General utility functions
│   │   ├── pages/                   # 34 page components (lazy-loaded)
│   │   ├── routes/                  # Routing configuration
│   │   │   ├── AppRouter.tsx        # Wouter router with guards
│   │   │   ├── routeDefinitions.tsx # Route table with lazy imports
│   │   │   └── routeGuards.tsx      # Auth/access guard components
│   │   ├── services/                # Client-side services
│   │   │   ├── api/                 # API service wrappers
│   │   │   ├── aiStream.ts          # SSE/streaming AI response handler
│   │   │   ├── chatApi.ts           # Chat-specific API calls
│   │   │   └── errorReporting.ts    # Client error reporting
│   │   ├── stores/                  # Zustand state stores (6 files)
│   │   ├── test/                    # Frontend test utilities
│   │   ├── types/                   # TypeScript type definitions
│   │   ├── App.tsx                  # Root App component
│   │   ├── main.tsx                 # Entry point (ReactDOM.createRoot)
│   │   └── vite-env.d.ts            # Vite type declarations
│   ├── index.html                   # HTML entry point
│   ├── vite.config.ts               # Vite build configuration
│   ├── tailwind.config.ts           # Tailwind CSS configuration
│   └── package.json
│
├── server/                          # Node.js/Express API server
│   ├── AI_Core/                     # Python AI service (sub-process)
│   │   ├── agents/                  # 6 specialized financial agents
│   │   │   ├── master_agent.py      # Orchestrator / router agent
│   │   │   ├── income_expense_analyzer.py
│   │   │   ├── budget_planner.py
│   │   │   ├── investment_advisor.py
│   │   │   ├── debt_optimizer.py
│   │   │   └── financial_educator.py
│   │   ├── graph/                   # LangGraph workflow definition
│   │   │   ├── state.py             # AgentState, AnalysisType, UserProfile
│   │   │   └── workflow.py          # StateGraph with conditional routing
│   │   ├── tools/                   # AI tool implementations
│   │   │   ├── financial_calculators.py
│   │   │   ├── data_processors.py
│   │   │   └── plan_builder.py
│   │   ├── memory/                  # Conversation memory management
│   │   │   ├── extract.py           # Memory extraction from conversations
│   │   │   └── store.py             # Memory persistence
│   │   ├── vision/                  # Receipt/document vision processing
│   │   │   ├── engine.py            # Vision processing engine
│   │   │   ├── receipt_parser.py    # Receipt OCR parsing
│   │   │   ├── handwriting_parser.py
│   │   │   ├── preprocess.py        # Image preprocessing
│   │   │   └── errors.py            # Vision-specific errors
│   │   ├── config/                  # Python service configuration
│   │   ├── contracts/               # Shared API contracts
│   │   ├── tests/                   # Python test suite
│   │   ├── api_service.py           # HTTP API wrapper for Node server
│   │   ├── main.py                  # CLI entry point
│   │   └── requirements.txt
│   ├── src/
│   │   ├── config/                  # Server configuration (6 files)
│   │   │   ├── database.ts          # MongoDB connection (strict + fallback)
│   │   │   ├── env.ts               # Environment variable parsing/validation
│   │   │   ├── logger.ts            # Pino logger setup
│   │   │   ├── passport.ts          # JWT authentication strategy
│   │   │   ├── redis.ts             # Redis client configuration
│   │   │   └── telemetry.ts         # OpenTelemetry setup
│   │   ├── connectors/              # External service connectors
│   │   │   ├── bankStubConnector.ts # Stub bank data connector
│   │   │   ├── registry.ts          # Connector registry
│   │   │   └── types.ts             # Connector type definitions
│   │   ├── controllers/             # Request handlers (14 root + 32 v1)
│   │   │   ├── v1/                  # Canonical v1 controllers (32 files)
│   │   │   ├── aiController.ts
│   │   │   ├── authController.ts
│   │   │   ├── chatController.ts
│   │   │   └── ...                  # Other root-level controllers
│   │   ├── middleware/              # Express middleware (13 files)
│   │   │   ├── authAny.ts           # JWT or API key authentication
│   │   │   ├── orgContext.ts        # Organization scoping middleware
│   │   │   ├── validate.ts          # Zod request validation
│   │   │   ├── errorHandler.ts      # Global error handler
│   │   │   ├── csrfProtection.ts    # CSRF token validation
│   │   │   ├── securityHeaders.ts   # Additional security headers
│   │   │   ├── uploads.ts           # Multer file upload handling
│   │   │   └── ...
│   │   ├── models/                  # Mongoose models (49 files)
│   │   ├── modules/                 # Pluggable subsystems
│   │   │   ├── plugins/             # Plugin system with sandboxing
│   │   │   │   ├── pluginManager.ts
│   │   │   │   ├── permissionSandbox.ts
│   │   │   │   ├── permissionMiddleware.ts
│   │   │   │   ├── runtimeClient.ts
│   │   │   │   └── types.ts
│   │   │   ├── queue/               # Background job queue
│   │   │   │   └── jobQueue.ts
│   │   │   └── realtime/            # Real-time event system
│   │   │       ├── eventBus.ts      # In-memory event bus with dedup
│   │   │       └── domainEventFanout.ts  # MongoDB changestream/poll fanout
│   │   ├── observability/           # Metrics and tracing
│   │   ├── routes/                  # Express route definitions (17 files)
│   │   │   ├── routeRegistry.ts     # Central route mounting
│   │   │   ├── v1Routes.ts          # All /api/v1/* routes
│   │   │   └── ...                  # Legacy route files
│   │   ├── schemas/                 # Zod validation schemas (13 files)
│   │   │   └── v1/                  # V1-specific validation schemas
│   │   ├── services/                # Business logic (49 files)
│   │   ├── types/                   # TypeScript type definitions
│   │   ├── utils/                   # Shared utility functions
│   │   ├── worker/                  # Background worker process
│   │   │   └── worker.ts            # Job polling and execution
│   │   ├── app.ts                   # Express app factory
│   │   └── server.ts                # HTTP server entry point
│   ├── docs/                        # Server-specific documentation
│   └── package.json
│
├── packages/                        # Shared packages
│   └── contracts/                   # API contracts shared across tiers
│       ├── openapi/                 # OpenAPI/Swagger specifications
│       └── typescript/              # Shared TypeScript types
│
├── documentation/                   # Project documentation
│   ├── README.md
│   └── 02-architecture.md           # This file
│
├── docs/                            # Additional documentation
├── research_references/             # Research and reference materials
├── research_survey/                 # Survey data and results
└── README.md
```

---

## 3. Key Modules and Responsibilities

### 3.1 Client (React + Vite + TypeScript)

| Layer | Technology | Files | Responsibility |
|-------|-----------|-------|----------------|
| **Routing** | Wouter | 3 | Defines 34 lazy-loaded routes with access guards (public, public-only, protected) and layout assignment (app, chat, default) |
| **State Management** | Zustand | 6 | Global UI state: AI status, chat sessions, command bar, organization context, app dialogs |
| **Data Fetching** | React Query | 1 | Server state caching, background refetching, optimistic updates, query invalidation |
| **API Layer** | Fetch + custom client | 17 | Typed API functions organized by domain (auth, transactions, AI, billing, etc.) with v1 subdirectory |
| **Pages** | React + lazy() | 34 | Full-page components, each lazy-loaded for code splitting |
| **Components** | React + Tailwind | 36 | Reusable UI components including layout wrappers, AI command bar, insight panels, widgets |
| **Hooks** | React custom hooks | 13 | Encapsulated logic: auth, AI streaming, debouncing, keyboard shortcuts, real-time events, virtual lists |
| **Features** | Feature-sliced | 3 | Chat, journaling, and workflows as self-contained feature modules |
| **PWA** | Workbox (via Vite PWA) | - | Service worker, offline caching, installable app |

**Route Access Model:**

| Access Level | Description | Example Routes |
|-------------|-------------|----------------|
| `public` | Accessible without auth | `/accept-invite`, `/share/financial-story/:token` |
| `public-only` | Redirects if already authenticated | `/login`, `/register`, `/verify-email` |
| `protected` | Requires authentication | All dashboard, transactions, settings routes |

### 3.2 Server (Express + TypeScript)

#### Controllers (14 root + 32 v1)

Controllers are thin request handlers that:
1. Receive validated request data from middleware
2. Delegate to services for business logic
3. Return standardized JSON responses

**Root controllers** (`/api/*`): Legacy endpoints maintained during the deprecation window.

**V1 controllers** (`/api/v1/*`): Canonical API surface with full validation, org-scoping, and feature-gating.

#### Middleware (13 modules)

| Middleware | Purpose |
|-----------|---------|
| `requestContext` | Attaches request ID and timing to every request |
| `responseContext` | Standardizes response format |
| `httpLogger` | Pino-based structured request logging |
| `optionalJwtAuth` | Attempts JWT authentication (passes if absent) |
| `authAny` | Requires either JWT or API key authentication |
| `orgContext` | Resolves organization scope from request |
| `validate` | Zod schema validation for body, params, query |
| `csrfProtection` | CSRF token validation for state-changing requests |
| `securityHeaders` | Permissions-Policy, cache-control, HSTS |
| `legacyApiDeprecation` | Adds deprecation warnings to legacy `/api/*` routes |
| `errorHandler` | Global error handler with standardized error format |
| `uploads` | Multer-based file upload handling |
| `apiKeyAuth` | API key authentication for programmatic access |

#### Models (49 Mongoose models)

Models cover the full domain:

| Domain | Models |
|--------|--------|
| **Core** | User, Organization, OrgMember, OrgInvite |
| **Finance** | Transaction, Account, CategoryRule, Merchant, BudgetAllocation, RecurringRule, MonthClose |
| **AI** | AgentOutput, AIResponseCache, ChatSession, ChatMessage, MemoryRecord, ToolExecution, AutopilotRun |
| **Content** | BlogPost, GrowthStory, Comment, WorkspaceFile |
| **Operations** | AuditLog, AuditEvent, DomainEvent, UsageLedger, UsageEvent, ExportJob |
| **Monetization** | Subscription, BillingAccount, Entitlement, CreditGrant, FeatureFlag, ReferralCode, ReferralRedemption |
| **Integrations** | IntegrationConnection, IntegrationSyncRun, MarketplacePlugin, PluginInstall |
| **Workflows** | Workflow, WorkflowRun, Task, JournalEntry, FinancialProfile, CalendarReminder, ShareLink, Notification |
| **Security** | ApiKey |

#### Services (49 business logic modules)

Services contain the core business logic and are called by controllers. They:
- Interact with models for data access
- Call the AI Core via `aiCoreClient.ts`
- Emit domain events via `domainEvents.ts`
- Handle complex operations (transaction categorization, budget calculations, AI request building)

#### Modules (3 subsystems)

| Module | Files | Responsibility |
|--------|-------|----------------|
| **plugins** | 5 | Plugin system with manifest validation, permission sandboxing, and runtime execution |
| **queue** | 1 | Job queue abstraction for background processing |
| **realtime** | 2 | In-memory event bus with deduplication + MongoDB changestream/polling fanout for SSE |

### 3.3 AI Core (Python + LangGraph)

| Component | Files | Responsibility |
|-----------|-------|----------------|
| **Agents** | 6 | Specialized financial agents orchestrated by a master agent |
| **Graph** | 2 | LangGraph StateGraph with conditional routing based on analysis type |
| **Tools** | 3 | Financial calculators, data processors, and plan builders available to agents |
| **Memory** | 2 | Conversation memory extraction and persistence for contextual responses |
| **Vision** | 7 | Receipt OCR, handwriting recognition, and image preprocessing |
| **Config** | - | Environment configuration, API key validation |
| **API Service** | 1 | HTTP API wrapper for communication with the Node.js server |

**Agent Roster:**

| Agent | Role |
|-------|------|
| `MasterFinancialStrategistAgent` | Routes requests to specialists, synthesizes final plans |
| `IncomeExpenseAnalyzerAgent` | Analyzes income/expense patterns from transaction data |
| `BudgetPlannerAgent` | Creates and optimizes budget plans |
| `InvestmentAdvisorAgent` | Provides investment advice based on risk profile |
| `DebtOptimizerAgent` | Optimizes debt repayment strategies (avalanche/snowball) |
| `FinancialEducatorAgent` | Explains financial concepts (no personal data required) |

**LangGraph Workflow:**

```
                    ┌──────────────┐
                    │ master_agent │
                    │  (classify)  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
    ┌─────────▼──┐  ┌──────▼──────┐  ┌──────▼──────┐
    │income_analyzer│ │budget_planner│ │investment_  │
    │              │ │             │ │advisor       │
    └─────────┬────┘ └──────┬──────┘ └──────┬──────┘
              │             │               │
    ┌─────────▼──┐  ┌──────▼──────┐        │
    │debt_optimizer│ │comprehensive│        │
    │              │ │ analysis    │        │
    └─────────┬────┘ └──────┬──────┘        │
              │             │               │
              └─────────────┼───────────────┘
                            │
                    ┌───────▼───────┐
                    │   synthesize  │
                    │ (master plan) │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │     END       │
                    └───────────────┘

  financial_educator ──────────────────▶ END (bypasses synthesis)
```

---

## 4. Data Flow

### 4.1 Standard Request Flow

```
User Action (Browser)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  CLIENT                                                     │
│  1. User interacts with UI component                        │
│  2. Component calls React Query mutation/query              │
│  3. React Query invokes typed API function (lib/api/)       │
│  4. apiClient.ts adds auth headers, sends fetch() request   │
└─────────────────────────────────────────────────────────────┘
       │ HTTP POST/GET/PUT/PATCH/DELETE
       ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVER - Middleware Pipeline                               │
│  1. requestContext: attach requestId, start timer           │
│  2. responseContext: wrap response format                   │
│  3. httpLogger: structured request log                      │
│  4. optionalJwtAuth: attempt JWT decode                     │
│  5. orgContext: resolve organization scope                  │
│  6. validate: Zod schema validation                         │
│  7. authAny / passport: enforce authentication              │
│  8. csrfProtection: validate CSRF token                     │
│  9. apiRateLimiter: rate limit check                        │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVER - Controller                                        │
│  1. Extract validated params/body/query                     │
│  2. Call appropriate service function                       │
│  3. Format response with standardized envelope              │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVER - Service                                           │
│  1. Execute business logic                                  │
│  2. Query/update models (Mongoose)                          │
│  3. Optionally call AI Core via aiCoreClient                │
│  4. Emit domain events if state changed                     │
│  5. Write audit logs                                        │
│  6. Update usage ledger                                     │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  MONGODB                                                    │
│  1. Mongoose executes query/mutation                        │
│  2. Returns documents or write result                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼ (response bubbles back up)
┌─────────────────────────────────────────────────────────────┐
│  SERVER - Controller → Middleware → Express                 │
│  1. Controller returns response object                      │
│  2. asyncRoute wraps in try/catch                           │
│  3. errorHandler catches any unhandled errors               │
└─────────────────────────────────────────────────────────────┘
       │ JSON Response
       ▼
┌─────────────────────────────────────────────────────────────┐
│  CLIENT                                                     │
│  1. apiClient parses JSON response                          │
│  2. React Query caches result, triggers re-renders          │
│  3. UI updates with new data                                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 AI Request Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  Server  │────▶│ AI Core  │────▶│LangGraph │────▶│  Agents  │
│          │     │          │     │ (Python) │     │ Workflow │     │          │
│  Chat    │     │aiStream  │     │api_      │     │StateGraph│     │Master    │
│  Input   │     │/command  │     │service   │     │conditional│    │routes to  │
│          │◀────│          │◀────│.py       │◀────│routing   │◀────│specialist│
│  SSE     │     │Response  │     │HTTP      │     │nodes     │     │          │
│  Stream  │     │envelope  │     │endpoint  │     │          │     │Tools     │
│          │     │          │     │          │     │synthesize│     │available │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

**Step-by-step:**

1. **Client**: User sends message via chat UI → `useAIStream` hook opens SSE connection to `/api/v1/ai/stream`
2. **Server**: `aiController.processAiStream()` builds request via `aiRequestBuilder.ts`, calls `aiCoreClient.ts`
3. **AI Core**: Python service receives HTTP request, invokes LangGraph workflow
4. **LangGraph**: `master_agent` classifies request type, routes to appropriate specialist(s)
5. **Agents**: Specialist agent(s) execute analysis, optionally using tools (calculators, data processors)
6. **Synthesis**: `master_agent` synthesizes results into final plan
7. **Response**: Results streamed back via SSE to client, which updates UI incrementally

### 4.3 Real-Time Flow (SSE + Domain Events)

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENT                                                             │
│  1. useRealtimeEvents() hook opens EventSource to /api/v1/events/stream│
│  2. SSE connection established with auth cookie                     │
│  3. Client subscribes to event types in Zustand store               │
│  4. Events trigger UI updates (notifications, feed, etc.)           │
└──────────────────────────────────────────────────────────────────────┘
       ▲
       │ SSE stream
       │
┌──────────────────────────────────────────────────────────────────────┐
│  SERVER - eventsController.streamEvents()                           │
│  1. Authenticates client, resolves orgId                            │
│  2. Subscribes to EventBus for this orgId                           │
│  3. Writes SSE events as they arrive                                │
│  4. Cleans up subscription on disconnect                            │
└──────────────────────────────────────────────────────────────────────┘
       ▲
       │ EventBus.publish()
       │
┌──────────────────────────────────────────────────────────────────────┐
│  SERVER - Domain Event Fanout                                       │
│  1. MongoDB ChangeStream (preferred) or polling detects new events  │
│  2. domainEventFanout.ts reads new DomainEventModel documents       │
│  3. Publishes to EventBus with org-scoped routing                   │
│  4. EventBus deduplicates and fans out to SSE subscribers           │
└──────────────────────────────────────────────────────────────────────┘
       ▲
       │ DomainEventModel.create()
       │
┌──────────────────────────────────────────────────────────────────────┐
│  SERVER - Services                                                  │
│  1. Service performs state-changing operation                       │
│  2. Calls domainEvents.emit() or creates DomainEventModel directly  │
│  3. Event includes: eventType, aggregateType, aggregateId, payload  │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.4 Background Worker Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRIGGER                                                            │
│  1. API request creates job record (queued status)                  │
│     - WorkflowRunModel, IntegrationSyncRunModel, or ExportJobModel  │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼ MongoDB polling
┌─────────────────────────────────────────────────────────────────────┐
│  WORKER PROCESS (worker.ts)                                         │
│  1. Polls MongoDB for jobs with status="queued"                     │
│  2. Round-robin across job kinds (workflow, sync, export)           │
│  3. Claims job via findOneAndUpdate (atomic)                        │
│  4. Updates status to "running"                                     │
│  5. Enqueues in p-queue (configurable concurrency)                  │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  JOB EXECUTION                                                      │
│  1. processWorkflowRun() / processIntegrationSyncRun() /            │
│     processExportJob()                                              │
│  2. Calls relevant services                                         │
│  3. Updates job record (completed/failed)                           │
│  4. Emits domain events for completion                              │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GRACEFUL SHUTDOWN                                                  │
│  1. SIGINT/SIGTERM received                                         │
│  2. Stops accepting new jobs                                        │
│  3. Waits for in-flight jobs (15s timeout)                          │
│  4. Closes DB connection                                            │
│  5. Exits cleanly                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Design Patterns

### 5.1 Dual API Versioning

The system maintains two API surfaces simultaneously:

| Version | Prefix | Status | Purpose |
|---------|--------|--------|---------|
| **Canonical** | `/api/v1/*` | Active | Primary API with full validation, org-scoping, and feature-gating |
| **Legacy** | `/api/*` | Deprecated | Maintained during migration window; adds deprecation headers |

**Mounting order** in `app.ts` is critical: v1 routes are mounted before legacy routes because Express matches `/api/*` against `/api/v1/*` prefixes.

```
mountCanonicalApiRoutes(app, env);  // /api/v1/* — mounted first
mountLegacyApiRoutes(app, env);     // /api/* — mounted second
```

### 5.2 Org-Scoped Multi-Tenancy

All data is scoped to an organization. The `orgContext` middleware resolves the organization from:
- Request header (`X-Org-Id`)
- User's default organization
- API key's associated organization

Services receive `orgId` and scope all queries:

```typescript
TransactionModel.find({ orgId, ... })
```

### 5.3 Provenance Tracking

Every AI-generated output is tracked with full provenance:
- `AgentOutputModel`: Stores which agent produced what output
- `ToolExecutionModel`: Records every tool call with inputs/outputs
- `AIResponseCacheModel`: Caches AI responses to reduce costs
- `AuditEventModel` / `AuditLogModel`: Immutable audit trails

### 5.4 Graceful Shutdown

Both the server and worker implement graceful shutdown:

| Process | Signal Handling | Cleanup Steps |
|---------|----------------|---------------|
| **Server** | SIGINT, SIGTERM | Close HTTP server, drain connections, close DB, stop fanout |
| **Worker** | SIGINT, SIGTERM | Stop polling, wait for in-flight jobs (15s), close DB |

### 5.5 In-Memory DB Fallback

The database layer supports a strict mode and a fallback mode:
- `connectDBStrict()`: Fails if MongoDB is unreachable
- Fallback mode: Allows server to start with in-memory data for development/testing

### 5.6 Deterministic-First AI

The AI Core prioritizes deterministic computation over LLM calls:
- Financial calculations use pure functions (not LLM-generated)
- LLMs are used for narrative generation and classification only
- `fallback_used` flag indicates when deterministic path was used vs. LLM

### 5.7 Tool Calls Pattern

AI agents use a tool-calling pattern:
- `ToolCatalog`: Registry of available tools
- `ToolExecutor`: Executes tools with policy checks
- `ToolPolicy`: Validates tool permissions per agent/context
- Tools include: financial calculators, data processors, plan builders

### 5.8 Feature-Gated Modules

Features are controlled by `FeatureFlagModel`:
- Flags can be toggled per organization
- Services check entitlements before executing feature logic
- `orgEntitlements` service resolves effective feature set

### 5.9 Domain Events

The system uses domain events for decoupled communication:

| Component | Role |
|-----------|------|
| `DomainEventModel` | Persistent event store |
| `domainEventFanout.ts` | Reads new events (ChangeStream or poll) and publishes to EventBus |
| `eventBus.ts` | In-memory pub/sub with org-scoped routing and deduplication |
| `eventsController.ts` | Exposes SSE endpoint for client subscriptions |

**Event structure:**

```
{
  id: string,
  org_id: string,
  type: string,              // e.g. "transaction.created"
  aggregate_type: string,    // e.g. "transaction"
  aggregate_id: string,
  action_link_id: string | null,
  request_id: string | null,
  payload: Record<string, unknown>,
  created_at: string
}
```

### 5.10 PWA Caching Strategies

The client uses multiple caching strategies:
- **Static assets**: Cache-first with versioned hashes
- **API responses**: Network-first with stale-while-revalidate
- **Shell**: Cache-first for app shell HTML/CSS/JS
- **Offline fallback**: Custom offline page

---

## 6. Component Communication

### 6.1 Frontend Communication Patterns

```
┌─────────────────────────────────────────────────────────────────────┐
│  COMPONENT COMMUNICATION MATRIX                                     │
│                                                                     │
│  Pattern              │ Use Case              │ Direction           │
│  ─────────────────────┼───────────────────────┼──────────────────── │
│  Zustand stores       │ Global UI state       │ Any component ↔ store│
│  React Query          │ Server state          │ Component ↔ API     │
│  Props                │ Parent → Child        │ Parent → Child      │
│  Context (Auth)       │ Auth state            │ Provider → Consumer │
│  Custom hooks         │ Encapsulated logic    │ Component → hook    │
│  EventSource (SSE)    │ Real-time events      │ Server → Component  │
└─────────────────────────────────────────────────────────────────────┘
```

**Zustand Stores:**

| Store | Purpose |
|-------|---------|
| `aiStore` | AI processing status, current operation |
| `chatStore` | Active chat session, messages |
| `commandBarStore` | AI command bar visibility and state |
| `orgStore` | Current organization context |
| `appDialogStore` | Modal/dialog management |

**React Query Integration:**

- Queries are defined in `lib/api/` functions
- Each domain (transactions, auth, billing) has its own API module
- React Query handles caching, background refetching, and optimistic updates
- Query invalidation is triggered by mutations

**Data Flow Example (Transaction List):**

```
Transactions Page
       │
       ├── React Query: useQuery(['transactions', filters], fetchTransactions)
       │       │
       │       ├── apiClient.get('/api/v1/transactions', { params: filters })
       │       │       │
       │       │       └── Server responds with transactions
       │       │
       │       └── Cache result, trigger re-render
       │
       ├── Zustand: orgStore (provides current orgId for filters)
       │
       └── SSE: useRealtimeEvents() listens for 'transaction.created'
                └── Invalidates React Query cache on event
```

---

## 7. Service Boundaries

### 7.1 Tier Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT TIER (Browser)                                              │
│  ─────────────────                                                  │
│  Owns: UI rendering, user interaction, client-side state            │
│  Cannot: Access database directly, execute server logic             │
│  Communicates via: HTTP REST API, SSE streams                       │
│  Tech: React 19, Vite, TypeScript, Wouter, Zustand, React Query     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    HTTP + SSE
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER TIER (Node.js Process)                                      │
│  ─────────────────                                                  │
│  Owns: API surface, authentication, business logic, data access     │
│  Cannot: Directly render UI, execute Python code in-process         │
│  Communicates via: HTTP to AI Core, MongoDB queries, EventBus       │
│  Tech: Express, TypeScript, Mongoose, Passport, Zod                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                         HTTP (JSON)
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  AI CORE TIER (Python Process)                                      │
│  ─────────────────                                                  │
│  Owns: AI reasoning, financial analysis, natural language           │
│  Cannot: Access database directly, serve HTTP to clients            │
│  Communicates via: HTTP API with Node.js server                     │
│  Tech: Python, LangGraph, LangChain, Google Gemini                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                         MongoDB
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  DATA TIER                                                          │
│  ─────────                                                          │
│  Owns: Data persistence, indexing, changestreams                    │
│  Tech: MongoDB (Mongoose ODM)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Responsibility Matrix

| Concern | Client | Server | AI Core |
|---------|--------|--------|---------|
| UI Rendering | Primary | - | - |
| Authentication | Token storage | JWT validation, Passport | - |
| Authorization | Route guards | Middleware, entitlements | - |
| Data Validation | Form validation | Zod schemas | - |
| Business Logic | - | Services | Agent analysis |
| Data Access | - | Mongoose models | - |
| AI Reasoning | - | Request orchestration | LangGraph workflow |
| Financial Calculations | Display | Some aggregations | Deterministic tools |
| File Processing | Upload UI | Multer, GridFS | Vision/OCR |
| Real-time | SSE consumer | EventSource handler | - |
| Background Jobs | - | Worker process | - |
| Caching | React Query, PWA | AI response cache | - |
| Logging | Runtime logger | Pino structured logs | Python logging |

### 7.3 Cross-Tier Communication Contracts

| Direction | Protocol | Format | Endpoint/Interface |
|-----------|----------|--------|-------------------|
| Client → Server | HTTP | JSON | `/api/v1/*`, `/api/*` |
| Server → Client | SSE | text/event-stream | `/api/v1/events/stream` |
| Server → AI Core | HTTP | JSON | `PYTHON_API_URL` (configured) |
| AI Core → Server | HTTP | JSON | Callback endpoints |
| Server → MongoDB | Native | BSON | Mongoose ODM |
| Worker → MongoDB | Native | BSON | Mongoose ODM |

---

## 8. Deployment Topology

```
                    ┌─────────────┐
                    │   Browser   │
                    │  (PWA)      │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │   Reverse   │
                    │   Proxy     │
                    │  (nginx/    │
                    │   Caddy)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼────────┐ ┌─▼──────────┐
       │  Node.js    │ │  Node.js  │ │   Worker   │
       │  Server 1   │ │  Server 2 │ │  Process   │
       │  (Express)  │ │  (Express)│ │  (separate)│
       └──────┬──────┘ └─────┬─────┘ └─────┬──────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │    MongoDB      │
                    │  (Replica Set)  │
                    └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Python AI     │
                    │   Core Service  │
                    └─────────────────┘
```

---

## 9. Key Metrics

| Metric | Value |
|--------|-------|
| Client routes | 34 (lazy-loaded) |
| Client components | 36+ |
| Client stores (Zustand) | 6 |
| Client hooks | 13 |
| Client API modules | 17 |
| Server controllers (root) | 14 |
| Server controllers (v1) | 32 |
| Server middleware | 13 |
| Server models (Mongoose) | 49 |
| Server services | 49 |
| Server schemas (Zod) | 13+ |
| AI agents | 6 |
| AI tools | 3 modules |
| Vision processors | 7 files |
| Background job types | 3 |
| Plugin system files | 5 |
| Realtime modules | 2 |
