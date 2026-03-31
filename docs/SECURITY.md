# FinWise Security Architecture

## Threat Model

FinWise handles **sensitive personal financial data** — income, debts, spending patterns, and investment goals. The security architecture follows defense-in-depth with OWASP API Security Top 10 coverage.

### Attack Surface

| Layer              | Protection                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Transport**      | HSTS (production), secure cookies, CORS origin allowlist                            |
| **Authentication** | JWT + HttpOnly cookies, Google OAuth, API keys with scopes                          |
| **Authorization**  | Org-scoped data isolation, RBAC via entitlements, API key scope enforcement         |
| **Input**          | Zod schema validation, NoSQL injection sanitizer, request size limits               |
| **Rate Limiting**  | Per-org/user/IP rate limiting, tighter auth endpoint limits                         |
| **Brute Force**    | Account lockout after 5 failed attempts (15-min window)                             |
| **CSRF**           | Double-submit cookie pattern (configurable)                                         |
| **2FA**            | TOTP (RFC 6238) with backup codes, native crypto (no third-party deps)              |
| **Audit**          | Immutable security audit log with 26 event types, TTL cleanup                       |
| **Plugin Sandbox** | Fail-closed permission enforcement, high-risk permission flagging                   |
| **Headers**        | Helmet + custom security headers (X-Content-Type-Options, Permissions-Policy, etc.) |

---

## Two-Factor Authentication (TOTP)

### Setup Flow

```
POST /api/v1/auth/2fa/setup      → { secret, uri }          (scan QR code)
POST /api/v1/auth/2fa/verify     → { enabled, backup_codes } (confirm TOTP)
```

### Login Flow (with 2FA)

```
POST /api/v1/auth/login           → { twoFactorEnabled: true }
POST /api/v1/auth/2fa/verify      → { token: "123456" }       (verify TOTP)
```

### Disable

```
POST /api/v1/auth/2fa/disable     → { token: "123456" }       (requires TOTP or backup code)
```

### Status Check

```
GET /api/v1/auth/2fa/status        → { enabled: true/false }
```

### Implementation

- RFC 6238 TOTP with SHA-1, 6 digits, 30s period
- ±1 period clock drift tolerance
- 8 backup codes (SHA-256 hashed for storage)
- All 2FA state changes audit-logged
- Secrets stored with `select: false` — never returned in normal queries

---

## Account Lockout

- **Threshold**: 5 failed login attempts within 15 minutes
- **Lockout duration**: 15 minutes
- **Scope**: email + IP combination (prevents lockout by email alone)
- **Reset**: Automatic after lockout expires; cleared on successful login
- **Storage**: In-memory (swap to Redis for multi-instance)

---

## Security Audit Log

### Events Tracked (26 types)

| Category     | Events                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| **Auth**     | `login_success`, `login_failed`, `logout`                                      |
| **Password** | `password_change`, `password_reset_request`, `password_reset_complete`         |
| **2FA**      | `2fa_enabled`, `2fa_disabled`, `2fa_verified`, `2fa_failed`, `2fa_backup_used` |
| **API Keys** | `api_key_created`, `api_key_revoked`                                           |
| **Account**  | `account_locked`, `account_unlocked`, `profile_updated`, `session_invalidated` |
| **Org**      | `role_changed`, `org_member_added`, `org_member_removed`                       |
| **Plugins**  | `plugin_installed`, `plugin_uninstalled`, `plugin_permission_denied`           |
| **Data**     | `export_created`, `data_deleted`                                               |
| **Alert**    | `suspicious_activity`                                                          |

### Severity Levels

- **info** — normal operations (login success, profile update)
- **warn** — potential issues (login failure, 2FA failure, permission denied)
- **critical** — active threats (account lockout, suspicious activity)

### Retention

- 365-day TTL (MongoDB TTL index auto-cleanup)
- Immutable (no update operations at schema level)

### Endpoints

```
GET /api/v1/security/audit-log       → User's own activity
GET /api/v1/orgs/audit-log           → Org-wide audit (admin)
```

---

## Plugin Permission Sandbox

### Permission Format: `resource:action`

| Permission           | Description                       | Risk     |
| -------------------- | --------------------------------- | -------- |
| `transactions:read`  | Read transaction history          | Normal   |
| `transactions:write` | Create/update/delete transactions | **High** |
| `goals:read`         | Read financial goals              | Normal   |
| `goals:write`        | Modify goals                      | **High** |
| `profile:read`       | Read user profile                 | Normal   |
| `profile:write`      | Modify profile                    | **High** |
| `workflows:create`   | Create workflows                  | Normal   |
| `workflows:execute`  | Execute workflow actions          | **High** |
| `notifications:send` | Send user notifications           | Normal   |

### Enforcement

- **Fail-closed**: Unknown tools are denied by default
- **Runtime check**: Every plugin tool call is verified against granted permissions
- **High-risk flagging**: Install flow warns users about high-risk permissions
- **Manifest validation**: `POST /api/v1/plugins/validate-manifest`

---

## HTTP Security Headers

Applied via Helmet + custom middleware:

| Header                      | Value                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                                        |
| `X-Frame-Options`           | `DENY`                                                           |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), payment=(), usb=()`   |
| `Cache-Control`             | `no-store, no-cache, must-revalidate`                            |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production only) |
| `Content-Security-Policy`   | Restrictive policy via Helmet                                    |

---

## Connector Health Monitoring

- Sync success rate calculation (last 20 runs)
- Stale connection detection (auto-marks "error" after 48h)
- Webhook signature verification (HMAC-SHA256, constant-time comparison)

### Endpoint

```
GET /api/v1/integrations/health-summary
```

---

## Cookie Security

Cookie behavior is configurable for production deployment:

| Variable           | Default | Description                          |
| ------------------ | ------- | ------------------------------------ |
| `COOKIE_SECRET`    | —       | Secret for signed cookies            |
| `COOKIE_SECURE`    | auto    | Set Secure flag (auto in production) |
| `COOKIE_SAME_SITE` | `lax`   | SameSite attribute                   |
| `COOKIE_DOMAIN`    | —       | Cookie Domain scope                  |

> `COOKIE_SAME_SITE=none` requires `COOKIE_SECURE=true`.

---

## API Versioning

The canonical API surface is `/api/v1`. Legacy `/api` routes are maintained during a deprecation window and include `X-API-Deprecation` headers. All new features should target `/api/v1` exclusively.

---

_See also_: [MIDDLEWARE.md](./MIDDLEWARE.md) · [ENV_VARIABLES.md](./ENV_VARIABLES.md) · [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md)
