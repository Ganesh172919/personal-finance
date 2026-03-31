# FinWise API Reference

> **Version:** v1 (canonical) / legacy (deprecated)
> **Base URL:** `https://api.finwise.app` (production) / `http://localhost:3001` (development)
> **Last Updated:** 2026-03-31

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Authentication](#2-authentication)
3. [API Route Groups](#3-api-route-groups)
   - [3.1 Auth (`/api/v1/auth/*`)](#31-auth-apiv1auth)
   - [3.2 Organizations (`/api/v1/orgs/*`)](#32-organizations-apiv1orgs)
   - [3.3 Finance (`/api/v1/finance/*`)](#33-finance-apiv1finance)
   - [3.4 Transactions (`/api/v1/transactions`)](#34-transactions-apiv1transactions)
   - [3.5 AI (`/api/v1/ai/*`)](#35-ai-apiv1ai)
   - [3.6 Chat (`/api/v1/chat/*`)](#36-chat-apiv1chat)
   - [3.7 Workflows (`/api/v1/workflows/*`)](#37-workflows-apiv1workflows)
   - [3.8 Analytics (`/api/v1/analytics/*`)](#38-analytics-apiv1analytics)
   - [3.9 Tasks (`/api/v1/tasks/*`)](#39-tasks-apiv1tasks)
   - [3.10 Receipts (`/api/v1/receipts/*`)](#310-receipts-apiv1receipts)
   - [3.11 Files (`/api/v1/files/*`)](#311-files-apiv1files)
   - [3.12 Journal (`/api/v1/financial-journal/*`)](#312-journal-apiv1financial-journal)
   - [3.13 Billing (`/api/v1/billing/*`)](#313-billing-apiv1billing)
   - [3.14 Notifications (`/api/v1/notifications/*`)](#314-notifications-apiv1notifications)
   - [3.15 Search (`/api/v1/search`)](#315-search-apiv1search)
   - [3.16 Exports (`/api/v1/exports/*`)](#316-exports-apiv1exports)
   - [3.17 Plugins (`/api/v1/plugins/*`)](#317-plugins-apiv1plugins)
   - [3.18 Integrations (`/api/v1/integrations/*`)](#318-integrations-apiv1integrations)
   - [3.19 Comments (`/api/v1/comments/*`)](#319-comments-apiv1comments)
   - [3.20 Shares (`/api/v1/shares/*`)](#320-shares-apiv1shares)
   - [3.21 Referrals (`/api/v1/referrals/*`)](#321-referrals-apiv1referrals)
   - [3.22 Feature Flags (`/api/v1/feature-flags/*`)](#322-feature-flags-apiv1feature-flags)
   - [3.23 Audit (`/api/v1/audit/*`)](#323-audit-apiv1audit)
   - [3.24 Tools (`/api/v1/tools/*`)](#324-tools-apiv1tools)
   - [3.25 Calendar (`/api/v1/calendar-reminders/*`)](#325-calendar-apiv1calendar-reminders)
   - [3.26 Marketplace (`/api/v1/marketplace/*`)](#326-marketplace-apiv1marketplace)
   - [3.27 Autopilot (`/api/v1/autopilot/*`)](#327-autopilot-apiv1autopilot)
   - [3.28 Category Rules (`/api/v1/category-rules/*`)](#328-category-rules-apiv1category-rules)
   - [3.29 API Keys (`/api/v1/api-keys/*`)](#329-api-keys-apiv1api-keys)
   - [3.30 Usage (`/api/v1/usage/*`)](#330-usage-apiv1usage)
   - [3.31 Automation (`/api/v1/automation/*`)](#331-automation-apiv1automation)
   - [3.32 Security (`/api/v1/security/*`)](#332-security-apiv1security)
   - [3.33 Events (`/api/v1/events/*`)](#333-events-apiv1events)
   - [3.34 Activity Feed (`/api/v1/activity-feed`)](#334-activity-feed-apiv1activity-feed)
   - [3.35 Config (`/api/v1/config/*`)](#335-config-apiv1config)
   - [3.36 Media (`/api/v1/media/*`)](#336-media-apiv1media)
   - [3.37 Content (`/api/v1/blogs/*`, `/api/v1/growth-stories/*`)](#337-content-apiv1blogs-apiv1growth-stories)
   - [3.38 Public Shares (`/api/v1/public/*`)](#338-public-shares-apiv1public)
   - [3.39 Internal Tools (`/api/internal/tools/*`)](#339-internal-tools-apiinternaltools)
4. [Response Format](#4-response-format)
5. [Error Codes](#5-error-codes)
6. [Authentication Requirements](#6-authentication-requirements)
7. [Rate Limiting](#7-rate-limiting)
8. [Deprecation Policy](#8-deprecation-policy)

---

## 1. API Overview

### Base URLs

| Environment | URL |
|---|---|
| Production | `https://api.finwise.app` |
| Development | `http://localhost:3001` |

### Authentication

FinWise uses **JWT cookie-based authentication** for browser clients and **Bearer token / API key** authentication for programmatic access.

| Method | Header / Cookie | Description |
|---|---|---|
| JWT Cookie | `accessToken` (httpOnly, secure) | Set automatically after login; sent with every request |
| Bearer Token | `Authorization: Bearer <jwt>` | For API clients and mobile apps |
| API Key | `Authorization: Bearer <api-key>` or `X-Api-Key: <api-key>` | Scoped, org-bound keys for server-to-server access |

### Organization Context

Multi-tenant endpoints require an organization context. The server resolves this via:

| Method | Description |
|---|---|
| `X-Org-Id` header | Explicitly specify the org ID |
| Default org | If no header is provided, the user's default org is used |
| API key org | API keys are bound to a specific org; no header needed |

### Validation

All request inputs are validated server-side using **Zod schemas**. Invalid payloads return `400 Bad Request` with a `VALIDATION_ERROR` code and a `details` object containing `fieldErrors`.

### Response Format

All responses follow a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful",
  "request_id": "req_abc123",
  "org_id": "org_xyz789"
}
```

Error responses:

```json
{
  "success": false,
  "message": "Invalid request payload",
  "code": "VALIDATION_ERROR",
  "details": { "fieldErrors": { "email": ["Invalid email format"] } },
  "request_id": "req_abc123"
}
```

### Rate Limits

| Tier | Limit | Window | Keyed By |
|---|---|---|---|
| General API | 200 requests | 1 minute | Org / API key org / User / IP |
| Auth endpoints | 20 requests | 1 minute | IP address |

Rate limit headers are included in every response:

```
RateLimit-Limit: 200
RateLimit-Remaining: 195
RateLimit-Reset: 1711900800
```

### Health Checks & Metrics

| Endpoint | Auth | Description |
|---|---|---|
| `GET /healthz` | None | Simple liveness check; returns `ok` |
| `GET /api/test` | None | Basic connectivity test |
| `GET /api/python-health` | None | AI Core (Python service) health proxy |
| `GET /api/metrics` | Bearer token (`METRICS_TOKEN`) | Prometheus metrics endpoint |

### SSE (Server-Sent Events)

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/v1/events/stream` | JWT | Real-time event stream for the authenticated user's org |

---

## 2. Authentication

All auth routes are mounted at `/api/v1/auth/*`. Auth endpoints have a stricter rate limit of **20 requests per minute per IP**.

### 2.1 Get Available Providers

```
GET /api/v1/auth/providers
```

Returns which authentication providers are configured.

**Response:**

```json
{
  "email": true,
  "google": true,
  "request_id": "req_abc123"
}
```

### 2.2 Get CSRF Token

```
GET /api/v1/auth/csrf
```

Returns a CSRF token for form submissions.

**Response:**

```json
{
  "csrfToken": "csrf_abc123...",
  "request_id": "req_abc123"
}
```

### 2.3 Register

```
POST /api/v1/auth/register
```

Creates a new user account.

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecureP@ssw0rd!"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | Yes | 2–100 characters |
| `email` | string | Yes | Valid email format, unique |
| `password` | string | Yes | Min 8 chars, uppercase, lowercase, number, special char |

**Response (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "John Doe",
      "email": "john@example.com",
      "emailVerified": false
    },
    "message": "Registration successful. Please verify your email."
  },
  "request_id": "req_abc123"
}
```

**curl Example:**

```bash
curl -X POST https://api.finwise.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"SecureP@ssw0rd!"}'
```

### 2.4 Login

```
POST /api/v1/auth/login
```

Authenticates a user and sets JWT cookies.

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "SecureP@ssw0rd!"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "John Doe",
      "email": "john@example.com",
      "emailVerified": true
    },
    "requires2FA": false
  },
  "request_id": "req_abc123"
}
```

Sets httpOnly cookies:
- `accessToken` — JWT access token
- `refreshToken` — JWT refresh token (if rotation enabled)

### 2.5 Verify Email

```
POST /api/v1/auth/verify-email
```

Verifies a user's email address with a token.

**Request Body:**

```json
{
  "token": "email_verify_abc123..."
}
```

### 2.6 Resend Verification Email

```
POST /api/v1/auth/resend-verification
```

Resends the email verification link.

**Request Body:**

```json
{
  "email": "john@example.com"
}
```

### 2.7 Google OAuth

```
GET  /api/v1/auth/google
GET  /api/v1/auth/google/callback
```

Initiates and completes the Google OAuth flow.

**Step 1 — Redirect:**

```bash
curl -v https://api.finwise.app/api/v1/auth/google
# → 302 redirect to Google OAuth consent screen
```

**Step 2 — Callback:**

Google redirects back to `/api/v1/auth/google/callback?code=...&state=...`. The server exchanges the code, creates or finds the user, sets JWT cookies, and redirects to the client app.

### 2.8 Get Profile

```
GET /api/v1/auth/profile
```

Returns the authenticated user's profile.

**Auth:** Required (JWT)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": true,
    "avatar": "https://...",
    "createdAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-03-20T14:22:00Z"
  },
  "request_id": "req_abc123"
}
```

### 2.9 Update Profile

```
PUT /api/v1/auth/profile
```

Updates the authenticated user's profile.

**Auth:** Required (JWT)

**Request Body:**

```json
{
  "name": "John A. Doe",
  "avatar": "https://..."
}
```

### 2.10 Change Password

```
POST /api/v1/auth/password
```

Changes the authenticated user's password.

**Auth:** Required (JWT)

**Request Body:**

```json
{
  "currentPassword": "OldP@ssw0rd!",
  "newPassword": "NewP@ssw0rd!"
}
```

### 2.11 Logout

```
POST /api/v1/auth/logout
```

Clears authentication cookies and invalidates the session.

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully",
  "request_id": "req_abc123"
}
```

### 2.12 Two-Factor Authentication

#### Setup 2FA

```
POST /api/v1/auth/2fa/setup
```

Generates a TOTP secret and QR code URI.

**Auth:** Required (JWT)

**Response:**

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUri": "otpauth://totp/FinWise:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=FinWise"
  },
  "request_id": "req_abc123"
}
```

#### Verify 2FA

```
POST /api/v1/auth/2fa/verify
```

Verifies a TOTP code to enable 2FA.

**Auth:** Required (JWT)

**Request Body:**

```json
{
  "token": "123456"
}
```

#### Get 2FA Status

```
GET /api/v1/auth/2fa/status
```

Returns whether 2FA is enabled for the user.

**Auth:** Required (JWT)

**Response:**

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "backupCodesRemaining": 8
  },
  "request_id": "req_abc123"
}
```

#### Disable 2FA

```
POST /api/v1/auth/2fa/disable
```

Disables two-factor authentication.

**Auth:** Required (JWT)

**Request Body:**

```json
{
  "token": "123456"
}
```

---

## 3. API Route Groups

### 3.1 Auth (`/api/v1/auth/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/providers` | None | List available auth providers |
| `GET` | `/csrf` | None | Get CSRF token |
| `POST` | `/register` | None | Create new account |
| `POST` | `/login` | None | Authenticate user |
| `POST` | `/verify-email` | None | Verify email address |
| `POST` | `/resend-verification` | None | Resend verification email |
| `GET` | `/google` | None | Initiate Google OAuth |
| `GET` | `/google/callback` | None | Complete Google OAuth |
| `GET` | `/profile` | JWT | Get user profile |
| `PUT` | `/profile` | JWT | Update user profile |
| `POST` | `/password` | JWT | Change password |
| `POST` | `/logout` | None | Logout and clear cookies |
| `POST` | `/2fa/setup` | JWT | Setup 2FA |
| `POST` | `/2fa/verify` | JWT | Verify 2FA token |
| `POST` | `/2fa/disable` | JWT | Disable 2FA |
| `GET` | `/2fa/status` | JWT | Get 2FA status |

### 3.2 Organizations (`/api/v1/orgs/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/orgs/me` | JWT | List user's organizations |
| `POST` | `/orgs` | JWT | Create a new organization |
| `POST` | `/orgs/:orgId/members` | JWT | Add a member to an org |
| `PATCH` | `/orgs/:orgId/settings` | JWT | Update org settings |
| `POST` | `/org-invites/accept` | JWT | Accept an org invitation |
| `GET` | `/orgs/audit-log` | JWT | Get org audit log |

#### Create Organization

```
POST /api/v1/orgs
```

**Request Body:**

```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "free"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "org_abc123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "role": "owner",
    "isDefault": true
  },
  "request_id": "req_abc123"
}
```

#### List My Organizations

```
GET /api/v1/orgs/me
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "org_abc123",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "role": "owner",
      "isDefault": true,
      "memberCount": 3
    },
    {
      "id": "org_def456",
      "name": "Personal Finances",
      "slug": "personal",
      "role": "owner",
      "isDefault": false,
      "memberCount": 1
    }
  ],
  "request_id": "req_abc123"
}
```

#### Add Org Member

```
POST /api/v1/orgs/:orgId/members
```

**Request Body:**

```json
{
  "email": "jane@example.com",
  "role": "member"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Email of the user to invite |
| `role` | string | Yes | One of: `owner`, `admin`, `member`, `viewer` |

#### Update Org Settings

```
PATCH /api/v1/orgs/:orgId/settings
```

**Request Body:**

```json
{
  "name": "Acme Corp (Updated)",
  "defaultCurrency": "USD",
  "fiscalYearStart": "01-01"
}
```

### 3.3 Finance (`/api/v1/finance/*`)

#### Accounts

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/finance/accounts` | JWT | List all accounts |
| `POST` | `/finance/accounts` | JWT | Create an account |
| `PATCH` | `/finance/accounts/:id` | JWT | Update an account |

**Create Account:**

```json
{
  "name": "Chase Checking",
  "type": "checking",
  "balance": 5420.50,
  "currency": "USD"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Account display name |
| `type` | string | Yes | `checking`, `savings`, `credit`, `investment`, `loan`, `cash`, `crypto` |
| `balance` | number | Yes | Current balance |
| `currency` | string | No | ISO 4217 currency code (default: org currency) |

#### Merchants

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/finance/merchants` | JWT | List merchants (paginated) |
| `POST` | `/finance/merchants` | JWT | Create or update a merchant |

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `q` | string | Search query |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |

#### Budgets

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/finance/budgets/:periodKey/allocations` | JWT | List budget allocations for a period |
| `PUT` | `/finance/budgets/:periodKey/allocations` | JWT | Upsert budget allocations |
| `GET` | `/finance/budgets/:periodKey/envelopes` | JWT | Get budget envelope data |

**Path Parameters:**

| Param | Type | Description |
|---|---|---|
| `periodKey` | string | Period identifier, e.g. `2026-03` for monthly |

**Query Parameters for Allocations:**

| Param | Type | Description |
|---|---|---|
| `categoryId` | string | Filter by category |

#### Recurring Rules

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/finance/recurring` | JWT | List recurring rules |
| `POST` | `/finance/recurring` | JWT | Create a recurring rule |
| `PATCH` | `/finance/recurring/:id` | JWT | Update a recurring rule |
| `GET` | `/finance/recurring/candidates` | JWT | Get recurring transaction candidates |

**Create Recurring Rule:**

```json
{
  "description": "Netflix Subscription",
  "amount": 15.99,
  "frequency": "monthly",
  "categoryId": "cat_entertainment",
  "accountId": "acc_checking_01",
  "startDate": "2026-01-01"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Rule description |
| `amount` | number | Yes | Transaction amount |
| `frequency` | string | Yes | `weekly`, `biweekly`, `monthly`, `quarterly`, `yearly` |
| `categoryId` | string | No | Auto-categorization category |
| `accountId` | string | No | Source account |
| `startDate` | string | Yes | ISO date for first occurrence |

#### Forecast

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/finance/forecast` | JWT | Get cash flow forecast |

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `months` | number | Forecast horizon (default: 6, max: 24) |
| `accountId` | string | Filter by specific account |

### 3.4 Transactions (`/api/v1/transactions`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/transactions` | JWT | Create a transaction |
| `GET` | `/transactions` | JWT | List transactions (paginated, filterable) |
| `GET` | `/transactions/recent` | JWT | Get recent transactions |
| `GET` | `/transactions/summary` | JWT | Get transaction summary/aggregates |
| `PATCH` | `/transactions/:id` | JWT | Update a transaction |
| `DELETE` | `/transactions/:id` | JWT | Delete a transaction |
| `POST` | `/transactions/import` | JWT | Import transactions from external source |
| `POST` | `/integrations/transactions_csv/import` | JWT | Import transactions from CSV file |

#### Create Transaction

```
POST /api/v1/transactions
```

**Request Body:**

```json
{
  "amount": -42.50,
  "description": "Grocery store",
  "date": "2026-03-28",
  "categoryId": "cat_groceries",
  "accountId": "acc_checking_01",
  "merchantId": "merch_abc123",
  "tags": ["essential", "weekly"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | Yes | Positive = income, negative = expense |
| `description` | string | Yes | Transaction description |
| `date` | string | Yes | ISO date string |
| `categoryId` | string | No | Category ID |
| `accountId` | string | No | Account ID |
| `merchantId` | string | No | Merchant ID |
| `tags` | string[] | No | Free-form tags |
| `type` | string | No | `income`, `expense`, `transfer` |

#### List Transactions

```
GET /api/v1/transactions
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50, max: 200) |
| `startDate` | string | Filter from date (ISO) |
| `endDate` | string | Filter to date (ISO) |
| `categoryId` | string | Filter by category |
| `accountId` | string | Filter by account |
| `type` | string | Filter by type: `income`, `expense`, `transfer` |
| `q` | string | Full-text search on description |
| `sort` | string | Sort field: `date`, `amount` |
| `order` | string | Sort order: `asc`, `desc` |

#### CSV Import

```
POST /api/v1/integrations/transactions_csv/import
```

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | file | CSV file with transaction data |
| `accountId` | string | Target account ID |
| `dateFormat` | string | Date format in CSV (e.g. `YYYY-MM-DD`) |
| `hasHeader` | boolean | Whether CSV has a header row (default: true) |

### 3.5 AI (`/api/v1/ai/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/ai/command` | JWT | Process an AI command |
| `POST` | `/ai/stream` | JWT | Process AI command with SSE streaming |
| `POST` | `/ai/scenario` | JWT | Run a what-if scenario |
| `GET` | `/ai/financial-profiles/me` | JWT | Get user's financial profile |
| `PUT` | `/ai/financial-profiles/me` | JWT | Update financial profile |
| `POST` | `/ai/financial-profiles/investments` | JWT | Add an investment to profile |
| `GET` | `/ai/agent-outputs/recent` | JWT | Get recent agent outputs |
| `GET` | `/ai/agent-outputs/:id` | JWT | Get agent output by ID |
| `GET` | `/ai/agent-outputs/user/:userId` | JWT | Get all agent outputs for a user |
| `POST` | `/ai/agent-outputs/:id/feedback` | JWT | Submit feedback on agent output |
| `GET` | `/ai/ai-core/status` | JWT | Get AI Core service status |
| `GET` | `/ai/ai-core/providers` | JWT | Get available AI providers |

#### Process AI Command

```
POST /api/v1/ai/command
```

**Request Body:**

```json
{
  "command": "What were my total expenses last month?",
  "context": {
    "orgId": "org_abc123"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "answer": "Your total expenses for February 2026 were $3,247.82 across 127 transactions.",
    "breakdown": {
      "categories": [
        { "name": "Groceries", "amount": 842.50 },
        { "name": "Transport", "amount": 312.00 },
        { "name": "Entertainment", "amount": 198.75 }
      ],
      "totalTransactions": 127,
      "period": "2026-02"
    },
    "confidence": 0.95
  },
  "request_id": "req_abc123"
}
```

#### AI Stream (SSE)

```
POST /api/v1/ai/stream
```

Same request body as `/ai/command`. Returns a Server-Sent Events stream with incremental tokens.

**Response Headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Format:**

```
data: {"type": "token", "content": "Your"}
data: {"type": "token", "content": " total"}
data: {"type": "token", "content": " expenses"}
data: {"type": "done", "data": {"answer": "Your total expenses...", "confidence": 0.95}}
```

#### What-If Scenario

```
POST /api/v1/ai/scenario
```

**Request Body:**

```json
{
  "scenario": "What if I increase my monthly savings by $500?",
  "parameters": {
    "monthlySavingsDelta": 500,
    "timeHorizonMonths": 12
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": "Increasing monthly savings by $500 would add $6,000 to your net worth over 12 months.",
    "projections": [
      { "month": "2026-04", "netWorth": 45200 },
      { "month": "2026-10", "netWorth": 48200 },
      { "month": "2027-03", "netWorth": 51200 }
    ],
    "risks": ["Reduced emergency fund buffer in months 1-3"],
    "confidence": 0.88
  },
  "request_id": "req_abc123"
}
```

#### Financial Profile

```
GET /api/v1/ai/financial-profiles/me
```

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "riskTolerance": "moderate",
    "investmentHorizon": "long-term",
    "monthlyIncome": 8500,
    "monthlyExpenses": 5200,
    "savingsRate": 0.39,
    "netWorth": 42000,
    "goals": ["Emergency fund: $15,000", "Retirement: $1,000,000"],
    "investments": [
      { "type": "401k", "value": 28000, "provider": "Vanguard" },
      { "type": "IRA", "value": 12000, "provider": "Fidelity" }
    ]
  },
  "request_id": "req_abc123"
}
```

### 3.6 Chat (`/api/v1/chat/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/chat/sessions` | JWT | Create a chat session |
| `GET` | `/chat/sessions` | JWT | List chat sessions |
| `GET` | `/chat/sessions/:sessionId` | JWT | Get a session by ID |
| `DELETE` | `/chat/sessions/:sessionId` | JWT | Delete a session |
| `PATCH` | `/chat/sessions/:sessionId` | JWT | Rename a session |
| `GET` | `/chat/sessions/:sessionId/messages` | JWT | Get messages for a session |
| `POST` | `/chat/sessions/:sessionId/messages` | JWT | Send a message |
| `GET` | `/chat/insights/conversation` | JWT | Get conversation insights |

#### Create Session

```
POST /api/v1/chat/sessions
```

**Request Body:**

```json
{
  "title": "Budget Planning Q2",
  "type": "finance"
}
```

#### Send Message

```
POST /api/v1/chat/sessions/:sessionId/messages
```

**Request Body:**

```json
{
  "content": "Help me plan my Q2 budget",
  "attachments": ["file_abc123"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg_xyz789",
      "role": "assistant",
      "content": "I'd be happy to help you plan your Q2 budget...",
      "timestamp": "2026-03-31T10:00:00Z"
    }
  },
  "request_id": "req_abc123"
}
```

#### List Sessions

```
GET /api/v1/chat/sessions
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `type` | string | Filter by session type |

### 3.7 Workflows (`/api/v1/workflows/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/workflows` | JWT | List org workflows |
| `POST` | `/workflows` | JWT | Create a workflow |
| `POST` | `/workflows/:id/run` | JWT | Run a workflow |
| `GET` | `/workflows/templates` | JWT | List workflow templates |

#### Create Workflow

```
POST /api/v1/workflows
```

**Request Body:**

```json
{
  "name": "Monthly Reconciliation",
  "description": "Auto-reconcile transactions at month-end",
  "steps": [
    {
      "type": "fetch_transactions",
      "params": { "period": "current_month" }
    },
    {
      "type": "categorize",
      "params": { "strategy": "ai" }
    },
    {
      "type": "notify",
      "params": { "channel": "email" }
    }
  ],
  "schedule": "0 0 1 * *"
}
```

#### Run Workflow

```
POST /api/v1/workflows/:id/run
```

**Request Body:**

```json
{
  "params": {
    "dryRun": false
  }
}
```

### 3.8 Analytics (`/api/v1/analytics/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/analytics/overview` | JWT | Get analytics overview |
| `GET` | `/analytics/spending-heatmap` | JWT | Get spending heatmap data |
| `GET` | `/analytics/category-trends` | JWT | Get category trend data |
| `GET` | `/analytics/income-expense` | JWT | Get income vs expense summary |
| `GET` | `/analytics/account-balances` | JWT | Get account balance overview |
| `GET` | `/analytics/top-merchants` | JWT | Get top merchants by spend |

#### Analytics Overview

```
GET /api/v1/analytics/overview
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `period` | string | `7d`, `30d`, `90d`, `ytd`, `custom` |
| `startDate` | string | Custom start date (ISO) |
| `endDate` | string | Custom end date (ISO) |

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "30d",
    "totalIncome": 8500.00,
    "totalExpenses": 5247.82,
    "netSavings": 3252.18,
    "savingsRate": 0.38,
    "topCategory": { "name": "Groceries", "amount": 842.50 },
    "transactionCount": 127,
    "averageDailySpend": 174.93
  },
  "request_id": "req_abc123"
}
```

#### Spending Heatmap

```
GET /api/v1/analytics/spending-heatmap
```

Returns a day-of-week × hour-of-day matrix of spending intensity.

### 3.9 Tasks (`/api/v1/tasks/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/tasks/from-plan` | JWT | Create tasks from an AI plan |
| `GET` | `/tasks` | JWT | List tasks |
| `GET` | `/tasks/:id` | JWT | Get a task by ID |
| `PATCH` | `/tasks/:id` | JWT | Update a task |
| `POST` | `/tasks/:id/apply` | JWT | Apply/execute a task |

**Query Parameters for List:**

| Param | Type | Description |
|---|---|---|
| `status` | string | `pending`, `in_progress`, `completed`, `failed` |
| `page` | number | Page number |
| `limit` | number | Items per page |

### 3.10 Receipts (`/api/v1/receipts/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/receipts/parse` | JWT | Upload and parse a receipt |
| `POST` | `/receipts/:id/confirm` | JWT | Confirm a parsed receipt |
| `GET` | `/receipts` | JWT | List receipts |
| `GET` | `/receipts/:id` | JWT | Get a receipt by ID |
| `DELETE` | `/receipts/:id` | JWT | Delete a receipt |

#### Parse Receipt

```
POST /api/v1/receipts/parse
```

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | file | Receipt image (JPG, PNG, PDF) |
| `merchantHint` | string | Optional merchant name hint |

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "rcpt_abc123",
    "merchant": "Whole Foods Market",
    "date": "2026-03-28",
    "total": 87.43,
    "tax": 6.12,
    "items": [
      { "description": "Organic Bananas", "quantity": 1, "price": 3.49 },
      { "description": "Almond Milk", "quantity": 2, "price": 8.98 }
    ],
    "confidence": 0.94,
    "status": "parsed"
  },
  "request_id": "req_abc123"
}
```

#### Confirm Receipt

```
POST /api/v1/receipts/:id/confirm
```

**Request Body:**

```json
{
  "categoryId": "cat_groceries",
  "accountId": "acc_checking_01",
  "notes": "Weekly groceries"
}
```

### 3.11 Files (`/api/v1/files/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/files` | JWT | Upload files (max 10) |
| `GET` | `/files` | JWT | List workspace files |
| `GET` | `/files/:id` | JWT | Get a file by ID |
| `POST` | `/files/:id/analyze` | JWT | Analyze a file with AI |
| `DELETE` | `/files/:id` | JWT | Delete a file |

#### Upload Files

```
POST /api/v1/files
```

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `files` | file[] | Up to 10 files |

#### Analyze File

```
POST /api/v1/files/:id/analyze
```

**Request Body:**

```json
{
  "analysisType": "extract_data",
  "prompt": "Extract all financial data from this document"
}
```

### 3.12 Journal (`/api/v1/financial-journal/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/financial-journal/entries` | JWT | List journal entries |
| `GET` | `/financial-journal/entries/:id` | JWT | Get an entry by ID |
| `PATCH` | `/financial-journal/entries/:id` | JWT | Update an entry |
| `POST` | `/financial-journal/entries/:id/insights` | JWT | Generate AI insights for an entry |
| `POST` | `/financial-journal/recognize-handwriting` | JWT | OCR handwriting from image |

#### Recognize Handwriting

```
POST /api/v1/financial-journal/recognize-handwriting
```

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | file | Image of handwritten notes |

### 3.13 Billing (`/api/v1/billing/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/billing/checkout` | JWT | Create a Stripe checkout session |
| `GET` | `/billing/portal` | JWT | Get Stripe billing portal URL |
| `POST` | `/billing/webhook` | None | Stripe webhook (signature verified) |

#### Create Checkout Session

```
POST /api/v1/billing/checkout
```

**Request Body:**

```json
{
  "planId": "pro_monthly",
  "successUrl": "https://app.finwise.app/billing/success",
  "cancelUrl": "https://app.finwise.app/billing/cancel"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "cs_test_abc123",
    "url": "https://checkout.stripe.com/pay/cs_test_abc123"
  },
  "request_id": "req_abc123"
}
```

#### Billing Portal

```
GET /api/v1/billing/portal
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `returnUrl` | string | URL to redirect after portal session |

### 3.14 Notifications (`/api/v1/notifications/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | JWT | List notifications |
| `POST` | `/notifications/:id/read` | JWT | Mark a notification as read |

#### List Notifications

```
GET /api/v1/notifications
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `unreadOnly` | boolean | Only return unread notifications |
| `type` | string | Filter by notification type |

### 3.15 Search (`/api/v1/search`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/search` | JWT | Global search across all entities |

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `q` | string | **Required.** Search query |
| `types` | string | Comma-separated entity types: `transactions`, `accounts`, `merchants`, `receipts`, `journal` |
| `limit` | number | Max results (default: 20, max: 50) |
| `startDate` | string | Filter from date |
| `endDate` | string | Filter to date |

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "type": "transaction",
        "id": "txn_abc123",
        "highlight": "Grocery store - $42.50",
        "score": 0.92,
        "data": { "amount": -42.50, "date": "2026-03-28" }
      }
    ],
    "total": 15
  },
  "request_id": "req_abc123"
}
```

### 3.16 Exports (`/api/v1/exports/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/exports` | JWT | List exports |
| `POST` | `/exports` | JWT | Create an export job |
| `GET` | `/exports/:id` | JWT | Get export status |
| `GET` | `/exports/:id/download` | JWT | Download export file |

#### Create Export

```
POST /api/v1/exports
```

**Request Body:**

```json
{
  "type": "transactions",
  "format": "csv",
  "filters": {
    "startDate": "2026-01-01",
    "endDate": "2026-03-31",
    "categoryId": "cat_groceries"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | `transactions`, `accounts`, `budgets`, `receipts` |
| `format` | string | Yes | `csv`, `json`, `xlsx` |
| `filters` | object | No | Export filters |

### 3.17 Plugins (`/api/v1/plugins/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/plugins` | JWT | List installed plugins |
| `POST` | `/plugins/:id/update` | JWT | Update an installed plugin |
| `POST` | `/plugins/:id/uninstall` | JWT | Uninstall a plugin |
| `POST` | `/plugins/validate-manifest` | JWT | Validate a plugin manifest |

### 3.18 Integrations (`/api/v1/integrations/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/integrations` | JWT | List available integrations |
| `POST` | `/integrations/:id/connect` | JWT | Connect an integration |
| `POST` | `/integrations/:id/disconnect` | JWT | Disconnect an integration |
| `GET` | `/integrations/:id/health` | JWT | Check integration health |
| `GET` | `/integrations/:id/history` | JWT | Get integration sync history |
| `POST` | `/integrations/:id/sync` | JWT | Trigger a sync |
| `GET` | `/integrations/health-summary` | JWT | Get all connector health summary |

#### Connect Integration

```
POST /api/v1/integrations/:id/connect
```

**Request Body:**

```json
{
  "credentials": {
    "apiKey": "sk_live_abc123",
    "institutionId": "ins_12345"
  }
}
```

#### Sync Integration

```
POST /api/v1/integrations/:id/sync
```

**Request Body:**

```json
{
  "syncType": "full",
  "dateRange": {
    "start": "2026-01-01",
    "end": "2026-03-31"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `syncType` | string | No | `full` or `incremental` (default: `incremental`) |
| `dateRange` | object | No | Date range for sync |

### 3.19 Comments (`/api/v1/comments/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/comments` | JWT | List comments |
| `POST` | `/comments` | JWT | Create a comment |
| `PATCH` | `/comments/:id` | JWT | Update a comment |
| `DELETE` | `/comments/:id` | JWT | Delete a comment |

### 3.20 Shares (`/api/v1/shares/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/shares/financial-story` | JWT | Create a shareable financial story |
| `GET` | `/public/shares/financial-story/:token` | None | View a shared financial story |

#### Create Financial Story Share

```
POST /api/v1/shares/financial-story
```

**Request Body:**

```json
{
  "title": "Q1 2026 Financial Summary",
  "description": "Our Q1 financial performance overview",
  "expiresAt": "2026-06-30T23:59:59Z",
  "password": "optional-password"
}
```

### 3.21 Referrals (`/api/v1/referrals/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/referrals/me` | JWT | Get user's referral info |
| `POST` | `/referrals/redeem` | JWT | Redeem a referral code |

#### Redeem Referral

```
POST /api/v1/referrals/redeem
```

**Request Body:**

```json
{
  "code": "REFER-ABC123"
}
```

### 3.22 Feature Flags (`/api/v1/feature-flags/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/feature-flags` | JWT | List feature flags |
| `PUT` | `/feature-flags/:key` | JWT | Create or update a feature flag |
| `DELETE` | `/feature-flags/:key` | JWT | Delete a feature flag |

### 3.23 Audit (`/api/v1/audit/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/audit/events` | JWT | List audit events |

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number |
| `limit` | number | Items per page (default: 50, max: 200) |
| `action` | string | Filter by action type |
| `userId` | string | Filter by user |
| `startDate` | string | Filter from date |
| `endDate` | string | Filter to date |

### 3.24 Tools (`/api/v1/tools/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/tools/simulate` | JWT | Simulate a tool execution |
| `POST` | `/tools/execute` | JWT | Execute a tool |

#### Simulate Tool

```
POST /api/v1/tools/simulate
```

**Request Body:**

```json
{
  "tool": "create_transaction",
  "params": {
    "amount": -100,
    "description": "Test transaction",
    "categoryId": "cat_test"
  }
}
```

### 3.25 Calendar (`/api/v1/calendar-reminders/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/calendar-reminders` | JWT | List calendar reminders |
| `POST` | `/calendar-reminders` | JWT | Create a reminder |
| `PATCH` | `/calendar-reminders/:id/toggle` | JWT | Toggle reminder active state |
| `DELETE` | `/calendar-reminders/:id` | JWT | Delete a reminder |

### 3.26 Marketplace (`/api/v1/marketplace/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/marketplace/catalog` | JWT | List marketplace plugins |
| `POST` | `/marketplace/install` | JWT | Install a marketplace plugin |

### 3.27 Autopilot (`/api/v1/autopilot/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/autopilot/plan` | JWT | Create an autopilot plan |
| `POST` | `/autopilot/simulate` | JWT | Simulate an autopilot run |
| `POST` | `/autopilot/approve` | JWT | Approve an autopilot run |
| `POST` | `/autopilot/execute` | JWT | Execute an autopilot run |
| `GET` | `/autopilot/runs/:id` | JWT | Get an autopilot run by ID |

#### Create Autopilot Plan

```
POST /api/v1/autopilot/plan
```

**Request Body:**

```json
{
  "goal": "Optimize monthly spending",
  "constraints": {
    "maxCategoryBudget": { "cat_dining": 200 },
    "minSavingsRate": 0.30
  }
}
```

### 3.28 Category Rules (`/api/v1/category-rules/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/category-rules` | JWT | List auto-categorization rules |
| `POST` | `/category-rules` | JWT | Create a categorization rule |
| `PATCH` | `/category-rules/:id` | JWT | Update a rule |
| `DELETE` | `/category-rules/:id` | JWT | Delete a rule |

#### Create Category Rule

```
POST /api/v1/category-rules
```

**Request Body:**

```json
{
  "pattern": "UBER",
  "categoryId": "cat_transport",
  "matchType": "contains",
  "priority": 10
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `pattern` | string | Yes | Text pattern to match |
| `categoryId` | string | Yes | Target category ID |
| `matchType` | string | Yes | `contains`, `equals`, `regex`, `starts_with` |
| `priority` | number | No | Rule priority (higher = evaluated first) |

### 3.29 API Keys (`/api/v1/api-keys/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api-keys` | JWT | List API keys |
| `POST` | `/api-keys` | JWT | Create an API key |
| `POST` | `/api-keys/:id/revoke` | JWT | Revoke an API key |

#### Create API Key

```
POST /api/v1/api-keys
```

**Request Body:**

```json
{
  "name": "Production Server",
  "scopes": ["transactions:read", "transactions:write", "analytics:read"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "key_abc123",
    "name": "Production Server",
    "key": "fw_sk_live_abc123def456...",
    "keyPrefix": "fw_sk_live_abc",
    "scopes": ["transactions:read", "transactions:write", "analytics:read"],
    "createdAt": "2026-03-31T10:00:00Z"
  },
  "request_id": "req_abc123"
}
```

> **Important:** The full key value is only shown once at creation. Store it securely.

### 3.30 Usage (`/api/v1/usage/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/usage/ledger` | JWT or API Key | Get usage ledger entries |

**Auth:** Accepts JWT or API key with `usage:read` scope.

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `startDate` | string | Filter from date |
| `endDate` | string | Filter to date |
| `feature` | string | Filter by feature name |
| `page` | number | Page number |
| `limit` | number | Items per page |

### 3.31 Automation (`/api/v1/automation/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/automation/events` | JWT | List automation events |
| `POST` | `/automation/events/emit` | JWT | Emit an automation event |

### 3.32 Security (`/api/v1/security/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/security/audit-log` | JWT | Get user security audit log |

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `limit` | number | Max entries (default: 50, max: 200) |
| `actions` | string | Comma-separated action types |

### 3.33 Events (`/api/v1/events/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/events/stream` | JWT | SSE event stream |

**SSE Event Format:**

```
data: {"type": "transaction.created", "data": {"id": "txn_abc123", "amount": -42.50}}
data: {"type": "notification", "data": {"id": "notif_xyz", "message": "New transaction detected"}}
```

### 3.34 Activity Feed (`/api/v1/activity-feed`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/activity-feed` | JWT | Get the activity feed |

### 3.35 Config (`/api/v1/config/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/config/me` | JWT | Get user's configuration |

### 3.36 Media (`/api/v1/media/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/media/:fileId` | JWT | Get media file by ID |

### 3.37 Content (`/api/v1/blogs/*`, `/api/v1/growth-stories/*`)

#### Blogs

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/blogs` | Optional | List blog posts |
| `GET` | `/blogs/featured` | Optional | Get featured blog posts |
| `GET` | `/blogs/categories` | None | List blog categories |
| `GET` | `/blogs/:slug` | Optional | Get a blog post by slug |
| `POST` | `/blogs` | Optional (JWT to create) | Create a blog post |
| `POST` | `/blogs/:id/like` | Optional | Toggle like on a post |

#### Growth Stories

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/growth-stories` | Optional | List growth stories |
| `GET` | `/growth-stories/featured` | Optional | Get featured stories |
| `GET` | `/growth-stories/categories` | None | List story categories |
| `GET` | `/growth-stories/:slug` | Optional | Get a story by slug |
| `POST` | `/growth-stories` | Optional (JWT to create) | Create a story |
| `POST` | `/growth-stories/:id/like` | Optional | Toggle like on a story |

### 3.38 Public Shares (`/api/v1/public/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/public/shares/financial-story/:token` | None | View a shared financial story by token |

### 3.39 Internal Tools (`/api/internal/tools/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/internal/tools/catalog` | Bearer (`AI_CORE_TOOLS_TOKEN`) | List available tools |
| `POST` | `/internal/tools/simulate` | Bearer (`AI_CORE_TOOLS_TOKEN`) | Simulate a tool call |
| `POST` | `/internal/tools/execute` | Bearer (`AI_CORE_TOOLS_TOKEN`) | Execute a tool call |

These endpoints are for internal AI Core service communication only and require a dedicated bearer token.

---

## 4. Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message",
  "request_id": "req_unique_id",
  "org_id": "org_context_id"
}
```

| Field | Type | Always Present | Description |
|---|---|---|---|
| `success` | boolean | Yes | `true` for successful responses |
| `data` | object/array/null | Yes | Response payload |
| `message` | string | No | Human-readable message |
| `request_id` | string | Yes | Unique request identifier for tracing |
| `org_id` | string | No | Resolved organization context (success only) |

### Error Response

```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { ... },
  "request_id": "req_unique_id"
}
```

| Field | Type | Always Present | Description |
|---|---|---|---|
| `success` | boolean | Yes | Always `false` for errors |
| `message` | string | Yes | Human-readable error description |
| `code` | string | Yes | Machine-readable error code |
| `details` | object | No | Additional error context (e.g., field errors) |
| `request_id` | string | Yes | Unique request identifier |

### Pagination

List endpoints that support pagination return:

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "request_id": "req_abc123"
}
```

---

## 5. Error Codes

### HTTP Status Codes

| Status | Code | Description |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request or missing required fields |
| 400 | `VALIDATION_ERROR` | Zod validation failed; see `details.fieldErrors` |
| 400 | `INVALID_ID` | Invalid MongoDB ObjectId format |
| 400 | `DB_VALIDATION_ERROR` | Mongoose model validation failed |
| 400 | `INVALID_ORG_ID` | Invalid organization ID provided |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 401 | `API_KEY_INVALID` | API key not found or revoked |
| 401 | `API_KEY_REQUIRED` | API key authentication required |
| 402 | `PAYMENT_REQUIRED` | Feature quota exceeded; upgrade required |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 403 | `ORG_ACCESS_DENIED` | Not a member of the requested organization |
| 403 | `API_KEY_SCOPE_REQUIRED` | API key missing required scope |
| 404 | `NOT_FOUND` | Route or resource not found |
| 409 | `CONFLICT` | Resource conflict (e.g., duplicate email) |
| 429 | `RATE_LIMITED` | Too many requests |
| 429 | `AUTH_RATE_LIMITED` | Too many authentication attempts |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server error |
| 502 | `AI_CORE_UNAVAILABLE` | AI Core (Python) service unreachable |
| 503 | `SERVICE_UNAVAILABLE` | Dependent service unavailable |

### Validation Error Details

When a `VALIDATION_ERROR` occurs, the `details` field contains Zod's flattened error structure:

```json
{
  "success": false,
  "message": "Invalid request payload",
  "code": "VALIDATION_ERROR",
  "details": {
    "fieldErrors": {
      "email": ["Invalid email format"],
      "password": ["Password must be at least 8 characters"]
    }
  },
  "request_id": "req_abc123"
}
```

---

## 6. Authentication Requirements

### Auth Matrix

| Endpoint Group | Auth Required | API Key Support | Org Context Required |
|---|---|---|---|
| `/api/v1/auth/*` (login/register) | No | No | No |
| `/api/v1/auth/*` (profile/password) | JWT | No | No |
| `/api/v1/auth/2fa/*` | JWT | No | No |
| `/api/v1/orgs/*` | JWT | No | Yes (via header or default) |
| `/api/v1/finance/*` | JWT | Yes | Yes |
| `/api/v1/transactions` | JWT | Yes | Yes |
| `/api/v1/ai/*` | JWT | No | Yes |
| `/api/v1/chat/*` | JWT | No | Yes |
| `/api/v1/workflows/*` | JWT | Yes | Yes |
| `/api/v1/analytics/*` | JWT | Yes | Yes |
| `/api/v1/tasks/*` | JWT | Yes | Yes |
| `/api/v1/receipts/*` | JWT | Yes | Yes |
| `/api/v1/files/*` | JWT | Yes | Yes |
| `/api/v1/financial-journal/*` | JWT | Yes | Yes |
| `/api/v1/billing/*` | JWT | No | Yes |
| `/api/v1/notifications/*` | JWT | Yes | Yes |
| `/api/v1/search` | JWT | Yes | Yes |
| `/api/v1/exports/*` | JWT | Yes | Yes |
| `/api/v1/plugins/*` | JWT | Yes | Yes |
| `/api/v1/integrations/*` | JWT | Yes | Yes |
| `/api/v1/comments/*` | JWT | Yes | Yes |
| `/api/v1/shares/*` | JWT | No | Yes |
| `/api/v1/referrals/*` | JWT | No | No |
| `/api/v1/feature-flags/*` | JWT | No | No |
| `/api/v1/audit/*` | JWT | No | Yes |
| `/api/v1/tools/*` | JWT | No | Yes |
| `/api/v1/calendar-reminders/*` | JWT | Yes | Yes |
| `/api/v1/marketplace/*` | JWT | Yes | Yes |
| `/api/v1/autopilot/*` | JWT | No | Yes |
| `/api/v1/category-rules/*` | JWT | Yes | Yes |
| `/api/v1/api-keys/*` | JWT | No | Yes |
| `/api/v1/usage/*` | JWT or API Key | Yes | Yes |
| `/api/v1/automation/*` | JWT | No | Yes |
| `/api/v1/security/*` | JWT | No | No |
| `/api/v1/events/stream` | JWT | No | Yes |
| `/api/v1/activity-feed` | JWT | No | Yes |
| `/api/v1/config/*` | JWT | No | No |
| `/api/v1/media/*` | JWT | Yes | Yes |
| `/api/v1/blogs/*` | Optional | No | No |
| `/api/v1/growth-stories/*` | Optional | No | No |
| `/api/v1/public/*` | None | No | No |
| `/api/internal/tools/*` | Bearer token | No | Yes (in body) |
| `/healthz`, `/api/test` | None | No | No |
| `/api/python-health` | None | No | No |
| `/api/metrics` | Bearer token | No | No |

### API Key Scopes

API keys support granular scopes:

| Scope | Description |
|---|---|
| `transactions:read` | Read transactions |
| `transactions:write` | Create/update/delete transactions |
| `analytics:read` | Read analytics data |
| `finance:read` | Read finance data (accounts, budgets) |
| `finance:write` | Modify finance data |
| `usage:read` | Read usage ledger |
| `workflows:read` | Read workflows |
| `workflows:write` | Create/run workflows |
| `integrations:read` | Read integration status |
| `integrations:write` | Connect/disconnect integrations |
| `*` | Full access (owner-only) |

### Organization Context Resolution

The server resolves organization context in this order:

1. **`X-Org-Id` header** — Explicit org ID provided by the client
2. **API key binding** — API keys are bound to a specific org
3. **User's default org** — Falls back to the user's default organization

If no org context can be resolved for a required endpoint, a `400 MISSING_ORG_CONTEXT` error is returned.

---

## 7. Rate Limiting

### Limits

| Endpoint Group | Limit | Window | Keyed By |
|---|---|---|---|
| General API (`/api/*`) | 200 requests | 1 minute | Org ID / API key org / User ID / IP |
| Auth (`/api/v1/auth/*`) | 20 requests | 1 minute | IP address |

### Rate Limit Headers

Every API response includes standard rate limit headers:

```
RateLimit-Limit: 200
RateLimit-Remaining: 187
RateLimit-Reset: 1711900860
```

### Rate Limit Response

When rate limited, the server returns:

```json
{
  "success": false,
  "message": "Too many requests, please try again shortly.",
  "code": "RATE_LIMITED",
  "request_id": "req_abc123"
}
```

For auth endpoints:

```json
{
  "success": false,
  "message": "Too many authentication attempts, please try again later.",
  "code": "AUTH_RATE_LIMITED",
  "request_id": "req_abc123"
}
```

### Quota Enforcement

API key requests are additionally subject to org-level feature quotas. If the `api_requests` quota is exhausted:

```json
{
  "success": false,
  "message": "API request quota exceeded for this billing period.",
  "code": "QUOTA_EXCEEDED",
  "details": {
    "feature": "api_requests",
    "used": 10000,
    "limit": 10000,
    "resetsAt": "2026-04-01T00:00:00Z"
  },
  "request_id": "req_abc123"
}
```

---

## 8. Deprecation Policy

### Legacy vs Canonical Routes

FinWise supports two API path prefixes:

| Prefix | Status | Description |
|---|---|---|
| `/api/v1/*` | **Canonical** | Current, fully supported API surface |
| `/api/*` (non-v1) | **Deprecated** | Legacy routes; will be removed |
| `/api/internal/*` | **Internal** | Internal service-to-service endpoints |

### Sunset Date

Legacy `/api/*` routes carry deprecation headers:

```
Deprecation: true
Sunset: 2026-05-31
```

All legacy routes will be **fully removed on 2026-05-31**. Clients should migrate to `/api/v1/*` equivalents.

### Legacy Route Mapping

| Legacy Route | Canonical Route |
|---|---|
| `POST /api/auth/register` | `POST /api/v1/auth/register` |
| `POST /api/auth/login` | `POST /api/v1/auth/login` |
| `GET /api/auth/profile` | `GET /api/v1/auth/profile` |
| `POST /api/ai/process-command` | `POST /api/v1/ai/command` |
| `POST /api/ai/process/stream` | `POST /api/v1/ai/stream` |
| `GET /api/config/me` | `GET /api/v1/config/me` |
| `GET /api/transactions` | `GET /api/v1/transactions` |
| `POST /api/transactions` | `POST /api/v1/transactions` |
| `GET /api/files` | `GET /api/v1/files` |
| `POST /api/receipts/parse` | `POST /api/v1/receipts/parse` |
| `GET /api/financial-journal/entries` | `GET /api/v1/financial-journal/entries` |
| `GET /api/chat/sessions` | `GET /api/v1/chat/sessions` |
| `GET /api/tasks` | `GET /api/v1/tasks` |
| `GET /api/media/:fileId` | `GET /api/v1/media/:fileId` |
| `GET /api/plans` | `GET /api/v1/plans` |
| `GET /api/entitlements/me` | `GET /api/v1/entitlements/me` |
| `POST /api/usage-events` | `POST /api/v1/usage-events` |

### Versioning Strategy

- API versions are indicated in the URL path (`/api/v1/`, `/api/v2/`, etc.)
- Breaking changes are introduced only in new major versions
- Minor versions add endpoints without breaking existing contracts
- Deprecated versions receive a minimum **90-day sunset window** before removal
- Clients should pin to a specific API version and monitor deprecation headers

---

## Appendix A: Common Query Parameters

Most list endpoints support these standard query parameters:

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | number | 1 | — | Page number |
| `limit` | number | 20–50 | 100–200 | Items per page |
| `sort` | string | `createdAt` | — | Sort field |
| `order` | string | `desc` | — | Sort direction (`asc`/`desc`) |
| `q` | string | — | — | Full-text search query |

## Appendix B: Common Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Conditional | `Bearer <token>` for JWT or API key auth |
| `X-Api-Key` | Conditional | Alternative to Authorization header for API keys |
| `X-Org-Id` | Conditional | Organization context for multi-tenant endpoints |
| `Content-Type` | Conditional | `application/json` for JSON bodies; `multipart/form-data` for file uploads |
| `X-CSRF-Token` | Conditional | CSRF token for browser-based POST/PUT/PATCH/DELETE |

## Appendix C: File Upload Endpoints

Endpoints that accept file uploads use `multipart/form-data`:

| Endpoint | File Field | Max Files | Max Size | Accepted Types |
|---|---|---|---|---|
| `POST /api/v1/files` | `files` | 10 | 10 MB each | All types |
| `POST /api/v1/receipts/parse` | `file` | 1 | 10 MB | JPG, PNG, PDF |
| `POST /api/v1/financial-journal/recognize-handwriting` | `file` | 1 | 10 MB | JPG, PNG |
| `POST /api/v1/integrations/transactions_csv/import` | `file` | 1 | 5 MB | CSV |

## Appendix D: Environment Variables (Server Configuration)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | — |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` (1 min) |
| `RATE_LIMIT_MAX` | Max requests per window | `200` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth rate limit window | `60000` (1 min) |
| `AUTH_RATE_LIMIT_MAX` | Max auth requests per window | `20` |
| `REQUEST_SIZE_LIMIT` | Max request body size | `10mb` |
| `PYTHON_API_URL` | AI Core (Python) service URL | — |
| `MONETIZATION_ENABLED` | Enable billing routes | `false` |
| `TASKS_ENABLED` | Enable task routes | `true` |
| `METRICS_TOKEN` | Bearer token for `/api/metrics` | — |
| `AI_CORE_TOOLS_TOKEN` | Bearer token for internal tools | — |
