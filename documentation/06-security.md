# Security Documentation

**Project:** FinWise Personal Finance Platform
**Last Updated:** March 2026
**Version:** 1.0

---

## Table of Contents

1. [Security Overview](#1-security-overview)
2. [Authentication](#2-authentication)
3. [Authorization](#3-authorization)
4. [Data Protection](#4-data-protection)
5. [Security Headers & Middleware](#5-security-headers--middleware)
6. [Rate Limiting](#6-rate-limiting)
7. [Audit Logging](#7-audit-logging)
8. [Session Management](#8-session-management)
9. [API Security](#9-api-security)
10. [Email Security](#10-email-security)
11. [Stripe Integration Security](#11-stripe-integration-security)
12. [Security Best Practices Followed](#12-security-best-practices-followed)
13. [Security Checklist](#13-security-checklist)
14. [Incident Response](#14-incident-response)

---

## 1. Security Overview

### Security Philosophy

FinWise follows a **defense-in-depth** security model where every layer of the application independently validates, authenticates, and authorizes requests. No single mechanism is relied upon as the sole line of defense. The core principles are:

- **Zero trust by default** — all inputs are treated as untrusted until validated
- **Least privilege** — every component operates with the minimum permissions required
- **Fail closed** — errors default to denying access rather than granting it
- **Immutable audit trails** — security-relevant events are logged in append-only stores
- **Secure defaults** — every configuration choice defaults to the most restrictive option

### Threat Model

| Threat Category | Attack Vector | Mitigation |
|---|---|---|
| Unauthorized access | Credential stuffing, brute force | Account lockout (5 attempts/15 min), rate limiting (20 req/min on auth), bcrypt hashing |
| Session hijacking | XSS, network interception | HTTP-only cookies, `SameSite` policy, configurable secure flag, CSRF tokens |
| Data exfiltration | Cross-org queries, injection | Org-scoped queries, NoSQL injection sanitization, Zod validation, orgScopePlugin |
| API abuse | DDoS, scraping, enumeration | Tiered rate limiting (200 general / 20 auth), API key scopes, quota enforcement |
| Payment fraud | Webhook forgery, replay | Stripe signature verification, raw body capture, idempotent handlers |
| Privilege escalation | Role manipulation, scope bypass | Server-side RBAC, scoped API keys, org context middleware |
| File-based attacks | Malicious uploads, polyglot files | MIME type validation, magic-byte verification, size limits, memory storage |

### Compliance Considerations

- **PCI-DSS:** Stripe handles all card data; FinWise never stores raw card numbers. Only Stripe customer IDs and subscription metadata are persisted.
- **GDPR:** User data is scoped to organizations with clear ownership. Audit logs support data access and deletion requests.
- **SOC 2:** Comprehensive audit logging (AuditLog + AuditEvent models), request ID tracking, and immutable security event records support SOC 2 Type II requirements.

---

## 2. Authentication

FinWise supports four authentication mechanisms, each designed for specific use cases.

### 2.1 JWT Cookie-Based Authentication

**Primary mechanism** for web application sessions.

| Property | Value |
|---|---|
| Library | `passport-jwt` |
| Token location | HTTP-only cookie named `jwt` |
| Secret | `JWT_SECRET` (required environment variable) |
| Session mode | Stateless (`session: false`) |
| User resolution | `UserModel.findById(jwtPayload.id)` on every request |

**Cookie configuration:**

| Setting | Default | Production |
|---|---|---|
| `httpOnly` | `true` | `true` |
| `secure` | Computed from `NODE_ENV` + `CLIENT_URL` | `true` (requires HTTPS) |
| `sameSite` | `lax` | `strict` or `lax` |
| `domain` | Unset (defaults to current host) | Configurable via `COOKIE_DOMAIN` |

**Passport JWT strategy configuration** (`server/src/config/passport.ts`):

```typescript
passport.use(
  "jwt",
  new JwtStrategy(
    {
      jwtFromRequest: req => req?.cookies?.jwt || null,
      secretOrKey: env.JWT_SECRET,
    },
    async (jwtPayload, done) => {
      const user = await UserModel.findById(jwtPayload.id);
      return user ? done(null, user) : done(null, false);
    }
  )
);
```

**Key security properties:**

- Tokens are never exposed to JavaScript (HTTP-only cookie)
- Each request re-validates the user against the database (no stale sessions)
- Failed authentication returns `false` without revealing whether the user exists

### 2.2 Google OAuth 2.0

**Secondary mechanism** for social login.

| Property | Value |
|---|---|
| Library | `passport-google-oauth20` |
| Scopes | `profile`, `email` |
| Auto-verify | Yes — Google-authenticated users are marked `isEmailVerified: true` |
| Account linking | Existing email accounts are linked to Google profiles automatically |
| Conditional activation | Only enabled when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set |

**Account creation flow:**

1. Check for existing user by `googleId` — return if found
2. Check for existing user by `email` — link Google profile if found
3. Create new user with `authProvider: "google"` and `isEmailVerified: true`

**Security considerations:**

- Google credentials are optional; endpoints return `501 OAUTH_NOT_CONFIGURED` when not set
- No tokens are stored — only the Google profile ID is persisted
- Email verification is inherited from Google's identity verification

### 2.3 TOTP Two-Factor Authentication

**Optional enhancement** for account security.

| Property | Value |
|---|---|
| Algorithm | SHA1 (RFC 6238 / RFC 4226 compliant) |
| Digits | 6 |
| Period | 30 seconds |
| Window | ±1 period (clock drift tolerance) |
| Backup codes | 8 codes, format `XXXX-XXXX`, SHA-256 hashed for storage |
| Library | Native Node.js `crypto` (no external TOTP dependency) |

**TOTP lifecycle:**

| Step | Endpoint/Action | Description |
|---|---|---|
| 1. Generate | Service call | `generateTotpSecret()` creates a 20-byte random base32 secret |
| 2. QR Code | Service call | `generateTotpUri(secret, email)` produces `otpauth://` URI |
| 3. Verify | Service call | `verifyTotp(token, secret)` checks ±1 window with timing-safe comparison |
| 4. Enable | User model | `twoFactorEnabled: true`, `twoFactorSecret` stored (not selected by default) |
| 5. Disable | User model | `twoFactorEnabled: false`, secret cleared |
| 6. Backup | Service call | `generateBackupCodes()` creates 8 single-use codes, hashed with SHA-256 |

**Security properties:**

- Timing-safe comparison (`crypto.timingSafeEqual`) prevents timing attacks
- Backup codes are hashed (SHA-256) before storage — never stored in plaintext
- Pending secret (`twoFactorPendingSecret`) allows setup without enabling until verified
- Sensitive 2FA fields use `select: false` in Mongoose schema

### 2.4 API Key Authentication

**Machine-to-machine** authentication for programmatic access.

| Property | Value |
|---|---|
| Key format | `fwk_<4-hex-prefix>_<24-byte-base64url>` |
| Header | `Authorization: Bearer <key>` or `X-API-Key: <key>` |
| Scoping | Org-level with granular permission scopes |
| Hashing | HMAC-SHA256 with `API_KEY_PEPPER` (falls back to `JWT_SECRET`) |
| Storage | Only `keyHash` and `keyPrefix` stored — raw key never persisted |

See [API Security](#9-api-security) for complete details.

### 2.5 Password Hashing

| Property | Value |
|---|---|
| Algorithm | bcrypt |
| Salt rounds | 10 |
| Implementation | Mongoose pre-save hook |
| Schema behavior | `password` field uses `select: false` by default |

```typescript
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
```

### 2.6 Account Lockout Service

**Brute-force protection** for login endpoints.

| Property | Default | Description |
|---|---|---|
| Max attempts | 5 | Failed logins before lockout |
| Lockout duration | 15 minutes | Account locked after threshold |
| Window | 15 minutes | Failure count resets after this period |
| Key format | `email:ip` or `email` | Tracks per email, optionally per IP |
| Storage | In-memory Map | Swap with Redis for multi-instance |
| Cleanup | Every 5 minutes | Automatic expiry of stale records |

**Lockout key generation:**

```typescript
function lockoutKey(email: string, ip?: string): string {
  const normalized = email.toLowerCase().trim();
  return ip ? `${normalized}:${ip}` : normalized;
}
```

**Operations:**

| Method | Description |
|---|---|
| `isLocked(key)` | Check if account is currently locked |
| `recordFailure(key)` | Increment failure count, lock if threshold reached |
| `recordSuccess(key)` | Clear all failed attempts on successful login |
| `unlock(key)` | Manual unlock (admin operation) |
| `getStats()` | Monitoring: total tracked accounts, currently locked count |

---

## 3. Authorization

### 3.1 Role-Based Access Control (RBAC)

Access control is enforced at the **organization level** through the `OrgMember` model. Each user has a role within each organization they belong to.

**Role hierarchy:**

| Role | Permissions |
|---|---|
| `owner` | Full access: manage members, billing, settings, all data |
| `admin` | Manage data, workflows, members (except owners) |
| `member` | Read/write own data, limited admin functions |
| `viewer` | Read-only access to organization data |

### 3.2 Organization Context Middleware

The `orgContext` middleware (`server/src/middleware/orgContext.ts`) resolves the active organization for every authenticated request.

**Resolution flow:**

1. Extract `X-Org-Id` header (optional)
2. If header present: validate user membership in requested org, reject with `403 ORG_ACCESS_DENIED` if not a member
3. If header absent: resolve user's default organization
4. Attach resolved context to `req.org`:

```typescript
req.org = {
  orgId: activeOrg.orgId.toString(),
  memberId: activeOrg.memberId.toString(),
  role: activeOrg.role,
  isDefault: Boolean(activeOrg.isDefault),
  defaultOrgId: defaultOrg.orgId.toString(),
};
```

**Security properties:**

- Users can only access organizations they are members of
- Invalid org IDs return `400 INVALID_ORG_ID`
- Unauthorized org access returns `403 ORG_ACCESS_DENIED`
- Legacy org ID backfill is configurable via `ORG_LEGACY_BACKFILL_ENABLED`

### 3.3 Org Scope Plugin

The `orgScopePlugin` (`server/src/utils/orgScopePlugin.ts`) is a Mongoose plugin that warns when queries on org-scoped models omit the `orgId` filter.

**Guarded operations:**

- `find()`
- `findOne()`
- `countDocuments()`
- `aggregate()` (checks first `$match` stage)

**Usage:**

```typescript
transactionSchema.plugin(orgScopePlugin);
```

**Development-mode warnings:**

```
[orgScopePlugin] Query on Transaction.find() without orgId filter!
[orgScopePlugin] Aggregate on Transaction without orgId in first $match stage!
```

This catches accidental cross-org data exposure during development before it reaches production.

### 3.4 Protected vs Public Routes

| Route Pattern | Auth Required | Description |
|---|---|---|
| `/healthz` | No | Health check |
| `/api/test` | No | Test endpoint |
| `/api/python-health` | No | Python service health proxy |
| `/api/v1/auth/*` | Mixed | Auth endpoints (register, login are public; profile is protected) |
| `/api/v1/billing/webhook` | No (signature verified) | Stripe webhook |
| `/api/usage-events` | No (token verified) | Usage event ingestion |
| `/api/metrics` | Token-guarded | Prometheus metrics |
| All other `/api/v1/*` | Yes | JWT or API key required |

### 3.5 `optionalJwtAuth` Middleware Pattern

The `optionalJwtAuth` middleware (`server/src/middleware/optionalJwtAuth.ts`) attempts JWT authentication but **never rejects** unauthenticated requests. It is applied globally to all routes.

**Purpose:**

- Improves rate limiting key resolution (org/user-based vs IP-based)
- Enables optional personalization for authenticated users on public endpoints
- Downstream middleware (`authAny`) enforces authentication where required

```typescript
export const optionalJwtAuth: RequestHandler = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err) { next(err); return; }
    if (user) { (req as any).user = user; }
    next(); // Always calls next — never rejects
  })(req, res, next);
};
```

---

## 4. Data Protection

### 4.1 Password Hashing

| Layer | Detail |
|---|---|
| Algorithm | bcrypt |
| Salt rounds | 10 (configurable at schema level) |
| Schema default | `password: { select: false }` — never returned in queries |
| Hash trigger | Mongoose pre-save hook on `password` modification |

### 4.2 Cookie Encryption

| Property | Detail |
|---|---|
| Cookie parser | `cookie-parser` with signed cookies |
| Secret | `COOKIE_SECRET` environment variable |
| JWT cookie | Named `jwt`, HTTP-only, signed |
| CSRF cookie | Named `csrf_token` (configurable via `CSRF_COOKIE_NAME`) |

### 4.3 NoSQL Injection Sanitization

Custom middleware strips MongoDB operator keys (`$`-prefixed) and dotted keys from request bodies and params:

```typescript
const stripDollarDot = (obj) => {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripDollarDot);
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    clean[key] = stripDollarDot(obj[key]);
  }
  return clean;
};
```

**Coverage:**

- `req.body` — all request bodies
- `req.params` — URL parameters
- Recursive — handles nested objects and arrays

### 4.4 Input Validation with Zod

All API inputs are validated using Zod schemas through the `validate` middleware (`server/src/middleware/validate.ts`).

**Validation layers:**

| Layer | Schema | Description |
|---|---|---|
| Request body | `body?: ZodTypeAny` | Parsed and replaced with validated data |
| URL params | `params?: ZodTypeAny` | Validated and merged into `req.params` |
| Query string | `query?: ZodTypeAny` | Validated; invalid keys stripped |

**Error handling:**

- Invalid input returns `400 VALIDATION_ERROR` with flattened Zod error details
- Unknown errors pass to the global error handler

### 4.5 File Upload Validation

| Upload Type | Max Size | Allowed MIME Types | Validator |
|---|---|---|---|
| Receipts | 8 MB | `image/jpeg`, `image/png`, `image/webp` | Multer + magic-byte check |
| Journal | 4 MB | `image/jpeg`, `image/png`, `image/webp` | Multer + magic-byte check |
| CSV Import | 15 MB | `text/csv`, `application/vnd.ms-excel`, `application/csv` | Multer MIME filter |
| Workspace Files | 25 MB | Configurable via `UPLOAD_ALLOWED_MIME` | Multer MIME filter |

**Magic-byte validation** (`validateImageBuffer`):

Uses `file-type` library to verify actual file content matches the declared MIME type, preventing polyglot file attacks and MIME spoofing.

### 4.6 GridFS File Storage Security

- Files stored in MongoDB GridFS with org-scoped metadata
- Access controlled through authenticated routes only
- No direct file URLs — all access goes through authenticated endpoints
- File metadata includes `orgId` for access control enforcement

---

## 5. Security Headers & Middleware

### 5.1 Complete Middleware Stack

The middleware is applied in the following order in `app.ts`:

```
1.  cors()                    — Cross-origin request filtering
2.  helmet()                  — Core security headers (CSP, etc.)
3.  securityHeaders()         — Additional defense-in-depth headers
4.  express.json()            — Body parsing with rawBody capture for Stripe
5.  express.urlencoded()      — URL-encoded body parsing
6.  NoSQL injection sanitizer — Custom $-key stripping middleware
7.  cookieParser()            — Signed cookie parsing
8.  passport.initialize()     — Passport.js initialization
9.  requestContext()          — Request ID generation/tracking
10. responseContext()         — Response context headers
11. legacyApiDeprecation()    — Deprecation headers for legacy routes
12. httpLogger()              — Structured HTTP request logging
13. metricsMiddleware()       — Prometheus metrics collection
14. optionalJwtAuth()         — Optional JWT authentication
15. orgContext()              — Organization context resolution
16. apiRateLimiter            — General API rate limiting (200/min)
17. csrfProtection()          — CSRF token validation
18. authRateLimiter           — Auth endpoint rate limiting (20/min)
19. Route handlers            — Application routes
20. notFoundHandler()         — 404 handler
21. errorHandler()            — Global error handler
```

### 5.2 Helmet Security Headers

```typescript
helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", ...CORS_ORIGINS.filter((o) => o !== "*")],
    },
  },
});
```

### 5.3 Additional Security Headers

Applied by `securityHeaders` middleware (`server/src/middleware/securityHeaders.ts`):

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `0` | Disable legacy XSS filter (CSP is superior) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Disable device APIs |
| `Cache-Control` | `no-store, no-cache, must-revalidate, proxy-revalidate` | Prevent caching of responses |
| `Pragma` | `no-cache` | Legacy cache prevention |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | HSTS (production only) |
| `X-Powered-By` | Removed | Hide server technology |

### 5.4 CORS Configuration

| Property | Value |
|---|---|
| Origins | Configurable via `CORS_ORIGINS` (CSV), plus `CLIENT_URL` |
| Credentials | `true` — allows cookies |
| Wildcard | Supported (`*`) but not recommended for production |
| Local aliases | `localhost` and `127.0.0.1` treated as equivalent |

### 5.5 CSRF Protection

| Property | Value |
|---|---|
| Enabled by default | `false` in development, `true` in production |
| Token mechanism | Double-submit cookie pattern |
| Cookie name | `csrf_token` (configurable via `CSRF_COOKIE_NAME`) |
| Header name | `X-CSRF-Token` |
| Exempt methods | `GET`, `HEAD`, `OPTIONS` |
| Exempt paths | `/api/v1/billing/webhook`, `/api/usage-events`, `/api/v1/usage-events` |
| Bypass condition | Requests without `jwt` cookie (API key auth) |

**Validation logic:**

```typescript
if (!cookieToken || !headerToken || cookieToken !== headerToken) {
  return res.status(403).json({
    message: "CSRF token missing or invalid",
    code: "CSRF_FAILED",
    request_id: req.requestId,
  });
}
```

### 5.6 Request Context Tracking

Every request receives a unique `X-Request-Id` header (UUID v4) for traceability:

- Generated from `x-request-id` header if provided by client
- Otherwise generated via `randomUUID()`
- Attached to `req.requestId` for use throughout the request lifecycle
- Included in all error responses, audit logs, and structured log entries

### 5.7 Error Handler — No Sensitive Data Leakage

The global error handler (`server/src/middleware/errorHandler.ts`) categorizes errors and returns sanitized responses:

| Error Type | Status | Response | Internal Logging |
|---|---|---|---|
| `HttpError` | As defined | Message, code, details, requestId | No |
| `ZodError` | 400 | "Invalid request payload", flattened errors | No |
| `mongoose.ValidationError` | 400 | "Data validation failed", field errors | No |
| `mongoose.CastError` | 400 | "Invalid identifier format" | No |
| All other errors | 500 | "Internal server error" only | Yes — full error logged server-side |

**Critical:** Unknown errors never expose stack traces, internal paths, or database details to the client.

---

## 6. Rate Limiting

### 6.1 Configuration Overview

| Tier | Endpoint | Window | Max Requests | Key Strategy |
|---|---|---|---|---|
| General | `/api/*` | 60 seconds | 200 | Org → User → API Key Org → IP |
| Auth | `/api/v1/auth/*`, `/api/auth/*` | 60 seconds | 20 | IP-based |

### 6.2 General API Rate Limiter

**Key generation hierarchy** (most specific to least):

```
1. api_key_org:<orgId>    — API key authenticated requests (org-level)
2. org:<orgId>            — User authenticated requests (org-level)
3. user:<userId>          — User authenticated without org context
4. <ip>                   — Unauthenticated requests (IP-based)
```

This ensures that authenticated users share rate limits at the organization level (fair for team accounts) while unauthenticated requests are limited per IP.

**Configuration:**

```typescript
const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,    // default: 60,000ms (1 min)
  max: env.RATE_LIMIT_MAX,                // default: 200
  standardHeaders: true,                  // RateLimit-* headers
  legacyHeaders: false,                   // No X-RateLimit-* headers
  passOnStoreError: true,                 // Fail open if store unavailable
});
```

### 6.3 Auth Rate Limiter

Stricter limits on authentication endpoints to prevent brute-force attacks:

```typescript
const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,  // default: 60,000ms (1 min)
  max: env.AUTH_RATE_LIMIT_MAX,              // default: 20
  keyGenerator: (req) => String(req.ip || "unknown"),
});
```

Applied to:
- `/api/v1/auth/*` (canonical auth routes)
- `/api/auth/*` (legacy auth routes)

### 6.4 Response Format

**General rate limit exceeded:**

```json
{
  "message": "Too many requests, please try again shortly.",
  "code": "RATE_LIMITED",
  "requestId": "<uuid>"
}
```

**Auth rate limit exceeded:**

```json
{
  "message": "Too many authentication attempts, please try again later.",
  "code": "AUTH_RATE_LIMITED",
  "requestId": "<uuid>"
}
```

### 6.5 Redis-Backed Rate Limiting

When `REDIS_URL` is configured, `express-rate-limit` can use Redis as a distributed store for multi-instance deployments. The `passOnStoreError: true` setting ensures the application continues to function (with in-memory fallback) if Redis is unavailable.

**Redis connection properties:**

| Property | Value |
|---|---|
| Lazy connect | Yes |
| Auto-pipelining | Enabled |
| Max retries | 3 per request |
| Retry strategy | Exponential backoff (200ms → 2000ms), stops after 5 attempts |
| Error handling | Non-fatal — logged as warning |

---

## 7. Audit Logging

FinWise maintains two complementary audit models for comprehensive security event tracking.

### 7.1 AuditLog Model

**Purpose:** Security-specific event logging for compliance and incident investigation.

| Field | Type | Description |
|---|---|---|
| `orgId` | ObjectId (indexed) | Organization context |
| `userId` | ObjectId (indexed) | User who triggered the event |
| `action` | Enum (indexed) | Security action type |
| `severity` | Enum (indexed) | `info`, `warn`, `critical` |
| `ip` | String (max 45) | Client IP address |
| `userAgent` | String (max 500) | Client user agent |
| `targetResource` | String (max 120) | Affected resource type |
| `targetId` | String (max 120) | Affected resource ID |
| `metadata` | Mixed | Additional context |
| `requestId` | String (max 64) | Correlated request ID |
| `createdAt` | Date (immutable) | Event timestamp |

**Supported actions:**

| Category | Actions |
|---|---|
| Authentication | `login_success`, `login_failed`, `logout`, `2fa_verified`, `2fa_failed`, `2fa_backup_used` |
| Account | `password_change`, `password_reset_request`, `password_reset_complete`, `account_locked`, `account_unlocked` |
| 2FA Management | `2fa_enabled`, `2fa_disabled` |
| API Keys | `api_key_created`, `api_key_revoked` |
| Organization | `role_changed`, `org_member_added`, `org_member_removed` |
| Profile | `profile_updated` |
| Data | `export_created`, `data_deleted`, `session_invalidated` |
| Plugins | `plugin_installed`, `plugin_uninstalled`, `plugin_permission_denied` |
| Security | `suspicious_activity` |

**Indexes:**

- `{ userId: 1, action: 1, createdAt: -1 }` — User activity timeline
- `{ orgId: 1, severity: 1, createdAt: -1 }` — Org security events by severity
- `{ createdAt: 1 }` with TTL — Auto-expire after 365 days

**Immutability:**

- `updatedAt: false` — no update timestamps
- `strict: true` — no arbitrary fields
- Append-only by design

### 7.2 AuditEvent Model

**Purpose:** General operational audit trail for all org-scoped actions.

| Field | Type | Description |
|---|---|---|
| `orgId` | ObjectId (required, indexed) | Organization context |
| `actorType` | Enum (indexed) | `user`, `system`, `api_key` |
| `actorUserId` | ObjectId (optional) | User actor reference |
| `actorApiKeyId` | ObjectId (optional) | API key actor reference |
| `action` | String (indexed, max 80) | Action description |
| `targetType` | String (indexed, max 80) | Resource type |
| `targetId` | String (max 120) | Resource ID |
| `requestId` | String (max 128) | Correlated request ID |
| `metadata` | Mixed | Additional context |

**Indexes:**

- `{ orgId: 1, createdAt: -1 }` — Org timeline
- `{ orgId: 1, actorUserId: 1, createdAt: -1 }` — User activity within org
- `{ orgId: 1, action: 1, createdAt: -1 }` — Action-based queries

### 7.3 Audit Trail Coverage

| Entity | Audit Coverage |
|---|---|
| Users | Login/logout, password changes, 2FA events, profile updates |
| Organizations | Member changes, role changes, plan changes |
| API Keys | Creation, revocation, usage tracking |
| Data Operations | Exports, deletions, bulk operations |
| Security Events | Lockouts, suspicious activity, permission denials |

### 7.4 Security Audit Endpoint

```
GET /api/v1/security/audit-log
```

Query parameters:

| Parameter | Type | Description |
|---|---|---|
| `orgId` | string | Filter by organization |
| `userId` | string | Filter by user |
| `action` | string | Filter by action type |
| `severity` | string | Filter by severity level |
| `from` | date | Start date range |
| `to` | date | End date range |
| `limit` | number | Page size (default: 50) |
| `cursor` | string | Pagination cursor |

Requires authenticated user with appropriate org role.

---

## 8. Session Management

### 8.1 Cookie-Based Sessions

| Property | Configuration |
|---|---|
| Mechanism | HTTP-only signed cookies |
| Cookie name | `jwt` |
| Cookie secret | `COOKIE_SECRET` environment variable |
| Session storage | Stateless (JWT payload) — no server-side session store |
| Passport sessions | Disabled (`session: false` on all strategies) |

### 8.2 Cookie Security Flags

| Flag | Behavior |
|---|---|
| `httpOnly` | Always `true` — inaccessible to JavaScript |
| `secure` | `true` in production (HTTPS required), computed in development |
| `sameSite` | `lax` by default; `strict` or `none` configurable |
| `domain` | Unset by default (current host); configurable via `COOKIE_DOMAIN` |

**Validation constraint:** `SameSite=none` requires `secure=true` — enforced at startup.

### 8.3 JWT Lifecycle

| Phase | Detail |
|---|---|
| Issuance | On successful login (email/password or Google OAuth) |
| Storage | HTTP-only cookie |
| Validation | On every request via `passport-jwt` strategy |
| User resolution | Database lookup (`UserModel.findById`) — no cached sessions |
| Expiration | Configurable in JWT payload |
| Refresh | New token issued on re-authentication |

### 8.4 Logout and Session Invalidation

| Action | Implementation |
|---|---|
| Logout endpoint | `POST /api/v1/auth/logout` |
| Cookie clearing | `jwt` cookie cleared with past expiration |
| Audit logging | `logout` action recorded in AuditLog |
| Session invalidation | Client-side cookie removal; server-side JWT validation continues to accept until expiry (stateless) |

**Note:** Because JWTs are stateless, true server-side invalidation requires either short expiration times or a token blacklist (not currently implemented). For enhanced security, use short JWT expiration and rely on the database lookup on each request.

---

## 9. API Security

### 9.1 API Key Architecture

**Key format:** `fwk_<prefix>_<secret>`

```
Example: fwk_a3f2b1c8_dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIHRlc3Rpbmc
         ^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         prefix     secret (never stored)
```

| Component | Detail |
|---|---|
| Prefix | 4-byte hex identifier (8 chars), stored in database for key identification |
| Secret | 24-byte base64url-encoded random value, shown only at creation |
| Hash | HMAC-SHA256 of full key using `API_KEY_PEPPER` (or `JWT_SECRET` as fallback) |

### 9.2 Key Hashing

Raw API keys are **never stored**. Only the HMAC-SHA256 hash is persisted:

```typescript
export const hashApiKey = (raw: string) => {
  return crypto.createHmac("sha256", getPepper()).update(raw).digest("hex");
};

export const resolveApiKey = async (rawKey: string) => {
  const keyHash = hashApiKey(rawKey);
  return ApiKeyModel.findOne({ keyHash, revokedAt: { $exists: false } }).lean();
};
```

**Pepper configuration:**

| Priority | Source |
|---|---|
| 1 | `API_KEY_PEPPER` environment variable |
| 2 | `JWT_SECRET` environment variable (fallback) |

### 9.3 Scoped Permissions

Available scopes:

| Scope | Description |
|---|---|
| `usage:read` | Read usage and billing data |
| `workflows:read` | Read workflow definitions and runs |
| `workflows:write` | Create and modify workflows |
| `transactions:read` | Read transaction data |
| `transactions:write` | Create and modify transactions |

**Scope enforcement middleware:**

```typescript
export const requireScopeIfApiKey = (scope: string): RequestHandler => {
  return (req, res, next) => {
    const apiKey = (req as any).apiKey;
    if (!apiKey) { next(); return; } // Not using API key — skip
    if (!apiKey.scopes.includes(scope)) {
      return res.status(403).json({
        message: "Missing required API key scope",
        code: "API_KEY_SCOPE_REQUIRED",
        details: { scope },
      });
    }
    next();
  };
};
```

### 9.4 Key Lifecycle

| Operation | Description |
|---|---|
| **Create** | `createApiKey()` generates secret, hashes it, stores hash + prefix. Secret returned **only once** at creation. |
| **List** | Returns key metadata (name, prefix, scopes, last used) — never the secret. |
| **Revoke** | Sets `revokedAt` timestamp. Revoked keys are excluded from `resolveApiKey()` queries. |
| **Usage tracking** | `lastUsedAt` updated on each successful authentication. |

### 9.5 API Key Rate Limiting and Quotas

| Mechanism | Detail |
|---|---|
| Rate limiting key | `api_key_org:<orgId>` — all keys from same org share rate limit |
| Quota enforcement | `enforceFeatureLimit()` checks `api_requests` quota before processing |
| Usage recording | `recordFeatureUsage()` tracks per-request usage with path/method context |
| Quota exceeded | Returns `402 Payment Required` with details |

### 9.6 API Key Authentication Middleware

Two middleware variants available:

| Middleware | Purpose |
|---|---|
| `authAny` | Tries JWT first, falls back to API key. Used on general protected routes. |
| `apiKeyAuth` | API key only. Used on routes that should not accept user sessions. |

Both set `req.apiKey` with `{ id, orgId, createdByUserId, scopes, keyPrefix }` and ensure `req.org` is populated.

---

## 10. Email Security

### 10.1 SMTP Configuration

| Property | Environment Variable | Default |
|---|---|---|
| Username | `EMAIL_USER` | — |
| Password | `EMAIL_PASSWORD` | — |
| From address | `EMAIL_FROM` | — |
| Service | `EMAIL_SERVICE` | `gmail` |
| Host | `EMAIL_HOST` | — (uses service if unset) |
| Port | `EMAIL_PORT` | — |
| Secure (TLS) | `EMAIL_SECURE` | `true` (or `true` for port 465) |
| Require TLS | `EMAIL_REQUIRE_TLS` | `false` |

**Validation:** All three of `EMAIL_USER`, `EMAIL_PASSWORD`, and `EMAIL_FROM` must be set together. Partial configuration throws an error at startup.

### 10.2 Transport Security

| Mode | Condition |
|---|---|
| Custom SMTP | `EMAIL_HOST` + `EMAIL_PORT` configured |
| Service-based | Falls back to `EMAIL_SERVICE` (default: Gmail) |
| TLS | `secure: true` by default; `requireTLS` configurable |

### 10.3 Email Verification Flow

1. User registers with email/password
2. Server generates `emailVerificationToken` with expiration (`emailVerificationTokenExpires`)
3. Verification email sent with token link
4. User clicks link → `POST /api/v1/auth/verify-email` validates token
5. On success: `isEmailVerified: true`, token cleared

**Token properties:**

- Stored with `select: false` — never returned in queries
- Expiration date enforced at verification time
- Resend available via `POST /api/v1/auth/resend-verification` (rate-limited)

### 10.4 Fallback Behavior

| Environment | SMTP Failure Behavior |
|---|---|
| `test` | Console logging only — no SMTP attempt |
| `development` | Falls back to console logging after SMTP failure |
| `production` | Throws error — email delivery is required |

---

## 11. Stripe Integration Security

### 11.1 Webhook Signature Verification

**Critical:** Stripe webhooks are verified using the raw request body and signature header.

```typescript
const event = stripe.webhooks.constructEvent(
  params.rawBody,      // Raw buffer (not parsed JSON)
  params.signature,    // Stripe-Signature header
  env.STRIPE_WEBHOOK_SECRET
);
```

**Raw body capture:**

The Express JSON parser captures the raw body for webhook routes before parsing:

```typescript
express.json({
  verify: (req, _res, buf) => {
    const path = String(req.originalUrl || req.url || "");
    if (path.startsWith("/api/v1/billing/webhook")) {
      (req as any).rawBody = buf;
    }
  },
});
```

### 11.2 Webhook Security Properties

| Property | Detail |
|---|---|
| Signature verification | `stripe.webhooks.constructEvent()` — rejects tampered payloads |
| Raw body requirement | Buffer captured before JSON parsing |
| Exempt from CSRF | Webhook path excluded from CSRF protection |
| Idempotent handling | `setOrgPlan()` uses upserts to handle duplicate events |
| Secret validation | `STRIPE_WEBHOOK_SECRET` required at startup when Stripe is enabled |

### 11.3 Supported Webhook Events

| Event | Action |
|---|---|
| `checkout.session.completed` | Retrieve subscription, sync plan and entitlements |
| `customer.subscription.updated` | Sync plan tier, status, seats, billing period |
| `customer.subscription.deleted` | Mark subscription as canceled |

### 11.4 Stripe Secret Key Handling

| Property | Detail |
|---|---|
| Environment variable | `STRIPE_SECRET_KEY` |
| Validation | Required when `BILLING_PROVIDER=stripe` |
| Client initialization | Singleton pattern — created once, reused |
| API version | Pinned to `2024-06-20` |
| Customer data | Only Stripe IDs stored; no card data persisted |

### 11.5 Customer Data Protection

| Data Stored | Purpose |
|---|---|
| `stripeCustomerId` | Link org to Stripe customer |
| `stripeSubscriptionId` | Track subscription lifecycle |
| `stripePriceId` | Determine plan tier |
| `currentPeriodStart/End` | Billing period tracking |
| Metadata | `org_id`, `plan_tier`, `created_by_user_id` for webhook correlation |

**No sensitive payment data** (card numbers, CVV, bank details) is ever stored in FinWise databases.

---

## 12. Security Best Practices Followed

### 12.1 Principle of Least Privilege

- API keys scoped to specific permissions (`usage:read`, `transactions:write`, etc.)
- Organization roles limit access to data within org boundaries
- Mongoose `select: false` on sensitive fields (passwords, 2FA secrets, verification tokens)
- Password field excluded from all queries by default

### 12.2 Defense in Depth

| Layer | Mechanism |
|---|---|
| Network | CORS origin filtering, HSTS |
| Application | Helmet headers, CSP, Permissions-Policy |
| Authentication | JWT + OAuth2 + TOTP + API keys (multiple options) |
| Authorization | RBAC, org scoping, API key scopes |
| Input | Zod validation, NoSQL injection sanitization, file type verification |
| Rate limiting | Tiered limits (general + auth) |
| Audit | Dual audit models (AuditLog + AuditEvent) |

### 12.3 Input Validation at Every Layer

1. **HTTP layer:** CORS origin validation
2. **Body parsing:** NoSQL injection sanitization (strips `$` and `.` keys)
3. **Schema layer:** Zod validation on all request bodies, params, and queries
4. **Database layer:** Mongoose schema validation and type enforcement
5. **File layer:** MIME type filtering + magic-byte verification

### 12.4 Secure Defaults

| Setting | Default | Rationale |
|---|---|---|
| `NODE_ENV` | `development` | Explicit opt-in required for production |
| `CSRF_ENABLED` | `false` in dev, `true` in prod | Developer-friendly but production-secure |
| `COOKIE_SECURE` | Computed from `NODE_ENV` + `CLIENT_URL` | Auto-enables for HTTPS |
| `BILLING_PROVIDER` | `stub` (or `stripe` if key present) | No payment processing without explicit config |
| Password field | `select: false` | Never leaked in queries |
| 2FA fields | `select: false` | Never leaked in queries |
| Error responses | Generic messages | No information leakage |

### 12.5 Error Handling Without Information Leakage

- All unknown errors return generic `500 Internal server error`
- Stack traces, file paths, and database details are logged server-side only
- Validation errors expose only the field-level issues (not schema internals)
- MongoDB CastErrors return "Invalid identifier format" (not the raw value)

### 12.6 Dependency Security

| Practice | Implementation |
|---|---|
| Environment validation | Zod schema validates all env vars at startup — fails fast on missing secrets |
| Minimal dependencies | TOTP uses native `crypto` instead of external library |
| Pinned versions | Stripe API version pinned (`2024-06-20`) |
| Conditional loading | Google OAuth only initialized when credentials are present |
| Graceful degradation | Redis failures are non-fatal; email falls back to console in dev |

---

## 13. Security Checklist

### Pre-Deployment

#### Environment Configuration

- [ ] `JWT_SECRET` is a strong, randomly generated value (minimum 32 characters)
- [ ] `COOKIE_SECRET` is set and different from `JWT_SECRET`
- [ ] `API_KEY_PEPPER` is set (or confirmed to fall back to `JWT_SECRET`)
- [ ] `NODE_ENV` is set to `production`
- [ ] `CORS_ORIGINS` lists only production domains (no `*`)
- [ ] `COOKIE_SECURE` is `true`
- [ ] `COOKIE_SAME_SITE` is `strict` or `lax`
- [ ] `TRUST_PROXY` is configured correctly for the deployment environment
- [ ] `CSRF_ENABLED` is `true`

#### Authentication

- [ ] Google OAuth credentials are configured (if Google login is enabled)
- [ ] Email credentials are configured for production (all three: user, password, from)
- [ ] Account lockout thresholds are appropriate for expected traffic

#### API Security

- [ ] Stripe webhook secret is configured (if Stripe is enabled)
- [ ] Stripe secret key is not exposed in client-side code or logs
- [ ] API key scopes follow least privilege for each integration

#### Infrastructure

- [ ] HTTPS is enforced at the reverse proxy/load balancer level
- [ ] HSTS header is enabled (automatic when `NODE_ENV=production`)
- [ ] Redis is configured for distributed rate limiting (multi-instance deployments)
- [ ] MongoDB connection uses authentication and TLS
- [ ] `MONGO_URI` is not logged or exposed in error messages

#### Monitoring

- [ ] Structured logging is enabled with request ID correlation
- [ ] Audit log endpoints are accessible to administrators
- [ ] Error monitoring/alerting is configured for `critical` severity audit events
- [ ] Metrics endpoint is protected by `METRICS_TOKEN`

#### Data Protection

- [ ] Database backups are encrypted at rest
- [ ] No sensitive data (passwords, tokens, keys) is logged
- [ ] File upload limits are appropriate for expected usage
- [ ] GridFS access is restricted to authenticated routes only

---

## 14. Incident Response

### 14.1 Classification

| Severity | Criteria | Response Time |
|---|---|---|
| **Critical** | Data breach, unauthorized access to production data, compromised credentials | Immediate |
| **High** | Authentication bypass, rate limit bypass, CSRF vulnerability | Within 1 hour |
| **Medium** | Information disclosure, misconfigured CORS, weak session settings | Within 4 hours |
| **Low** | Header misconfiguration, non-critical validation gaps | Within 24 hours |

### 14.2 Response Procedures

#### Step 1: Identify and Contain

1. Check audit logs for the affected scope:
   ```
   GET /api/v1/security/audit-log?severity=critical&from=<timestamp>
   ```
2. Review `AuditEvent` records for the affected organization(s)
3. If API key compromise suspected:
   - Identify the key by its prefix
   - Revoke immediately via admin interface
   - Generate replacement key
4. If user account compromise suspected:
   - Force password reset
   - Disable 2FA and require re-setup
   - Invalidate active sessions

#### Step 2: Investigate

1. Use `requestId` from error responses to trace the full request chain
2. Check structured logs for the affected time window
3. Review AuditLog entries for the affected user/org:
   - Login attempts (success/failure patterns)
   - API key usage
   - Data access patterns
4. Check for cross-org data access anomalies

#### Step 3: Remediate

1. Apply the necessary fix (credential rotation, configuration change, code patch)
2. Verify the fix in a staging environment
3. Deploy to production
4. Monitor for recurrence

#### Step 4: Document and Review

1. Create an incident report with:
   - Timeline of events
   - Root cause analysis
   - Actions taken
   - Preventive measures
2. Update this security documentation if new patterns are discovered
3. Review and update the security checklist

### 14.3 Key Rotation Procedures

| Credential | Rotation Method |
|---|---|
| `JWT_SECRET` | Rotate and force re-authentication for all users |
| `COOKIE_SECRET` | Rotate; existing cookies become invalid |
| `API_KEY_PEPPER` | Rotate; all existing API keys become invalid and must be regenerated |
| `STRIPE_SECRET_KEY` | Rotate in Stripe dashboard, update env var |
| `STRIPE_WEBHOOK_SECRET` | Rotate in Stripe dashboard, update env var |
| Google OAuth credentials | Rotate in Google Cloud Console |
| Email credentials | Rotate in email provider, update env vars |

### 14.4 Emergency Contacts

| Role | Responsibility |
|---|---|
| Security Lead | Overall incident coordination |
| DevOps | Infrastructure containment and recovery |
| Backend Lead | Code-level investigation and fixes |
| Communications | Stakeholder and user notifications |

---

*This document should be reviewed and updated with each major release or security-relevant change.*
