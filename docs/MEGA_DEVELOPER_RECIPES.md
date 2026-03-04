<!--
MEGA_DEVELOPER_RECIPES.md

Why is this file so long?
- You requested large documentation, new files only, with >= 500 lines per file.
- This file is structured as “recipes” (step-by-step) so it remains useful despite the line count.
-->

# FinWise Developer Recipes (Mega)

This document is a cookbook for making changes in this repo without getting lost.
It focuses on repeatable workflows, file locations, and “gotchas”.

Related docs:
- `docs/SETUP.md` (local setup)
- `docs/FRONTEND.md` (client architecture)
- `docs/API.md` (API conventions)
- `docs/MEGA_CODEBASE_REFERENCE.md` (repo atlas)
- `docs/MEGA_API_PLAYBOOK.md` (API usage details)

---

## 1) Repo Conventions (Quick Orientation)

Top-level directories:
- `client/` → React SPA (Vite).
- `server/` → Express API + worker + AI Core.
- `packages/contracts/` → shared DTOs and OpenAPI paths list.
- `docs/` → canonical docs.

Formatting:
- `.editorconfig` enforces:
  - LF line endings,
  - UTF-8,
  - 2-space indent,
  - final newline.

General coding rule of thumb:
- Keep controllers thin.
- Put business logic in services.
- Validate at the boundary (Zod).
- Enforce org isolation in every org-scoped query.

---

## 2) Local Dev Recipes (Most Common)

### 2.1 Start the API server

Commands:
- `cd server`
- `npm install`
- `npm run dev`

Useful endpoints:
- `GET /healthz`
- `GET /api/test`
- `GET /api/python-health`

### 2.2 Start the client

Commands:
- `cd client`
- `npm install`
- `npm run dev`

### 2.3 Start the AI Core

Commands (see `server/AI_Core/README.md`):
- `cd server/AI_Core`
- create venv
- install requirements
- run Uvicorn on port `8001`

### 2.4 Start the worker (optional)

Commands:
- `cd server`
- `npm run worker:dev`

Remember:
- Worker only runs when `ASYNC_JOBS_ENABLED=true`.

---

## 3) Recipe: Add a New API Endpoint (v1)

Goal:
- Add `GET /api/v1/foo/bar` returning JSON with `request_id`.

Steps:
- Pick router file under `server/src/routes/`.
- Add a Zod schema under `server/src/schemas/` for params/query/body.
- Add controller function under `server/src/controllers/`.
- Add service logic under `server/src/services/` (if non-trivial).
- Mount route in `server/src/app.ts` only if a new router is added.
- Add tests under `server/src/test/`.
- Regenerate OpenAPI paths list if route surface changed:
  - `cd server`
  - `npm run generate:openapi`

Do not:
- Put heavy logic in router files.
- Skip org isolation filtering.
- Return ad-hoc error shapes (use HttpError or allow error handler to normalize).

---

## 4) Recipe: Add/Update a Zod Schema

Why:
- Zod schemas are the boundary contract for inputs.

Where:
- `server/src/schemas/*`

Steps:
- Define `z.object({...}).strict()`.
- Add `.refine(...)` for cross-field rules.
- Use `z.coerce.*` for query params (strings → numbers/dates).
- Keep error messages stable and human readable.

Example patterns already used:
- transaction filters (page/limit/from/to/type/category) in `server/src/schemas/financialDataSchemas.ts`.
- auth payload schemas in `server/src/schemas/authSchemas.ts`.

---

## 5) Recipe: Add a New Mongo Model (Org-Scoped)

Steps:
- Create `server/src/models/<thing>Model.ts`.
- Include:
  - `orgId` field (required).
  - `userId` field if user-owned within org.
  - `createdAt`/`updatedAt` timestamps.
- Add indexes:
  - `{ orgId, createdAt }` for lists.
  - `{ orgId, userId, createdAt }` if user-specific.
  - Unique indexes when required (be careful; include orgId in uniqueness).
- Update services to always filter by orgId.
- Add org isolation tests.

Pitfalls:
- Unique indexes without orgId can cause cross-tenant collisions.
- Queries without orgId are the #1 source of tenant leakage.

---

## 6) Recipe: Publish a Domain Event + Trigger Side Effects

Domain event publisher:
- `server/src/services/domainEvents.ts` → `publishDomainEvent`

Reactive triggers:
- `server/src/services/domainEventTriggers.ts`

Steps to add a new event type:
- Choose a stable eventType string (e.g., `transaction.created`).
- Publish with:
  - orgId,
  - userId,
  - aggregateType,
  - aggregateId,
  - payload (small and stable).
- Update trigger processing logic if needed:
  - add side effects,
  - enqueue workflows for event triggers.
- Add tests verifying:
  - event is stored,
  - triggers run or enqueue appropriately,
  - failures go to DLQ after retries if designed.

Operational note:
- `processPendingDomainEvents` is polled by `server/src/server.ts` in non-test.

---

## 7) Recipe: Add a Workflow Template

Templates endpoint:
- `GET /api/v1/workflows/templates`

Implementation likely lives in:
- `server/src/services/workflowTemplates.ts`

Template fields to define:
- name/title
- description
- trigger:
  - manual, cron, or event
- actions:
  - tool calls or task creation actions
- required role
- required entitlement (if any)

Testing:
- Add tests for template listing.
- Add tests for workflow creation + run (happy path).

---

## 8) Recipe: Add a New Tool (Simulate + Execute)

Core idea:
- Tools must support simulation first.
- Execution should be gated by confirmation and policy rules.

Where to look:
- `server/src/services/toolExecutor.ts`
- `server/src/services/toolPolicy.ts`
- `server/src/services/tools/*` (if present)

Steps:
- Define a tool name string (stable).
- Implement simulate:
  - no writes,
  - returns preview object.
- Implement execute:
  - performs writes,
  - publishes domain events if relevant,
  - returns result object.
- Register the tool in the tool registry.
- Add policy defaults:
  - risk level,
  - confirmation thresholds (amount limits, etc).
- Add tests for:
  - simulate output shape,
  - execute side effects,
  - policy enforcement (blocked vs allowed).

---

## 9) Recipe: Add a New Client Page

Steps:
- Create `client/src/pages/<PageName>.tsx`.
- Add route in `client/src/App.tsx`.
- Add nav entry in `client/src/components/Sidebar.tsx` if needed.
- Use existing UI primitives in `client/src/components/ui/*`.
- Use React Query for server state:
  - define query in `client/src/lib/api/v1/*` or appropriate wrapper,
  - use `useQuery` / `useMutation`.

Checklist:
- Handle loading state.
- Handle empty state.
- Handle error state.
- Keep the page responsive (mobile + desktop).

---

## 10) Recipe: Add a New Client API Wrapper (v1)

Where:
- `client/src/lib/api/v1/*` or `client/src/lib/api/*` depending on module grouping.

Rules:
- Always call `apiClient(...)` from `client/src/lib/api/core.ts`.
- Do not call `fetch(...)` directly from pages/components.
- Keep request/response typing close to the wrapper function.

CSRF and org headers:
- You do not set these manually; `apiClient` injects them.

Uploads:
- Use `FormData`.
- Let the browser set multipart Content-Type boundary.

---

## 11) Recipe: Add a React Query Cache Pattern

Query client:
- `client/src/lib/queryClient.ts`

Default behavior:
- `staleTime: 30s`
- no retries by default
- refetchOnWindowFocus disabled

Typical patterns:
- `useQuery({ queryKey: ["transactions", "list", params], queryFn: ... })`
- `useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries(...) })`

Pitfalls:
- Don’t bake volatile objects into query keys without stable serialization.
- Avoid infinite refetch loops (watch dependencies).

---

## 12) Recipe: Update Shared Contracts

OpenAPI path list:
- `packages/contracts/openapi/v1/paths/index.yaml`
- Generated by `server/src/scripts/generateOpenApiPaths.ts`

To regenerate:
- `cd server`
- `npm run generate:openapi`

Shared TypeScript DTOs:
- `packages/contracts/typescript/api.ts`

Rule:
- Update shared DTOs when both client and server need the same shape.
- Keep DTO changes backwards compatible when possible.

---

## 13) Recipe: Add a Server Test

Tests live in:
- `server/src/test/*`

Common test utilities:
- Look for helpers in `server/src/test/setup.ts` and `server/src/test/testDb.ts`.

Test categories:
- Route tests (Supertest style).
- Service tests.
- Contract coverage tests (OpenAPI paths list).

Recommended minimum for new endpoints:
- Happy path.
- Validation error.
- Auth error (401/403).
- Org isolation check (if org-scoped).

---

## 14) Recipe: Debug a Bug with Request IDs

Steps:
- Capture `X-Request-Id` header from failing call.
- Search server logs for that request id.
- Identify:
  - router,
  - controller,
  - service,
  - downstream dependency call (AI Core, Stripe, etc).
- If AI-related:
  - also search AI Core logs for the same request id.

Why this works:
- `server/src/middleware/requestContext.ts` standardizes request ids.
- `server/AI_Core/api_service.py` propagates `X-Request-Id` as well.

---

## 15) Recipe: Troubleshoot “Org Access Denied”

Symptom:
- API returns 403 with code `ORG_ACCESS_DENIED`.

Steps:
- Confirm the client is sending `X-Org-Id`.
- Confirm the user is a member of that org.
- Check server org resolution in `server/src/middleware/orgContext.ts`.
- Check client org selection storage in `client/src/lib/orgContext.ts`.

Client behavior:
- If it injected the org id, it may clear it and retry safe requests once.

---

## 16) Recipe: Add a New Notification Type

Notifications model:
- `server/src/models/notificationModel.ts`

Patterns already present:
- anomaly alerts (`type: "anomaly_alert"`) from `server/src/services/anomalyDetection.ts`
- budget alerts (`type: "budget_alert"`) from `server/src/services/budgetAlerts.ts`

Steps:
- Decide on a stable `type` string.
- Add notification creation logic in the responsible service.
- Include a `metadata` dedup key if notifications can repeat.
- Add tests verifying:
  - notification is created,
  - dedup works when expected.

---

## 17) Code Review Checklists (Short and Brutal)

Backend PR checklist:
- Inputs validated with Zod.
- Errors use stable `code`s.
- Org isolation enforced.
- Role/entitlement checks enforced.
- No PII in logs.
- Tests added.
- OpenAPI paths updated if route surface changed.

Frontend PR checklist:
- Uses `apiClient`, not raw fetch.
- Handles loading/empty/error states.
- Query keys stable.
- Mutations invalidate queries.
- UI is accessible and responsive.

AI PR checklist:
- Prompt/context bounded.
- Tool calls require confirmation.
- Fallback behavior acceptable.
- Streaming behavior tested behind proxy.

---

## 18) Padding Section (Intentional)

The bullets below add line count while being useful as a reusable template.

### 18.1 “Add a feature” template

- What problem are we solving?
- Who is the user persona?
- What is the user journey?
- What are the API endpoints involved?
- What data model changes are needed?
- What org isolation rules apply?
- What quotas/entitlements apply?
- What is the rollback plan?
- What tests prove correctness?

### 18.2 “Ship safely” template

- Feature flag exists (if risky).
- Metrics/alerts defined.
- Logs are traceable via request id.
- Migration/backfill plan exists (if DB change).
- Docs updated (at least one page).

---

## 19) Recipe: Add a New Integration Connector

Integrations are connectors that import/sync external data.
Core connector types live in:
- `server/src/connectors/*`

Registry:
- `server/src/connectors/registry.ts`

Steps:
- Define a connector key string (stable, lowercase).
- Implement the connector interface in `server/src/connectors/types.ts`.
- Register it in the connector registry.
- Add API endpoints under `/api/v1/integrations/*` if needed.
- Add tests for:
  - connector catalog listing,
  - sync run creation,
  - org isolation.

Operational note:
- Connectors should be safe to run multiple times (idempotent where possible).
- Track sync runs via `IntegrationSyncRunModel`.

---

## 20) Recipe: Add a Plugin Runtime Tool or Connector (Marketplace)

Plugin runtime integration is optional.
If enabled, the server pulls a registry and proxies tool/connector calls.

Where to look:
- `server/src/modules/plugins/pluginManager.ts`
- `server/src/modules/plugins/runtimeClient.ts`
- `server/src/models/pluginInstallModel.ts`

Steps (server side):
- Ensure the runtime registry describes:
  - tool id,
  - tool name,
  - required permissions,
  - required role,
  - args schema,
  - default risk + confirmation flags.
- Ensure the org has the plugin installed and permissions granted.
- Ensure simulate and execute routes work end-to-end:
  - `simulatePluginTool(...)`
  - `executePluginTool(...)`

Testing:
- Add tests that:
  - deny execution when plugin not installed,
  - deny execution when permissions missing,
  - allow execution when installed and granted.

---

## 21) Recipe: Add a Background Job Type (Worker)

Worker types are defined in:
- `server/src/worker/worker.ts`

Current job kinds include:
- workflow runs
- integration sync runs
- export jobs

Steps:
- Add a new job kind discriminator.
- Add a “claim” function:
  - atomic findOneAndUpdate from `queued` → `running`.
- Add a “process” function that executes the job.
- Ensure failures are logged but don’t crash the worker loop.
- Add tests or a manual script to enqueue a job for local verification.

Operational note:
- Keep processing idempotent so retries are safe.

---

## 22) Recipe: Add a New Export Format

Exports are long-running and should be job-based.

Where to look:
- `server/src/services/exports.ts`
- `server/src/models/exportJobModel.ts`
- `server/src/worker/worker.ts` (processExportJob)

Steps:
- Add export kind/type field.
- Add generator that produces:
  - CSV,
  - PDF,
  - or other format.
- Ensure authorization:
  - only org members can request export,
  - only org members can download export.
- Add entitlement checks (exports often gated).
- Add tests:
  - create export job,
  - process export job,
  - download export.

---

## 23) Recipe: Add a New Chart or Analytics Widget

Client chart primitives:
- Recharts is used in multiple components.

Steps:
- Create a new component under `client/src/components/`.
- Keep data fetching separate from rendering:
  - fetch with React Query,
  - pass data into chart component.
- Use existing styling patterns:
  - Tailwind utility classes,
  - design tokens used by other charts.
- Add an empty state for no data.
- Add a loading skeleton where appropriate.

Testing:
- For complex logic, add unit tests.
- For simple rendering, a smoke test may be enough.

---

## 24) Recipe: Add/Update MSW Mocks (Client Tests)

Mock Service Worker setup:
- `client/src/test/mocks/server.ts`
- `client/src/test/mocks/handlers.ts`

Steps:
- Add a handler for the endpoint you need.
- Keep handlers consistent with server error codes.
- Use realistic payload shapes.

Benefit:
- Client tests run faster and are deterministic.

---

## 25) Recipe: Add a New AI Endpoint on the Server

Server AI routes:
- `server/src/routes/aiRoutes.ts`

AI controller:
- `server/src/controllers/aiController.ts`

Steps:
- Add Zod schema for request body in `server/src/schemas/aiSchemas.ts`.
- Add controller function:
  - enforce feature limits if needed,
  - fetch profile/org context,
  - call AI Core client function,
  - normalize response,
  - persist output if needed.
- Add tests for:
  - 401 unauthenticated,
  - 403 missing org context,
  - success response shape,
  - fallback behavior when AI core down.

---

## 26) Recipe: Fix a Bug Without Making It Worse

This is the “safe debug” checklist.

Steps:
- Reproduce on a minimal input.
- Capture request id.
- Add a failing test first (when feasible).
- Identify the layer:
  - client UI,
  - client API wrapper,
  - server route/controller,
  - server service,
  - AI core.
- Fix the root cause.
- Add regression coverage.
- Avoid unrelated refactors in the same PR.

---

## 27) Padding: Reusable Checklists (More Granular)

### 27.1 Backend endpoint checklist (detailed)

- Endpoint is listed in `packages/contracts/openapi/v1/paths/index.yaml` (after regen).
- Router mounted correctly in `server/src/app.ts`.
- Validation middleware used.
- Controller returns JSON (no raw throws).
- Errors are `HttpError` with stable code when intentional.
- Org isolation included.
- Rate limiting considered for expensive endpoints.
- CSRF impact considered for unsafe methods.
- Tests added and pass locally.

### 27.2 Frontend feature checklist (detailed)

- Page route registered.
- Sidebar/nav updated (if needed).
- Uses `apiClient`.
- Uses React Query with stable keys.
- Handles:
  - loading,
  - empty,
  - error.
- Accessible labels and keyboard navigation where relevant.
- Mobile layout verified.

### 27.3 AI change checklist (detailed)

- Request builder sends bounded context.
- AI Core endpoint exists and is called correctly.
- Response normalization tolerant to missing fields.
- Tool calls safe-by-default.
- Streaming works behind proxy.

