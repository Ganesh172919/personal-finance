# FinWise — Services Catalog

> Reference for all 49 business-logic service files in `server/src/services/`. Controllers stay thin — services contain the domain logic.

---

## AI Services

| Service              | File                  | Domain                                              |
| -------------------- | --------------------- | --------------------------------------------------- |
| **aiCoreClient**     | `aiCoreClient.ts`     | HTTP client for Python AI Core with circuit breaker |
| **aiRequestBuilder** | `aiRequestBuilder.ts` | Constructs structured AI requests with user context |
| **aiCache**          | `aiCache.ts`          | Caches AI responses to reduce latency               |
| **aiConcurrency**    | `aiConcurrency.ts`    | Per-user and global AI request throttling           |
| **responseCache**    | `responseCache.ts`    | General response caching layer                      |
| **chatSummary**      | `chatSummary.ts`      | Chat session summarization                          |

---

## Financial Intelligence

| Service                  | File                      | Domain                                               |
| ------------------------ | ------------------------- | ---------------------------------------------------- |
| **financeIntelligence**  | `financeIntelligence.ts`  | High-level AI-powered financial analysis             |
| **actionOutcomeService** | `actionOutcomeService.ts` | Tracks and evaluates outcomes of recommended actions |

---

## Financial Services

| Service                  | File                       | Domain                                             |
| ------------------------ | -------------------------- | -------------------------------------------------- |
| **transactionService**   | `transactionService.ts`    | Transaction CRUD and queries                       |
| **transactionCsvImport** | `transactionsCsvImport.ts` | CSV file parsing and transaction creation          |
| **transactionMigration** | `transactionMigration.ts`  | Transaction schema migration utilities             |
| **categoryRuleService**  | `categoryRuleService.ts`   | Auto-categorization rule engine (pattern matching) |

---

## Auth & Security Services

| Service            | File                | Domain                                        |
| ------------------ | ------------------- | --------------------------------------------- |
| **totp**           | `totp.ts`           | TOTP 2FA setup, verification, backup codes    |
| **accountLockout** | `accountLockout.ts` | Failed login tracking and account lockout     |
| **auditService**   | `auditService.ts`   | Security audit event logging (26 event types) |
| **auditLog**       | `auditLog.ts`       | Audit log query and persistence               |
| **apiKeyService**  | `apiKeys.ts`        | API key generation, hashing, validation       |

---

## Organization Services

| Service             | File                 | Domain                                      |
| ------------------- | -------------------- | ------------------------------------------- |
| **orgService**      | `orgService.ts`      | Organization CRUD, member management        |
| **orgDataBackfill** | `orgDataBackfill.ts` | Backfill org IDs for legacy data            |
| **orgEntitlements** | `orgEntitlements.ts` | Organization-level entitlement management   |
| **orgInvites**      | `orgInvites.ts`      | Organization invite creation and acceptance |
| **referrals**       | `referrals.ts`       | Referral code generation and redemption     |
| **profileService**  | `profileService.ts`  | User profile management                     |

---

## Content Services

| Service                 | File                     | Domain                                       |
| ----------------------- | ------------------------ | -------------------------------------------- |
| **blogService**         | `blogService.ts`         | Blog post CRUD and publishing                |
| **growthStoryService**  | `growthStoryService.ts`  | Growth story content management              |
| **journalContext**      | `journalContext.ts`      | Journal session context management           |
| **journalIntentParser** | `journalIntentParser.ts` | Parse financial intents from journal entries |

---

## Billing & Monetization

| Service          | File              | Domain                                          |
| ---------------- | ----------------- | ----------------------------------------------- |
| **billing**      | `billing.ts`      | Stripe checkout, portal, subscription lifecycle |
| **entitlements** | `entitlements.ts` | Feature limit enforcement by subscription tier  |
| **credits**      | `credits.ts`      | Credit-based usage metering and deduction       |
| **usageLedger**  | `usageLedger.ts`  | Usage event recording and ledger queries        |

---

## Workflow & Automation

| Service                 | File                     | Domain                                        |
| ----------------------- | ------------------------ | --------------------------------------------- |
| **workflows**           | `workflows.ts`           | Workflow CRUD, execution engine, and triggers |
| **workflowScheduler**   | `workflowScheduler.ts`   | Cron-based workflow scheduling and execution  |
| **workflowCron**        | `workflowCron.ts`        | Cron job management for scheduled workflows   |
| **workflowTemplates**   | `workflowTemplates.ts`   | Pre-built workflow template definitions       |
| **domainEvents**        | `domainEvents.ts`        | Domain event emission and persistence         |
| **domainEventTriggers** | `domainEventTriggers.ts` | Event-driven trigger evaluation and routing   |

---

## Integration & Connector Services

| Service             | File                 | Domain                                       |
| ------------------- | -------------------- | -------------------------------------------- |
| **connectorHealth** | `connectorHealth.ts` | Connector health monitoring, stale detection |
| **integrations**    | `integrations.ts`    | Integration connection lifecycle             |

---

## Tool Services

| Service          | File              | Domain                                            |
| ---------------- | ----------------- | ------------------------------------------------- |
| **toolCatalog**  | `toolCatalog.ts`  | Registry of available agent tools                 |
| **toolExecutor** | `toolExecutor.ts` | Execute tool calls from AI agent responses        |
| **toolPolicy**   | `toolPolicy.ts`   | Tool execution policies (confirm above threshold) |

### Tool Sub-modules (`services/tools/`)

| Module       | File          | Domain                                |
| ------------ | ------------- | ------------------------------------- |
| **builtins** | `builtins.ts` | Built-in tool implementations (47 KB) |
| **registry** | `registry.ts` | Tool name → handler resolution        |
| **types**    | `types.ts`    | Tool input/output type definitions    |

---

## Utility Services

| Service           | File               | Domain                                  |
| ----------------- | ------------------ | --------------------------------------- |
| **searchService** | `searchService.ts` | Full-text search across collections     |
| **digestService** | `digestService.ts` | Weekly/periodic digest email generation |
| **exports**       | `exports.ts`       | CSV/PDF export generation and storage   |
| **gridfs**        | `gridfs.ts`        | GridFS media file storage and retrieval |
| **shares**        | `shares.ts`        | Public share link creation and access   |

---

## Service Design Patterns

All services follow these conventions:

1. **Pure functions** — Services export standalone async functions (not classes)
2. **Dependency injection** — Database access via Mongoose models imported at module scope
3. **Error propagation** — Services throw `HttpError` instances (caught by `errorHandler` middleware)
4. **Org-scoped** — Most queries include `orgId` for multi-tenant isolation
5. **Typed returns** — Functions return typed objects consistent with API response shapes

```ts
// Example service pattern
export const getTransactions = async (
  orgId: ObjectId,
  userId: ObjectId,
  filters: TransactionFilters,
) => {
  const query = Transaction.find({ orgId, userId, ...buildFilter(filters) });
  return query.sort({ date: -1 }).limit(filters.limit).skip(filters.offset);
};
```

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [MIDDLEWARE.md](./MIDDLEWARE.md) · [API.md](./API.md)
