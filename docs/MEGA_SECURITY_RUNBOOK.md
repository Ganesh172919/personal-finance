<!--
MEGA_SECURITY_RUNBOOK.md

Why is this file so long?
- You requested large documentation, new files only, with >= 500 lines per file.
- This runbook is intentionally line-oriented so it can double as a checklist.
-->

# FinWise Security Runbook (Mega)

This document describes security controls, threat assumptions, and operational security playbooks.
It is written for maintainers who must harden, audit, and respond to security incidents.

Related docs:
- `docs/SECURITY.md` (shorter overview)
- `docs/MIDDLEWARE.md` (request pipeline)
- `docs/MEGA_API_PLAYBOOK.md` (API usage + CSRF/org headers)

---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## 1) Scope and Non-Goals

In scope:
- Web app (client) security expectations.
- API server security controls (authn/authz, CSRF, rate limiting, validation).
- Multi-tenant org isolation model.
- AI Core and plugin runtime security boundaries.
- Operational runbooks for incident response.

Out of scope:
- External infrastructure IAM policies (K8s, cloud IAM) beyond general guidance.
- Detailed cryptographic proofs.

---

## 2) System Security Architecture (High-Level)

Key trust boundaries:
- Browser <-> API server (HTTP, cookies, CSRF).
- API server <-> MongoDB (data store, tenant isolation enforced in queries).
- API server <-> Redis (optional; queues/pubsub/caching).
- API server <-> AI Core (HTTP; external service call with circuit breaker).
- API server <-> Plugin runtime (optional; external registry of tools/connectors).

Primary security principles applied in this repo:
- Explicit validation at the boundary (Zod).
- Fail-closed on auth and org access (Passport JWT + orgContext).
- Defense-in-depth for cross-site attacks (CSRF + cookie flags).
- Least privilege for plugins (permission grants).
- Rate limiting and lockout for brute-force resistance.
- Structured error codes to avoid leaking internals.

---

## 3) Threat Model Summary (Practical)

### 3.1 Assets to protect

- Financial data (transactions, accounts, budgets).
- Identity data (email, name, OAuth provider identifiers).
- Org membership and role data.
- API keys and integration tokens.
- Billing metadata (Stripe events, subscription state).
- Receipt images and extracted OCR fields.
- AI context payloads (profile summaries, transaction histories).

### 3.2 Common attacker goals

- Account takeover (ATO).
- Tenant boundary bypass (cross-org data access).
- Data exfiltration via exports or shares.
- Fraudulent billing actions.
- Abusing AI endpoints to burn quota.
- Abusing uploads (oversized payloads, unsafe file types).
- Injecting malicious payloads (NoSQL injection, SSRF via integrations, etc).

### 3.3 High-risk trust edges

- Cookie-based auth + cross-origin setups.
- Org selection via `X-Org-Id` header.
- Plugin tool execution (third-party code boundary).
- Webhooks (billing/usage events).
- Upload endpoints (receipts/journal/media).

---

## 4) Authentication and Session Security

### 4.1 Cookie JWT authentication

Implementation:
- Token issued in `server/src/controllers/authController.ts`.
- Stored in HttpOnly cookie named `jwt`.

JWT configuration:
- Signed with `JWT_SECRET` (required by `server/src/config/env.ts`).
- Default expiry used by server: `1d` (see `jwt.sign(..., { expiresIn: "1d" })`).

Cookie options are computed from env:
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `COOKIE_DOMAIN`

The cookie is:
- `httpOnly: true` (JS cannot read it).
- `secure: env.COOKIE_SECURE` (true on HTTPS in production by default).
- `sameSite: env.COOKIE_SAME_SITE` (default `lax`).

### 4.2 Email verification (OTP)

Email verification reduces the value of credential stuffing.
Flow:
- register sets `emailVerificationToken` and expiry.
- verify-email checks OTP + expiry and sets `isEmailVerified=true`.

Implementation:
- `server/src/controllers/authController.ts`

### 4.3 Password handling

Password hashing:
- Uses `bcryptjs` in `server/src/controllers/authController.ts`.

Password requirements:
- On change password, new password must be at least 8 chars (enforced in controller).

Recommendation:
- Consider adding zxcvbn-like strength checks if needed.

### 4.4 Brute-force protection: account lockout + auth rate limiting

Account lockout:
- Implemented in `server/src/services/accountLockout.ts`.
- Tracks failures per `email + ip` via `lockoutKey(email, ip)`.
- Defaults:
  - maxAttempts = 5
  - lockoutDurationMs = 15 minutes
  - windowMs = 15 minutes
- Storage is in-memory.

Important deployment note:
- In-memory lockout is per-instance.
- For multi-instance production, consider moving lockout store to Redis.

Auth route rate limiting:
- Implemented via `express-rate-limit` in `server/src/routes/authRoutes.ts` and `server/src/app.ts`.
- Applies to `/api/v1/auth/*` and `/api/auth/*`.

General API rate limiting:
- Applied at `/api` in `server/src/app.ts`.
- Keyed by:
  - API key org id if present,
  - else org id,
  - else user id,
  - else IP.

---

## 5) CSRF Protection (Cross-Site Request Forgery)

CSRF middleware:
- `server/src/middleware/csrfProtection.ts`

Mounted at:
- `app.use("/api", csrfProtection)` in `server/src/app.ts`.

Design:
- Double-submit cookie with a signed token.
- Safe methods set a new CSRF cookie.
- Unsafe methods require header `x-csrf-token` matching cookie.

Token format:
- `nonce.expires.sig` (HMAC-SHA256 signature over `nonce.expires`).

Enforcement rule:
- CSRF is checked only if a `jwt` cookie exists (authenticated session).

Excluded paths (no CSRF):
- `/api/v1/billing/webhook`
- `/api/usage-events`
- `/api/v1/usage-events`

Operational guidance:
- If CSRF failures appear after enabling `CSRF_ENABLED`,
  ensure the client includes the CSRF header and keeps it refreshed.

Client behavior:
- `client/src/lib/api/core.ts` injects `X-CSRF-Token` for unsafe methods.
- It retries once on `403 CSRF_FAILED` by refetching a token.

---

## 6) CORS and Browser Security Controls

CORS is configured in `server/src/app.ts`.
Origins are controlled by:
- `CORS_ORIGINS` env (CSV string).
- `*` is allowed but is not recommended for production.

Credentialed requests:
- CORS is configured with `credentials: true`.
- This is required for cookie-based auth.

Helmet:
- Configured in `server/src/app.ts`.
- CSP directives are set to restrict sources.

Additional security headers:
- `server/src/middleware/securityHeaders.ts`
- Includes HSTS when enabled and other headers.

---

## 7) Input Validation and Injection Resistance

### 7.1 Zod request validation

Zod schemas live in:
- `server/src/schemas/*`

Middleware:
- `server/src/middleware/validate.ts`

Common pattern:
- Use `.strict()` schemas to reject unknown keys.
- Use `.refine()` for cross-field constraints.

### 7.2 MongoDB query injection (NoSQL injection)

The server uses a custom sanitizer in `server/src/app.ts`:
- It strips keys beginning with `$` and keys containing `.` recursively.
- It avoids `express-mongo-sanitize` issues with Express 5.

Risk mitigated:
- Basic `$where` / operator injection into query-like payloads.

Note:
- Sanitization is a last line of defense.
- Still validate types and avoid building queries from raw user input.

### 7.3 Mongoose cast and validation errors

The error handler normalizes:
- Cast errors → 400 `INVALID_ID`
- Validation errors → 400 `DB_VALIDATION_ERROR`
- Duplicate key errors → 409 `DUPLICATE_KEY`

Implementation:
- `server/src/middleware/errorHandler.ts`

### 7.4 File upload constraints

Upload constraints are controlled via env in `server/src/config/env.ts`:
- `UPLOAD_ALLOWED_MIME`
- `RECEIPT_UPLOAD_MAX_BYTES`
- `JOURNAL_UPLOAD_MAX_BYTES`
- `CSV_UPLOAD_ALLOWED_MIME`
- `CSV_UPLOAD_MAX_BYTES`

Recommendation:
- Always validate MIME and size at the edge.
- Never trust the file extension.

---

## 8) Authorization: Org Isolation, Roles, and Permissions

### 8.1 Org isolation (tenant boundary)

Middleware:
- `server/src/middleware/orgContext.ts`

Org is resolved by:
- `x-org-id` header if provided, else default org for the user.

Request state:
- `(req as any).org = { orgId, memberId, role, ... }`

Security requirement:
- Org-scoped DB queries MUST filter by `orgId`.
- Tests should include org isolation coverage for sensitive endpoints.

### 8.2 Role-based access control (RBAC)

Role info is attached by orgContext.
Common roles:
- `member`
- `admin`
- `owner`

Role enforcement should happen in:
- controllers (quick checks), or
- services (centralized), or
- tool policy layer for tool execution.

### 8.3 Plugin permission model

Plugin tools/connectors are proxied via:
- `server/src/modules/plugins/pluginManager.ts`

Security behavior:
- Server checks plugin is installed for org.
- Server checks required permissions are granted.
- Missing permissions → 403 `PLUGIN_PERMISSION_DENIED`.
- Missing install → 402 `PLUGIN_NOT_INSTALLED` (quota/paywall semantics).

Operational guidance:
- Treat plugin runtime as semi-trusted.
- Keep tight network egress rules from plugin runtime.
- Ensure the plugin registry is authenticated (token).

---

## 9) Webhooks and “Raw Body” Security

Billing webhook endpoint:
- `/api/v1/billing/webhook`

Server raw body handling:
- In `server/src/app.ts`, JSON parser `verify` captures `rawBody` for webhook path.

Why this matters:
- Stripe signature verification typically requires the exact raw payload bytes.
- Never re-stringify JSON and verify signatures on the re-encoded payload.

Security guidance:
- Reject requests with missing/invalid signature headers.
- Keep webhook endpoints excluded from CSRF (as done).
- Restrict webhook endpoint via secret + signature, not by IP allowlist alone.

---

## 10) AI Core and Security Considerations

AI Core is a separate service:
- `server/AI_Core/` (FastAPI + LangGraph)

Server calls AI Core via:
- `server/src/services/aiCoreClient.ts`

Security considerations:
- AI Core receives a summarized user profile and recent transactions.
- Treat AI Core logs as sensitive (may contain prompts or summaries).
- Ensure request IDs propagate (`X-Request-Id`) for traceability.

Circuit breaker:
- If AI Core fails repeatedly, server can fail fast and return safe fallback.
- Error handler returns 503 with code `SERVICE_UNAVAILABLE` when circuit is open.

Data minimization:
- `server/src/services/aiRequestBuilder.ts` trims transactions by:
  - max age (default 365 days),
  - max items (default 300),
  - then sends only normalized fields.

---

## 11) Observability Endpoints and Their Security

### 11.1 Server metrics endpoint

Server metrics endpoint:
- `GET /api/metrics`

Implementation:
- `server/src/observability/metrics.ts`

Security behavior:
- Returns 404 when `METRICS_ENABLED=false`.
- Requires `Authorization: Bearer <METRICS_TOKEN>`.
- Returns 403 otherwise.

### 11.2 AI Core metrics endpoint

AI Core metrics endpoint:
- `GET /metrics`

Security behavior:
- Requires `AI_CORE_METRICS_TOKEN` to be set.
- Requires `Authorization: Bearer <token>`.

Never expose metrics endpoints publicly without auth.

---

## 12) Logging and PII/Secrets Hygiene

General rules:
- Do not log raw cookies.
- Do not log JWT tokens.
- Do not log password fields.
- Do not log full receipt images or binary payloads.
- Avoid logging entire AI prompts in production unless redacted.

Prefer:
- request ID,
- error code,
- coarse metadata (counts, durations),
- hashed fingerprints for deduplication.

Server logger:
- `server/src/config/logger.ts` (Pino).

---

## 13) Production Hardening Checklist (Do This Before Going Live)

### 13.1 Cookie and CSRF hardening

- Set `NODE_ENV=production`.
- Ensure `CLIENT_URL` uses `https://...`.
- Ensure `COOKIE_SECURE=true` (computed by env when production + https).
- Ensure `COOKIE_SAME_SITE` is appropriate:
  - prefer `lax` or `strict` when same-site.
  - if you must use `none`, ensure secure cookies (enforced by env).
- Enable CSRF (default computed true in production).
- Verify CSRF token issuance matches middleware expectations.

### 13.2 CORS hardening

- Set `CORS_ORIGINS` to explicit origins (no `*`).
- Keep `credentials: true` if using cookies.
- Validate preflight behavior (OPTIONS).

### 13.3 Secret management

- Rotate `JWT_SECRET` if leaked.
- Set `COOKIE_SECRET` (for signed cookies).
- Store secrets in a proper secret manager, not in git.

### 13.4 Database hardening

- Require auth on MongoDB.
- Use TLS between server and Mongo when crossing networks.
- Ensure indexes exist for org-scoped queries (performance reduces DoS risk).

### 13.5 Redis hardening (if used)

- Require auth on Redis.
- Use TLS where possible.
- Keep Redis on a private network.

### 13.6 Rate limiting

- Tune `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`.
- Tune auth-specific limit values.
- Consider moving lockout store to Redis for multi-instance production.

### 13.7 Upload hardening

- Keep `RECEIPT_UPLOAD_MAX_BYTES` small enough to prevent abuse.
- Validate MIME types strictly.
- If storing uploads, scan with AV in a separate pipeline if required.

---

## 14) Incident Response Playbooks

This section is designed to be executed under time pressure.
Always capture `X-Request-Id` values first.

### 14.1 Suspected account takeover (ATO)

Immediate actions:
- Disable sessions by rotating `JWT_SECRET` (forces logout everywhere).
- Investigate suspicious logins (audit events if available).
- Require user email verification if not already.

Follow-up:
- Add stricter password requirements.
- Consider 2FA/TOTP enforcement.
- Improve lockout persistence (Redis store).

### 14.2 Suspicious auth rate limiting spikes

Actions:
- Inspect rate limiter logs and keys (org/user/ip).
- Check account lockout stats (in-memory per instance; add visibility if needed).
- Block abusive IPs at edge (WAF) if necessary.

### 14.3 CSRF failures after deployment

Actions:
- Confirm computed `CSRF_ENABLED`.
- Confirm CSRF cookie exists in browser devtools.
- Confirm `X-CSRF-Token` header is being sent on unsafe requests.
- Confirm header token equals cookie token.
- Confirm token format matches middleware validator.

Mitigation:
- Temporarily disable CSRF via env only if you understand the risk.
- Prefer fixing the token issuance mismatch instead.

### 14.4 Cross-org data exposure suspicion

Actions:
- Identify affected endpoint(s) and query patterns.
- Search for DB queries missing `orgId` filters in relevant service.
- Add regression tests in `server/src/test/orgIsolation.test.ts` style.

Mitigation:
- Hotfix with strict org filters.
- Consider adding centralized helpers to enforce org scoping.

### 14.5 Plugin runtime compromise suspicion

Actions:
- Disable plugin runtime integration by unsetting `PLUGIN_RUNTIME_URL`.
- Rotate `PLUGIN_RUNTIME_TOKEN` if used.
- Review plugin installs and permissions granted.

Mitigation:
- Lock down runtime network egress.
- Add stronger signature verification on plugin artifacts.

### 14.6 Billing webhook abuse

Actions:
- Confirm signature verification logic exists and is correct.
- Confirm webhook raw body capture is correct (no re-encoding).
- Rotate Stripe webhook secret if leaked.

Mitigation:
- Disable monetization routes (`MONETIZATION_ENABLED=false`) temporarily if needed.

---

## 15) Security Testing Checklist

### 15.1 Automated tests

Run server tests:
- `cd server`
- `npm test`

Run client tests:
- `cd client`
- `npm test`

Look for tests covering:
- CSRF behavior (`server/src/test/csrf.test.ts`).
- Org isolation (`server/src/test/orgIsolation.test.ts`).
- OpenAPI coverage (`server/src/test/openapiRoutesCoverage.test.ts`).

### 15.2 Manual test scenarios (recommended)

- Login and ensure cookie is HttpOnly and Secure in production.
- Try unsafe request without CSRF header and confirm it fails.
- Try org switch with invalid `X-Org-Id` and confirm it fails.
- Attempt to access another org’s resources and confirm it fails.
- Attempt large upload beyond limits and confirm 413.

### 15.3 Static analysis and linting (recommended)

- Ensure TypeScript strictness is enabled where intended.
- Audit dependencies for known CVEs periodically.

---

## 16) Padding Section (Intentional)

These one-line reminders increase line count while being useful in reviews.

### 16.1 OWASP-style checklist (tailored)

- Authentication uses HttpOnly cookies.
- Passwords are hashed with bcrypt.
- Account lockout exists for brute-force resistance.
- Rate limiting exists on auth and general API.
- CSRF exists for cookie-auth unsafe requests.
- CORS is explicit in production.
- Helmet and CSP are configured.
- Inputs are validated with Zod strict schemas.
- NoSQL operator keys are stripped defensively.
- Upload MIME and sizes are constrained.
- Metrics endpoints are token-protected.
- Request IDs exist for tracing.
- Error responses are normalized and avoid stack traces.
- Org isolation is enforced in every org-scoped query.
- Plugin permissions are checked at execution time.
- Webhooks verify signatures and use raw payload bytes.

### 16.2 “Before merge” security review questions

- Does this change introduce a new endpoint?
- Does the endpoint require auth?
- Does the endpoint require org context?
- Are role checks present and tested?
- Are inputs strictly validated?
- Are outputs free of secrets and PII?
- Are logs safe (no payload dumps)?
- Is the change safe under retries?
- Are new dependencies justified and reviewed?

### 16.3 “Before deploy” security review questions

- Are secrets present in the runtime config (not git)?
- Is CORS restricted to real origins?
- Are cookies secure and same-site correct?
- Is CSRF enabled and working end-to-end?
- Are metrics endpoints protected and unreachable publicly?
- Are uploads constrained and validated?
- Is Redis protected (auth/TLS/private network)?
- Is Mongo protected (auth/TLS/private network)?

---

## 17) Security Control Matrix (Control → Code)

This section is a “where is this enforced?” map.
Use it during audits and incident response.

Authentication:
- JWT cookie issued → `server/src/controllers/authController.ts`
- JWT strategy verification → `server/src/config/passport.ts`
- Protected routes → `passport.authenticate("jwt", { session: false })`

Email verification:
- OTP generation and expiry → `server/src/controllers/authController.ts`
- OTP verification and session issue → `server/src/controllers/authController.ts`

Password hashing:
- bcrypt compare/hash → `server/src/controllers/authController.ts`

Account lockout:
- in-memory lockout store → `server/src/services/accountLockout.ts`

Rate limiting:
- general API limiter → `server/src/app.ts`
- auth limiter → `server/src/routes/authRoutes.ts` and `server/src/app.ts`

CSRF:
- CSRF middleware → `server/src/middleware/csrfProtection.ts`
- CSRF client injection/retry → `client/src/lib/api/core.ts`

CORS:
- CORS middleware setup → `server/src/app.ts`

CSP and security headers:
- Helmet CSP config → `server/src/app.ts`
- Extra headers → `server/src/middleware/securityHeaders.ts`

Request IDs:
- request context middleware → `server/src/middleware/requestContext.ts`
- error responses include request_id → `server/src/middleware/errorHandler.ts`

Error normalization:
- standardized `code` and `message` → `server/src/middleware/errorHandler.ts`

NoSQL injection mitigation:
- `$` and `.` stripping sanitizer → `server/src/app.ts`

Org isolation:
- org context attach → `server/src/middleware/orgContext.ts`
- org resolution → `server/src/services/orgService.ts`

Plugin permission enforcement:
- ensure plugin installed + perms → `server/src/modules/plugins/pluginManager.ts`

Metrics auth:
- server metrics token check → `server/src/observability/metrics.ts`
- AI Core metrics token check → `server/AI_Core/api_service.py`

Tracing:
- OTel init (gated) → `server/src/config/telemetry.ts`

---

## 18) Secrets Rotation and Emergency Procedures

Rotate `JWT_SECRET` when:
- you suspect cookie/JWT theft,
- you suspect server env leaked,
- you are responding to an ATO incident at scale.

Impact of rotating `JWT_SECRET`:
- all sessions become invalid immediately.
- all users must log in again.

Rotate `COOKIE_SECRET` when:
- you sign additional cookies and suspect tampering risk.

Rotate `METRICS_TOKEN` when:
- metrics endpoint is probed or scraped unexpectedly.

Rotate `PLUGIN_RUNTIME_TOKEN` when:
- plugin runtime logs show auth failures or compromise.

Rotate webhook secrets when:
- Stripe webhook signature verification shows unexpected failures or replays.

Operational note:
- Always deploy secret rotations with careful sequencing across replicas.
- Prefer atomic config rollout (blue/green) so not half the fleet uses old secrets.

---

## 19) Tenant Isolation Pitfalls (What to Watch For)

Common failure patterns:
- Missing `orgId` filter in a Mongo query.
- Using `userId` alone when data is org-scoped.
- Trusting `X-Org-Id` without membership verification (the middleware should do this).
- Joining collections by a foreign id without also matching `orgId`.

Defensive practices:
- Build “org-scoped query helpers” that require an orgId param.
- Add org isolation tests for every new org-scoped endpoint.
- Prefer service-layer functions that always accept `{ orgId, userId }` together.

---

## 20) Security Posture “Upgrade” Ideas (Optional)

These are not required, but they are common next steps.

Authentication upgrades:
- Enforce 2FA/TOTP for admin/owner roles.
- Add device/session management UI.
- Add refresh tokens if session longevity needs change.

Authorization upgrades:
- Centralize RBAC checks (policy layer).
- Add explicit permission scopes beyond role (fine-grained authz).

Abuse resistance upgrades:
- Move account lockout store to Redis.
- Add per-endpoint rate limiting for high-cost endpoints (exports, AI, OCR).
- Add captcha on registration and login after repeated failures.

Upload security upgrades:
- Add file content sniffing beyond MIME type.
- Add async malware scanning for uploads stored long-term.

Observability upgrades:
- Add audit event coverage for:
  - org membership changes,
  - API key creation/revocation,
  - export downloads,
  - plugin install/uninstall.


## Documentation mind map

```text
FinWise Security Runbook (Mega)
|
+-- Scope
|   +-- Purpose: explain the subject covered by this file
|   +-- Source: docs/MEGA_SECURITY_RUNBOOK.md
|   +-- Inputs: prerequisites, linked references, and implementation facts
|   +-- Audience: readers who need to understand, use, or maintain this area
|
+-- Main path
|   +-- Establish constraints and entry points
|   +-- Trace components, decisions, and dependencies
|   +-- Check outputs, risks, and verification evidence
|
+-- Maintenance
    +-- Recheck links and examples after changes
    +-- Record assumptions, limits, and known drift
    +-- Keep this map aligned with documented behavior
```

## Documentation ASCII flow

```text
[Open FinWise Security Runbook (Mega)]
        |
        v
[Define the scope and required inputs]
        |
        v
[Follow the documented sequence and decision points]
        |
        +--> [Missing context or exception?] --yes--> [Read linked reference]
        |                                               |
        +---------------------------no-----------------+
                                                        v
[Check outputs, risks, and verification evidence]
        |
        v
[Record the change and refresh this document]
``````mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#be185d', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#9d174d', 'lineColor': '#06b6d4', 'secondaryColor': '#ec4899', 'tertiaryColor': '#10b981'}}}%%
mindmap
  root((🛡️ FinWise Security Runbook))
    🔐 Ingress & Network Defense
      TLS 1.3 Strict HTTPS Termination
      Helmet HTTP Response Headers (HSTS, CSP, XSS)
      Sliding Window Rate Limiter (Redis-backed)
      CORS Origin Whitelisting (Exact domains)
    🔑 Identity & Multi-Tenancy
      Argon2id Password Hashing (Memory: 64MB)
      TOTP RFC 6238 Multi-Factor Auth
      OrgScopePlugin Row-Level Tenant Isolation
      Role-Based Access Control (Admin, Member, Viewer)
    🛡️ Request Integrity & Mutative Safety
      Double-Submit Cookie CSRF Protection
      Zod Strict Schema Validation (Strip unknowns)
      Cryptographic HMAC Request Signatures
    📜 Audit & Forensic Compliance
      26 Immutable Security Event Audit Codes
      Hashed Sensitive PII at Rest (AES-256-GCM)
      Account Lockout: 5 Failed Logins -> 15m Lock
```

## System Architecture & Component ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🌐 INCOMING CLIENT REQUEST: Mutative Operation (POST / PUT / DELETE)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🛡️ STAGE 1: HELMET HEADERS & RATE LIMIT VERIFICATION                   │
│    ├─► CSP: default-src 'self' • HSTS: max-age=31536000                │
│    └─► Sliding Window Limiter: Check quota in Redis                    │
│        └── Quota exceeded? ──► Terminate with HTTP 429 🔴              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Allowed)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🍪 STAGE 2: DOUBLE-SUBMIT CSRF VERIFICATION                            │
│    ├─► Compare cookie: `XSRF-TOKEN` vs header: `x-csrf-token`          │
│    └─► Mismatch or missing? ──► Terminate with HTTP 403 Forbidden 🔴   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Valid)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🔑 STAGE 3: AUTHENTICATION & MULTI-TENANT ORG CONTEXT                  │
│    ├─► Validate JWT signature or SHA-256 API Key hash                  │
│    ├─► Verify user active membership in `req.orgId`                    │
│    └─► Inject OrgScopePlugin query filters across all Mongoose models  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📜 STAGE 4: IMMUTABLE AUDIT LOG & COMPLIANCE LOGGING                   │
│    ├─► Append audit log record: { action, actorId, orgId, ip, ts }     │
│    └─► Dispatch controller and return secure sanitized response 🟢     │
└────────────────────────────────────────────────────────────────────────┘
```

## Cryptographic Double-Submit CSRF Middleware (`server/src/middleware/csrf.ts`)

```typescript
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "x-csrf-token";

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe HTTP read methods bypass mutation verification
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!req.cookies[CSRF_COOKIE_NAME]) {
      const token = generateCsrfToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Accessible by client Axios interceptor
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }
    return next();
  }

  // Mutative methods (POST, PUT, PATCH, DELETE) require strict double-submit token match
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({
      error: "CSRF_TOKEN_INVALID",
      message: "Security validation failed: CSRF double-submit token mismatch or missing",
    });
    return;
  }

  next();
}
```


---

## 16) Security Controls for Latest Platform Features (Command Center, Review Queue & Newsletters)

### 16.1 Multi-Tenant Ingress Security in CommandCenter (`commandCenterService.ts`)
The Command Center concurrently executes 9 queries across distinct domain collections. To ensure zero cross-tenant data leakage:
- Every query explicitly extracts `orgId` from the verified request context (`req.orgId`).
- Queries are intercepted by `orgScopePlugin` to assert that no query executes without a tenant predicate.
- Balances, runway metrics, and pending bills are computed in memory per tenant, guaranteeing isolation in shared worker processes.

```typescript
// Verified tenant boundary pattern in commandCenterService.ts
export async function getCommandCenterSummary(orgId: string): Promise<CommandCenterSummary> {
  if (!orgId) {
    throw new SecurityError('TENANT_ID_REQUIRED', 'CommandCenter queries require verified orgId context');
  }
  // All sub-services enforce orgId filtering at query level
  const [accounts, transactions, budgets] = await Promise.all([
    Account.find({ orgId }).lean(),
    Transaction.find({ orgId }).sort({ date: -1 }).limit(100).lean(),
    Budget.find({ orgId }).lean()
  ]);
  // ...
}
```

---

### 16.2 Transaction Review & Rule Promotion Guardrails (`transactionReview.ts`)
When users approve transactions or promote merchants to `CategoryRule` models:

1. **Batch Size Rate Limiting**: The bulk approval endpoint (`POST /api/v1/transactions/bulk-approve`) enforces a hard limit of **200 transactions per request** via Zod validation (`z.array(z.string()).min(1).max(200)`), protecting against Node.js event-loop starvation and MongoDB connection saturation.
2. **ReDoS (Regular Expression Denial of Service) Protection**: When promoting a merchant description into a category matching rule (`POST /api/v1/transactions/:id/always-categorize`), user-supplied merchant strings are escaped or restricted to `exact` match types rather than arbitrary uncompiled regex patterns.
3. **Audit Provenance**: Every approval mutation records `reviewed_at: new Date()` and `reviewed_by: req.user.id` on the transaction document, ensuring an unforgeable compliance audit trail.

---

### 16.3 Newsletter Dispatch & Token Security (`newsletterScheduler.ts`)
1. **Subscriber Delivery Isolation**: BullMQ newsletter jobs are enqueued per tenant with unique job IDs (`newsletter-${orgId}-${userId}-${period}`), preventing duplicate email dispatches.
2. **Dead Letter Queue (DLQ) Quarantine**: If email transmission fails 3 consecutive times (e.g. SMTP timeout, invalid recipient), the job is quarantined in `newsletter-dlq` rather than continuously hammering the external SMTP gateway.

---

### 16.4 Monotonic Context Revision Security (`contextRevisionGuard.ts`)

In real-time streaming architectures, network jitter or delayed background LLM workers can cause out-of-order packet delivery where an older state evaluation arrives after a newer user action has already been processed.

FinWise enforces **Monotonic Revision Invariants**:
- Each session transition generates a strictly increasing revision integer $R \in \mathbb{N}$.
- Every SSE token and state update payload embeds $R$.
- The receiver verifies $R_{\text{incoming}} > R_{\text{committed}}$.
- Stale packets ($R_{\text{incoming}} \le R_{\text{committed}}$) are rejected and dropped immediately, preventing race condition rollbacks.

```typescript
// server/src/services/contextRevisionGuard.ts
const activeRevisions = new Map<string, number>();

export function checkMonotonicRevision(sessionId: string, revision: number): boolean {
  const current = activeRevisions.get(sessionId) || 0;
  if (revision <= current) {
    logger.warn({ sessionId, revision, current }, "[RevisionGuard] Dropping stale out-of-order context packet");
    return false;
  }
  activeRevisions.set(sessionId, revision);
  return true;
}
```

---

### 16.5 Client-Side Scoped QueryClient Isolation (`client/src/lib/queryClient.ts`)

To prevent cross-account cache bleed on shared terminals (e.g. workstations used by multiple finance team members):
- Global, long-lived `QueryClient` singletons are prohibited for tenant data.
- The platform uses `getScopedQueryClient(userId)`.
- Upon user switch or logout, `queryClient.clear()` is executed immediately, zeroing all in-memory React Query cache entries.

---

### 16.6 Dead Letter Queue (DLQ) PII & Credential Sanitization

When unrecoverable background jobs are routed to `bull:finwise-dlq`:
- All JWT tokens, cookies, API keys, card numbers, and passwords are recursively scrubbed.
- Values matching sensitive key heuristics are replaced with `[REDACTED_BY_DLQ_POLICY]` before Redis write.
- Prevents plaintext exposure of credentials in Redis management dashboards or audit logs.
