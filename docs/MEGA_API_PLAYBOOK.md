<!--
MEGA_API_PLAYBOOK.md

Why is this file so long?
- You requested "huge documentation" with new docs only.
- Each new doc file is written to be >= 500 lines.
- This file uses a line-oriented style so you can grep and link to specific lines easily.
-->

# FinWise API Playbook (Mega)

This is an opinionated guide to using and extending the FinWise / Personal Finance Application API.
It is written for contributors, integrators, and anyone debugging production traffic.

If you want the shorter API overview first, read `docs/API.md`.
If you want the repo atlas, read `docs/MEGA_CODEBASE_REFERENCE.md`.

---

## 1) API Surface: What Exists

The canonical API lives under `/api/v1/*`.
Legacy routes also exist under `/api/*` for a deprecation window.
The v1 routes list is auto-generated into `packages/contracts/openapi/v1/paths/index.yaml`.

The server mounts routers in `server/src/app.ts`.
The client builds URLs in `client/src/lib/apiBase.ts`.

---

## 2) Base URL, Versioning, and URL Resolution

### 2.1 Client-side base URL

The client uses `client/src/lib/apiBase.ts`.
The default `API_BASE_URL` is `"/api"` (same origin).
You can override it using `VITE_API_BASE_URL`.

Resolution rules (simplified):
- If you pass an endpoint that already starts with `/api/v1`, it is kept.
- If you pass an endpoint that starts with `/v1/`, it is rewritten to `/api/v1/...`.
- If you pass an endpoint that starts with `/api/`, it is rewritten to `/api/v1/...` (client assumes v1).
- Otherwise, the client prefixes `/api/v1`.

Examples (input endpoint → final path):
- `"transactions"` → `/api/v1/transactions`
- `"/transactions"` → `/api/v1/transactions`
- `"/v1/transactions"` → `/api/v1/transactions`
- `"/api/transactions"` → `/api/v1/transactions`
- `"/api/v1/transactions"` → `/api/v1/transactions`

Important:
- This means `apiClient("/auth/login")` is actually `/api/v1/auth/login`.
- This is why many client wrapper modules omit the `/api/v1` prefix.

### 2.2 Server-side base URL

The server listens on `PORT` (default `3000`) from `server/src/config/env.ts`.
The server also exposes:
- `GET /healthz` (top-level) for infra probes.
- `GET /api/test` for a simple JSON response.
- `GET /api/python-health` to check AI Core connectivity.

---

## 3) Authentication: Sessions, Cookies, and What “Logged In” Means

### 3.1 Auth style

This app uses cookie-based JWT auth.
The server sets an HttpOnly cookie named `jwt`.
Protected endpoints generally use `passport.authenticate("jwt", { session: false })`.

### 3.2 Auth endpoints (v1)

Auth router:
- `server/src/routes/authRoutes.ts`

Endpoints (see also `packages/contracts/openapi/v1/paths/index.yaml`):
- `GET /api/v1/auth/providers`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `GET /api/v1/auth/google`
- `GET /api/v1/auth/google/callback`
- `GET /api/v1/auth/profile`
- `PUT /api/v1/auth/profile`
- `POST /api/v1/auth/password`
- `POST /api/v1/auth/logout`

### 3.3 Email verification (OTP)

Registration flow:
- `POST /api/v1/auth/register` creates user and sends OTP.
- `POST /api/v1/auth/verify-email` verifies OTP and sets JWT cookie.

Implementation:
- `server/src/controllers/authController.ts`

Dev note:
- In non-production, the server may return `dev_otp` when email sending is console-mode.
- Do not rely on `dev_otp` in production code.

### 3.4 Curl login example (cookie jar)

The “right” way to curl this API is to persist cookies.
Example outline:
- Step 1: login, save cookie jar.
- Step 2: call protected endpoint using cookie jar.

Pseudo-commands:
```bash
# 1) Login and save cookies
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}'

# 2) Call a protected endpoint with cookies
curl -b cookies.txt http://localhost:3000/api/v1/auth/profile
```

If CSRF is enabled, you must also send `X-CSRF-Token` for unsafe methods.
See the CSRF section below.

---

## 4) CSRF: When Required and How to Send It

### 4.1 CSRF middleware

CSRF protection is implemented in:
- `server/src/middleware/csrfProtection.ts`

It is mounted at:
- `app.use("/api", csrfProtection)` in `server/src/app.ts`.

Key idea:
- Safe methods (`GET`, `HEAD`, `OPTIONS`) issue a CSRF cookie.
- Unsafe methods require a matching header token (double-submit).

### 4.2 When CSRF is enforced

CSRF checks only apply when:
- `CSRF_ENABLED=true`, AND
- the request is unsafe (POST/PUT/PATCH/DELETE), AND
- the request includes a `jwt` cookie (meaning “authenticated session exists”).

This is why login/register endpoints work without CSRF.
After login, your first unsafe call must include CSRF header token.

### 4.3 Token format (HMAC + expiry)

The CSRF token validated by middleware is an HMAC-signed token:
- Format: `nonce.expires.sig`
- Signature: HMAC-SHA256 over `nonce.expires`

If you see CSRF tokens not matching this format in production, align token issuance.
The validator rejects tokens that are:
- missing parts,
- expired,
- signature-mismatched,
- header/cookie mismatched.

### 4.4 Client behavior (auto-injection)

The SPA injects CSRF token automatically in:
- `client/src/lib/api/core.ts`

Rules:
- `apiClient` sets `credentials: "include"` so cookies are sent.
- For unsafe methods, if a CSRF token is known, it sets `X-CSRF-Token`.
- It also injects `X-Org-Id` (see Org section).

The SPA fetches CSRF token using:
- `fetchCsrfToken()` which calls `GET /api/v1/auth/csrf` (via `apiClient("/auth/csrf")`).

### 4.5 Server-side CSRF refresh and rotation

The middleware rotates the CSRF cookie on successful unsafe requests.
So a client may need to keep its in-memory CSRF token updated.

Operational expectation:
- In the SPA, if you refresh token infrequently, you may see CSRF failures.

### 4.6 Client retry behavior on CSRF failure

`client/src/lib/api/core.ts` retries once when:
- response is 403,
- code is `CSRF_FAILED`,
- method is unsafe,
- and it has not already retried.

The retry strategy:
- fetch a fresh CSRF token,
- retry the original request once.

### 4.7 Common CSRF troubleshooting checklist

- Confirm `CSRF_ENABLED` computed value in `server/src/config/env.ts`.
- Confirm your client is storing the CSRF token.
- Confirm unsafe requests send `X-CSRF-Token`.
- Confirm cookie token equals header token.
- Confirm token format is `nonce.expires.sig` if middleware validation is enabled.
- Confirm cookies are actually being sent (CORS + SameSite).
- Capture `X-Request-Id` to correlate logs.

---

## 5) Organization Context (Multi-Tenancy)

### 5.1 The meaning of “org”

An organization (org) is a tenant boundary.
Most domain data is scoped by org.

### 5.2 How the server chooses the active org

Middleware:
- `server/src/middleware/orgContext.ts`

Algorithm:
- If request header `x-org-id` is present, server verifies membership and uses it.
- Otherwise, server uses the default org for that user.

Stored on request:
- `req.org = { orgId, memberId, role, isDefault, defaultOrgId }`

### 5.3 How the client sets the active org

The client stores active org id in a small storage layer:
- `client/src/lib/orgContext.ts`

Then it auto-injects `X-Org-Id` on API calls:
- `client/src/lib/api/core.ts`

### 5.4 What happens when org access is denied

Server may return:
- 403 `ORG_ACCESS_DENIED`

Client behavior:
- If it injected `X-Org-Id` and a safe method gets `ORG_ACCESS_DENIED`,
  it clears active org id and retries once.
- If an unsafe method gets `ORG_ACCESS_DENIED` and the header was injected,
  it clears active org id (no retry by default).

This behavior lives in:
- `client/src/lib/api/core.ts`

---

## 6) Standard Response Shapes and Error Model

### 6.1 Request IDs

Request IDs are created by:
- `server/src/middleware/requestContext.ts`

Behavior:
- Incoming header `x-request-id` is honored if present.
- Otherwise a UUID is generated.
- Response header `X-Request-Id` is always set.

Most JSON responses also include:
- `request_id`

### 6.2 Standard error response

The server uses a standard JSON error body from:
- `server/src/middleware/errorHandler.ts`

Fields:
- `message` (human readable).
- `code` (stable string for programmatic handling).
- `details` (optional structured info).
- `request_id` (trace id).
- `fingerprint` (optional hash for dedup).

Common error codes:
- `VALIDATION_ERROR` (Zod payload invalid).
- `DB_VALIDATION_ERROR` (Mongoose validation).
- `INVALID_ID` (Mongoose cast errors).
- `DUPLICATE_KEY` (Mongo unique constraint).
- `NOT_FOUND` (router not found).
- `SERVICE_UNAVAILABLE` (circuit open).

### 6.3 Client-side error parsing

The client normalizes errors into `ApiError` in:
- `client/src/lib/apiError.ts`

It extracts:
- `status` from HTTP.
- `code` from body.
- `requestId` from body or `X-Request-Id` header.
- `details` from body.

### 6.4 Feature limit errors (402)

When the server returns 402 for quota/entitlement:
- The client may open a feature-limit dialog.

This behavior is in:
- `client/src/lib/api/core.ts`

Expected codes include:
- `FEATURE_LIMIT_REACHED`
- `FEATURE_NOT_AVAILABLE`

Always keep error codes stable because the UI depends on them.

---

## 7) Input Validation: Where Rules Live

The server uses Zod for request validation.
Validation middleware:
- `server/src/middleware/validate.ts`

Schemas live in:
- `server/src/schemas/*`

Examples:
- Transactions query params are in `server/src/schemas/financialDataSchemas.ts`.
- Auth payload schemas are in `server/src/schemas/authSchemas.ts`.

Client-side validation:
- Typically uses Zod too (e.g., forms).

---

## 8) Pagination, Filtering, and Query Patterns (Confirmed Examples)

This section only documents query params that are explicitly present in Zod schemas.

### 8.1 List transactions (`GET /api/v1/transactions`)

Schema:
- `server/src/schemas/financialDataSchemas.ts` → `listTransactionsQuerySchema`

Parameters:
- `page` (positive int, optional).
- `limit` (positive int, max 100, optional).
- `from` (date, optional).
- `to` (date, optional).
- `type` (`income|expense|investment`, optional).
- `category` (string, optional).

Validation rule:
- If both `from` and `to` are provided, `from <= to`.

### 8.2 Recent transactions (`GET /api/v1/transactions/recent`)

Schema:
- `recentTransactionsQuerySchema`

Parameters:
- `limit` (positive int, max 50, optional).

### 8.3 Transactions summary (`GET /api/v1/transactions/summary`)

Schema:
- `transactionsSummaryQuerySchema`

Parameters:
- `from` (date, required).
- `to` (date, required).
- `groupBy` (enum, optional; currently only `"month"`).
- `topCategories` (positive int, max 20, optional).

### 8.4 Portfolio summary (`GET /api/v1/portfolio/summary`)

Schema:
- `portfolioSummaryQuerySchema`

Parameters:
- `months` (positive int, max 36, optional).

---

## 9) Uploads and Binary Payloads

Uploads are handled via multipart form data on the server.
The server uses `multer`.
Receipt OCR also uses raw image bytes when calling AI Core.

Client rule (important):
- In `client/src/lib/api/core.ts`, if `options.body` is a `FormData`,
  it does NOT set `Content-Type` (the browser sets the boundary).

Server rule (important):
- JSON request size limit is `REQUEST_SIZE_LIMIT` from env (default `"1mb"`).
- Upload max bytes are separately controlled (receipt/journal/csv max bytes env values).

---

## 10) Streaming APIs (SSE and AI Streaming)

There are two broad streaming use cases:
- Server → client event stream (domain events / notifications).
- AI Core → server → client streamed LLM output.

### 10.1 Server event stream

Contract path:
- `GET /api/v1/events/stream`

What it likely does:
- Uses SSE to push real-time events scoped to org.

Relevant server modules:
- `server/src/modules/realtime/eventBus.ts`
- `server/src/modules/realtime/domainEventFanout.ts`

Important deployment note:
- In-memory event bus does not work across replicas.
- Redis pubsub event bus does work across replicas (requires Redis).

### 10.2 AI streaming

The server has a streaming helper:
- `streamAiCoreRequest` in `server/src/services/aiCoreClient.ts`

The AI Core has a streaming endpoint:
- `POST /api/agents/process/stream` in `server/AI_Core/api_service.py`

Streaming format:
- AI Core emits `data: ...\n\n` chunks (SSE-like).
- Some chunks may represent tokens, trace entries, or phases.

Client consumption:
- Depends on the server controller formatting.
- Typically the UI will append tokens to an in-progress assistant message.

---

## 11) Domain Endpoint Index (v1) with Notes

This is a curated index.
For the authoritative path+method list, see `packages/contracts/openapi/v1/paths/index.yaml`.

Legend:
- (Auth) means requires JWT.
- (Org) means requires org context.
- (Flag) means gated by env flag.
- (Ent) means gated by entitlements/quota.

### 11.1 Auth (mostly public)

- `GET /api/v1/auth/providers` (Public)
- `GET /api/v1/auth/csrf` (Public; sets CSRF cookie)
- `POST /api/v1/auth/register` (Public)
- `POST /api/v1/auth/login` (Public)
- `POST /api/v1/auth/verify-email` (Public)
- `POST /api/v1/auth/resend-verification` (Public)
- `GET /api/v1/auth/google` (Public; may be 501 if not configured)
- `GET /api/v1/auth/google/callback` (Public)
- `GET /api/v1/auth/profile` (Auth)
- `PUT /api/v1/auth/profile` (Auth)
- `POST /api/v1/auth/password` (Auth)
- `POST /api/v1/auth/logout` (Public-ish; clears cookie)

### 11.2 Config

- `GET /api/v1/config/me` (Auth)

### 11.3 Public shares

- `GET /api/v1/public/shares/financial-story/{token}` (Public token access)

### 11.4 Search

- `GET /api/v1/search` (Auth, Org)

### 11.5 Category rules

- `GET /api/v1/category-rules` (Auth, Org)
- `POST /api/v1/category-rules` (Auth, Org)
- `PATCH /api/v1/category-rules/{id}` (Auth, Org)
- `DELETE /api/v1/category-rules/{id}` (Auth, Org)

### 11.6 Orgs and invites

- `GET /api/v1/orgs/me` (Auth)
- `POST /api/v1/orgs` (Auth)
- `POST /api/v1/orgs/{orgId}/members` (Auth; likely admin/owner)
- `PATCH /api/v1/orgs/{orgId}/settings` (Auth; likely admin/owner)
- `POST /api/v1/org-invites/accept` (Public token + user context)

### 11.7 API keys

- `GET /api/v1/api-keys` (Auth, Org)
- `POST /api/v1/api-keys` (Auth, Org)
- `POST /api/v1/api-keys/{id}/revoke` (Auth, Org)

### 11.8 Usage ledger

- `GET /api/v1/usage/ledger` (Auth, Org)

### 11.9 Billing

- `POST /api/v1/billing/checkout` (Auth, Org, Flag/Ent depending)
- `GET /api/v1/billing/portal` (Auth, Org)
- `POST /api/v1/billing/webhook` (Public webhook; raw body captured in `server/src/app.ts`)

### 11.10 Workflows

- `GET /api/v1/workflows/templates` (Auth, Org)
- `GET /api/v1/workflows` (Auth, Org)
- `POST /api/v1/workflows` (Auth, Org)
- `POST /api/v1/workflows/{id}/run` (Auth, Org, Ent)

### 11.11 Finance: accounts, merchants, budgets, recurring, forecast

- `GET /api/v1/finance/accounts` (Auth, Org)
- `POST /api/v1/finance/accounts` (Auth, Org)
- `PATCH /api/v1/finance/accounts/{id}` (Auth, Org)
- `GET /api/v1/finance/merchants` (Auth, Org)
- `POST /api/v1/finance/merchants` (Auth, Org)
- `GET /api/v1/finance/budgets/{periodKey}/allocations` (Auth, Org)
- `PUT /api/v1/finance/budgets/{periodKey}/allocations` (Auth, Org)
- `GET /api/v1/finance/budgets/{periodKey}/envelopes` (Auth, Org)
- `GET /api/v1/finance/recurring/candidates` (Auth, Org)
- `GET /api/v1/finance/recurring` (Auth, Org)
- `POST /api/v1/finance/recurring` (Auth, Org)
- `PATCH /api/v1/finance/recurring/{id}` (Auth, Org)
- `GET /api/v1/finance/forecast` (Auth, Org)

### 11.12 Exports

- `GET /api/v1/exports` (Auth, Org, Ent)
- `POST /api/v1/exports` (Auth, Org, Ent)
- `GET /api/v1/exports/{id}` (Auth, Org, Ent)
- `GET /api/v1/exports/{id}/download` (Auth, Org, Ent)

### 11.13 Audit

- `GET /api/v1/audit/events` (Auth, Org; likely admin/owner)

### 11.14 Tools (simulate/execute)

- `POST /api/v1/tools/simulate` (Auth, Org)
- `POST /api/v1/tools/execute` (Auth, Org)

Expected pattern:
- “simulate” returns a preview of effects (no writes).
- “execute” performs writes (may publish domain events).

### 11.15 AI endpoints (server-level)

- `POST /api/v1/ai/command` (Auth, Org, Ent)
- `POST /api/v1/ai/stream` (Auth, Org, Ent)
- `POST /api/v1/ai/scenario` (Auth, Org, Ent)

Also present:
- `POST /api/v1/process-command` (Auth, Org, Ent) (legacy-ish alias)
- `POST /api/v1/scenarios/what-if` (Auth, Org, Ent)
- `GET /api/v1/ai-core/status` (Auth)
- `GET /api/v1/ai-core/providers` (Auth; proxies AI Core)

### 11.16 Autopilot

- `POST /api/v1/autopilot/plan` (Auth, Org, Ent)
- `POST /api/v1/autopilot/simulate` (Auth, Org, Ent)
- `POST /api/v1/autopilot/approve` (Auth, Org, Ent)
- `POST /api/v1/autopilot/execute` (Auth, Org, Ent)
- `GET /api/v1/autopilot/runs/{id}` (Auth, Org)

### 11.17 Notifications and events

- `GET /api/v1/notifications` (Auth, Org)
- `POST /api/v1/notifications/{id}/read` (Auth, Org)
- `GET /api/v1/events/stream` (Auth, Org)

### 11.18 Marketplace plugins

- `GET /api/v1/marketplace/catalog` (Auth, Org)
- `POST /api/v1/marketplace/install` (Auth, Org, Ent)
- `GET /api/v1/plugins` (Auth, Org)
- `POST /api/v1/plugins/{id}/update` (Auth, Org)
- `POST /api/v1/plugins/{id}/uninstall` (Auth, Org)

### 11.19 Integrations

- `GET /api/v1/integrations` (Auth, Org)
- `POST /api/v1/integrations/transactions_csv/import` (Auth, Org)
- `GET /api/v1/integrations/{id}/health` (Auth, Org)
- `POST /api/v1/integrations/{id}/connect` (Auth, Org)
- `POST /api/v1/integrations/{id}/disconnect` (Auth, Org)
- `GET /api/v1/integrations/{id}/history` (Auth, Org)
- `POST /api/v1/integrations/{id}/sync` (Auth, Org)

### 11.20 Referrals and shares

- `POST /api/v1/shares/financial-story` (Auth, Org)
- `GET /api/v1/referrals/me` (Auth, Org)
- `POST /api/v1/referrals/redeem` (Auth, Org)

---

## 12) Adding a New Endpoint (Step-by-Step)

This section is “how to do it in this repo”, not a generic Express tutorial.

### 12.1 Pick the right router

Options:
- Add a domain route file under `server/src/routes/*`.
- Or add to `server/src/routes/v1Routes.ts` if it is part of the canonical v1 surface.

Rule of thumb:
- If it is “core platform” (orgs, usage, workflow, tools), put it in v1Routes.
- If it is a large domain, keep a dedicated router file.

### 12.2 Add Zod schema

Add validation schema under:
- `server/src/schemas/*`

Use:
- `.strict()` to reject unknown keys by default.
- `.refine(...)` for cross-field validation (from <= to, etc).

### 12.3 Add controller and service

Controller:
- `server/src/controllers/*`

Service:
- `server/src/services/*`

Guideline:
- Keep controllers thin.
- Put org filtering and business logic in services.

### 12.4 Add tests

Add tests in:
- `server/src/test/*`

Minimum expectations:
- happy path,
- validation errors,
- org isolation where relevant,
- permission/role checks where relevant.

### 12.5 Update route contract list

If you added a new route under `/api/v1`:
- run `npm run generate:openapi` in `server/`
- this updates `packages/contracts/openapi/v1/paths/index.yaml`

Then ensure the route coverage test passes.

---

## 13) API Debugging Toolkit (Practical)

### 13.1 Always capture Request ID

On any bug report, capture:
- HTTP status,
- response `code`,
- response `message`,
- `request_id` or header `X-Request-Id`.

Then search logs by request ID.

### 13.2 Common “it works in dev but not prod” causes

- Cookies blocked (SameSite/secure/domain mismatch).
- CORS origins missing.
- CSRF enabled in prod, disabled in dev.
- AI Core running locally in dev, unreachable in prod.
- Redis optional in dev, required for multi-replica features in prod (pubsub/queues).

### 13.3 Error fingerprinting

The server returns `fingerprint` on many errors.
This can be used by monitoring to deduplicate.
Implementation:
- `server/src/middleware/errorHandler.ts`

---

## 14) Padding Section (Intentional, but Useful)

The items below add line count while serving as a fast checklist for API work.
Use them in PR templates or review notes.

### 14.1 Endpoint readiness checklist

- Route is mounted under `/api/v1`.
- Route has Zod validation (body/query/params).
- Route uses org context if org-scoped.
- Role checks exist where needed.
- Quota/entitlement checks exist where needed.
- Response includes `request_id`.
- Error codes are stable.
- Controller does not contain heavy business logic.
- Tests cover both success and failure cases.
- OpenAPI paths list regenerated if route surface changed.

### 14.2 Client API wrapper checklist

- Wrapper uses `apiClient` from `client/src/lib/api/core.ts`.
- Wrapper passes JSON via `JSON.stringify` where needed.
- Wrapper uses FormData for uploads and does not force Content-Type.
- React Query keys are stable.
- Mutations invalidate relevant query keys.
- 401/403 errors are handled (redirect, message, clear org id).

### 14.3 Integration checklist (external consumers)

- Use cookie jar if authenticating via browser session.
- If using API keys, include the required headers (verify in server middleware).
- Send `X-Request-Id` to help tracing.
- If CSRF is enabled and you are using cookie auth:
  - fetch CSRF cookie on a safe request,
  - send `X-CSRF-Token` equal to cookie value.
- Set `X-Org-Id` to target the right tenant.

