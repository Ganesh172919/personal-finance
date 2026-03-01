# FinWise — REST API Reference

> Complete reference for the FinWise backend API. All protected endpoints require a valid JWT token in the `Authorization: Bearer <token>` header or a valid API key.

---

## Base URL

```
Development: http://localhost:3000
Production:  https://<your-domain>/api
```

All versioned endpoints are prefixed with `/api/v1`.

---

## Authentication

### `POST /api/auth/register`

Register a new user account.

| Field      | Type   | Required |
| ---------- | ------ | -------- |
| `email`    | string | ✅       |
| `password` | string | ✅       |
| `name`     | string | ✅       |

### `POST /api/auth/login`

Authenticate and receive a JWT token.

### `POST /api/auth/verify-email`

Verify email address with a token sent via email.

### `POST /api/auth/forgot-password`

Request a password reset email.

### `POST /api/auth/reset-password`

Reset password with a valid reset token.

### `GET /api/auth/google`

Initiate Google OAuth2 sign-in flow.

### `GET /api/auth/google/callback`

Google OAuth2 callback handler.

### `GET /api/auth/me`

🔒 Returns the authenticated user's profile.

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

### `GET /api/v1/orgs/:orgId/members`

🔒 List members of an organization.

### `POST /api/v1/orgs/:orgId/invites`

🔒 Send an invite to join the organization.

### `POST /api/v1/invites/accept`

🔒 Accept an organization invite.

---

## Financial Data

### `GET /api/financial-data/profile`

🔒 Get the user's complete financial profile.

### `PUT /api/financial-data/profile`

🔒 Update the financial profile.

### `GET /api/financial-data/transactions`

🔒 List transactions with pagination, filtering, and sorting.

| Query Param | Type     | Description         |
| ----------- | -------- | ------------------- |
| `page`      | number   | Page number         |
| `limit`     | number   | Items per page      |
| `category`  | string   | Filter by category  |
| `startDate` | ISO date | Start of date range |
| `endDate`   | ISO date | End of date range   |
| `search`    | string   | Full-text search    |

### `POST /api/financial-data/transactions`

🔒 Create a new transaction.

### `PATCH /api/financial-data/transactions/:id`

🔒 Update a transaction.

### `DELETE /api/financial-data/transactions/:id`

🔒 Delete a transaction.

### `GET /api/financial-data/monthly-close/:periodKey`

🔒 Get month-close summary for a given period (e.g., `2024-01`).

### `POST /api/financial-data/monthly-close/:periodKey/close`

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

### `POST /api/ai/insights`

🔒 Generate AI-powered financial insights.

### `POST /api/ai/scenarios`

🔒 Run a what-if financial scenario.

### `POST /api/ai/financial-story`

🔒 Generate a narrative financial story.

### `POST /api/ai/handwriting`

🔒 OCR processing for handwritten receipts/notes.

---

## Chat

### `GET /api/chat/sessions`

🔒 List chat sessions.

### `POST /api/chat/sessions`

🔒 Create a new chat session.

### `GET /api/chat/sessions/:sessionId/messages`

🔒 Get messages for a session.

### `POST /api/chat/sessions/:sessionId/messages`

🔒 Send a message (triggers AI response via streaming).

### `DELETE /api/chat/sessions/:sessionId`

🔒 Delete a chat session.

---

## Tasks

### `GET /api/tasks`

🔒 List AI-generated financial tasks.

### `POST /api/tasks`

🔒 Create a task.

### `PATCH /api/tasks/:id`

🔒 Update task status.

### `POST /api/tasks/:id/apply`

🔒 Apply a task's recommended action.

---

## Workflows

### `GET /api/v1/workflows`

🔒 List organization workflows.

### `POST /api/v1/workflows`

🔒 Create a new workflow.

### `POST /api/v1/workflows/:id/run`

🔒 Trigger a workflow run.

### `GET /api/v1/workflow-templates`

🔒 List available workflow templates.

---

## Receipts

### `GET /api/receipts`

🔒 List receipts with pagination.

### `POST /api/receipts`

🔒 Upload and OCR-process a receipt (multipart form data).

### `GET /api/receipts/:id`

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

## Blogs & Growth Stories

### `GET /api/blogs`

List published blog posts.

### `GET /api/blogs/:slug`

Get a single blog post by slug.

### `GET /api/growth-stories`

List published growth stories.

### `GET /api/growth-stories/:slug`

Get a single growth story by slug.

---

## Billing & Monetization

### `POST /api/v1/billing/checkout`

🔒 Create a Stripe checkout session.

### `GET /api/v1/billing/portal`

🔒 Generate a Stripe customer portal link.

### `POST /api/v1/billing/webhook`

Stripe webhook handler (no auth — verified by Stripe signature).

### `GET /api/v1/usage`

🔒 Get current usage metrics.

### `GET /api/v1/usage/ledger`

🔒 Get detailed usage ledger entries.

### `GET /api/v1/credits`

🔒 Get credit balance.

---

## Tools & Autopilot

### `POST /api/v1/tools/simulate`

🔒 Simulate a financial tool action.

### `POST /api/v1/tools/execute`

🔒 Execute a financial tool action.

### `POST /api/v1/autopilot/plan`

🔒 Create an autopilot financial plan.

### `POST /api/v1/autopilot/:id/simulate`

🔒 Simulate an autopilot run.

### `POST /api/v1/autopilot/:id/execute`

🔒 Execute an approved autopilot run.

### `POST /api/v1/autopilot/:id/approve`

🔒 Approve an autopilot run for execution.

### `GET /api/v1/autopilot/:id`

🔒 Get autopilot run details.

---

## Integrations

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

### `POST /api/v1/integrations/transactions_csv/import`

🔒 Import transactions via CSV upload.

---

## Marketplace

### `GET /api/v1/marketplace/catalog`

🔒 Browse available marketplace plugins.

### `POST /api/v1/marketplace/install`

🔒 Install a marketplace plugin.

### `PATCH /api/v1/marketplace/installed/:key`

🔒 Update an installed plugin's configuration.

### `DELETE /api/v1/marketplace/installed/:key`

🔒 Uninstall a marketplace plugin.

---

## Notifications & Events

### `GET /api/v1/notifications`

🔒 List notifications.

### `POST /api/v1/notifications/:id/read`

🔒 Mark a notification as read.

### `GET /api/v1/events/stream`

🔒 Server-Sent Events (SSE) stream for real-time updates.

---

## Miscellaneous

### `GET /api/v1/feature-flags`

🔒 List feature flags.

### `PUT /api/v1/feature-flags/:key`

🔒 Update a feature flag value.

### `GET /api/v1/audit-events`

🔒 List audit log events.

### `POST /api/v1/referrals`

🔒 Create a referral code.

### `POST /api/v1/referrals/redeem`

🔒 Redeem a referral code.

### `GET /api/v1/memory`

🔒 List AI memory records.

### `DELETE /api/v1/memory/:id`

🔒 Delete an AI memory record.

### `POST /api/v1/automation/events/emit`

🔒 Emit a domain automation event.

---

## Shared / Public Routes

### `GET /api/share/:token`

Access a publicly shared financial story (no auth required).

### `GET /api/config`

Get public application configuration.

### `GET /api/media/:id`

Serve a stored media file (GridFS).

---

## Error Response Format

All errors follow a consistent shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "email", "message": "Invalid email format" }]
  }
}
```

| HTTP Status | Meaning                                 |
| ----------- | --------------------------------------- |
| `400`       | Bad Request — validation failed         |
| `401`       | Unauthorized — missing or invalid token |
| `403`       | Forbidden — insufficient permissions    |
| `404`       | Not Found                               |
| `429`       | Too Many Requests — rate limited        |
| `500`       | Internal Server Error                   |

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) · [SETUP.md](./SETUP.md)
