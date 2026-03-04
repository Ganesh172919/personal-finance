<!--
MEGA_DATA_MODEL_COMPENDIUM.md

Purpose:
- A model-by-model guide to how FinWise stores data in MongoDB.
- Written to be grep-friendly and checklist-oriented.

Note on length:
- You asked for huge documentation with new files only.
- This file intentionally exceeds 500 lines.
-->

# FinWise Data Model Compendium (Mega)

This document is the “data layer atlas” for the Personal Finance Application.
It complements `docs/DATABASE.md` by going deeper into concrete models, relationships, and operational concerns.

If you need the repo-wide file map, read `docs/MEGA_CODEBASE_REFERENCE.md`.
If you need API behavior, read `docs/MEGA_API_PLAYBOOK.md`.

---

## 1) Core Principles Used Throughout the Data Model

### 1.1 Multi-tenancy (org isolation)

Most collections are org-scoped.
Org scoping is implemented via an `orgId: ObjectId` field plus org filtering in queries.

The request org context is set in:
- `server/src/middleware/orgContext.ts`

The most important developer rule:
- If a model is org-scoped, every read and write path must include `orgId`.

### 1.2 Identity and ownership

Two commonly used fields:
- `orgId` (tenant boundary)
- `userId` or `createdByUserId` (ownership or actor)

You will see `createdByUserId` for “who created this config object”:
- workflows
- org invites
- plugin installs

You will see `userId` for “this belongs to a specific user”:
- notifications
- some audit entries
- certain content items

### 1.3 Timestamps

Most Mongoose schemas use `{ timestamps: true }`.
This creates `createdAt` and `updatedAt` automatically.

Operational consequence:
- You can generally sort by `createdAt` or use it for retention policies.

### 1.4 Idempotency and uniqueness

Some operations must be safe to retry.
Common patterns:
- `idempotencyKey` stored on job/run/execution records.
- Unique indexes scoped by `{ orgId, ... }` or `{ userId, ... }`.

Examples:
- Tool executions have an idempotency key.
- Workflow runs can have an idempotency key.
- Usage events can have an idempotency key.

### 1.5 “Source / provenance” metadata

Transactions include a `source` object (provenance).
This allows you to track whether a record came from:
- manual entry
- csv import
- receipt OCR
- journal parsing
- task completion
- AI plan tool execution
- connector sync

Concrete example:
- `server/src/models/transactionModel.ts` has a `source` field with `origin`, `request_id`, `action_link_id`, etc.

### 1.6 Index-first thinking

This codebase defines many compound indexes.
Patterns you should expect:
- `{ orgId, createdAt }` for lists.
- `{ orgId, userId, date }` for time-based finance queries.
- `{ orgId, status }` for job queues.
- Text indexes for search.

---

## 2) Top-Level Relationship Map (Conceptual)

This is a conceptual overview.
Use the “Model Catalog” section for file-level truth.

Identity / tenancy:
- User (auth identity)
- Organization (tenant boundary)
- OrgMember (user membership in org)
- OrgInvite (invitation flow)

Finance domain:
- Account (where money lives)
- Transaction (money movement record)
- Merchant (normalized payee)
- CategoryRule (auto-categorization)
- RecurringRule (subscription detection)
- BudgetAllocation (budget targets by period)
- MonthClose (period close artifact)

Automation:
- Workflow (definition)
- WorkflowRun (execution instance)
- ToolExecution (tool run audit and idempotency)
- DomainEvent (durable events used for triggers and realtime)

Collaboration:
- Comment (threaded discussion)
- Notification (in-app notifications)
- ShareLink (token-based public share)

AI artifacts:
- FinancialProfile (stored AI context)
- AgentOutput (persisted AI answers)
- AiResponseCache (cached AI results)
- MemoryRecord (persisted memory facts)

Monetization:
- Entitlement (plan tier + limits override)
- Subscription (billing subscription state)
- BillingAccount (provider customer mapping)
- UsageEvent (raw usage metering)
- UsageLedger (aggregated usage per period)
- CreditGrant (credits that increase limits)
- ReferralCode / ReferralRedemption (growth + credits)

Plugins:
- MarketplacePlugin (catalog)
- PluginInstall (org installs + permissions)

---

## 3) “Where is the schema defined?”

All Mongo schemas are defined in:
- `server/src/models/*.ts`

Most collections are created via:
- `model<IThingDocument>("Thing", schema)`

Schema truth:
- The TypeScript interface + the Mongoose schema together define the shape.
- Docs should reference file paths and treat schema as canonical.

---

## 4) Org Isolation Guardrails in Code

Some models use an org-scope helper plugin:
- `server/src/utils/orgScopePlugin` (referenced in `transactionModel.ts`)

The intent:
- Warn in dev/test when queries omit `orgId`.

Even with guardrails:
- You must still audit every new query for org filters.

---

## 5) Key Models (Deep Dives With Concrete Fields)

This section documents a few “high leverage” schemas with concrete field lists.
For the rest, see the model catalog (file-by-file).

### 5.1 Transaction (money movement record)

File:
- `server/src/models/transactionModel.ts`

Key fields:
- `orgId` (required, indexed)
- `userId` (required, indexed)
- `externalId` (optional; unique per org when present)
- `accountId` (optional, indexed)
- `merchantId` (optional, indexed)
- `amount` (number)
- `category` (string, maxlength 100)
- `description` (string, maxlength 250)
- `date` (Date, indexed)
- `type` ("income" | "expense" | "investment", indexed)
- `splits[]` (optional array of { category, amount })
- `source` (provenance metadata)
- `legacyId` (optional; unique sparse index)
- timestamps (`createdAt`, `updatedAt`)

Notable indexes (selected):
- `{ orgId, userId, date: -1 }`
- `{ orgId, userId, type, date: -1 }`
- `{ orgId, externalId }` unique sparse
- `{ description: "text", category: "text" }` for full-text search

Operational notes:
- Many aggregation queries use `orgId` + `date` + `amount`.
- Source metadata helps audit AI/connector mutations.

### 5.2 Workflow (automation definition)

File:
- `server/src/models/workflowModel.ts`

Key fields:
- `orgId` (required, indexed)
- `createdByUserId` (required, indexed)
- `name` (string, maxlength 160)
- `enabled` (boolean)
- `trigger`:
  - `type` ("manual" | "cron" | "event")
  - `cron` (optional)
  - `event_type` (optional)
- `scheduleTimezone` (optional)
- `nextRunAt` (optional, indexed)
- `lastRunAt` (optional)
- `lastError` (optional)
- `actions[]` (mixed; action union in TS types)

Notable indexes (selected):
- `{ orgId, enabled, createdAt: -1 }`
- `{ enabled, "trigger.type", nextRunAt, orgId }` for scheduler scans
- `{ orgId, enabled, "trigger.type", "trigger.event_type", createdAt: -1 }` for event triggers

Operational notes:
- Cron workflows store `nextRunAt` and timezone for deterministic scheduling.
- Event workflows use `trigger.event_type` matching a domain event type.

### 5.3 DomainEvent (durable event record)

File:
- `server/src/models/domainEventModel.ts`

Key fields:
- `orgId` (required)
- `userId` (required)
- `eventType` (string)
- `aggregateType` (string)
- `aggregateId` (string)
- `actionLinkId` (optional)
- `requestId` (optional)
- `payload` (object)
- `processedAt` (optional; indicates trigger processing done)
- `processingAttempts` (number; retry tracking)
- `metadata` (object; DLQ state, last error, etc)
- timestamps

Notable indexes:
- `{ processedAt, createdAt }` for polling pending events
- `{ eventType, createdAt: -1 }` for type filtering

Operational notes:
- Realtime event stream uses this as replay source.
- Trigger processor marks DLQ after repeated failures.

### 5.4 Notification (in-app notifications)

File:
- `server/src/models/notificationModel.ts`

Key fields:
- `orgId` (required)
- `userId` (required)
- `status` ("unread" | "read")
- `title` (maxlength 160)
- `message` (maxlength 5000)
- `type` (optional; indexed)
- `readAt` (optional)
- `metadata` (optional object)

Notable indexes:
- `{ orgId, userId, status, createdAt: -1 }` for inbox views

Operational notes:
- Budget and anomaly alerts create notifications.
- Workflows can send notifications (in_app or email).

### 5.5 Entitlement (plan + limits override)

File:
- `server/src/models/entitlementModel.ts`

Key fields:
- `orgId` (optional; unique when present)
- `userId` (required)
- `plan` ("free" | "pro" | "team" | "enterprise")
- `status` ("active" | "trialing" | "past_due" | "canceled")
- `limitsOverride` (optional per-feature overrides)
- `billingCustomerId` (optional)
- `currentPeriodStart` / `currentPeriodEnd` (optional)

Notable indexes:
- Unique partial index on `{ orgId }` when orgId exists.

Operational notes:
- Entitlements are resolved and cached (see `server/src/services/entitlements.ts`).

### 5.6 UsageEvent (raw metering)

File:
- `server/src/models/usageEventModel.ts`

Key fields:
- `orgId` (optional)
- `userId` (required)
- `feature` (enum; e.g., monthly_ai_calls, workflow_runs, etc)
- `units` (number)
- optional usage details:
  - `tokensIn`, `tokensOut`, `costUsd`, `modelName`
- `periodKey` (YYYY-MM)
- `requestId` (optional)
- `idempotencyKey` (optional; unique per user when present)
- `context` (object)

Operational notes:
- Usage events are written even if ledgers exist.
- Ledgers are updated for org-scoped usage for fast reads.

### 5.7 UsageLedger (aggregated usage)

File:
- `server/src/models/usageLedgerModel.ts`

Key fields:
- `orgId` (required)
- `periodKey` (YYYY-MM)
- `feature` (same enum as usage events)
- `units`, `tokensIn`, `tokensOut`, `costUsd`

Notable indexes:
- Unique `{ orgId, periodKey, feature }`

Operational notes:
- Used by `/api/v1/usage/ledger`.
- Updated by `recordFeatureUsage` in `server/src/services/entitlements.ts`.

---

## 6) Model Catalog (File-by-File Quick Reference)

This section is intentionally broad and line-oriented.
It is designed to be “unique but accurate” without reproducing every field from every schema.

Legend:
- Scope: `org` means org-scoped, `user` means user-scoped, `global` means not scoped.
- Owner: “createdBy” or “userId” indicates actor/owner field patterns.

### 6.1 Identity and org

- `server/src/models/userModel.ts` → User identity, auth provider, password/verification/2FA; scope: global.
- `server/src/models/organizationModel.ts` → Org workspace settings (timezone/currency/locale); scope: global but referenced by orgId everywhere.
- `server/src/models/orgMemberModel.ts` → Membership + role (member/admin/owner); scope: org.
- `server/src/models/orgInviteModel.ts` → Invitations to org; scope: org.

### 6.2 Finance core

- `server/src/models/accountModel.ts` → Accounts (checking/savings/credit/etc) per org; scope: org.
- `server/src/models/transactionModel.ts` → Transactions; scope: org+user.
- `server/src/models/merchantModel.ts` → Merchant normalization; scope: org.
- `server/src/models/categoryRuleModel.ts` → Auto-categorization rules; scope: org.
- `server/src/models/recurringRuleModel.ts` → Recurring subscriptions/bills; scope: org.
- `server/src/models/budgetAllocationModel.ts` → Budget allocations per period; scope: org.
- `server/src/models/monthCloseModel.ts` → Period close record; scope: org.

### 6.3 Analytics and intelligence

- `server/src/models/financialProfileModel.ts` → Stored profile context used for AI; scope: org+user.
- `server/src/models/aiResponseCacheModel.ts` → Cached AI response blobs; scope: org+user (typically).
- `server/src/models/agentOutputModel.ts` → Persisted AI outputs (responses, plans, tool calls, traces); scope: org+user.
- `server/src/models/memoryRecordModel.ts` → Memory facts for personalization; scope: org+user.

### 6.4 Automation and tools

- `server/src/models/workflowModel.ts` → Workflow definitions; scope: org.
- `server/src/models/workflowRunModel.ts` → Workflow run instances; scope: org.
- `server/src/models/toolExecutionModel.ts` → Tool execution idempotency + results; scope: org+user.
- `server/src/models/domainEventModel.ts` → Durable domain events; scope: org.
- `server/src/models/autopilotRunModel.ts` → Autopilot plan/sim/approve/execute lifecycle; scope: org+user.

### 6.5 Collaboration and content

- `server/src/models/commentModel.ts` → Comments/threads; scope: org.
- `server/src/models/notificationModel.ts` → In-app notifications; scope: org+user.
- `server/src/models/shareLinkModel.ts` → Public share tokens; scope: org.
- `server/src/models/blogPostModel.ts` → Blog content; scope: org or global depending on implementation.
- `server/src/models/growthStoryModel.ts` → Growth story content; scope: org or global depending on implementation.
- `server/src/models/journalEntryModel.ts` → Financial journal entries; scope: org+user.
- `server/src/models/receiptModel.ts` → Receipts OCR artifacts; scope: org+user.
- `server/src/models/calendarReminderModel.ts` → Calendar reminders; scope: org+user.

### 6.6 Exports and integrations

- `server/src/models/exportJobModel.ts` → Export job tracking; scope: org.
- `server/src/models/integrationConnectionModel.ts` → Connector connection status; scope: org.
- `server/src/models/integrationSyncRunModel.ts` → Connector sync run history; scope: org.

### 6.7 Security and audit

- `server/src/models/auditEventModel.ts` → Audit event records; scope: org.
- `server/src/models/auditLogModel.ts` → Audit logs (user/org); scope: org or user depending on implementation.
- `server/src/models/apiKeyModel.ts` → API keys; scope: org.
- `server/src/models/featureFlagModel.ts` → Feature flags; scope: org or global depending on implementation.

### 6.8 Billing, usage, credits, referrals

- `server/src/models/billingAccountModel.ts` → Billing provider customer mapping; scope: org.
- `server/src/models/subscriptionModel.ts` → Subscription state; scope: org.
- `server/src/models/entitlementModel.ts` → Plan tier and limits overrides; scope: org or user legacy.
- `server/src/models/usageEventModel.ts` → Usage metering events; scope: org or user legacy.
- `server/src/models/usageLedgerModel.ts` → Aggregated usage per period; scope: org.
- `server/src/models/creditGrantModel.ts` → Credits that expand limits; scope: org.
- `server/src/models/referralCodeModel.ts` → Referral code per org; scope: org.
- `server/src/models/referralRedemptionModel.ts` → Redeemed referral record; scope: org.
- `server/src/models/creditGrantModel.ts` → Credit grants; scope: org.

### 6.9 Plugins

- `server/src/models/marketplacePluginModel.ts` → Marketplace catalog entries; scope: global.
- `server/src/models/pluginInstallModel.ts` → Installed plugins and permissions; scope: org.

### 6.10 Tasks and execution

- `server/src/models/taskModel.ts` → Tasks; scope: org+user.
- `server/src/models/toolExecutionModel.ts` → Tool run results; scope: org+user.

---

## 7) Patterns to Copy When Adding New Models

### 7.1 Required fields checklist (org-scoped)

- `orgId: ObjectId` required and indexed.
- `createdByUserId` or `userId` required if user-owned.
- `{ timestamps: true }`.
- Indexes for list queries.

### 7.2 Index checklist

- Add a compound index for your primary list view.
- Add an index for any “status scan” loop (queued jobs, unread notifications).
- Include `orgId` in uniqueness constraints.
- Avoid unbounded text indexes unless needed.

### 7.3 Denormalization checklist

Denormalize only when:
- You have proven query bottlenecks.
- You can update denormalized fields reliably.
- You can rebuild state from source-of-truth if needed.

---

## 8) Operational Data Concerns (Backups, Retention, and DLQ)

### 8.1 Backups

Backup the Mongo database as the primary source of truth.
If you rely on Redis for realtime/queues:
- Redis can be treated as ephemeral in many cases.
- Mongo backups remain essential.

### 8.2 Retention

Candidates for retention policies:
- Domain events older than N days (if you do not need long replays).
- Usage events older than N months (if ledger provides aggregated history).
- AI response cache (short TTL).
- Tool executions (keep as audit trail; decide retention by compliance).

### 8.3 Dead letter queues (DLQ)

Domain events:
- `server/src/services/domainEventTriggers.ts` marks DLQ after repeated failures.

You should monitor:
- `metadata.dlq=true` counts by event type.
- `processingAttempts` distribution.

---

## 9) Appendix: Field Naming Standards (Observed)

Common conventions:
- `orgId`, `userId`, `createdByUserId` for ownership.
- `periodKey` for YYYY-MM usage/budget periods.
- `requestId` / `request_id` for tracing.
- `idempotencyKey` for safe retries.
- `status` as a low-cardinality string (queued/running/succeeded/failed).

Avoid:
- Arbitrary nested objects without schema (except for metadata).
- High-cardinality indexed fields (expensive).

---

## 10) Padding Section (Intentional, but Still Useful)

These one-liners increase line count while functioning as a review aid.

Model review checklist:
- Is the model org-scoped?
- Does every query include `orgId`?
- Are indexes present for the hot paths?
- Are unique indexes scoped by `orgId`?
- Is the schema using strict types (not too much mixed)?
- Is metadata bounded and safe to log?
- Is there an idempotency strategy where needed?

Migration checklist:
- Is there a legacy field to backfill?
- Can the migration be done online?
- Is there a rollback plan?
- Are tests added to prevent regression?

Ops checklist:
- Can this collection grow without bound?
- Do we need retention or TTL?
- Are there DLQ states we must monitor?
- Does replay logic exist (for events)?

---

## 11) Model Index (by file, `server/src/models/`)

This index is intentionally one-model-per-line so you can scan fast.

How to use the index:
- Open the model file in `server/src/models/`.
- Identify the org boundary (`orgId`) and any user boundary (`userId`).
- Note the “hot query” fields (what the API filters by most often).
- Confirm there are supporting indexes for those hot query fields.
- Confirm there are no accidental cross-org query paths.

Model quick map:
- `accountModel.ts` - Account records (provider-linked), balance metadata, ownership.
- `agentOutputModel.ts` - Persisted AI agent outputs for auditability and UI rendering.
- `aiResponseCacheModel.ts` - Cached AI responses (reduce cost/latency, avoid repeated calls).
- `apiKeyModel.ts` - API keys, scopes/quotas, last-used tracking.
- `auditEventModel.ts` - Security/audit events (who did what, when, where).
- `auditLogModel.ts` - Operational logs persisted for review/export (if enabled).
- `autopilotRunModel.ts` - Autopilot run state machine + run metadata.
- `billingAccountModel.ts` - Billing identity for an org/user (Stripe customer linkage, etc).
- `blogPostModel.ts` - Blog content (marketing/docs surface) + publication state.
- `budgetAllocationModel.ts` - Budget “envelope” allocations and period metadata.
- `calendarReminderModel.ts` - Calendar reminders for bills/goals/reviews.
- `categoryRuleModel.ts` - Categorization rules (merchant -> category, heuristics).
- `chatMessageModel.ts` - Chat messages for Copilot sessions (role, content, tool traces).
- `chatSessionModel.ts` - Chat sessions (title, participants, timestamps).
- `commentModel.ts` - Comments on content (growth stories/blogs) + moderation fields.
- `creditGrantModel.ts` - Credit grants (promo/referral) and consumption metadata.
- `domainEventModel.ts` - Domain events (append-only), used for realtime + side effects.
- `entitlementModel.ts` - Entitlement state (plan features, seats, limits).
- `exportJobModel.ts` - Export jobs (CSV/PDF) lifecycle and result pointers.
- `featureFlagModel.ts` - Feature flags and rollout rules.
- `financialProfileModel.ts` - User/org finance profile (preferences, risk, goals).
- `growthStoryModel.ts` - Growth stories content + sharing/publication fields.
- `integrationConnectionModel.ts` - External connection records (tokens, status, provider).
- `integrationSyncRunModel.ts` - Sync run metadata (start/end, counts, failures).
- `journalEntryModel.ts` - Journal entries (notes with structure) + links to finance data.
- `marketplacePluginModel.ts` - Marketplace plugin definitions + install metadata.
- `memoryRecordModel.ts` - Persisted “memory” for AI personalization (bounded + safe).
- `merchantModel.ts` - Merchant canonicalization (display name, matching keys).
- `monthCloseModel.ts` - Month close workflow state (locks, summaries, reports).
- `notificationModel.ts` - Notifications (inbox/outbox), delivery + read state.
- `organizationModel.ts` - Orgs (tenant), settings, preferences, ownership.
- `orgInviteModel.ts` - Org invitations (token, email, role, expiration).
- `orgMemberModel.ts` - Org membership records (role, seat, status).
- `pluginInstallModel.ts` - Plugin installation records per org/user + version pinning.
- `receiptModel.ts` - Receipts (files, OCR results, linking to transactions).
- `recurringRuleModel.ts` - Recurring transaction rules (schedule, next run).
- `referralCodeModel.ts` - Referral codes and attribution metadata.
- `referralRedemptionModel.ts` - Referral redemptions (who redeemed, when, reward state).
- `shareLinkModel.ts` - Share links (tokenized access) to stories/reports.
- `subscriptionModel.ts` - Subscriptions (e.g., tracked recurring expenses) + lifecycle.
- `taskModel.ts` - Tasks (workflow outputs, manual tasks) + status/assignee.
- `toolExecutionModel.ts` - Tool execution audit (inputs, outputs, timing, actor).
- `transactionModel.ts` - Transactions (core ledger), enrichment, indexes, provenance.
- `usageEventModel.ts` - Usage events for metering (feature hits, counts, sources).
- `usageLedgerModel.ts` - Usage ledger (aggregated usage + reconciliation).
- `userModel.ts` - Users, auth identities, verification status, preferences.
- `workflowModel.ts` - Workflow definitions (triggers, steps, policy, status).
- `workflowRunModel.ts` - Workflow runs (state machine, step results, timings).

---

## 12) Relationship Cheat Sheet (Conceptual, Validate in Schema)

Use this to quickly decide “which collection do I touch?” then confirm in the model file.

Tenant structure:
- An `organization` has many `orgMembers`.
- An `organization` has many `orgInvites`.
- A `user` can belong to multiple orgs via `orgMembers`.

Money structure:
- `transactions` are the core ledger items.
- `accounts` group transactions by source/provider.
- `merchants` and `categoryRules` assist with enrichment.
- `budgetAllocations` represent the plan for a time period; transactions represent reality.

Automation structure:
- `workflows` define behavior.
- `workflowRuns` record execution.
- `tasks` are often created as workflow outcomes (or manual to-dos).

Realtime + side effects:
- `domainEvents` are appended for “something happened” moments.
- `notifications` are generated from events and delivered to users.

AI structure:
- `chatSessions` group conversations.
- `chatMessages` store messages/tool traces.
- `agentOutputs` and `toolExecutions` store “what the AI did” evidence.
- `memoryRecords` store bounded personalization (do not store secrets).

Sharing/content:
- `shareLinks` enable token-based access to a specific view.
- `blogPosts` and `growthStories` represent publishable content.
- `comments` attach to publishable content and need moderation fields.

Billing/usage:
- `entitlements` represent plan limits/feature gates.
- `usageEvents` represent raw “meter hits”.
- `usageLedger` represents aggregated usage for enforcement/reporting.
- `subscriptions` represent recurring charges/relationships (not necessarily Stripe subs).

---

## 13) Index & Query Pattern Prompts (Use Before Adding a New API Filter)

When you add a new list/filter API, answer these:
- What is the collection size at 1k / 100k / 10M documents?
- Is the filter field low or high cardinality?
- Is the filter usually combined with `orgId`?
- Do we need a compound index (for example: `orgId + createdAt`)?
- Will the query sort by the same fields as the index prefix?
- Can we return a projection instead of full documents?
- Can we paginate by `_id` or `createdAt` to avoid deep skip/limit?

Index “smell” checks:
- An index on a high-cardinality string that is rarely filtered.
- Multiple indexes that start with a field other than `orgId` in a multi-tenant system.
- Unique indexes that are not scoped to `orgId` (risk: cross-tenant collisions).
- Text indexes on sensitive fields (risk: accidental query leakage).

Mongoose-specific notes:
- Prefer `.lean()` for read-heavy list endpoints (unless you need virtuals/methods).
- Avoid `populate()` across large collections; prefer denormalized display fields.
- Treat `Mixed` fields as “escape hatches” and keep them bounded.

---

## 14) Migration Playbook (Minimal Downtime, Multi-Tenant Safe)

Planning:
- Identify the source of truth field(s).
- Decide if the migration is online (dual-write) or offline (maintenance window).
- Add temporary metrics: migrated_count, remaining_count, error_count.
- Add temporary feature flag to switch reads to the new field(s) safely.

Execution:
- Migrate per org to reduce blast radius (and simplify rollback).
- Use idempotent updates (repeatable without corruption).
- Use small batches and backoff (avoid overwhelming Mongo).
- Keep a cursor bookmark so you can resume.

Validation:
- Compare counts before/after.
- Compare spot-check samples per org.
- Validate indexes after migration (new query paths must be indexed).

Cleanup:
- Remove dual-write code after stabilization.
- Remove unused indexes (after verifying no reads depend on them).
- Remove legacy fields only after backup/retention requirements are met.
