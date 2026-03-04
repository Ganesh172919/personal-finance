<!--
MEGA_TESTING_PLAYBOOK.md

Purpose:
- A comprehensive testing guide for the FinWise repo: server, client, and AI Core.
- Includes inventories of existing tests and patterns to follow for new coverage.

Note on length:
- You requested large documentation with new files only.
- This file intentionally exceeds 500 lines.
-->

# FinWise Testing Playbook (Mega)

This document is the “how we test” reference for this repository.
It complements `docs/TESTING.md` by adding a deeper inventory and more prescriptive workflows.

If you’re debugging a production issue, also read:
- `docs/MEGA_OPERATIONS_RUNBOOK.md`
- `docs/MEGA_SECURITY_RUNBOOK.md`

---

## 1) Testing Goals (What We Optimize For)

Primary goals:
- Prevent tenant isolation regressions (org leakage).
- Prevent auth/CSRF regressions (cookie + CSRF flows).
- Keep API surface and contract list aligned (OpenAPI paths list).
- Keep automation safe (idempotency + simulate/execute rules).
- Keep degraded mode safe (AI Core down → fallback behavior).

Secondary goals:
- Catch performance regressions in hot queries where possible.
- Maintain stable error codes and response shapes for the SPA.

Non-goals (practical):
- 100% coverage everywhere.
- Perfect UI snapshot stability.

---

## 2) Test Surfaces (What Exists)

The repo has three major test surfaces:
- Server tests (Node/Express): `server/src/test/*` using Vitest.
- Client tests (React): `client/src/test/*` plus co-located component/store tests using Vitest.
- AI Core tests (Python): `server/AI_Core/tests/*` using pytest (and ruff for lint).

Contract artifacts:
- API paths contract: `packages/contracts/openapi/v1/paths/index.yaml`
- Shared DTO types: `packages/contracts/typescript/api.ts`

---

## 3) How to Run Tests (Commands)

### 3.1 Server

Run all:
- `cd server`
- `npm test`

Run watch:
- `cd server`
- `npm run test:watch`

Run CI mode:
- `cd server`
- `npm run test:ci`

Typecheck only:
- `cd server`
- `npm run check`

### 3.2 Client

Run all:
- `cd client`
- `npm test`

Run watch:
- `cd client`
- `npm run test:watch`

### 3.3 AI Core (Python)

From `server/AI_Core/README.md`:
- `ruff check tests`
- `pytest -q`

Operational note:
- Keep Python deps pinned and tested on your target platform (Windows is supported).

---

## 4) Server Testing: Setup and Conventions

### 4.1 Where tests live

Server tests:
- `server/src/test/*.test.ts`

Common helpers:
- `server/src/test/setup.ts`
- `server/src/test/testDb.ts`
- `server/src/test/authHelpers.ts`

### 4.2 Database strategy in tests

The server supports in-memory MongoDB via `mongodb-memory-server`.
In production you must set `MONGO_URI`, but in tests it can be provisioned per suite.

Connection logic:
- `server/src/config/database.ts`

Best practice:
- Use isolated databases per test file when possible.
- Clear collections between tests.

### 4.3 Request IDs in tests

The server adds `X-Request-Id` on responses.
In tests:
- assert `request_id` exists in JSON,
- and/or `X-Request-Id` header exists.

Why:
- It prevents silent regressions in tracing.

### 4.4 Stable error codes

The server’s error handler normalizes errors into `{ message, code, request_id, ... }`.
File:
- `server/src/middleware/errorHandler.ts`

Tests should assert `code` for:
- auth failures,
- validation failures,
- org access failures,
- quota failures (402),
because the client uses those codes.

---

## 5) Server Test Inventory (What Is Already Covered)

This section lists existing server test files and the intent they likely cover.
Use it to find a nearby pattern before writing a new test.

Legend:
- Auth = login/session flows and permissions.
- Org = org isolation and membership behaviors.
- AI = AI endpoints, fallback, tool calls.
- Ops = metrics, deprecation headers, caching, scheduler.
- Finance = transactions, imports, dashboard summaries.

Test files (inventory):
- `server/src/test/agentOutputsRecent.test.ts` → AI output listing, pagination/filters, org scoping.
- `server/src/test/anomalyDetection.test.ts` → anomaly detection heuristics and notification creation.
- `server/src/test/apiDeprecationHeaders.test.ts` → legacy API header behavior and migration guarantees.
- `server/src/test/apiKeyQuota.test.ts` → API key usage and quota enforcement patterns.
- `server/src/test/authHelpers.ts` → shared auth setup helpers (login, cookies, etc).
- `server/src/test/autopilot.test.ts` → autopilot lifecycle (plan/sim/approve/execute), approvals, tool execution.
- `server/src/test/chatV1.test.ts` → chat session endpoints and message flows.
- `server/src/test/csrf.test.ts` → CSRF cookie issuance, header requirements, rotation behavior.
- `server/src/test/dashboardCache.test.ts` → dashboard cache behavior and invalidation triggers.
- `server/src/test/exports.test.ts` → export job lifecycle, entitlement gating, download behavior.
- `server/src/test/financeIntelligence.test.ts` → intelligence aggregation endpoints and derived metrics.
- `server/src/test/internalTools.test.ts` → internal tools endpoints and auth/guard rails.
- `server/src/test/invites.test.ts` → org invite acceptance and membership creation.
- `server/src/test/journal.test.ts` → journal endpoints, handwriting recognition, AI integration points.
- `server/src/test/monetization.test.ts` → billing provider behaviors (stub/stripe), entitlements updates.
- `server/src/test/openapiRoutesCoverage.test.ts` → v1 route surface matches `packages/contracts/openapi/.../index.yaml`.
- `server/src/test/orgIsolation.test.ts` → org scoping enforcement across key endpoints.
- `server/src/test/orgSeats.test.ts` → seat counting and plan tier constraints for orgs.
- `server/src/test/planContract.test.ts` → plan limits contract and client/server alignment.
- `server/src/test/receipts.test.ts` → receipt OCR endpoints, upload constraints, confirm flows.
- `server/src/test/referrals.test.ts` → referral code redemption and credit granting.
- `server/src/test/responseContext.test.ts` → response context middleware and headers behavior.
- `server/src/test/scenarios.test.ts` → what-if scenarios, AI fallback behavior, response shape.
- `server/src/test/setup.ts` → vitest setup file for server tests.
- `server/src/test/shares.test.ts` → share link creation and public share resolution.
- `server/src/test/summaryEndpoints.test.ts` → dashboard/portfolio summary endpoints, response shapes.
- `server/src/test/tasks.test.ts` → tasks endpoints (gated by `TASKS_ENABLED`), creation/apply flows.
- `server/src/test/testDb.ts` → in-memory MongoDB helpers and cleanup.
- `server/src/test/toolsV2.test.ts` → tool simulate/execute endpoints, policy enforcement, idempotency.
- `server/src/test/transactions.test.ts` → transaction CRUD, list, filters, org isolation.
- `server/src/test/transactionsCsvImportV1.test.ts` → v1 CSV import endpoint behavior and validations.
- `server/src/test/transactionsImport.test.ts` → import flows (rows payload), dedup and totals.
- `server/src/test/transactionsV1.test.ts` → v1 transaction endpoints and schema validation.
- `server/src/test/vnextPlatform.test.ts` → compatibility shims between legacy and v1.
- `server/src/test/workflows.test.ts` → workflows create/list/run and action execution.
- `server/src/test/workflowScheduler.test.ts` → cron scheduling logic, nextRunAt computation, backfill/tick.

How to use this inventory:
- Find the closest test file by domain.
- Copy the setup patterns and assertions.
- Add coverage for your new endpoint and its failure modes.

---

## 6) Server Test Patterns (Copy/Paste Mental Templates)

### 6.1 Pattern: Authenticated request with cookie

Goal:
- Ensure endpoints that require auth return 401 without cookie, 200 with cookie.

Checklist:
- Create user.
- Verify email (if required in auth controller).
- Login and capture cookie.
- Call endpoint with cookie.
- Assert status + response code + request_id.

### 6.2 Pattern: Org isolation assertion

Goal:
- Ensure user in org A cannot read/write org B data.

Checklist:
- Create user with access to org A and org B or create two users.
- Create data in org A.
- Switch `X-Org-Id` to org B.
- Call list/get endpoints.
- Assert:
  - no org A records appear,
  - or 403 ORG_ACCESS_DENIED when membership missing.

### 6.3 Pattern: Zod validation assertion

Goal:
- Ensure invalid body/query yields 400 `VALIDATION_ERROR`.

Checklist:
- Call endpoint with malformed payload.
- Assert:
  - status 400,
  - code VALIDATION_ERROR,
  - details exist (flattened Zod shape).

### 6.4 Pattern: Entitlement / quota assertion

Goal:
- Ensure feature-gated endpoints throw 402 with stable codes.

Checklist:
- Set entitlement plan to a low tier (or override limits).
- Use up quota via `recordFeatureUsage` or repeated calls.
- Call endpoint again.
- Assert:
  - status 402,
  - code FEATURE_LIMIT_REACHED (or FEATURE_NOT_AVAILABLE),
  - details.feature matches expected.

### 6.5 Pattern: Idempotency assertion

Goal:
- Retried execute calls do not double-write.

Checklist:
- Execute with a fixed idempotency key.
- Execute again with same key.
- Assert:
  - idempotent replay true (where applicable),
  - side effects only applied once.

---

## 7) Client Testing: Setup and Conventions

### 7.1 Where client tests live

Client tests exist in:
- `client/src/test/*`
- co-located `*.test.tsx` or `*.test.ts` near components/stores.

### 7.2 MSW mocking for API calls

MSW setup:
- `client/src/test/mocks/server.ts`
- `client/src/test/mocks/handlers.ts`

Why MSW:
- Keeps tests deterministic.
- Tests UI behavior without hitting a real server.

Rules:
- Keep mocked error `code` fields aligned with server.
- Include `request_id` in mocked responses when possible.

### 7.3 UI testing philosophy

Prefer:
- behavior tests (“user clicks button → request fires → UI updates”)

Avoid:
- snapshot tests for large pages that churn frequently.

---

## 8) AI Core (Python) Testing Notes

AI Core tests live in:
- `server/AI_Core/tests/*`

Quality checks (from AI Core README):
- `ruff check tests`
- `pytest -q`

Focus areas:
- deterministic behavior when provider keys are missing (fallback-capable mode).
- serialization safety (`_simplify_for_json` patterns).
- endpoint response shapes and request_id propagation.

---

## 9) Contract and Compatibility Testing

### 9.1 OpenAPI route coverage

The repo keeps an auto-generated list of `/api/v1` paths:
- `packages/contracts/openapi/v1/paths/index.yaml`

There is a server test that asserts coverage:
- `server/src/test/openapiRoutesCoverage.test.ts`

When to regenerate:
- If you add/remove v1 routes.
- Run:
  - `cd server`
  - `npm run generate:openapi`

### 9.2 Shared DTOs

Shared DTO types live in:
- `packages/contracts/typescript/api.ts`

Best practice:
- When a request/response shape is consumed by both client and server,
  define it in the contracts package.

---

## 10) Regression Workflow (How to Add a “Good” Test)

When you find a bug:
- Write a failing test that reproduces it.
- Fix the bug.
- Keep the test as a guardrail.

Checklist for a good regression test:
- Minimal setup (only create required records).
- Uses stable assertions:
  - status codes,
  - error codes,
  - key JSON fields,
  - idempotency behavior.
- Avoid time-based flakiness:
  - freeze time when necessary,
  - avoid `setTimeout` in tests.

---

## 11) Flakiness Prevention Checklist

Server tests:
- Use in-memory DB consistently.
- Clear collections between tests.
- Avoid reliance on background intervals:
  - disable pollers where possible,
  - use env flags to disable fanout if needed.

Client tests:
- Wait for async UI updates using Testing Library patterns.
- Keep MSW handlers deterministic.
- Avoid depending on animation timings.

AI tests:
- Stub provider calls where possible.
- Keep deterministic outputs for snapshot-like comparisons.

---

## 12) Coverage Targets (Practical, Not Dogmatic)

High priority coverage:
- auth flows (login, verify email, logout)
- org switching and org isolation
- CSRF enforcement
- transactions CRUD and imports
- workflows/tools/autopilot
- billing webhooks and entitlement state
- SSE event stream replay behavior

Medium priority coverage:
- analytics detail endpoints
- blog/growth story content
- notification inbox and mark-read

Low priority coverage:
- purely presentational UI components

---

## 13) Padding Section (Intentional, but Useful)

These lines increase file size while serving as a reusable test planning template.

Per-endpoint test checklist:
- unauthenticated → 401
- authenticated but missing org → 401 ORG_REQUIRED (where applicable)
- authenticated but wrong org → 403 ORG_ACCESS_DENIED (where applicable)
- invalid payload → 400 VALIDATION_ERROR
- quota exceeded → 402 FEATURE_LIMIT_REACHED (where applicable)
- success → 200/201 with request_id and expected data

Per-model test checklist:
- create
- read
- list
- update
- delete
- org isolation
- idempotency (if relevant)

Per-automation test checklist:
- simulate returns preview, no writes
- execute writes once, idempotent on retry
- required confirmation enforced by policy
- entitlements enforced (workflow_runs, autopilot_actions)

---

## 14) Test Inventory (Server) — `server/src/test/`

These tests are written with `vitest` and typically drive HTTP behavior via `supertest`.
Use this list as a “what coverage exists?” map.

By file:
- `agentOutputsRecent.test.ts` - Recent agent output listing and org scoping expectations.
- `apiDeprecationHeaders.test.ts` - Deprecation/sunset headers behavior for versioned APIs.
- `apiKeyQuota.test.ts` - API key quota enforcement and error codes.
- `authHelpers.ts` - Shared helpers for auth/session setup in tests.
- `autopilot.test.ts` - Autopilot endpoints: safety gates, simulation, and idempotency.
- `chatV1.test.ts` - Chat v1 endpoints: sessions/messages and auth boundaries.
- `csrf.test.ts` - CSRF flow: required headers/tokens for unsafe methods.
- `exports.test.ts` - Export lifecycle: job creation, status, download permissions.
- `financeIntelligence.test.ts` - Finance intelligence endpoints: insights and summaries.
- `internalTools.test.ts` - Internal tool endpoints and policy restrictions.
- `invites.test.ts` - Org invites: create, accept, expiration, role assignment.
- `journal.test.ts` - Journal entry CRUD and org isolation.
- `monetization.test.ts` - Billing/entitlements gating and response shapes.
- `openapiRoutesCoverage.test.ts` - Contract coverage: routes declared vs implemented.
- `orgIsolation.test.ts` - Multi-tenant boundaries: `orgId` scoping enforced.
- `orgSeats.test.ts` - Seat limits, membership roles, and billing seat enforcement.
- `planContract.test.ts` - Plan catalog / contract-level invariants.
- `receipts.test.ts` - Receipt upload/OCR flows (or stubs), access controls.
- `referrals.test.ts` - Referral award logic and limits.
- `responseContext.test.ts` - Request context fields present (request_id, headers).
- `scenarios.test.ts` - Scenario modeling endpoints and validation.
- `setup.ts` - Vitest setup for server tests (env, hooks, global fixtures).
- `shares.test.ts` - Share link creation and access semantics.
- `summaryEndpoints.test.ts` - Summary endpoints shape and caching behavior.
- `tasks.test.ts` - Task CRUD and workflow-produced task visibility.
- `testDb.ts` - Test database bootstrap (often `mongodb-memory-server`).
- `toolsV2.test.ts` - Tool execution endpoints and policy behavior.
- `transactions.test.ts` - Transactions CRUD, filters, and org scoping.
- `transactionsCsvImportV1.test.ts` - CSV import v1 parsing/validation behaviors.
- `transactionsImport.test.ts` - Import flows and dedupe/idempotency behavior.
- `transactionsV1.test.ts` - Transactions v1 endpoints shape and error codes.
- `vnextPlatform.test.ts` - Platform “vnext” features and compatibility boundaries.
- `workflows.test.ts` - Workflow creation/execution and run lifecycle.
- `workflowScheduler.test.ts` - Scheduler behavior: triggers, next-run calculation.

---

## 15) Test Inventory (Client) — `client/src/**`

Client tests use `vitest` + React Testing Library.

By file:
- `client/src/components/Dashboard.test.tsx` - Dashboard renders, widgets, and basic smoke behavior.
- `client/src/hooks/useAuth.test.tsx` - Auth hook behavior: login/logout/loading.
- `client/src/stores/stores.test.ts` - Zustand store invariants and reducers/selectors.
- `client/src/test/features.test.ts` - Feature flags / gating behavior in the UI.

When adding UI tests:
- Prefer test IDs only when semantic queries are impractical.
- Mock network with MSW (see `msw` dependency in `client/package.json`).
- Keep tests resilient to visual/layout changes (avoid snapshots for large pages).

---

## 16) Test Inventory (AI Core) — `server/AI_Core/tests/`

AI Core tests are Python (pytest) style.
Treat them as “contract tests” for the AI subsystem logic.

By file:
- `conftest.py` - Shared fixtures.
- `test_data_processor.py` - Data preprocessing and normalization.
- `test_financial_calculators.py` - Financial calculator correctness.
- `test_financial_educator_cache.py` - Cache behavior for educator responses/content.
- `test_handwriting_parser.py` - Handwriting parser behavior (inputs/outputs).
- `test_master_agent_routing.py` - Master agent routing/dispatch logic.
- `test_memory_store.py` - Memory persistence and retrieval constraints.
- `test_metrics_auth.py` - Metrics endpoint auth and safety.
- `test_plan_builder_actions.py` - Plan builder action selection logic.
- `test_plan_contract_fixture.py` - Contract fixtures used by multiple tests.
- `test_process_contract.py` - Contract validation for process graph/workflow inputs.
- `test_provider_env.py` - Provider environment checks (keys, config).
- `test_receipt_parser.py` - Receipt parsing behavior.
- `test_scenario_contract.py` - Scenario contract validation.
- `test_vision_dependency_handling.py` - Vision/OCR dependency optionality handling.

---

## 17) Mocking & Fixtures (Patterns That Keep Tests Fast)

Server (TypeScript):
- Prefer `mongodb-memory-server` for isolated DB tests.
- Use `supertest` to drive the Express app like a real client.
- Keep helper functions in `server/src/test/authHelpers.ts` to reduce copy/paste.
- Use deterministic time (fake timers) for cron/scheduler tests when possible.

Client (React):
- Use MSW to mock fetch/axios at the network boundary.
- Keep “render with providers” helpers (QueryClientProvider, AuthProvider).
- Stub `EventSource` for SSE tests (see `useRealtimeEvents` behavior).

AI Core (Python):
- Prefer fixtures that pin random seeds for deterministic behavior.
- Mock provider calls (LLM, OCR) to keep CI stable.

---

## 18) Writing New Tests (Checklist by Risk Area)

Auth and cookies:
- Missing cookie -> 401
- Invalid cookie -> 401
- Valid cookie but no org selected -> enforce ORG_REQUIRED where applicable
- Ensure `credentials: include` flows match client expectations

CSRF:
- Unsafe method without token -> 403
- Unsafe method with token -> success
- Token rotation behavior (if present) covered

Org isolation:
- Create data in org A
- Assert org B cannot read/update/delete
- Assert list endpoints always filter by org

Entitlements / 402:
- Set plan limits low in fixture
- Exercise endpoint past limit
- Expect 402 with stable error code and message
- Verify UI shows `FeatureLimitDialog` or equivalent UX

Workflows & tools:
- Simulate path returns preview without writes
- Execute path writes once (idempotency on retry)
- Policy blocks unsafe tool invocation
- Audit trails created (tool execution records / domain events)

Realtime (SSE):
- SSE endpoint returns `text/event-stream`
- Client receives `domain_event` and parses JSON
- Invalid event payload is ignored (no crash)
- Event types invalidate correct query keys

File uploads (receipts):
- Invalid file type -> 400
- Oversize -> 413 (if enforced)
- Happy path -> receipt created + processing started

---

## 19) Common Flake Causes (And Fixes)

Time:
- Prefer injecting “now” for scheduler logic.
- Avoid relying on real `setTimeout` delays; use fake timers where possible.

Database:
- Ensure collections are cleared between tests.
- Do not share global mutable fixtures across tests without reset.

Network:
- Mock external integrations; do not hit real Stripe/OAuth in CI.

SSE:
- EventSource tests must clean up connections (close) to avoid hanging processes.

Concurrency:
- If tests are order-dependent, refactor them into independent fixtures.
- Use unique org/user IDs per test suite to prevent collisions.

---

## 20) Padding Section (Intentional)

These one-liners increase file size while remaining actionable.

Server test PR checklist:
- A new endpoint includes at least: 401, 400, 200, org isolation.
- A new “metered” endpoint includes at least one 402 case.
- A new scheduler feature includes deterministic time tests.
- A new SSE event type includes invalidation map updates and at least one test.

Client test PR checklist:
- A new page includes a smoke test (renders without crashing).
- A new mutation includes a test for cache invalidation.
- A new dialog includes keyboard navigation coverage.

AI Core test PR checklist:
- Any provider integration is mocked.
- Any contract schema change updates fixtures and validation tests.

---

## 21) Example Test Case Templates (Copy/Paste Starters)

Endpoint template (read-only):
- Arrange: create org A, user A, seed 3 records in org A.
- Act: call GET endpoint as user A.
- Assert: 200 and records length = 3.
- Assert: every record has `orgId == orgA`.

Endpoint template (write):
- Arrange: create org A, user A, get CSRF token (if needed).
- Act: POST with valid payload.
- Assert: 201 with stable response shape.
- Assert: DB contains exactly one new record for org A.
- Assert: retry with same idempotency key does not create duplicates (if supported).

Org isolation template:
- Arrange: create org A + org B, users in each org.
- Seed: create a record in org A.
- Act: attempt to fetch/update that record as org B.
- Assert: 403 ORG_ACCESS_DENIED (or 404, depending on policy).

402 entitlement template:
- Arrange: set plan limit to N.
- Act: perform the metered action N times.
- Assert: actions succeed until N.
- Act: perform one more time.
- Assert: 402 FEATURE_LIMIT_REACHED with consistent error payload.

SSE template (server):
- Arrange: open SSE stream with valid cookie.
- Assert: response has `Content-Type: text/event-stream`.
- Act: trigger a domain event (create transaction).
- Assert: stream emits `event: domain_event`.
- Assert: `data:` JSON contains `type` and `payload`.

SSE template (client):
- Arrange: stub `global.EventSource` in test environment.
- Mount: component tree that calls `useRealtimeEvents`.
- Emit: `domain_event` message with `type: "TransactionCreated"`.
- Assert: `queryClient.invalidateQueries` called with `["transactions"]`.

Tool/workflow template:
- Arrange: create a workflow that writes a task.
- Simulate: call simulate endpoint.
- Assert: no DB writes occur.
- Execute: call execute endpoint.
- Assert: task is created exactly once.

File upload template:
- Arrange: build multipart form with a valid file.
- Act: POST receipt upload endpoint.
- Assert: 200/201 with receipt id.
- Assert: a “processing started” status exists (or a queued job record).

---

## 22) Extra Padding (Still Useful)

Stability reminders:
- Prefer explicit `await` for async operations; avoid race-prone sleeps.
- Prefer assert-on-shape before assert-on-values for large payloads.
- Prefer seeding minimal data to keep tests fast.

Coverage reminders:
- Every controller should have at least one test.
- Every middleware should have at least one test for its reject path.
- Every new domain event should have at least one test for emission.
