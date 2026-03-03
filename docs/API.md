# Personal Finance — REST API Reference

> Complete reference for the Personal Finance backend API. All protected endpoints require a valid JWT token in the `Authorization: Bearer <token>` header or a valid API key.

> **vNext Migration**: The canonical API surface is `/api/v1`. Legacy `/api` routes remain available during the deprecation window and include an `X-API-Deprecation` header.

---

## Base URL

```
Development: http://localhost:3000
Production:  https://<your-domain>/api
```

All versioned endpoints are prefixed with `/api/v1`.

---

## Authentication

### `POST /api/v1/auth/register`

Register a new user account.

| Field      | Type   | Required |
| ---------- | ------ | -------- |
| `email`    | string | ✅       |
| `password` | string | ✅       |
| `name`     | string | ✅       |

### `POST /api/v1/auth/login`

Authenticate and receive a JWT token. Returns `{ twoFactorEnabled: true }` if 2FA is active.

### `POST /api/v1/auth/verify-email`

Verify email address with a token sent via email.

### `POST /api/v1/auth/forgot-password`

Request a password reset email.

### `POST /api/v1/auth/reset-password`

Reset password with a valid reset token.

### `GET /api/v1/auth/google`

Initiate Google OAuth2 sign-in flow.

### `GET /api/v1/auth/google/callback`

Google OAuth2 callback handler.

### `GET /api/v1/auth/me`

🔒 Returns the authenticated user's profile (includes `authProvider`, `isEmailVerified`, `phoneNumber`).

### `PUT /api/v1/auth/profile`

🔒 Update the authenticated user's profile (name, phone, etc.).

### `POST /api/v1/auth/password`

🔒 Change the authenticated user's password (requires `currentPassword` and `newPassword`).

---

## Two-Factor Authentication (2FA)

### `POST /api/v1/auth/2fa/setup`

🔒 Generate TOTP secret and provisioning URI for QR code scanning.

### `POST /api/v1/auth/2fa/verify`

🔒 Verify a TOTP code to enable 2FA (on setup) or complete login (on auth).

### `POST /api/v1/auth/2fa/disable`

🔒 Disable 2FA (requires valid TOTP code or backup code).

### `GET /api/v1/auth/2fa/status`

🔒 Check whether 2FA is enabled for the authenticated user.

---

## Global Search

### `GET /api/v1/search`

🔒 Full-text search across transactions, tasks, and financial data.

| Query Param | Type   | Description           |
| ----------- | ------ | --------------------- |
| `q`         | string | Search query string   |
| `limit`     | number | Max results to return |

---

## Category Rules

### `GET /api/v1/category-rules`

🔒 List auto-categorization rules.

### `POST /api/v1/category-rules`

🔒 Create a new category rule.

### `PATCH /api/v1/category-rules/:id`

🔒 Update a category rule.

### `DELETE /api/v1/category-rules/:id`

🔒 Delete a category rule.

---

## Calendar Reminders

### `GET /api/v1/calendar-reminders`

🔒 List reminders for the current user, optionally filtered by date range.

| Query Param | Type   | Description             |
| ----------- | ------ | ----------------------- |
| `from`      | string | Start date (YYYY-MM-DD) |
| `to`        | string | End date (YYYY-MM-DD)   |

### `POST /api/v1/calendar-reminders`

🔒 Create a new calendar reminder.

| Field         | Type   | Required        |
| ------------- | ------ | --------------- |
| `date`        | string | ✅ (YYYY-MM-DD) |
| `title`       | string | ✅              |
| `description` | string |                 |

### `PATCH /api/v1/calendar-reminders/:id/toggle`

🔒 Toggle a reminder’s completion status.

### `DELETE /api/v1/calendar-reminders/:id`

🔒 Delete a calendar reminder.

---

## Organizations

### `GET /api/v1/orgs/me`

🔒 List organizations the current user belongs to.

### `POST /api/v1/orgs`

🔒 Create a new organization.

### `POST /api/v1/orgs/:orgId/members`

🔒 Add a member to an organization.

### `PATCH /api/v1/orgs/:orgId/settings`

🔒 Update organization settings.

### `POST /api/v1/org-invites/accept`

🔒 Accept an organization invite.

---

## API Keys

### `GET /api/v1/api-keys`

🔒 List API keys for the current user.

### `POST /api/v1/api-keys`

🔒 Create a new API key.

### `POST /api/v1/api-keys/:id/revoke`

🔒 Revoke an API key.

---

## Financial Data

### `GET /api/v1/financial-data/profile`

🔒 Get the user's complete financial profile.

### `PUT /api/v1/financial-data/profile`

🔒 Update the financial profile.

### `GET /api/v1/financial-data/transactions`

🔒 List transactions with pagination, filtering, and sorting.

| Query Param | Type     | Description         |
| ----------- | -------- | ------------------- |
| `page`      | number   | Page number         |
| `limit`     | number   | Items per page      |
| `category`  | string   | Filter by category  |
| `startDate` | ISO date | Start of date range |
| `endDate`   | ISO date | End of date range   |

### `POST /api/v1/financial-data/transactions`

🔒 Create a new transaction.

### `PATCH /api/v1/financial-data/transactions/:id`

🔒 Update a transaction.

### `DELETE /api/v1/financial-data/transactions/:id`

🔒 Delete a transaction.

### `GET /api/v1/financial-data/monthly-close/:periodKey`

🔒 Get month-close summary for a given period (e.g., `2024-01`).

### `POST /api/v1/financial-data/monthly-close/:periodKey/close`

🔒 Close a month and generate the period summary.

---

## Finance Module

### `GET /api/v1/finance/accounts`

🔒 List user's financial accounts.

### `POST /api/v1/finance/accounts`

🔒 Create a financial account.

### `PATCH /api/v1/finance/accounts/:id`

🔒 Update an account.

### `GET /api/v1/finance/merchants`

🔒 List merchants with optional search.

### `POST /api/v1/finance/merchants`

🔒 Create or update a merchant.

### `GET /api/v1/finance/budgets/:periodKey/allocations`

🔒 Get budget allocations for a period.

### `PUT /api/v1/finance/budgets/:periodKey/allocations`

🔒 Upsert budget allocations.

### `GET /api/v1/finance/budgets/:periodKey/envelopes`

🔒 Get budget envelope breakdown for a period (actual vs. allocated).

### `GET /api/v1/finance/recurring/candidates`

🔒 Detect recurring transaction candidates from transaction history.

### `GET /api/v1/finance/recurring`

🔒 List recurring transaction rules.

### `POST /api/v1/finance/recurring`

🔒 Create a recurring rule.

### `PATCH /api/v1/finance/recurring/:id`

🔒 Update a recurring rule.

### `GET /api/v1/finance/forecast`

🔒 Generate a forward-looking financial forecast.

---

## AI & Insights

### `POST /api/v1/ai/command`

🔒 Process an AI command (synchronous response).

### `POST /api/v1/ai/stream`

🔒 Process an AI command with streaming response (SSE).

### `POST /api/v1/ai/scenario`

🔒 Run a what-if financial scenario.

### `POST /api/v1/ai/insights`

🔒 Generate AI-powered financial insights.

### `POST /api/v1/ai/financial-story`

🔒 Generate a narrative financial story.

### `POST /api/v1/ai/handwriting`

🔒 OCR processing for handwritten receipts/notes.

---

## Chat

### `GET /api/v1/chat/sessions`

🔒 List chat sessions.

### `POST /api/v1/chat/sessions`

🔒 Create a new chat session.

### `GET /api/v1/chat/sessions/:sessionId/messages`

🔒 Get messages for a session.

### `POST /api/v1/chat/sessions/:sessionId/messages`

🔒 Send a message (triggers AI response via streaming).

### `DELETE /api/v1/chat/sessions/:sessionId`

🔒 Delete a chat session.

---

## Tasks

### `GET /api/v1/tasks`

🔒 List AI-generated financial tasks.

### `POST /api/v1/tasks`

🔒 Create a task.

### `PATCH /api/v1/tasks/:id`

🔒 Update task status.

### `POST /api/v1/tasks/:id/apply`

🔒 Apply a task's recommended action.

---

## Workflows

### `GET /api/v1/workflows`

🔒 List organization workflows.

### `POST /api/v1/workflows`

🔒 Create a new workflow.

### `POST /api/v1/workflows/:id/run`

🔒 Trigger a workflow run.

### `GET /api/v1/workflows/templates`

🔒 List available workflow templates.

---

## Receipts

### `GET /api/v1/receipts`

🔒 List receipts with pagination.

### `POST /api/v1/receipts`

🔒 Upload and OCR-process a receipt (multipart form data).

### `GET /api/v1/receipts/:id`

🔒 Get a single receipt with extracted data.

---

## Exports

### `GET /api/v1/exports`

🔒 List export jobs.

### `POST /api/v1/exports`

🔒 Create an export job (CSV, PDF).

### `GET /api/v1/exports/:id`

🔒 Get export job status.

### `GET /api/v1/exports/:id/download`

🔒 Download the generated export file.

---

## Autopilot

### `POST /api/v1/autopilot/plan`

🔒 Create an autopilot financial plan.

### `POST /api/v1/autopilot/simulate`

🔒 Simulate an autopilot run.

### `POST /api/v1/autopilot/approve`

🔒 Approve an autopilot run for execution.

### `POST /api/v1/autopilot/execute`

🔒 Execute an approved autopilot run.

### `GET /api/v1/autopilot/runs/:id`

🔒 Get autopilot run details.

---

## Tools

### `POST /api/v1/tools/simulate`

🔒 Simulate a financial tool action.

### `POST /api/v1/tools/execute`

🔒 Execute a financial tool action.

---

## Analytics

### `GET /api/v1/analytics/overview`

🔒 Get analytics overview with transaction summaries and trends.

---

## Blogs & Growth Stories

### `GET /api/v1/blogs`

List published blog posts.

### `GET /api/v1/blogs/:slug`

Get a single blog post by slug.

### `GET /api/v1/growth-stories`

List published growth stories.

### `GET /api/v1/growth-stories/:slug`

Get a single growth story by slug.

---

## Billing & Monetization

### `POST /api/v1/billing/checkout`

🔒 Create a Stripe checkout session.

### `GET /api/v1/billing/portal`

🔒 Generate a Stripe customer portal link.

### `POST /api/v1/billing/webhook`

Stripe webhook handler (no auth — verified by Stripe signature).

### `GET /api/v1/usage/ledger`

🔒 Get detailed usage ledger entries.

---

## Integrations

### `GET /api/v1/integrations`

🔒 List all integration connections.

### `POST /api/v1/integrations/:id/connect`

🔒 Connect an integration.

### `POST /api/v1/integrations/:id/disconnect`

🔒 Disconnect an integration.

### `POST /api/v1/integrations/:id/sync`

🔒 Trigger a data sync for an integration.

### `GET /api/v1/integrations/:id/history`

🔒 Get sync history.

### `GET /api/v1/integrations/:id/health`

🔒 Check integration health status.

### `GET /api/v1/integrations/health-summary`

🔒 Get connector health summary for all integrations in the org.

### `POST /api/v1/integrations/transactions_csv/import`

🔒 Import transactions via CSV upload (multipart form data).

---

## Marketplace & Plugins

### `GET /api/v1/marketplace/catalog`

🔒 Browse available marketplace plugins.

### `POST /api/v1/marketplace/install`

🔒 Install a marketplace plugin.

### `GET /api/v1/plugins`

🔒 List installed plugins.

### `POST /api/v1/plugins/:id/update`

🔒 Update an installed plugin's configuration.

### `POST /api/v1/plugins/:id/uninstall`

🔒 Uninstall a marketplace plugin.

### `POST /api/v1/plugins/validate-manifest`

🔒 Validate a plugin manifest against the permission schema.

---

## Shares

### `POST /api/v1/shares/financial-story`

🔒 Create a public share link for a financial story.

---

## Referrals

### `GET /api/v1/referrals/me`

🔒 Get the current user's referral code.

### `POST /api/v1/referrals/redeem`

🔒 Redeem a referral code.

---

## Notifications & Events

### `GET /api/v1/notifications`

🔒 List notifications.

### `POST /api/v1/notifications/:id/read`

🔒 Mark a notification as read.

### `GET /api/v1/events/stream`

🔒 Server-Sent Events (SSE) stream for real-time updates.

---

## Activity Feed

### `GET /api/v1/activity/feed`

🔒 Get the organization activity feed with recent actions and events.

| Query Param | Type   | Description           |
| ----------- | ------ | --------------------- |
| `limit`     | number | Max entries to return |
| `cursor`    | string | Cursor for pagination |

---

## Comments & Annotations

### `GET /api/v1/comments`

🔒 List comments for a given target resource.

| Query Param  | Type   | Description   |
| ------------ | ------ | ------------- |
| `targetType` | string | Resource type |
| `targetId`   | string | Resource ID   |

### `POST /api/v1/comments`

🔒 Create a new comment on a resource.

### `PATCH /api/v1/comments/:id`

🔒 Update a comment.

### `DELETE /api/v1/comments/:id`

🔒 Delete a comment.

---

## Settings & Profile

### `GET /api/v1/settings/profile`

🔒 Get the current user's profile and preferences.

### `PATCH /api/v1/settings/profile`

🔒 Update user profile information.

### `PATCH /api/v1/settings/preferences`

🔒 Update user preferences (theme, notifications, etc.).

---

## Automation Events

### `GET /api/v1/automation/events`

🔒 List domain automation events.

### `POST /api/v1/automation/events/emit`

🔒 Emit a domain automation event.

---

## Feature Flags

### `GET /api/v1/feature-flags`

🔒 List feature flags.

### `PUT /api/v1/feature-flags/:key`

🔒 Upsert a feature flag value.

### `DELETE /api/v1/feature-flags/:key`

🔒 Delete a feature flag.

---

## Security Audit Log

### `GET /api/v1/security/audit-log`

🔒 Get the current user's security audit log.

| Query Param | Type   | Description                       |
| ----------- | ------ | --------------------------------- |
| `limit`     | number | Max entries (default 50, max 200) |
| `actions`   | string | Comma-separated action filter     |

### `GET /api/v1/orgs/audit-log`

🔒 Get org-wide audit log (requires org context).

| Query Param | Type   | Description                             |
| ----------- | ------ | --------------------------------------- |
| `limit`     | number | Max entries (default 100, max 500)      |
| `severity`  | string | Filter by severity (info/warn/critical) |

---

## Miscellaneous

### `GET /api/v1/audit/events`

🔒 List audit log events (operational).

### `GET /api/v1/config`

Get public application configuration.

### `GET /api/v1/media/:id`

Serve a stored media file (GridFS).

### `GET /api/v1/public/:token`

Access a publicly shared financial story (no auth required).

---

## Health & Diagnostics

### `GET /healthz`

Liveness probe (returns `ok`).

### `GET /api/test`

Returns greeting JSON (quick connectivity check).

### `GET /api/python-health`

Check Python AI Core service health.

### `GET /api/metrics`

Prometheus metrics (requires `METRICS_TOKEN` in Authorization header).

---

## Internal Tools

### `POST /api/internal/tools/execute`

🔒 Execute internal tool calls (AI agent → server tool bridge).

---

## Error Response Format

All errors follow a consistent flat shape:

```json
{
  "message": "Human-readable description",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "email", "message": "Invalid email format" }],
  "request_id": "req_abc123"
}
```

| HTTP Status | Meaning                                 |
| ----------- | --------------------------------------- |
| `400`       | Bad Request — validation failed         |
| `401`       | Unauthorized — missing or invalid token |
| `402`       | Payment Required — feature limit hit    |
| `403`       | Forbidden — insufficient permissions    |
| `404`       | Not Found                               |
| `429`       | Too Many Requests — rate limited        |
| `500`       | Internal Server Error                   |

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) · [SETUP.md](./SETUP.md) · [MIDDLEWARE.md](./MIDDLEWARE.md) · [SERVICES.md](./SERVICES.md)
