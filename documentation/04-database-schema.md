# Database Schema Documentation

**Project:** FinWise Personal Finance Platform  
**Version:** 1.0  
**Last Updated:** 2026-03-31  
**Primary Datastore:** MongoDB (Mongoose ODM)  
**Secondary Stores:** Redis (caching/queues), SQLite (AI memory), GridFS (file storage)

---

## Table of Contents

1. [Database Overview](#1-database-overview)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Mongoose Models](#3-mongoose-models)
   - [User & Organization Domain](#user--organization-domain)
   - [Finance Domain](#finance-domain)
   - [AI & Chat Domain](#ai--chat-domain)
   - [Feature Domain](#feature-domain)
   - [Platform Domain](#platform-domain)
4. [Relationships](#4-relationships)
5. [Indexing Strategy](#5-indexing-strategy)
6. [Data Lifecycle](#6-data-lifecycle)
7. [Multi-Tenancy](#7-multi-tenancy)

---

## 1. Database Overview

### Primary Datastore: MongoDB

The FinWise platform uses MongoDB as its primary operational datastore, accessed through the Mongoose ODM layer. All business entities, user data, financial records, AI outputs, and platform configuration are persisted as MongoDB collections.

**Key Characteristics:**
- Schema validation enforced at the Mongoose layer
- All models use `{ timestamps: true }` for automatic `createdAt` / `updatedAt` fields
- Compound indexes optimized for multi-tenant query patterns
- Text search indexes for content discovery
- TTL indexes for automatic cleanup of ephemeral data

### Secondary Datastores

| Store | Purpose | Details |
|-------|---------|---------|
| **Redis** | Caching, message queues, session storage | AI response caching, rate limiting, real-time pub/sub, job queues |
| **SQLite** | AI memory (local) | Lightweight vector store for AI conversation memory, used as fallback to MongoDB `MemoryRecord` |
| **GridFS** | File storage | Receipt images, journal handwriting scans, workspace documents, export artifacts |

### Collection Summary

| Domain | Collections | Count |
|--------|-------------|-------|
| User & Organization | User, Organization, OrgMember, OrgInvite | 4 |
| Finance | Transaction, Account, BudgetAllocation, Merchant, RecurringRule, MonthClose, CategoryRule, FinancialProfile | 8 |
| AI & Chat | ChatSession, ChatMessage, AgentOutput, AiResponseCache, MemoryRecord | 5 |
| Feature | Workflow, WorkflowRun, Task, Receipt, JournalEntry, ExportJob, WorkspaceFile, Comment, ShareLink, Notification, CalendarReminder, GrowthStory, BlogPost | 13 |
| Platform | Subscription, BillingAccount, Entitlement, UsageLedger, UsageEvent, ApiKey, FeatureFlag, IntegrationConnection, IntegrationSyncRun, PluginInstall, MarketplacePlugin, ReferralCode, ReferralRedemption, AuditEvent, AuditLog, AutopilotRun, ToolExecution, DomainEvent, CreditGrant | 19 |
| **Total** | | **49** |

---

## 2. Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FINWISE ENTITY RELATIONSHIP DIAGRAM                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐     1:N     ┌───────────────┐     1:N     ┌──────────────┐
│   User   │────────────▶│ Organization  │────────────▶│  OrgMember   │
└────┬─────┘             └───────┬───────┘             └──────────────┘
     │                           │
     │ 1:N                       │ 1:N
     ▼                           ▼
┌──────────┐             ┌───────────────┐
│OrgInvite │             │   Account     │◀──── 1:N ────┐
└──────────┘             └───────┬───────┘               │
                                 │                       │
                                 │ 1:N                   │ N:1
                                 ▼                       │
                          ┌──────────────┐               │
                          │ Transaction  │───────────────┘
                          └──────┬───────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │ 1:N                │                    │ 1:N
            ▼                    ▼                    ▼
     ┌─────────────┐     ┌─────────────┐      ┌─────────────┐
     │   Budget    │     │   Month     │      │  Category   │
     │ Allocation  │     │   Close     │      │    Rule     │
     └─────────────┘     └─────────────┘      └─────────────┘
            │
            │ N:1
            ▼
     ┌─────────────┐     N:1     ┌─────────────┐
     │  Merchant   │◀────────────│  Recurring  │
     └─────────────┘             │    Rule     │
                                 └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     AI & CHAT DOMAIN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ChatSession 1:N ──▶ ChatMessage                                │
│       │                    │                                    │
│       │ N:1                │ N:1                                │
│       ▼                    ▼                                    │
│  AgentOutput ◀─────────────────────▶ MemoryRecord               │
│       │                                                       │
│       │ N:1                                                   │
│       ▼                                                       │
│  AiResponseCache                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     FEATURE DOMAIN                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Workflow 1:N ──▶ WorkflowRun                                   │
│       │                                                         │
│       │ N:1                                                     │
│       ▼                                                         │
│  Task ◀──── N:1 ──── AgentOutput                                │
│       │                                                         │
│       │ 1:N                                                     │
│       ▼                                                         │
│  Receipt ──── GridFS (fileId)                                   │
│       │                                                         │
│       ▼                                                         │
│  JournalEntry ── GridFS (fileId)                                │
│       │                                                         │
│       ▼                                                         │
│  WorkspaceFile ── GridFS (fileId)                               │
│       │                                                         │
│       ▼                                                         │
│  ExportJob ──── GridFS (fileId)                                 │
│       │                                                         │
│       ▼                                                         │
│  Comment (polymorphic: resourceType + resourceId)               │
│       │                                                         │
│       ▼                                                         │
│  ShareLink (polymorphic: type + payload)                        │
│       │                                                         │
│       ▼                                                         │
│  Notification                                                   │
│       │                                                         │
│       ▼                                                         │
│  CalendarReminder                                               │
│       │                                                         │
│       ▼                                                         │
│  AutopilotRun ──▶ ToolExecution                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM DOMAIN                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Organization 1:1 ──▶ Subscription                              │
│       │                    │                                    │
│       │ 1:1                │ N:1                                │
│       ▼                    ▼                                    │
│  BillingAccount      Entitlement                                │
│       │                    │                                    │
│       │                    ▼                                    │
│       │              UsageLedger ◀── CreditGrant                │
│       │                    │                                    │
│       │                    ▼                                    │
│       │              UsageEvent                                 │
│       │                                                         │
│       ▼                                                         │
│  FeatureFlag                                                    │
│       │                                                         │
│       ▼                                                         │
│  ApiKey                                                         │
│       │                                                         │
│       ▼                                                         │
│  IntegrationConnection 1:N ──▶ IntegrationSyncRun               │
│       │                                                         │
│       ▼                                                         │
│  PluginInstall ◀──── MarketplacePlugin                          │
│       │                                                         │
│       ▼                                                         │
│  ReferralCode 1:N ──▶ ReferralRedemption                        │
│       │                                                         │
│       ▼                                                         │
│  AuditEvent                                                     │
│       │                                                         │
│       ▼                                                         │
│  AuditLog                                                       │
│       │                                                         │
│       ▼                                                         │
│  DomainEvent                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CONTENT DOMAIN                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GrowthStory (global, no orgId)                                 │
│       │                                                         │
│       ▼                                                         │
│  BlogPost (global, no orgId)                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Mongoose Models

### User & Organization Domain

#### User

Authentication and identity for platform users. Supports email/password and Google OAuth.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `email` | String | Yes | — | Unique, lowercase, trimmed email address |
| `name` | String | Yes | — | Display name |
| `password` | String | No | — | Bcrypt-hashed; `select: false` by default |
| `googleId` | String | No | — | Unique Google OAuth ID; sparse index |
| `photoURL` | String | No | — | Profile photo URL |
| `phoneNumber` | String | No | — | Contact phone number |
| `authProvider` | String | Yes | — | Enum: `"email"`, `"google"` |
| `isEmailVerified` | Boolean | No | `false` | Email verification status |
| `emailVerificationToken` | String | No | — | `select: false` |
| `emailVerificationTokenExpires` | Date | No | — | Token expiration |
| `pendingReferralCode` | String | No | — | Uppercase, max 16 chars |
| `referralRedeemedAt` | Date | No | — | When referral was redeemed |
| `twoFactorEnabled` | Boolean | No | `false` | 2FA activation status |
| `twoFactorSecret` | String | No | — | `select: false` |
| `twoFactorPendingSecret` | String | No | — | `select: false` |
| `twoFactorBackupCodes` | [String] | No | — | `select: false` |

**Indexes:** `email` (unique), `googleId` (unique, sparse)

---

#### Organization

Top-level tenant container. All financial data belongs to an organization.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | String | Yes | — | Display name, max 120 chars |
| `slug` | String | Yes | — | Unique URL-safe identifier, lowercase, max 80 chars |
| `type` | String | Yes | `"personal"` | Enum: `"personal"`, `"team"` |
| `createdByUserId` | ObjectId (User) | Yes | — | Reference to creating user |
| `currency` | String | Yes | `"USD"` | ISO 4217 currency code, 3 chars |
| `locale` | String | Yes | `"en-US"` | Locale identifier, max 50 chars |
| `timezone` | String | Yes | `"UTC"` | IANA timezone, max 80 chars |

**Indexes:** `slug` (unique), `{ createdByUserId, createdAt }`

---

#### OrgMember

Maps users to organizations with role-based access control.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Organization reference |
| `userId` | ObjectId (User) | Yes | — | User reference |
| `role` | String | Yes | `"owner"` | Enum: `"owner"`, `"admin"`, `"member"` |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"invited"`, `"removed"` |
| `isDefault` | Boolean | No | `false` | Default org for user |
| `invitedEmail` | String | No | — | Email for invited (not yet joined) members |
| `invitedByUserId` | ObjectId (User) | No | — | Who sent the invite |

**Indexes:** `{ orgId, userId }` (unique), `{ userId, isDefault, createdAt }`

---

#### OrgInvite

Tracks pending invitations to join an organization.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Target organization |
| `email` | String | Yes | — | Invitee email, lowercase |
| `role` | String | Yes | `"member"` | Enum: `"owner"`, `"admin"`, `"member"` |
| `status` | String | Yes | `"pending"` | Enum: `"pending"`, `"accepted"`, `"revoked"`, `"expired"` |
| `tokenHash` | String | Yes | — | Unique hashed invite token, max 128 chars |
| `tokenPrefix` | String | Yes | — | First chars of token for display, max 16 chars |
| `invitedByUserId` | ObjectId (User) | Yes | — | Sender reference |
| `acceptedByUserId` | ObjectId (User) | No | — | Who accepted |
| `acceptedAt` | Date | No | — | Acceptance timestamp |
| `expiresAt` | Date | Yes | — | Expiration deadline |

**Indexes:** `tokenHash` (unique), `{ orgId, email, status, createdAt }`, `{ orgId, createdAt }`, `email`, `status`, `expiresAt`, `tokenPrefix`, `invitedByUserId`

---

### Finance Domain

#### Transaction

Core financial transaction record. The central entity for all money movement tracking.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Creating user |
| `externalId` | String | No | — | External system ID, max 120 chars |
| `accountId` | ObjectId (Account) | No | — | Associated account |
| `merchantId` | ObjectId (Merchant) | No | — | Associated merchant |
| `amount` | Number | Yes | — | Transaction amount (positive) |
| `category` | String | Yes | — | Category name, max 100 chars |
| `description` | String | Yes | — | Transaction description, max 250 chars |
| `date` | Date | Yes | — | Transaction date |
| `type` | String | Yes | — | Enum: `"income"`, `"expense"`, `"investment"` |
| `splits` | [{ category, amount }] | No | — | Split transaction subdocuments |
| `source.origin` | String | No | — | Enum: `"manual"`, `"csv_import"`, `"receipt_ocr"`, `"journal"`, `"task_completion"`, `"ai_plan"`, `"connector"` |
| `source.request_id` | String | No | — | Request correlation ID |
| `source.task_id` | String | No | — | Source task ID |
| `source.agent_output_id` | String | No | — | Source AI output ID |
| `source.receipt_id` | String | No | — | Source receipt ID |
| `source.journal_entry_id` | String | No | — | Source journal entry ID |
| `source.action_link_id` | String | No | — | Source action link ID |
| `source.actor_type` | String | No | — | Enum: `"user"`, `"system"`, `"agent"` |
| `source.source_ref` | String | No | — | External reference |
| `source.note` | String | No | — | Free-form note |
| `legacyId` | ObjectId | No | — | For migration purposes |

**Indexes:** `{ orgId, userId, date }`, `{ orgId, userId, accountId, date }`, `{ orgId, userId, merchantId, date }`, `{ orgId, userId, type, date }`, `{ orgId, userId, category, date }`, `{ orgId, userId, source.origin, date }`, `{ orgId, externalId }` (unique, sparse), `{ legacyId }` (unique, sparse), `{ orgId, date, amount }`, text index on `{ description, category }`

---

#### Account

Financial accounts (checking, savings, credit, brokerage, cash).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `name` | String | Yes | — | Account display name, max 120 chars |
| `institution` | String | No | — | Financial institution name, max 120 chars |
| `type` | String | Yes | — | Enum: `"checking"`, `"savings"`, `"credit"`, `"brokerage"`, `"cash"` |
| `currency` | String | Yes | `"USD"` | ISO 4217 code |
| `mask` | String | No | — | Last 4 digits, max 16 chars |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"closed"` |
| `createdByUserId` | ObjectId (User) | No | — | Creator reference |
| `metadata` | Mixed | No | `{}` | Extensible key-value store |

**Indexes:** `{ orgId, status, updatedAt }`, `{ orgId, type, status, updatedAt }`

---

#### BudgetAllocation

Monthly budget allocations per category.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `periodKey` | String | Yes | — | Format: `YYYY-MM`, max 7 chars |
| `category` | String | Yes | — | Budget category, max 100 chars |
| `amount` | Number | Yes | — | Allocated amount (min: 0) |
| `currency` | String | Yes | `"USD"` | ISO 4217 code |
| `createdByUserId` | ObjectId (User) | No | — | Creator reference |
| `updatedByUserId` | ObjectId (User) | No | — | Last editor reference |
| `metadata` | Mixed | No | `{}` | Extensible key-value store |

**Indexes:** `{ orgId, periodKey, category }` (unique), `{ orgId, periodKey, updatedAt }`

---

#### Merchant

Normalized merchant/vendor records for transaction categorization.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `name` | String | Yes | — | Display name, max 160 chars |
| `normalizedName` | String | Yes | — | Lowercase normalized name, max 160 chars |
| `categoryDefault` | String | No | — | Default category, max 100 chars |
| `aliases` | [String] | No | `[]` | Alternative names |
| `metadata` | Mixed | No | `{}` | Extensible key-value store |

**Indexes:** `{ orgId, normalizedName }` (unique), `{ orgId, updatedAt }`

---

#### RecurringRule

Scheduled transaction generation rules using cron expressions.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `createdByUserId` | ObjectId (User) | Yes | — | Creator reference |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"disabled"` |
| `name` | String | Yes | — | Rule name, max 160 chars |
| `cron` | String | Yes | — | Cron expression, max 120 chars |
| `merchantId` | ObjectId (Merchant) | No | — | Associated merchant |
| `merchantName` | String | No | — | Merchant name fallback, max 160 chars |
| `category` | String | No | — | Transaction category, max 100 chars |
| `amountMin` | Number | No | — | Minimum amount (min: 0) |
| `amountMax` | Number | No | — | Maximum amount (min: 0) |
| `nextRunAt` | Date | No | — | Next scheduled execution |
| `metadata` | Mixed | No | `{}` | Extensible key-value store |

**Indexes:** `{ orgId, status, nextRunAt }`, `{ orgId, updatedAt }`

---

#### MonthClose

Monthly financial period closure with aggregated summaries.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `periodKey` | String | Yes | — | Format: `YYYY-MM`, max 7 chars |
| `createdByUserId` | ObjectId (User) | Yes | — | Creator reference |
| `status` | String | Yes | `"succeeded"` | Enum: `"succeeded"`, `"failed"` |
| `totals` | Mixed | Yes | `{}` | `{ income, expenses, net, tx_count }` |
| `budget` | Mixed | No | `{}` | Budget comparison data |
| `topCategories` | [Mixed] | No | `[]` | Top spending categories |
| `exportJobId` | ObjectId (ExportJob) | No | — | Associated export |
| `error` | String | No | — | Error message, max 2000 chars |
| `metadata` | Mixed | No | `{}` | Extensible key-value store |

**Indexes:** `{ orgId, periodKey }` (unique), `{ orgId, createdAt }`, `{ orgId, status, createdAt }`

---

#### CategoryRule

Automated transaction categorization rules with pattern matching.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Rule owner |
| `pattern` | String | Yes | — | Match pattern, max 200 chars |
| `matchType` | String | Yes | `"contains"` | Enum: `"contains"`, `"starts_with"`, `"exact"`, `"regex"` |
| `matchField` | String | Yes | `"description"` | Enum: `"description"`, `"category"` |
| `targetCategory` | String | Yes | — | Category to assign, max 100 chars |
| `targetType` | String | No | — | Enum: `"income"`, `"expense"`, `"investment"` |
| `priority` | Number | No | `0` | Higher = checked first |
| `enabled` | Boolean | No | `true` | Rule active status |
| `appliedCount` | Number | No | `0` | Usage counter |

**Indexes:** `{ orgId, userId, priority }`, `{ orgId, userId, enabled }`

---

#### FinancialProfile

User financial profile for AI-driven advice and onboarding.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Profile owner |
| `age` | Number | Yes | — | User age |
| `annual_income` | Number | Yes | — | Annual income |
| `monthly_expenses` | Number | Yes | — | Monthly expenses |
| `savings` | Number | No | `0` | Current savings |
| `goals` | [{ name, target, current, deadline, priority }] | No | `[]` | Financial goals |
| `debts` | [{ name, balance, interest_rate, minimum_payment, type }] | No | `[]` | Debt obligations |
| `transactions` | [{ amount, category, description, date, type }] | No | `[]` | Legacy embedded transactions |
| `transactionsCount` | Number | No | `0` | Transaction count for cache invalidation |
| `transactionsUpdatedAt` | Date | No | `Date.now` | Last transaction update |
| `transactionsMigratedAt` | Date | No | — | Migration completion timestamp |
| `risk_tolerance` | String | No | `"moderate"` | Enum: `"conservative"`, `"moderate"`, `"aggressive"` |
| `investment_experience` | String | No | `"beginner"` | Enum: `"beginner"`, `"intermediate"`, `"expert"` |
| `onboardingCompletedAt` | Date | No | — | Onboarding completion |
| `onboardingVersion` | String | No | — | Onboarding schema version |
| `lastMutation` | Mixed | No | — | Provenance tracking object with `at` date |

**Indexes:** `{ orgId, userId }` (unique)

---

### AI & Chat Domain

#### ChatSession

Conversation thread between a user and the AI assistant.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Session owner |
| `title` | String | Yes | `"New Chat"` | Session title, max 200 chars |
| `lastMessageAt` | Date | No | `Date.now` | Most recent message timestamp |
| `messageCount` | Number | No | `0` | Total messages in session |
| `isArchived` | Boolean | No | `false` | Archive status |
| `summary` | String | No | `""` | AI-generated conversation summary |
| `summaryUpdatedAt` | Date | No | — | Last summary refresh |

**Indexes:** `{ orgId, userId, lastMessageAt }`

---

#### ChatMessage

Individual messages within a chat session.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `sessionId` | ObjectId (ChatSession) | Yes | — | Parent session |
| `userId` | ObjectId (User) | Yes | — | Message author |
| `role` | String | Yes | — | Enum: `"user"`, `"assistant"` |
| `content` | String | Yes | — | Message text |
| `metadata.attachments` | [Mixed] | No | `[]` | File attachments |
| `metadata.analysisType` | String | No | — | Analysis classification |
| `metadata.agentsInvolved` | [String] | No | — | AI agents used |
| `metadata.priority` | String | No | — | Enum: `"low"`, `"medium"`, `"high"` |
| `metadata.actionable` | Boolean | No | — | Whether message triggered actions |
| `metadata.plan` | Mixed | No | — | AI-generated plan |
| `metadata.toolCalls` | [Mixed] | No | `[]` | Tool invocations |
| `metadata.agentOutputId` | String | No | — | Linked AgentOutput ID |
| `metadata.autopilotRunId` | String | No | — | Linked AutopilotRun ID |
| `metadata.autopilotRunStatus` | String | No | — | Autopilot status |
| `metadata.detailedAnalysis` | Mixed | No | `{}` | Full analysis data |
| `metadata.workflowTrace` | [Mixed] | No | `[]` | Agent execution trace |
| `metadata.fallbackUsed` | Boolean | No | — | Fallback mode indicator |
| `metadata.llmCallCount` | Number | No | — | LLM API call count |
| `metadata.requestId` | String | No | — | Request correlation ID |
| `metadata.actionLinkId` | String | No | — | Action link reference |
| `metadata.linkedTaskIds` | [String] | No | — | Associated task IDs |
| `metadata.aiCoreDurationMs` | Number | No | — | AI processing time |
| `metadata.cacheHit` | Boolean | No | — | Cache hit indicator |

**Indexes:** `{ orgId, sessionId, createdAt }`

---

#### AgentOutput

Structured AI analysis results and recommendations.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Request owner |
| `sessionId` | String | Yes | — | Chat session ID |
| `userInput` | String | Yes | — | Original user query |
| `agentType` | String | Yes | — | Agent that executed (e.g., `master`, `budget_planner`) |
| `outputData` | Mixed | Yes | `{}` | Flexible output payload (strict: false) |
| `analysis_type` | String | Yes | — | Analysis classification |
| `agents_involved` | [String] | Yes | — | All agents in workflow |
| `workflow_trace` | [Mixed] | No | `[]` | Per-agent execution trace |
| `detailed_analysis` | Mixed | No | `{}` | Full analysis results |
| `fallback_used` | Boolean | No | `false` | Fallback mode indicator |
| `llm_call_count` | Number | No | `0` | Total LLM API calls |
| `request_id` | String | No | — | Request correlation ID |
| `feedback.rating` | String | No | — | Enum: `"up"`, `"down"` |
| `feedback.note` | String | No | — | User feedback text |
| `feedback.createdAt` | Date | No | `Date.now` | Feedback timestamp |
| `timestamp` | Date | No | `Date.now` | Output generation time |
| `priority` | String | No | `"medium"` | Enum: `"low"`, `"medium"`, `"high"` |
| `actionable` | Boolean | No | `false` | Whether output triggered actions |

**Indexes:** `{ orgId, userId, timestamp }`, `{ orgId, userId, createdAt }`, `{ orgId, userId, request_id, timestamp }`, `{ orgId, userId, actionable, timestamp }`

---

#### AiResponseCache

Cached AI responses to reduce redundant LLM calls.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Request owner |
| `cacheKey` | String | Yes | — | Unique cache key |
| `endpoint` | String | Yes | — | API endpoint identifier |
| `responseData` | Mixed | Yes | `{}` | Cached response payload |
| `expiresAt` | Date | Yes | — | Expiration timestamp (TTL index) |

**Indexes:** `cacheKey` (unique), `expiresAt` (TTL: `expireAfterSeconds: 0`), `{ orgId, userId, createdAt }`

---

#### MemoryRecord

AI-learned facts about users persisted across sessions. Replaces SQLite-based memory store.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Memory subject |
| `key` | String | Yes | — | Memory key, max 200 chars |
| `value` | String | Yes | — | Memory value, max 2000 chars |
| `confidence` | Number | Yes | `0.5` | Confidence score (0–1) |
| `source` | String | Yes | `"ai_conversation"` | Memory source, max 100 chars |

**Indexes:** `{ orgId, userId, key }` (unique), `{ orgId, userId, updatedAt }`, text index on `{ key, value }`

---

### Feature Domain

#### Workflow

Automated action sequences triggered by manual, cron, or event triggers.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `createdByUserId` | ObjectId (User) | Yes | — | Creator reference |
| `name` | String | Yes | — | Workflow name, max 160 chars |
| `enabled` | Boolean | No | `true` | Active status |
| `trigger.type` | String | Yes | `"manual"` | Enum: `"manual"`, `"cron"`, `"event"` |
| `trigger.cron` | String | No | — | Cron expression, max 120 chars |
| `trigger.event_type` | String | No | — | Event type, max 120 chars |
| `scheduleTimezone` | String | No | — | IANA timezone, max 80 chars |
| `nextRunAt` | Date | No | — | Next scheduled run |
| `lastRunAt` | Date | No | — | Last execution time |
| `lastError` | String | No | — | Last error message, max 800 chars |
| `actions` | [Mixed] | No | `[]` | Action definitions (create_task, send_notification, export_report) |

**Indexes:** `{ orgId, enabled, createdAt }`, `{ orgId, createdByUserId, createdAt }`, `{ orgId, enabled, trigger.type, trigger.event_type, createdAt }`, `{ enabled, trigger.type, nextRunAt, orgId }`

---

#### WorkflowRun

Execution record for a workflow trigger.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `workflowId` | ObjectId (Workflow) | Yes | — | Parent workflow |
| `triggeredByUserId` | ObjectId (User) | Yes | — | Trigger source user |
| `status` | String | No | `"queued"` | Enum: `"queued"`, `"running"`, `"succeeded"`, `"failed"` |
| `idempotencyKey` | String | No | — | Deduplication key, max 128 chars |
| `requestId` | String | No | — | Request correlation ID, max 128 chars |
| `startedAt` | Date | No | — | Execution start |
| `finishedAt` | Date | No | — | Execution end |
| `result` | Mixed | No | `{}` | `{ tasks_created, exports_created, notifications_sent }` |
| `error` | String | No | — | Error message, max 2000 chars |

**Indexes:** `{ orgId, createdAt }`, `{ workflowId, createdAt }`, `{ workflowId, idempotencyKey }` (partial unique)

---

#### Task

AI-generated financial action items organized into time buckets.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `_id` | String | Yes | — | Custom string ID (not ObjectId) |
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Task assignee |
| `source.agentOutputId` | ObjectId (AgentOutput) | No | — | Source AI output |
| `source.chatMessageId` | ObjectId (ChatMessage) | No | — | Source chat message |
| `source.requestId` | String | No | — | Request correlation ID |
| `bucket` | Number | Yes | — | Enum: `7`, `30`, `365` (days) |
| `title` | String | Yes | — | Task title |
| `why` | String | Yes | — | Rationale |
| `steps` | [String] | No | `[]` | Action steps |
| `priority` | String | No | `"medium"` | Enum: `"low"`, `"medium"`, `"high"` |
| `expected_impact` | String | Yes | — | Expected financial impact |
| `kind` | String | No | `"generic"` | Enum: `"cashflow"`, `"budget"`, `"debt"`, `"invest"`, `"goal"`, `"education"`, `"generic"` |
| `dueDate` | Date | No | — | Due date |
| `status` | String | No | `"open"` | Enum: `"open"`, `"completed"`, `"dismissed"` |
| `completedAt` | Date | No | — | Completion timestamp |
| `completionEvidence.note` | String | No | — | Completion note, max 1000 chars |
| `completionEvidence.completedAt` | Date | No | — | Evidence timestamp |
| `completionEvidence.effects` | [Mixed] | No | `[]` | Side effects |
| `appliedAt` | Date | No | — | When task was applied |
| `appliedSummary.transactions` | [String] | No | `[]` | Affected transaction IDs |
| `appliedSummary.goals` | [String] | No | `[]` | Affected goal IDs |
| `appliedSummary.debts` | [String] | No | `[]` | Affected debt IDs |
| `appliedSummary.profileUpdated` | Boolean | No | `false` | Profile update flag |
| `applyStatus` | String | No | — | Enum: `"pending"`, `"succeeded"`, `"failed"` |
| `applyErrorCode` | String | No | — | Error code, max 80 chars |
| `applyIdempotencyKey` | String | No | — | Deduplication key, max 128 chars |
| `actionLinkId` | String | No | — | Action link reference, max 128 chars |
| `outcomeRefs` | [String] | No | `[]` | Outcome references |

**Indexes:** `{ orgId, userId, status, dueDate }`, `{ orgId, userId, updatedAt }`, `{ orgId, userId, source.agentOutputId, updatedAt }`, `{ orgId, userId, applyIdempotencyKey }` (sparse)

---

#### Receipt

OCR-processed receipt data linked to GridFS-stored images.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Uploader |
| `fileId` | ObjectId | Yes | — | GridFS file reference |
| `status` | String | Yes | `"parsed"` | Enum: `"parsed"`, `"confirmed"` |
| `extracted.vendor` | String | No | — | Vendor name, max 250 chars |
| `extracted.date` | String | No | — | Date string (YYYY-MM-DD), max 20 chars |
| `extracted.total` | Number | No | — | Total amount |
| `extracted.tax` | Number | No | — | Tax amount |
| `extracted.currency` | String | No | — | Currency code, max 10 chars |
| `extracted.items` | [{ description, quantity, unit_price, total, confidence }] | No | `[]` | Line items |
| `extracted.raw_text` | String | No | — | Raw OCR text |
| `extracted.category_suggestion` | String | No | — | Suggested category, max 100 chars |
| `confidence` | Mixed | Yes | `{}` | Per-field confidence scores |
| `warnings` | [String] | No | `[]` | Processing warnings |
| `categorySuggestion` | String | No | — | Top-level category hint, max 100 chars |
| `corrections` | Mixed (ReceiptExtracted) | No | — | User corrections |
| `transactionId` | ObjectId (Transaction) | No | — | Linked transaction |

**Indexes:** `{ orgId, userId, createdAt }`, `{ orgId, transactionId }` (sparse)

---

#### JournalEntry

Handwritten journal entries processed via OCR/HTR.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Author |
| `fileId` | ObjectId | Yes | — | GridFS file reference |
| `strokes` | Mixed | No | — | Raw stroke data |
| `recognizedText` | String | No | `""` | OCR/HTR recognized text |
| `confidence` | Mixed | Yes | `{}` | Confidence scores per line |
| `parsedIntent` | Mixed | Yes | `{}` | Extracted financial intent (amounts, dates, goals) |

**Indexes:** `{ orgId, userId, createdAt }`

---

#### ExportJob

Background export job for generating reports.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `createdByUserId` | ObjectId (User) | Yes | — | Requestor |
| `type` | String | Yes | — | Enum: `"transactions_csv"`, `"monthly_summary_pdf"` |
| `status` | String | Yes | `"queued"` | Enum: `"queued"`, `"running"`, `"succeeded"`, `"failed"` |
| `params` | Mixed | No | `{}` | Export parameters |
| `fileId` | ObjectId | No | — | GridFS output file |
| `filename` | String | No | — | Output filename, max 200 chars |
| `contentType` | String | No | — | MIME type, max 120 chars |
| `bytes` | Number | No | — | File size (min: 0) |
| `startedAt` | Date | No | — | Processing start |
| `finishedAt` | Date | No | — | Processing end |
| `error` | String | No | — | Error message, max 2000 chars |
| `requestId` | String | No | — | Request correlation ID, max 120 chars |
| `idempotencyKey` | String | No | — | Deduplication key, max 128 chars |

**Indexes:** `{ orgId, createdByUserId, createdAt }`, `{ orgId, status, createdAt }`, `{ orgId, createdByUserId, idempotencyKey }` (partial unique)

---

#### WorkspaceFile

User-uploaded files with AI analysis, stored via GridFS.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Uploader |
| `fileId` | ObjectId | Yes | — | GridFS reference (unique) |
| `originalName` | String | Yes | — | Original filename, max 260 chars |
| `mimeType` | String | Yes | — | MIME type, max 200 chars |
| `sizeBytes` | Number | Yes | — | File size (min: 0) |
| `extension` | String | No | — | File extension, max 40 chars |
| `kind` | String | No | `"other"` | Enum: `"document"`, `"spreadsheet"`, `"image"`, `"code"`, `"data"`, `"archive"`, `"other"` |
| `status` | String | No | `"uploaded"` | Enum: `"uploaded"`, `"processed"`, `"error"` |
| `extractedText` | String | No | `""` | Extracted text content |
| `extractedPreview` | String | No | `""` | Preview content |
| `extractionWarnings` | [String] | No | `[]` | Processing warnings |
| `analysis.summary` | String | No | — | AI analysis summary |
| `analysis.response` | String | No | — | AI response text |
| `analysis.plan` | Mixed | No | — | Generated plan |
| `analysis.analysisType` | String | No | — | Analysis type |
| `analysis.agentsInvolved` | [String] | No | `[]` | Agents used |
| `analysis.workflowTrace` | [Mixed] | No | `[]` | Execution trace |
| `analysis.fallbackUsed` | Boolean | No | — | Fallback indicator |
| `analysis.llmCallCount` | Number | No | — | LLM call count |
| `analysis.requestId` | String | No | — | Request ID |
| `analysis.updatedAt` | Date | No | — | Analysis timestamp |
| `lastAnalyzedAt` | Date | No | — | Last analysis time |

**Indexes:** `{ orgId, userId, createdAt }`, `{ orgId, userId, originalName }`

---

#### Comment

Polymorphic comments on financial resources.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Comment author |
| `resourceType` | String | Yes | — | Enum: `"transaction"`, `"budget"`, `"goal"`, `"workflow"`, `"insight"` |
| `resourceId` | String | Yes | — | Target resource ID, max 128 chars |
| `text` | String | Yes | — | Comment text, max 2000 chars |
| `mentions` | [String] | No | — | Mentioned user IDs |
| `parentId` | ObjectId (Comment) | No | — | Parent comment for threading |
| `editedAt` | Date | No | — | Last edit timestamp |
| `deletedAt` | Date | No | — | Soft delete timestamp |

**Indexes:** `{ orgId, resourceType, resourceId, createdAt }`, `{ orgId, userId, createdAt }`

---

#### ShareLink

Shareable links for financial stories and insights.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `createdByUserId` | ObjectId (User) | Yes | — | Creator |
| `type` | String | Yes | — | Enum: `"financial_story"` |
| `tokenHash` | String | Yes | — | Unique hashed token |
| `tokenPrefix` | String | Yes | — | Display prefix, max 12 chars |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"revoked"` |
| `expiresAt` | Date | Yes | — | Expiration (TTL index) |
| `payload` | Mixed | Yes | `{}` | Shared content payload |

**Indexes:** `tokenHash` (unique), `expiresAt` (TTL: `expireAfterSeconds: 0`), `{ orgId, createdByUserId, createdAt }`, `type`, `status`, `tokenPrefix`

---

#### Notification

In-app notifications for users.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Recipient |
| `status` | String | Yes | `"unread"` | Enum: `"unread"`, `"read"` |
| `title` | String | Yes | — | Notification title, max 160 chars |
| `message` | String | Yes | — | Notification body, max 5000 chars |
| `readAt` | Date | No | — | Read timestamp |
| `metadata` | Mixed | No | `{}` | Extensible payload |

**Indexes:** `{ orgId, userId, status, createdAt }`, `{ orgId, userId, createdAt }`

---

#### CalendarReminder

User-defined calendar reminders for financial events.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Owner |
| `date` | String | Yes | — | Date string (YYYY-MM-DD), max 10 chars |
| `title` | String | Yes | — | Reminder title, max 200 chars |
| `description` | String | No | `""` | Details, max 1000 chars |
| `completed` | Boolean | No | `false` | Completion status |

**Indexes:** `{ orgId, userId, date }`

---

#### GrowthStory

Published financial success stories (global, no org scoping).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | String | Yes | — | Story title |
| `slug` | String | Yes | — | Unique URL slug |
| `persona` | String | Yes | — | User persona |
| `location` | String | Yes | — | Geographic location |
| `summary` | String | Yes | — | Short summary, max 200 chars |
| `challenge` | String | Yes | — | Financial challenge |
| `journey` | String | Yes | — | Story body (Markdown) |
| `outcome` | String | Yes | — | Result/outcome |
| `timeline` | String | Yes | — | Duration description |
| `financialMetrics.startingNetWorth` | Number | No | `0` | Starting net worth |
| `financialMetrics.currentNetWorth` | Number | No | `0` | Current net worth |
| `financialMetrics.monthlyIncome` | Number | No | `0` | Monthly income |
| `financialMetrics.savingsRate` | Number | No | `0` | Savings rate (%) |
| `financialMetrics.debtPaidOff` | Number | No | `0` | Debt eliminated |
| `financialMetrics.investmentReturns` | Number | No | `0` | Investment returns |
| `strategies` | [String] | No | `[]` | Strategies used |
| `tags` | [String] | No | `[]` | Topic tags |
| `category` | String | Yes | — | Enum: `"debt-freedom"`, `"wealth-building"`, `"early-retirement"`, `"side-hustle"`, `"tax-optimization"`, `"family-finance"`, `"student-finance"` |
| `difficulty` | String | Yes | — | Enum: `"beginner"`, `"intermediate"`, `"advanced"` |
| `isVerified` | Boolean | No | `false` | Verification status |
| `isFeatured` | Boolean | No | `false` | Featured flag |
| `isPublished` | Boolean | No | `true` | Publication status |
| `coverImage` | String | Yes | — | Cover image URL |
| `likes` | Number | No | `0` | Like count |
| `views` | Number | No | `0` | View count |
| `readTime` | Number | No | `5` | Estimated read time (minutes) |
| `userId` | ObjectId (User) | No | — | Associated user |
| `publishedAt` | Date | No | `Date.now` | Publication timestamp |

**Indexes:** `slug` (unique), `category`, `difficulty`, `tags`, `{ isPublished, publishedAt }`, text index on `{ title, summary, challenge, tags }`

---

#### BlogPost

Published financial education articles (global, no org scoping).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | String | Yes | — | Article title |
| `slug` | String | Yes | — | Unique URL slug |
| `excerpt` | String | Yes | — | Short excerpt, max 300 chars |
| `content` | String | Yes | — | Full article body |
| `category` | String | Yes | — | Enum: `"investing"`, `"budgeting"`, `"tax-planning"`, `"debt-management"`, `"retirement"`, `"insurance"`, `"real-estate"`, `"market-news"`, `"personal-growth"` |
| `tags` | [String] | No | `[]` | Topic tags |
| `coverImage` | String | Yes | — | Cover image URL |
| `author.name` | String | Yes | — | Author name |
| `author.avatar` | String | Yes | — | Author avatar URL |
| `author.bio` | String | Yes | — | Author biography |
| `readTime` | Number | No | `5` | Estimated read time (minutes) |
| `likes` | Number | No | `0` | Like count |
| `views` | Number | No | `0` | View count |
| `isFeatured` | Boolean | No | `false` | Featured flag |
| `isPublished` | Boolean | No | `true` | Publication status |
| `publishedAt` | Date | No | `Date.now` | Publication timestamp |
| `userId` | ObjectId (User) | No | — | Associated user |
| `relatedPosts` | [ObjectId (BlogPost)] | No | `[]` | Related article references |
| `seoMeta.metaTitle` | String | No | — | SEO title |
| `seoMeta.metaDescription` | String | No | — | SEO description |
| `seoMeta.keywords` | [String] | No | `[]` | SEO keywords |

**Indexes:** `slug` (unique), `category`, `tags`, `{ isPublished, publishedAt }`, text index on `{ title, content, tags }`

---

### Platform Domain

#### Subscription

Organization-level subscription to a paid plan.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Unique per organization |
| `provider` | String | Yes | `"stub"` | Enum: `"stub"`, `"stripe"` |
| `planTier` | String | Yes | `"free"` | Enum: `"free"`, `"pro"`, `"team"`, `"enterprise"` |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"trialing"`, `"past_due"`, `"canceled"` |
| `seats` | Number | No | — | Seat count (min: 1) |
| `stripeSubscriptionId` | String | No | — | Stripe subscription ID |
| `stripePriceId` | String | No | — | Stripe price ID |
| `currentPeriodStart` | Date | No | — | Billing period start |
| `currentPeriodEnd` | Date | No | — | Billing period end |

**Indexes:** `orgId` (unique), `{ provider, status }`, `stripeSubscriptionId` (sparse)

---

#### BillingAccount

Stripe billing customer account per organization.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Unique per organization |
| `provider` | String | Yes | `"stub"` | Enum: `"stub"`, `"stripe"` |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"inactive"` |
| `stripeCustomerId` | String | No | — | Stripe customer ID |

**Indexes:** `orgId` (unique), `{ provider, status }`, `stripeCustomerId` (sparse)

---

#### Entitlement

Feature entitlements and limits per user or organization.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | No | — | Optional org-level entitlement |
| `userId` | ObjectId (User) | Yes | — | Entitlement owner |
| `plan` | String | Yes | `"free"` | Enum: `"free"`, `"pro"`, `"team"`, `"enterprise"` |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"trialing"`, `"past_due"`, `"canceled"` |
| `limitsOverride.monthly_ai_calls` | Number | No | — | Override for AI call limit |
| `limitsOverride.scenario_depth` | Number | No | — | Override for scenario depth |
| `limitsOverride.ocr_quota` | Number | No | — | Override for OCR quota |
| `limitsOverride.export_access` | Boolean | No | — | Override for export access |
| `limitsOverride.api_requests` | Number | No | — | Override for API requests |
| `limitsOverride.autopilot_actions` | Number | No | — | Override for autopilot actions |
| `limitsOverride.workflow_runs` | Number | No | — | Override for workflow runs |
| `limitsOverride.connector_sync_records` | Number | No | — | Override for connector syncs |
| `limitsOverride.marketplace_installs` | Number | No | — | Override for marketplace installs |
| `billingCustomerId` | String | No | — | Billing provider customer ID |
| `currentPeriodStart` | Date | No | — | Billing period start |
| `currentPeriodEnd` | Date | No | — | Billing period end |

**Indexes:** `{ plan, status }`, `orgId` (partial unique, when present)

---

#### UsageLedger

Aggregated usage counters per organization per period.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `periodKey` | String | Yes | — | Period identifier, max 16 chars |
| `feature` | String | Yes | — | Enum: `"monthly_ai_calls"`, `"scenario_depth"`, `"ocr_quota"`, `"export_access"`, `"api_requests"`, `"autopilot_actions"`, `"workflow_runs"`, `"connector_sync_records"`, `"marketplace_installs"` |
| `units` | Number | Yes | — | Consumed units (min: 0) |
| `tokensIn` | Number | No | — | Input token count (min: 0) |
| `tokensOut` | Number | No | — | Output token count (min: 0) |
| `costUsd` | Number | No | — | Cost in USD (min: 0) |

**Indexes:** `{ orgId, periodKey, feature }` (unique), `{ orgId, periodKey, createdAt }`

---

#### UsageEvent

Individual usage events for metering and billing.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | No | — | Optional org reference |
| `userId` | ObjectId (User) | Yes | — | Event owner |
| `feature` | String | Yes | — | Same enum as UsageLedger |
| `units` | Number | Yes | — | Consumed units (min: 0) |
| `tokensIn` | Number | No | — | Input token count |
| `tokensOut` | Number | No | — | Output token count |
| `costUsd` | Number | No | — | Cost in USD |
| `modelName` | String | No | — | LLM model name, max 80 chars |
| `periodKey` | String | Yes | — | Period identifier, max 16 chars |
| `requestId` | String | No | — | Request correlation ID, max 128 chars |
| `idempotencyKey` | String | No | — | Deduplication key, max 128 chars |
| `context` | Mixed | No | `{}` | Additional context |

**Indexes:** `{ userId, feature, periodKey, createdAt }`, `{ orgId, feature, periodKey, createdAt }`, `{ userId, idempotencyKey }` (partial unique)

---

#### ApiKey

API keys for programmatic access.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `createdByUserId` | ObjectId (User) | Yes | — | Creator |
| `name` | String | Yes | — | Key display name, max 120 chars |
| `keyPrefix` | String | Yes | — | First chars for display, max 32 chars |
| `keyHash` | String | Yes | — | Unique hashed key, max 128 chars |
| `scopes` | [String] | Yes | `[]` | Enum values: `"usage:read"`, `"workflows:read"`, `"workflows:write"`, `"transactions:read"`, `"transactions:write"` |
| `lastUsedAt` | Date | No | — | Last usage timestamp |
| `revokedAt` | Date | No | — | Revocation timestamp |

**Indexes:** `keyHash` (unique), `{ orgId, createdAt }`, `{ orgId, revokedAt, createdAt }`, `keyPrefix`

---

#### FeatureFlag

Per-organization feature toggles.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `key` | String | Yes | — | Flag key, max 120 chars |
| `enabled` | Boolean | Yes | `false` | Flag state |
| `variant` | String | No | — | Variant identifier, max 80 chars |
| `rolloutPercent` | Number | Yes | `100` | Rollout percentage (0–100) |
| `metadata` | Mixed | No | `{}` | Extensible payload |
| `updatedByUserId` | ObjectId (User) | No | — | Last editor |

**Indexes:** `{ orgId, key }` (unique), `{ orgId, enabled, key }`

---

#### IntegrationConnection

External service connections (banking, payment, etc.).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `connectorKey` | String | Yes | — | Connector identifier, lowercase, max 120 chars |
| `status` | String | Yes | `"disconnected"` | Enum: `"connected"`, `"syncing"`, `"error"`, `"disconnected"` |
| `lastSyncAt` | Date | No | — | Last successful sync |
| `lastError` | String | No | — | Last error message, max 400 chars |
| `metadata` | Mixed | No | `{}` | Connection metadata |

**Indexes:** `{ orgId, connectorKey }` (unique), `{ orgId, status, updatedAt }`

---

#### IntegrationSyncRun

Individual sync execution records.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `connectorKey` | String | Yes | — | Connector identifier, lowercase, max 120 chars |
| `status` | String | Yes | — | Enum: `"queued"`, `"running"`, `"succeeded"`, `"failed"` |
| `recordsSynced` | Number | No | `0` | Records processed (min: 0) |
| `startedAt` | Date | No | — | Sync start |
| `finishedAt` | Date | No | — | Sync end |
| `error` | String | No | — | Error message, max 400 chars |
| `requestId` | String | No | — | Request correlation ID, max 120 chars |
| `triggeredByUserId` | ObjectId (User) | No | — | Trigger source |
| `metadata` | Mixed | No | `{}` | Sync metadata |

**Indexes:** `{ orgId, connectorKey, createdAt }`, `{ orgId, status, createdAt }`

---

#### PluginInstall

Per-organization plugin installations.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `pluginKey` | String | Yes | — | Plugin identifier, lowercase, max 120 chars |
| `version` | String | Yes | — | Installed version, max 40 chars |
| `status` | String | Yes | `"installed"` | Enum: `"installed"`, `"disabled"` |
| `permissionsGranted` | [String] | No | `[]` | Granted permission keys, max 120 chars each |
| `installedByUserId` | ObjectId (User) | No | — | Installer |
| `updatedByUserId` | ObjectId (User) | No | — | Last updater |
| `metadata` | Mixed | No | `{}` | Install metadata |

**Indexes:** `{ orgId, pluginKey }` (unique), `{ orgId, status, updatedAt }`

---

#### MarketplacePlugin

Plugin catalog entries available for installation.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pluginKey` | String | Yes | — | Unique plugin key, lowercase, max 120 chars |
| `name` | String | Yes | — | Display name, max 120 chars |
| `description` | String | Yes | — | Description, max 500 chars |
| `publisher` | String | Yes | — | Publisher name, max 120 chars |
| `status` | String | Yes | `"active"` | Enum: `"active"`, `"preview"`, `"deprecated"` |
| `latestVersion` | String | Yes | — | Latest version string, max 40 chars |
| `availableVersions` | [String] | Yes | `[]` | All available versions |
| `permissions` | [String] | No | `[]` | Required permissions |
| `pricingModel` | String | Yes | `"free"` | Enum: `"free"`, `"paid"` |
| `priceMonthlyUsd` | Number | No | — | Monthly price (min: 0) |
| `metadata` | Mixed | No | `{}` | Plugin metadata |

**Indexes:** `pluginKey` (unique), `{ status, updatedAt }`

---

#### ReferralCode

Unique referral codes per organization.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Unique per organization |
| `code` | String | Yes | — | Unique uppercase code, max 16 chars |
| `createdByUserId` | ObjectId (User) | Yes | — | Creator |

**Indexes:** `orgId` (unique), `code` (unique), `createdByUserId`, `{ createdByUserId, createdAt }`

---

#### ReferralRedemption

Records of referral code redemptions and rewards issued.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `codeId` | ObjectId (ReferralCode) | Yes | — | Source referral code |
| `referralCode` | String | Yes | — | Code string, uppercase, max 16 chars |
| `referrerOrgId` | ObjectId (Organization) | Yes | — | Referrer's organization |
| `referrerUserId` | ObjectId (User) | Yes | — | Referrer user |
| `referredOrgId` | ObjectId (Organization) | Yes | — | Referred organization (unique) |
| `referredUserId` | ObjectId (User) | Yes | — | Referred user |
| `redeemedAt` | Date | Yes | `Date.now` | Redemption timestamp |
| `reward.periods` | [String] | No | `[]` | Applicable billing periods |
| `reward.unitsByFeature` | Mixed | No | `{}` | Credit units per feature |

**Indexes:** `codeId`, `referralCode`, `referrerOrgId`, `referrerUserId`, `referredOrgId` (unique), `referredUserId`, `redeemedAt`, `{ referrerOrgId, redeemedAt }`, `{ referredUserId, redeemedAt }`

---

#### AuditEvent

General audit trail for organization-level actions.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `actorType` | String | Yes | `"user"` | Enum: `"user"`, `"system"`, `"api_key"` |
| `actorUserId` | ObjectId (User) | No | — | User actor reference |
| `actorApiKeyId` | ObjectId (ApiKey) | No | — | API key actor reference |
| `action` | String | Yes | — | Action identifier, max 80 chars |
| `targetType` | String | Yes | — | Target entity type, max 80 chars |
| `targetId` | String | No | — | Target entity ID, max 120 chars |
| `requestId` | String | No | — | Request correlation ID, max 128 chars |
| `metadata` | Mixed | No | `{}` | Event metadata |

**Indexes:** `{ orgId, createdAt }`, `{ orgId, actorUserId, createdAt }`, `{ orgId, action, createdAt }`, `actorType`, `action`, `targetType`

---

#### AuditLog

Security-focused immutable audit log for compliance.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | No | — | Organization context |
| `userId` | ObjectId (User) | No | — | User context |
| `action` | String | Yes | — | Enum: `"login_success"`, `"login_failed"`, `"logout"`, `"password_change"`, `"password_reset_request"`, `"password_reset_complete"`, `"2fa_enabled"`, `"2fa_disabled"`, `"2fa_verified"`, `"2fa_failed"`, `"2fa_backup_used"`, `"api_key_created"`, `"api_key_revoked"`, `"account_locked"`, `"account_unlocked"`, `"profile_updated"`, `"role_changed"`, `"org_member_added"`, `"org_member_removed"`, `"plugin_installed"`, `"plugin_uninstalled"`, `"plugin_permission_denied"`, `"export_created"`, `"data_deleted"`, `"session_invalidated"`, `"suspicious_activity"` |
| `severity` | String | Yes | `"info"` | Enum: `"info"`, `"warn"`, `"critical"` |
| `ip` | String | No | — | Client IP address, max 45 chars |
| `userAgent` | String | No | — | Browser user agent, max 500 chars |
| `targetResource` | String | No | — | Target resource type, max 120 chars |
| `targetId` | String | No | — | Target resource ID, max 120 chars |
| `metadata` | Mixed | No | `{}` | Event metadata |
| `requestId` | String | No | — | Request correlation ID, max 64 chars |

**Indexes:** `createdAt` (TTL: 365 days), `{ userId, action, createdAt }`, `{ orgId, severity, createdAt }`

**Note:** This collection is append-only with `updatedAt: false` to prevent tampering.

---

#### AutopilotRun

Autonomous AI-driven financial action execution.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Request owner |
| `goal` | String | Yes | — | User goal description, max 4000 chars |
| `status` | String | Yes | `"planned"` | Enum: `"planned"`, `"simulated"`, `"awaiting_approval"`, `"approved"`, `"executing"`, `"succeeded"`, `"failed"` |
| `ai` | Mixed | No | `{}` | AI reasoning data |
| `toolCalls` | [Mixed] | No | `[]` | Tool invocations |
| `simulations` | [Mixed] | No | `[]` | Simulation results |
| `approvals` | Mixed | No | `{}` | Approval data |
| `executions` | [Mixed] | No | `[]` | Execution results |
| `error` | String | No | — | Error message, max 4000 chars |
| `requestId` | String | No | — | Request correlation ID, max 128 chars |

**Indexes:** `{ orgId, userId, createdAt }`, `{ orgId, status, createdAt }`

---

#### ToolExecution

Individual tool call execution records within Autopilot runs.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Request owner |
| `tool` | String | Yes | — | Tool name, max 120 chars |
| `toolCallId` | String | Yes | — | Tool call identifier, max 128 chars |
| `idempotencyKey` | String | Yes | — | Deduplication key, max 128 chars |
| `status` | String | No | `"running"` | Enum: `"running"`, `"succeeded"`, `"failed"` |
| `requestId` | String | No | — | Request correlation ID, max 128 chars |
| `toolCall` | Mixed | No | `{}` | Tool invocation payload |
| `result` | Mixed | No | `{}` | Tool execution result |
| `error` | String | No | — | Error message, max 2000 chars |
| `finishedAt` | Date | No | — | Completion timestamp |

**Indexes:** `{ orgId, userId, createdAt }`, `{ orgId, userId, idempotencyKey }` (unique)

---

#### DomainEvent

Event sourcing events for CQRS/event-driven architecture.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `userId` | ObjectId (User) | Yes | — | Event initiator |
| `eventType` | String | Yes | — | Event type identifier, max 120 chars |
| `aggregateType` | String | Yes | — | Aggregate root type, max 80 chars |
| `aggregateId` | String | Yes | — | Aggregate root ID, max 128 chars |
| `actionLinkId` | String | No | — | Action link reference, max 128 chars |
| `requestId` | String | No | — | Request correlation ID, max 128 chars |
| `payload` | Mixed | Yes | `{}` | Event payload |
| `processedAt` | Date | No | — | Processing completion timestamp |

**Indexes:** `{ orgId, userId, createdAt }`, `{ eventType, createdAt }`, `{ processedAt, createdAt }`

---

#### CreditGrant

Feature credit allocations (from referrals, promotions, etc.).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `orgId` | ObjectId (Organization) | Yes | — | Owning organization |
| `periodKey` | String | Yes | — | Period identifier, max 16 chars |
| `feature` | String | Yes | — | Enum: `"monthly_ai_calls"`, `"scenario_depth"`, `"ocr_quota"`, `"api_requests"`, `"autopilot_actions"`, `"workflow_runs"`, `"connector_sync_records"`, `"marketplace_installs"` |
| `units` | Number | Yes | — | Granted units (min: 0) |
| `sourceType` | String | Yes | — | Grant source type, max 40 chars |
| `sourceId` | String | Yes | — | Source entity ID, max 128 chars |
| `idempotencyKey` | String | No | — | Deduplication key, max 128 chars |
| `createdByUserId` | ObjectId (User) | No | — | Grant creator |
| `metadata` | Mixed | No | `{}` | Grant metadata |

**Indexes:** `{ orgId, periodKey, feature, createdAt }`, `{ orgId, idempotencyKey }` (partial unique)

---

## 4. Relationships

### Primary Entity Graph

```
User ──1:N──▶ OrgMember ──N:1──▶ Organization
  │                                    │
  │ 1:N                                │ 1:N
  ▼                                    ▼
FinancialProfile              Account ──1:N──▶ Transaction
  │                                    │            │
  │                                    │            N:1
  │                                    │            ▼
  │                                    │       Merchant
  │                                    │
  │                                    ├──1:N──▶ BudgetAllocation
  │                                    ├──1:N──▶ RecurringRule
  │                                    ├──1:N──▶ MonthClose
  │                                    ├──1:N──▶ CategoryRule
  │                                    ├──1:N──▶ Workflow ──1:N──▶ WorkflowRun
  │                                    ├──1:N──▶ Task
  │                                    ├──1:N──▶ Receipt ──N:1──▶ GridFS
  │                                    ├──1:N──▶ JournalEntry ──N:1──▶ GridFS
  │                                    ├──1:N──▶ WorkspaceFile ──N:1──▶ GridFS
  │                                    ├──1:N──▶ ExportJob ──N:1──▶ GridFS
  │                                    ├──1:N──▶ Comment (polymorphic)
  │                                    ├──1:N──▶ ShareLink
  │                                    ├──1:N──▶ Notification
  │                                    ├──1:N──▶ CalendarReminder
  │                                    ├──1:N──▶ ChatSession ──1:N──▶ ChatMessage
  │                                    ├──1:N──▶ AgentOutput
  │                                    ├──1:N──▶ AiResponseCache
  │                                    ├──1:N──▶ MemoryRecord
  │                                    ├──1:N──▶ AutopilotRun ──1:N──▶ ToolExecution
  │                                    ├──1:N──▶ DomainEvent
  │                                    ├──1:N──▶ IntegrationConnection ──1:N──▶ IntegrationSyncRun
  │                                    ├──1:N──▶ PluginInstall
  │                                    ├──1:N──▶ ReferralCode ──1:N──▶ ReferralRedemption
  │                                    ├──1:N──▶ AuditEvent
  │                                    ├──1:N──▶ FeatureFlag
  │                                    ├──1:N──▶ ApiKey
  │                                    ├──1:N──▶ CreditGrant
  │                                    ├──1:1──▶ Subscription
  │                                    ├──1:1──▶ BillingAccount
  │                                    └──1:N──▶ UsageLedger
  │
  ├──1:N──▶ Entitlement
  └──1:N──▶ UsageEvent

MarketplacePlugin ──N:1──▶ PluginInstall (via pluginKey)

GrowthStory (global, no org)
BlogPost (global, no org)
```

### Key Relationship Patterns

| Pattern | Models Involved | Description |
|---------|----------------|-------------|
| **Ownership** | Organization → all finance/feature models | Every operational document references `orgId` for multi-tenant isolation |
| **User Attribution** | User → Transaction, ChatSession, Task, etc. | Most models track `userId` for audit and personalization |
| **Parent-Child** | ChatSession → ChatMessage, Workflow → WorkflowRun | One-to-many with explicit foreign key references |
| **Polymorphic** | Comment (resourceType + resourceId) | Single comment model references multiple entity types |
| **File Reference** | Receipt, JournalEntry, WorkspaceFile, ExportJob → GridFS | `fileId` references MongoDB GridFS `fs.files` collection |
| **Provenance** | Transaction.source → AgentOutput, Receipt, Task, etc. | Source tracking via `source` subdocument with typed references |
| **Global Content** | GrowthStory, BlogPost | No `orgId`; platform-wide content accessible to all users |
| **Billing Chain** | Organization → BillingAccount → Subscription → Entitlement → UsageLedger → UsageEvent | Complete billing and metering pipeline |
| **Referral Chain** | User → ReferralCode → ReferralRedemption → CreditGrant | Referral tracking with reward issuance |
| **Audit Chain** | AuditEvent (org-scoped) + AuditLog (security, user-scoped) | Dual audit trail for operational and security events |

---

## 5. Indexing Strategy

### Multi-Tenant Index Pattern

The dominant indexing pattern across all collections is `{ orgId: 1, ... }` as the leading compound index key. This ensures:

1. **Data isolation** — queries always filter by `orgId` first
2. **Index efficiency** — compound indexes serve both filtering and sorting
3. **Collation safety** — org-scoped indexes prevent cross-tenant data leakage

```
{ orgId: 1, userId: 1, date: -1 }     // Most common: user's records by date
{ orgId: 1, status: 1, createdAt: -1 } // Status-filtered listings
{ orgId: 1, periodKey: 1, feature: 1 } // Periodic aggregation lookups
```

### Unique Constraints

| Collection | Unique Index | Purpose |
|------------|-------------|---------|
| User | `email` | Prevent duplicate accounts |
| User | `googleId` (sparse) | OAuth deduplication |
| Organization | `slug` | URL-safe unique identifier |
| OrgMember | `{ orgId, userId }` | Prevent duplicate memberships |
| OrgInvite | `tokenHash` | Unique invite tokens |
| BudgetAllocation | `{ orgId, periodKey, category }` | One budget per category per period |
| MonthClose | `{ orgId, periodKey }` | One close per period |
| FinancialProfile | `{ orgId, userId }` | One profile per user per org |
| AiResponseCache | `cacheKey` | Cache deduplication |
| MemoryRecord | `{ orgId, userId, key }` | One memory per key per user |
| Subscription | `orgId` | One subscription per org |
| BillingAccount | `orgId` | One billing account per org |
| ApiKey | `keyHash` | Unique key hashes |
| FeatureFlag | `{ orgId, key }` | One flag per key per org |
| IntegrationConnection | `{ orgId, connectorKey }` | One connection per connector per org |
| PluginInstall | `{ orgId, pluginKey }` | One install per plugin per org |
| MarketplacePlugin | `pluginKey` | Unique plugin catalog entries |
| ReferralCode | `orgId`, `code` | Unique codes |
| ReferralRedemption | `referredOrgId` | One redemption per referred org |
| ShareLink | `tokenHash` | Unique share tokens |
| Task | `_id` (string) | Custom string identifiers |
| WorkspaceFile | `fileId` | Unique GridFS references |
| UsageLedger | `{ orgId, periodKey, feature }` | One ledger entry per feature per period |
| ToolExecution | `{ orgId, userId, idempotencyKey }` | Idempotent tool calls |

### Partial Unique Indexes

Used for optional unique constraints that should only apply when a field is present:

| Collection | Partial Unique Index | Condition |
|------------|---------------------|-----------|
| Transaction | `{ orgId, externalId }` | `externalId` exists |
| Transaction | `legacyId` | `legacyId` exists |
| WorkflowRun | `{ workflowId, idempotencyKey }` | `idempotencyKey` is string |
| ExportJob | `{ orgId, createdByUserId, idempotencyKey }` | `idempotencyKey` is string |
| UsageEvent | `{ userId, idempotencyKey }` | `idempotencyKey` is string |
| Entitlement | `orgId` | `orgId` is ObjectId |
| CreditGrant | `{ orgId, idempotencyKey }` | `idempotencyKey` is string |

### TTL Indexes

Automatic document expiration:

| Collection | TTL Field | Expiration | Purpose |
|------------|-----------|------------|---------|
| AiResponseCache | `expiresAt` | `expireAfterSeconds: 0` | Auto-expire cached responses |
| ShareLink | `expiresAt` | `expireAfterSeconds: 0` | Auto-delete expired share links |
| AuditLog | `createdAt` | `expireAfterSeconds: 31536000` (365 days) | Compliance retention policy |

### Text Search Indexes

| Collection | Text Fields | Weights | Purpose |
|------------|------------|---------|---------|
| Transaction | `description`, `category` | description: 3, category: 1 | Transaction search |
| MemoryRecord | `key`, `value` | Equal | Memory keyword search |
| GrowthStory | `title`, `summary`, `challenge`, `tags` | Equal | Story discovery |
| BlogPost | `title`, `content`, `tags` | Equal | Article search |

---

## 6. Data Lifecycle

### Creation Patterns

| Pattern | Models | Description |
|---------|--------|-------------|
| **User Registration** | User, OrgMember, Organization, Entitlement, FinancialProfile | New user creates account, default personal org, free-tier entitlement, and financial profile |
| **Organization Creation** | Organization, OrgMember, Subscription, BillingAccount | Team org creation with subscription and billing setup |
| **Transaction Ingestion** | Transaction | Manual entry, CSV import, receipt OCR, journal parsing, AI plan execution, or connector sync |
| **AI Conversation** | ChatSession, ChatMessage, AgentOutput, MemoryRecord | User initiates chat, messages are recorded, AI outputs are analyzed and cached, memories are extracted |
| **Workflow Execution** | Workflow, WorkflowRun, Task, Notification, ExportJob | Cron or event trigger creates WorkflowRun, which generates downstream artifacts |
| **File Upload** | WorkspaceFile, Receipt, JournalEntry → GridFS | File uploaded to GridFS, metadata record created, async processing begins |
| **Autopilot Execution** | AutopilotRun, ToolExecution, Transaction | AI plans actions, user approves, tools execute, transactions are created |

### Update Patterns

| Pattern | Models | Description |
|---------|--------|-------------|
| **Financial Profile Sync** | FinancialProfile | `transactionsCount` and `transactionsUpdatedAt` updated on each transaction mutation for cache invalidation |
| **Budget Tracking** | BudgetAllocation, MonthClose | Budget allocations set monthly; MonthClose aggregates at period end |
| **Task Lifecycle** | Task | `open` → `completed` → `appliedAt` with `appliedSummary` recording financial effects |
| **Chat Session** | ChatSession | `messageCount` and `lastMessageAt` incremented per message; `summary` regenerated periodically |
| **Subscription Changes** | Subscription, Entitlement | Plan upgrades/downgrades update `planTier`, `status`, and billing period dates |
| **Usage Metering** | UsageEvent → UsageLedger | Individual events aggregated into period-keyed ledger entries |
| **Merchant Normalization** | Merchant | New merchants created from transaction descriptions; aliases accumulated over time |

### Archival and Deletion

| Strategy | Models | Description |
|----------|--------|-------------|
| **TTL Expiration** | AiResponseCache, ShareLink, AuditLog | MongoDB TTL indexes automatically remove expired documents |
| **Soft Delete** | Comment | `deletedAt` field set instead of physical deletion |
| **Status Transition** | Task, OrgMember, Workflow, IntegrationConnection | Status fields (`dismissed`, `removed`, `disabled`, `disconnected`) mark inactive records |
| **Hard Delete** | Most models | Physical deletion with cascade where applicable (e.g., ChatMessage on ChatSession delete) |
| **Period Rotation** | UsageLedger, UsageEvent, CreditGrant | Old period keys naturally age out; can be archived or purged |

### Data Migration Patterns

| Pattern | Description |
|---------|-------------|
| **Transaction Migration** | `FinancialProfile.transactions` (embedded) migrated to dedicated `Transaction` collection; `transactionsMigratedAt` tracks completion |
| **Legacy ID Mapping** | `Transaction.legacyId` preserves original ObjectId during migration for referential integrity |
| **Schema Versioning** | `FinancialProfile.onboardingVersion` tracks onboarding schema evolution |

---

## 7. Multi-Tenancy

### Organization-Based Isolation

All operational data in FinWise is scoped to an organization via the `orgId` field. This is the foundational multi-tenancy pattern.

```
┌──────────────────────────────────────────────────────┐
│                    MongoDB Cluster                    │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Organization A                      │ │
│  │  orgId: ObjectId("abc...")                       │ │
│  │                                                   │ │
│  │  ├── Users (OrgMembers)                          │ │
│  │  ├── Transactions                                │ │
│  │  ├── Accounts                                    │ │
│  │  ├── Budgets                                     │ │
│  │  ├── AI Sessions                                 │ │
│  │  ├── Tasks                                       │ │
│  │  └── ... (all org-scoped models)                │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Organization B                      │ │
│  │  orgId: ObjectId("def...")                       │ │
│  │  (complete data isolation from Org A)            │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Enforcement Mechanisms

1. **Schema-Level**: Every org-scoped model defines `orgId: { type: ObjectId, ref: "Organization", required: true }`
2. **Query-Level**: All API routes and services filter by `orgId` from the authenticated session context
3. **Index-Level**: Compound indexes lead with `orgId` for efficient tenant-scoped queries
4. **Plugin-Level**: The `orgScopePlugin` Mongoose plugin warns in development when queries lack `orgId` filters (applied to Transaction and other critical models)

### Models Without orgId

| Model | Reason |
|-------|--------|
| `User` | Users exist across organizations; membership is via `OrgMember` |
| `GrowthStory` | Platform-wide content, not tenant-specific |
| `BlogPost` | Platform-wide content, not tenant-specific |
| `MarketplacePlugin` | Global plugin catalog |
| `AuditLog` | Security events may be user-scoped without org context (e.g., login attempts before org selection) |
| `Entitlement` | Can be user-scoped (orgId is optional) |
| `UsageEvent` | Can be user-scoped (orgId is optional) |

### Tenant Context Flow

```
HTTP Request → JWT/Auth Token → Extract userId → Lookup OrgMember → Get orgId
                                                                    ↓
                                                    All DB queries include { orgId }
```

### Cross-Tenant Operations

Cross-tenant operations are intentionally limited:
- **Referrals**: `ReferralRedemption` links `referrerOrgId` and `referredOrgId` but does not share financial data
- **Marketplace**: `MarketplacePlugin` is global; `PluginInstall` is per-org
- **Content**: `GrowthStory` and `BlogPost` are globally readable but not editable across tenants

---

*End of Database Schema Documentation*
