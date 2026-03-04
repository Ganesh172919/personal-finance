<!--
MEGA_PROJECT_GUIDE.md

Why is this file so long?
- The repository request explicitly asked for "huge documentation" and that each new doc file be >= 500 lines.
- This guide uses a "one idea per line" style to keep diffs readable and to make it easy to reference line-oriented notes.
-->

# FinWise / Personal Finance Application — Mega Project Guide

This is a high-signal, end-to-end guide to the FinWise "Personal Finance Application" codebase.
If you want the shorter, topic-by-topic docs first, see `docs/DOCS_HOME.md`.
If you want a file-and-folder map, see `docs/MEGA_CODEBASE_REFERENCE.md`.

---

## 1) What This Repository Contains

This repository is a full-stack personal finance platform with AI-assisted workflows.
It is split into three runtime surfaces and one shared contracts package.

Runtime surfaces:
- `client/` → React + Vite SPA.
- `server/` → Node.js + Express API (TypeScript) plus worker process.
- `server/AI_Core/` → Python FastAPI service that orchestrates AI agents and tools.

Shared contracts:
- `packages/contracts/` → OpenAPI paths + shared TypeScript DTOs.

Non-runtime artifacts:
- `docs/` → canonical docs set (already present) plus this "mega" series.
- `research_*` and `docs/research*` → research survey/references/paper draft materials.

---

## 2) High-Level Architecture (Mental Model)

Think of the system as:
- A browser-based client that renders dashboards and collects user intent.
- A primary API server that owns data, auth, org isolation, and most business logic.
- A dedicated AI service that turns natural-language intent into structured plans and tool calls.
- Optional background processing (worker + queues) for asynchronous jobs.

Key patterns you will see repeatedly:
- Request IDs for tracing (`server/src/middleware/requestContext.ts`).
- Cookie-based JWT auth (Passport JWT strategy; token stored in `jwt` cookie).
- Org isolation using an org context resolved per request (`x-org-id` header).
- Domain events stored in Mongo and optionally fanned out in real time.
- A tool system that supports simulate → confirm → execute flows.

---

## 3) Local Development Quick Start (Happy Path)

### 3.1 Prerequisites

Required:
- Node.js (server + client).
- Python 3.11 (AI Core).
- MongoDB (server data store).

Optional but recommended:
- Redis (rate limiting store, event bus pubsub, BullMQ queues, etc).

### 3.2 Start the server (API)

In a terminal:
- `cd server`
- `npm install`
- `npm run dev`

Default server port:
- `PORT` defaults to `3000` in `server/src/config/env.ts`.

Health checks:
- `GET /healthz` → returns `ok`.
- `GET /api/test` → returns a JSON hello.
- `GET /api/python-health` → checks AI Core connectivity.

### 3.3 Start the client (web app)

In a second terminal:
- `cd client`
- `npm install`
- `npm run dev`

Default client port:
- Vite defaults to `5173`.

### 3.4 Start the AI Core (Python service)

In a third terminal:
- `cd server/AI_Core`
- Create a venv and install requirements (see `server/AI_Core/README.md`).
- Run with Uvicorn on port `8001`.

Default AI Core base URL expected by server:
- `PYTHON_API_URL` defaults to `http://localhost:8001` in `server/src/config/env.ts`.

### 3.5 First login flow (how to confirm the stack is wired)

At the UI:
- Register.
- Verify email (OTP).
- Login.

On login:
- Server sets an HttpOnly `jwt` cookie.
- If CSRF is enabled, the server also issues a CSRF cookie and expects `x-csrf-token` on unsafe requests.

---

## 4) Repository Map (Short Version)

This is the minimal map you need to navigate product code quickly.

### 4.1 Client (React SPA)

Entry points:
- `client/src/main.tsx` boots the app.
- `client/src/App.tsx` defines route layout + protected routes.

Routing:
- Wouter routes defined in `client/src/App.tsx`.
- Public routes: login/register/verify-email/accept-invite.
- Protected routes: dashboard, transactions, goals, workflows, tasks, receipts, billing, etc.

State and data:
- React Query (`client/src/lib/queryClient.ts`) handles API caching and async state.
- Zustand stores live in `client/src/stores/*`.

API bindings:
- `client/src/lib/api/*` contains the client-side API wrappers.
- `client/src/lib/api/v1/*` groups v1 endpoints by domain.

UI system:
- Tailwind CSS + Radix UI primitives.
- `client/src/components/ui/*` contains reusable UI primitives.

### 4.2 Server (Node/Express API)

Entry points:
- `server/src/server.ts` is the main HTTP server process.
- `server/src/worker/worker.ts` is an optional worker process.

Express app wiring:
- `server/src/app.ts` configures middleware and mounts routes.

Core slices:
- `server/src/models/*` Mongoose models (48 files).
- `server/src/routes/*` Express routers.
- `server/src/controllers/*` request handlers.
- `server/src/services/*` business logic and orchestration.
- `server/src/middleware/*` cross-cutting concerns (auth, org context, CSRF, etc).

### 4.3 AI Core (Python)

Entry points:
- `server/AI_Core/api_service.py` defines the FastAPI app.
- `server/AI_Core/main.py` often acts as a local runner / orchestrator entry.

Key slices:
- `agents/` for agent definitions and prompts.
- `tools/` for tool implementations used by agents.
- `graph/` for LangGraph orchestration.
- `vision/` for receipt/journal OCR and extraction components.
- `memory/` for longer-term memory storage patterns.

---

## 5) Core Cross-Cutting Concerns (Server)

This section explains the server pipeline and what it implies for feature work.

### 5.1 Request IDs and tracing

Every request gets a `requestId`.
Implementation:
- `server/src/middleware/requestContext.ts`.

Behavior:
- If the client sends `x-request-id`, it is reused.
- Otherwise a UUID is generated.
- Response includes header `X-Request-Id`.

Impact:
- Log lines and AI Core calls can be correlated with a request ID.

### 5.2 Security headers, CORS, and trust proxy

Primary setup:
- `server/src/app.ts`.

Helmet:
- CSP is set (script/style/font/image/connect restrictions).
- Cross-origin resource policy is disabled in Helmet config (explicit).

Additional headers:
- `server/src/middleware/securityHeaders.ts` adds extra headers (HSTS, etc).

CORS:
- Configured from `CORS_ORIGINS` env (CSV list).
- Supports `*` to allow all (not recommended for production).

Proxy:
- `TRUST_PROXY` is parsed and applied via `app.set("trust proxy", ...)`.

### 5.3 Rate limiting

There are two distinct rate limiters:
- A general `/api` rate limiter keyed by (API key org) or (org) or (user) or IP.
- A tighter auth rate limiter for `/api/v1/auth` and `/api/auth`.

Primary setup:
- `server/src/app.ts`.

### 5.4 Auth: cookie JWT + Passport JWT strategy

Token creation:
- `server/src/controllers/authController.ts` signs JWT and sets HttpOnly cookie `jwt`.

Protected endpoints:
- Use `passport.authenticate("jwt", { session: false })`.

Client expectations:
- The browser will automatically send the cookie to the API if same-site rules allow it.
- When using cross-site, ensure cookie settings and CORS credentials are correct.

### 5.5 CSRF (double-submit cookie)

CSRF middleware:
- `server/src/middleware/csrfProtection.ts`.

Default behavior:
- `CSRF_ENABLED` defaults to enabled in production and disabled otherwise (see env computation).

Mechanics:
- Safe methods set a signed CSRF cookie.
- Unsafe methods require:
  - CSRF cookie present, and
  - `x-csrf-token` header present, and
  - header token matches cookie token.

Important exceptions:
- Billing webhook endpoints bypass CSRF.
- Usage-events endpoints bypass CSRF.

### 5.6 Org isolation (multi-tenant)

Org context middleware:
- `server/src/middleware/orgContext.ts`.

How active org is chosen:
- If `x-org-id` header exists, it is validated and used (must be a member).
- Otherwise, the user's default org is used.

Where org context is stored:
- `req.org = { orgId, memberId, role, isDefault, defaultOrgId }`.

Implications:
- Most domain queries include `orgId`.
- Bugs often show up as "org leakage" if queries forget to filter by org.

---

## 6) Data Model Overview (Server + MongoDB)

The server uses MongoDB via Mongoose.
Model files are in `server/src/models/*Model.ts`.

### 6.1 Key aggregates (conceptual)

Core identity:
- User.
- Organization.
- OrgMember and invites.

Core finance:
- Account.
- Transaction.
- Merchant.
- Budget allocations and envelope views.
- Recurring rules.

Automation:
- Workflow and WorkflowRun.
- DomainEvent.
- ToolExecution.

Content + collaboration:
- Comment threads.
- Blog and growth stories.
- Notifications.
- Share links.

Monetization and usage:
- Subscription, billing accounts.
- Usage events and ledgers.
- Entitlements, credits, referrals.

### 6.2 Practical modeling conventions you will see

Org-scoped documents:
- Most models include an `orgId` field.
- Controllers/services should require org context and filter by it.

Audit fields:
- Many docs include `createdAt` / `updatedAt`.
- Some include `createdByUserId` for permission checks.

Idempotency:
- Workflow runs and certain tool executions use idempotency keys.

---

## 7) API Surface: v1 and legacy

Server supports:
- Canonical `/api/v1/*`.
- Legacy `/api/*` kept during a deprecation window.

The `/api/v1` path list is tracked in:
- `packages/contracts/openapi/v1/paths/index.yaml`.

Why the dual-mount exists:
- Allows client migration without breaking older integrations.
- Lets tests enforce route coverage (see `server/src/test/openapiRoutesCoverage.test.ts`).

---

## 8) End-to-End Feature Flows (How Things Actually Work)

This section is "follow the data" style documentation.
Use it when you are debugging production behavior or implementing features.

### 8.1 Login + session establishment

Sequence:
- Client calls `POST /api/v1/auth/login`.
- Server validates credentials and email verification.
- Server sets `jwt` cookie.
- Client then calls `GET /api/v1/auth/profile` to hydrate user context.

Files to read:
- `server/src/routes/authRoutes.ts`.
- `server/src/controllers/authController.ts`.
- `server/src/config/passport.ts`.

### 8.2 Org context selection and switching

Sequence:
- Client sets `x-org-id` header to switch active organization.
- Server resolves membership and role.
- Services enforce role checks (owner/admin/member patterns).

Files to read:
- `server/src/middleware/orgContext.ts`.
- `server/src/services/orgService.ts`.
- `server/src/models/orgMemberModel.ts`.

### 8.3 Transactions: CRUD and list views

Sequence (create):
- Client calls `POST /api/v1/transactions`.
- Server validates DTO (Zod).
- Controller passes to service.
- Service writes `TransactionModel` (org scoped).
- Service publishes domain events as needed.

Sequence (list):
- Client calls `GET /api/v1/transactions`.
- Server applies org filter and pagination.
- Client renders list and summary.

Files to read:
- `server/src/routes/financialDataRoutes.ts`.
- `server/src/controllers/*` related to transactions.
- `server/src/services/transactionService.ts`.

### 8.4 CSV import (transactions)

Sequence:
- Client uploads CSV via v1 integration endpoint.
- Server parses CSV and creates transactions.
- Import is tracked via integration sync runs when appropriate.

Files to read:
- `server/src/services/transactionsCsvImport.ts`.
- `server/src/services/transactionsCsvImportV1` (if present).
- `server/src/routes/v1Routes.ts` (integrations section).

### 8.5 Budget allocations + envelope view

Key endpoints:
- `GET /api/v1/finance/budgets/{periodKey}/allocations`.
- `PUT /api/v1/finance/budgets/{periodKey}/allocations`.
- `GET /api/v1/finance/budgets/{periodKey}/envelopes`.

Concept:
- Allocations define intended spending per category/envelope per period.
- Envelopes present computed remaining and actual spend.

Files to read:
- `server/src/services/spendingInsights.ts`.
- `server/src/services/budgetAlerts.ts`.
- `server/src/models/budgetAllocationModel.ts`.

### 8.6 Dashboard summaries and caching

Endpoint:
- `GET /api/v1/dashboard/summary`.

Performance:
- Summaries may be cached to reduce recomputation.

Files to read:
- `server/src/services/dashboardCache.ts`.
- `server/src/services/financeIntelligence.ts`.

### 8.7 AI Chat: process-command + streaming

Two relevant patterns exist:
- "Classic" chat endpoints under `/api/v1/chat/*`.
- AI orchestration endpoints under `/api/v1/ai/*` and `/api/v1/process-command`.

Typical sequence:
- Client sends a user message.
- Server assembles:
  - user profile context,
  - org context,
  - conversation history,
  - optional session summary.
- Server calls AI Core (`PYTHON_API_URL`) via `server/src/services/aiCoreClient.ts`.
- Server returns structured output + insight list + tool calls (if any).

Streaming:
- Some endpoints support streamed output for better UX.

Files to read:
- `server/src/routes/aiRoutes.ts`.
- `server/src/services/aiCoreClient.ts`.
- `server/AI_Core/api_service.py`.

### 8.8 Autopilot: plan → simulate → approve → execute

Autopilot is the "safe automation" funnel.
The core idea is:
- The AI drafts actions.
- The system simulates effects.
- The user confirms.
- The system executes atomically (as best as possible).

Relevant endpoints:
- `/api/v1/autopilot/plan`
- `/api/v1/autopilot/simulate`
- `/api/v1/autopilot/approve`
- `/api/v1/autopilot/execute`

Conceptual state:
- An `autopilotRun` tracks the lifecycle and results.

Files to read:
- `server/src/services/toolExecutor.ts`.
- `server/src/services/toolPolicy.ts`.
- `server/src/models/autopilotRunModel.ts`.

### 8.9 Workflows: templates, runs, and scheduling

Workflows allow:
- User-defined automations.
- Cron triggers.
- Tool execution pipelines.

Workflow templates:
- `GET /api/v1/workflows/templates`.

Workflow runs:
- Created and processed via `WorkflowRunModel`.

Scheduling:
- `server/src/services/workflowScheduler.ts` computes next runs and triggers due workflows.

Execution:
- In server process (when async jobs disabled) or worker process (when enabled).

Files to read:
- `server/src/models/workflowModel.ts`.
- `server/src/models/workflowRunModel.ts`.
- `server/src/services/workflows.ts`.
- `server/src/services/workflowScheduler.ts`.
- `server/src/worker/worker.ts`.

### 8.10 Background work: queues vs DB-poll worker

There are two layers:
- BullMQ queue helpers (`server/src/modules/queue/jobQueue.ts`) when Redis exists.
- A DB-claiming worker loop (`server/src/worker/worker.ts`) that claims queued jobs from Mongo.

Why both exist:
- Local dev can run without Redis.
- Production can use Redis-backed queues for better isolation.

### 8.11 Exports (CSV/PDF)

Exports are long-running enough to be jobs.
They are tracked via `ExportJobModel`.

Files to read:
- `server/src/services/exports.ts`.
- `server/src/models/exportJobModel.ts`.
- `server/src/worker/worker.ts` (processing loop).

### 8.12 Receipts OCR and confirmation

Receipt upload/parse:
- `POST /api/v1/receipts/parse`.

Confirmation:
- `POST /api/v1/receipts/{id}/confirm` creates a transaction or attaches metadata.

Files to read:
- `server/src/routes/receiptRoutes.ts`.
- `server/src/controllers/receiptController.ts` (or similarly named).
- `server/AI_Core/vision/*` for extraction logic.

### 8.13 Financial journal handwriting recognition

Endpoint:
- `POST /api/v1/financial-journal/recognize-handwriting`.

Purpose:
- Turn handwritten notes into structured journal entries and insights.

Files to read:
- `server/src/routes/financialJournalRoutes.ts`.
- `server/src/services/journalIntentParser.ts`.
- `server/AI_Core/vision/*`.

### 8.14 Marketplace plugins and runtime registry

At a glance:
- Plugins are installed per org.
- A plugin runtime registry exposes tools and connectors.
- The server periodically refreshes the registry and registers proxy handlers.

Implementation:
- `server/src/modules/plugins/pluginManager.ts`.
- `server/src/modules/plugins/runtimeClient.ts`.
- `server/src/services/tools/*` registry patterns.

Failure modes:
- If the registry is unavailable, tools/connectors may not register.
- Permission checks ensure only granted permissions are usable.

### 8.15 Real-time events (domain event fanout + SSE)

There are two separate ideas:
- Store domain events in Mongo (audit + replays).
- Fan them out to connected clients (live updates).

Fanout:
- `server/src/modules/realtime/domainEventFanout.ts`.

Event bus:
- In-memory bus or Redis pubsub bus (`server/src/modules/realtime/eventBus.ts`).

Client consumption:
- `/api/v1/events/stream` endpoint likely uses SSE.

---

## 9) Environment Configuration (Server)

Env parsing and validation:
- `server/src/config/env.ts` (Zod schema + computed defaults).

Key defaults you should remember:
- `PORT=3000`
- `PYTHON_API_URL=http://localhost:8001`
- `CLIENT_URL=http://localhost:5173`
- `CORS_ORIGINS=http://localhost:5173`

Mandatory in any environment:
- `JWT_SECRET` (required; server will throw on startup otherwise).

Optional but common:
- `MONGO_URI`
- `REDIS_URL`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for OAuth.
- Stripe config when billing provider is `stripe`.

Tip:
- If the server crashes on boot, read the thrown "Invalid environment configuration" message.
It includes schema-path hints.

---

## 10) Testing Strategy (How to Run and What It Covers)

Server tests:
- Use Vitest (see `server/vitest.config.ts`).
- Tests live in `server/src/test/*`.

Client tests:
- Use Vitest + Testing Library.
- Tests live alongside components and under `client/src/test/*`.

Contract coverage:
- The OpenAPI paths list is auto-generated.
- Tests enforce that mounted routes match the contract list.

How to run server tests:
- `cd server`
- `npm test`

How to run client tests:
- `cd client`
- `npm test`

---

## 11) Operational Notes (Dev → Prod)

This repo supports a production-like configuration.
But local dev can be "minimal dependencies" if you accept reduced async behavior.

### 11.1 Process model

Common deployment model:
- `server` process (HTTP).
- `worker` process (async jobs).
- `ai_core` process (Python FastAPI).

Optional:
- Redis (queues, pubsub, rate limiting store).
- OpenTelemetry collector if exporting traces.

### 11.2 Scaling guidance (practical)

Scale server:
- Horizontal scale behind a load balancer.
- Ensure sticky sessions are not required (JWT cookie is stateless).

Scale worker:
- Increase worker replicas to process queued jobs faster.
- Ensure DB claim logic is safe with multiple instances (uses atomic findOneAndUpdate).

Scale AI Core:
- Add replicas behind a load balancer.
- Keep an eye on concurrency limits and circuit breaker behavior.

### 11.3 Observability

Logging:
- Pino logger (`server/src/config/logger.ts`).

Metrics:
- Prometheus endpoint at `/api/metrics` guarded by `METRICS_TOKEN`.

Tracing:
- OpenTelemetry init in `server/src/config/telemetry.ts`.

---

## 12) Common Developer Tasks (Recipes)

These are "copy/paste ready" workflows.

### 12.1 Add a new API endpoint (v1)

Checklist:
- Add route in `server/src/routes/v1Routes.ts` (or a domain router).
- Add controller function in `server/src/controllers/*`.
- Add service logic in `server/src/services/*`.
- Add Zod DTO in `server/src/schemas/*`.
- Add tests in `server/src/test/*`.
- Run the OpenAPI path generator if the route is new:
  - `npm run generate:openapi` in `server/`.

### 12.2 Add a new org-scoped model

Checklist:
- Create model file in `server/src/models/*`.
- Include `orgId` field if org-scoped.
- Add indexes for common access patterns (orgId + date, orgId + status, etc).
- Update service/controller logic with org filter.
- Add tests verifying org isolation.

### 12.3 Add a new AI tool

Two places exist:
- Server tool registry (for core tools).
- Plugin runtime registry (for plugin tools).

Core tool approach:
- Add tool handler under `server/src/services/tools/*` if that structure exists.
- Update tool catalog (`server/src/services/toolCatalog.ts`) if needed.
- Add tool policy rules (`server/src/services/toolPolicy.ts`).
- Ensure simulate + execute are implemented.

AI Core tool approach:
- Add tool definition under `server/AI_Core/tools/*`.
- Update LangGraph wiring under `server/AI_Core/graph/*`.
- Ensure API responses include `tool_calls` in the expected shape.

### 12.4 Add a new workflow template

Checklist:
- Update `server/src/services/workflowTemplates.ts`.
- Include:
  - trigger type (manual/cron/event),
  - steps (tool calls),
  - args schema and examples,
  - required roles and entitlements.

### 12.5 Debug "AI is down" quickly

Checklist:
- Call `GET /api/python-health` to validate connectivity.
- Check server logs for circuit breaker open events.
- Confirm `PYTHON_API_URL` points to the right host.
- Confirm AI Core is listening on `8001`.
- Confirm any AI Core auth token is configured (if enabled).

---

## 13) Troubleshooting (Symptom → Likely Cause → Fix)

### 13.1 Login works but API calls return 401

Likely causes:
- Cookie not sent due to CORS or same-site mismatch.
- Server cookie config uses a domain that does not match local host.

Fix:
- Check `CLIENT_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN`, and `COOKIE_SAME_SITE`.

### 13.2 CSRF failures on POST/PUT/PATCH/DELETE

Likely causes:
- `CSRF_ENABLED=true` but client is not echoing the token header.
- Token expired (1 hour default in CSRF middleware).

Fix:
- Call `GET /api/v1/auth/csrf` or any safe endpoint to refresh cookie.
- Send `x-csrf-token` header equal to the CSRF cookie value.

### 13.3 "Origin not allowed by CORS"

Likely cause:
- `CORS_ORIGINS` env is missing the client origin.

Fix:
- Add `http://localhost:5173` (or your actual origin) to `CORS_ORIGINS`.

### 13.4 Domain events not streaming

Likely causes:
- `DOMAIN_EVENT_FANOUT_ENABLED=false`.
- No Redis and relying on in-memory event bus across multiple replicas.
- Client not connected to SSE endpoint.

Fix:
- Enable fanout and confirm SSE path.
- Use Redis for multi-replica deployments.

### 13.5 Worker is running but jobs never execute

Likely causes:
- `ASYNC_JOBS_ENABLED=false`.
- Jobs never set to `queued` status.
- Worker DB connectivity issues.

Fix:
- Ensure env enables worker.
- Inspect models: `WorkflowRunModel`, `ExportJobModel`, `IntegrationSyncRunModel`.
- Check worker logs.

### 13.6 OpenAPI coverage test fails

Likely cause:
- New route added but contract not regenerated.

Fix:
- Run `npm run generate:openapi` inside `server/`.

---

## 14) Glossary (Project-Specific Terms)

AI Core:
- The Python FastAPI service that orchestrates LLM calls and tool usage.

Autopilot:
- The safe automation funnel (plan → simulate → approve → execute).

Org:
- A multi-tenant boundary representing a household, team, or small business workspace.

Domain Event:
- A durable record of something meaningful that happened (stored in Mongo).

Fanout:
- The process that pushes durable domain events to connected clients in real time.

Workflow:
- A reusable automation definition, optionally cron-triggered.

Tool:
- A server-side or plugin capability with simulate + execute semantics.

Connector:
- An integration adapter that imports/syncs external data (e.g. CSV import).

---

## 15) Appendix: Suggested Reading Paths

If you are new and want the "tour":
- Read `README.md`.
- Read `docs/DOCS_HOME.md`.
- Then read this file top-to-bottom.

If you are about to change the backend:
- Read `server/src/app.ts`.
- Read `server/src/config/env.ts`.
- Read `server/src/middleware/*` (request, auth, org).
- Read the relevant router in `server/src/routes/*`.
- Read the relevant service in `server/src/services/*`.

If you are about to change the frontend:
- Read `client/src/App.tsx`.
- Read `client/src/lib/api/*` and `client/src/lib/queryClient.ts`.
- Read the relevant page in `client/src/pages/*`.

If you are about to change AI behavior:
- Read `server/src/services/aiCoreClient.ts`.
- Read `server/AI_Core/api_service.py`.
- Read `server/AI_Core/agents/*` and `server/AI_Core/tools/*`.

---

## 16) Line Count Padding (Intentional)

The sections below are intentionally line-oriented checklists.
They exist to satisfy the ">= 500 lines per new file" requirement without adding low-quality filler paragraphs.

### 16.1 Backend change checklist (repeatable)

- Confirm which endpoint(s) you are changing.
- Confirm whether the endpoint is under `/api/v1` or legacy `/api`.
- Confirm auth requirement (public, optional JWT, or required JWT).
- Confirm org requirement (org-scoped or global).
- Confirm role requirement (member/admin/owner).
- Confirm entitlement/quota requirement (usage ledger / plan gates).
- Add or update Zod schemas for inputs.
- Add or update response shaping (include `request_id`).
- Ensure logs include `requestId`.
- Add tests that prove:
  - correct status codes,
  - correct org isolation,
  - correct error codes,
  - correct contract coverage (if new route).
- Run server unit/integration tests.
- If route changed, regenerate OpenAPI paths list.

### 16.2 Frontend change checklist (repeatable)

- Identify whether the change is page-level or component-level.
- Confirm which API wrapper file to update (if needed).
- Confirm React Query keys and caching strategy.
- Add optimistic updates only when safe.
- Confirm empty/loading/error UI states.
- Add tests for critical business logic.
- Validate that auth redirects still behave as expected.

### 16.3 AI change checklist (repeatable)

- Confirm whether logic belongs in AI Core (Python) or server (TypeScript).
- If AI Core:
  - update agent prompt or tool wiring,
  - update response normalization shape if needed,
  - add tests in `server/AI_Core/tests`.
- If server:
  - update AI request builder,
  - update circuit breaker thresholds if needed,
  - add metrics for AI Core calls.
- Validate "fallback mode" behavior works when AI Core is down.

### 16.4 Deployment readiness checklist (repeatable)

- Ensure `JWT_SECRET` is configured.
- Ensure Mongo is reachable.
- Ensure AI Core URL is reachable from server.
- Ensure Redis is configured if you need:
  - BullMQ,
  - pubsub events,
  - rate limit store.
- Ensure CORS origins include your client domain.
- Ensure cookie settings are correct for your deployment domain.
- Ensure CSRF is enabled in production (default).
- Ensure `/api/metrics` is protected by a strong token.
- Ensure log aggregation is configured (Pino JSON logs).
- Ensure OpenTelemetry endpoint is configured if using tracing.

### 16.5 Support checklist (repeatable)

- Capture the `X-Request-Id` from the failing client call.
- Search server logs for that request ID.
- If AI-related, search AI Core logs for that request ID (passed via headers where implemented).
- Confirm whether the error is auth, org, quota, or validation.
- Confirm whether the failure reproduces on a fresh session.
- Add a regression test if the bug is logic-related.

