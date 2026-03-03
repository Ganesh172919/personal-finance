# Personal Finance — Middleware Reference

> Complete reference for the 13 Express middleware modules in `server/src/middleware/`. Applied in order from `app.ts`.

---

## Middleware Stack (Application Order)

The following table lists every middleware in the order they are mounted in `server/src/app.ts`:

| #   | Middleware             | File                         | Purpose                                              |
| --- | ---------------------- | ---------------------------- | ---------------------------------------------------- |
| 1   | CORS                   | (express `cors`)             | Restrict cross-origin requests to allowed origins    |
| 2   | Helmet                 | (npm `helmet`)               | Set security HTTP headers (CSP, X-Frame, etc.)       |
| 3   | Security Headers       | `securityHeaders.ts`         | Additional headers: HSTS, Permissions-Policy, Cache  |
| 4   | JSON Parser            | (express built-in)           | Parse JSON bodies with configurable size limit       |
| 5   | NoSQL Sanitizer        | (inline in `app.ts`)         | Strip `$` and `.` keys to prevent injection          |
| 6   | Cookie Parser          | (npm `cookie-parser`)        | Parse cookies with optional signed-cookie secret     |
| 7   | Passport               | (npm `passport`)             | Initialize Passport.js for JWT/OAuth strategies      |
| 8   | Request Context        | `requestContext.ts`          | Generate `X-Request-Id`, start request timer         |
| 9   | Response Context       | `responseContext.ts`         | Inject `request_id` and response timing metadata     |
| 10  | Legacy API Deprecation | `legacyApiDeprecation.ts`    | Add `X-API-Deprecation` headers for `/api` routes    |
| 11  | HTTP Logger            | `logger.ts` (config)         | Pino HTTP request/response logging                   |
| 12  | Metrics Middleware     | `metrics.ts` (observability) | Prometheus request counters and histograms           |
| 13  | Optional JWT Auth      | `optionalJwtAuth.ts`         | Attempt JWT decode; attach `req.user` if valid       |
| 14  | Org Context            | `orgContext.ts`              | Resolve org from JWT claim or API key; set `req.org` |
| 15  | Rate Limiter           | (express-rate-limit)         | Global rate limit on `/api` routes                   |
| 16  | CSRF Protection        | `csrfProtection.ts`          | Double-submit cookie CSRF on `/api` routes           |

---

## Module Details

### `requestContext.ts`

Generates a unique `X-Request-Id` for every request (UUID v4 or forwarded from incoming header). Attaches `req.requestId` and starts a high-resolution timer for response latency tracking.

### `responseContext.ts`

Injects the `request_id` and response timing into every JSON response. Ensures consistent response metadata across all endpoints.

### `csrfProtection.ts`

Implements **double-submit cookie** CSRF protection:

- On `GET` requests to `/api/v1/auth/me` or `/api/v1/config`, sets a random CSRF token as a cookie
- On state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`), validates the `X-CSRF-Token` header matches the cookie value
- Controlled by `CSRF_ENABLED` env var (defaults to `true` in production, `false` in dev)
- Cookie name configurable via `CSRF_COOKIE_NAME` (default: `csrf_token`)

**Exemptions**: Stripe webhooks (`/billing/webhook`), internal tools (`/api/internal/`), and API key-authenticated requests bypass CSRF.

### `securityHeaders.ts`

Sets additional HTTP security headers beyond what Helmet provides:

- **HSTS** — `Strict-Transport-Security` with `max-age=63072000` (enabled in production)
- **Permissions-Policy** — Restricts browser features (camera, microphone, geolocation, etc.)
- **X-Content-Type-Options** — `nosniff`
- **Cache-Control** — `no-store` for API responses
- **Referrer-Policy** — `strict-origin-when-cross-origin`

### `optionalJwtAuth.ts`

Non-blocking JWT authentication. Attempts to decode a JWT token from the `Authorization: Bearer` header. If valid, attaches `req.user`; if missing or invalid, the request continues without authentication page. This allows public routes to optionally display user-specific content.

### `orgContext.ts`

Resolves the organization context for multi-tenant requests:

- Checks for `X-Org-Id` header or JWT claim
- For API key requests, uses the key's bound org
- Sets `req.org` with `{ orgId, role, source }` for downstream use

### `legacyApiDeprecation.ts`

Adds `X-API-Deprecation` and `X-API-Sunset` headers to responses for requests hitting legacy `/api` routes (without `/v1`). Encourages migration to the canonical `/api/v1` surface.

### `authAny.ts`

Combined authentication middleware that accepts **either** JWT tokens or API keys. Exports:

- `authAny` — Authenticate via JWT or API key
- `requireScopeIfApiKey(scope)` — Additional scope check for API key requests

### `apiKeyAuth.ts`

Validates API key authentication from the `Authorization: Bearer apikey_...` header. Looks up the hashed key, checks expiry and quota, increments usage counters, and attaches `req.apiKey` with scopes and org binding.

### `validate.ts`

Zod-based request validation middleware factory. Accepts schemas for `body`, `query`, and `params`:

```ts
validate({ body: createOrgBodySchema, params: orgIdParamSchema });
```

Returns 400 with structured validation errors on failure.

### `uploads.ts`

Multer-based file upload middleware. Exports:

- `receiptUpload()` — Receipt image uploads (MIME filtering, size limiting via `RECEIPT_UPLOAD_MAX_BYTES`)
- `journalUpload()` — Journal attachment uploads (via `JOURNAL_UPLOAD_MAX_BYTES`)
- `csvUpload()` — CSV file uploads (via `CSV_UPLOAD_MAX_BYTES`)

### `errorHandler.ts`

Global error handling middleware. Exports:

- `errorHandler` — Catches all unhandled errors, logs them, and returns consistent JSON error responses
- `notFoundHandler` — Returns 404 for unmatched routes

### `httpError.ts`

Utility for creating typed HTTP errors:

```ts
throw createHttpError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
```

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [SECURITY.md](./SECURITY.md) · [API.md](./API.md)
