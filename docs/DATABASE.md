# Personal Finance — Database Models & Schema Reference

> All 48 Mongoose models used by the Personal Finance backend. The database is **MongoDB**, accessed via Mongoose 8.

---

## Connection

Configured in `server/src/config/database.ts`. Connection string is read from the `MONGODB_URI` environment variable.

---

## Model Catalog

### Core User & Auth

| Model      | File             | Key Fields                                                           |
| ---------- | ---------------- | -------------------------------------------------------------------- |
| **User**   | `userModel.ts`   | `email`, `passwordHash`, `name`, `googleId`, `emailVerified`, `role` |
| **ApiKey** | `apiKeyModel.ts` | `userId`, `keyHash`, `scopes[]`, `lastUsedAt`, `expiresAt`           |

---

### Organizations & Collaboration

| Model            | File                   | Key Fields                                                    |
| ---------------- | ---------------------- | ------------------------------------------------------------- |
| **Organization** | `organizationModel.ts` | `name`, `ownerId`, `settings`, `plan`                         |
| **OrgMember**    | `orgMemberModel.ts`    | `orgId`, `userId`, `role` (owner/admin/member)                |
| **OrgInvite**    | `orgInviteModel.ts`    | `orgId`, `email`, `invitedBy`, `status`, `token`, `expiresAt` |

---

### Collaboration

| Model       | File              | Key Fields                                                         |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| **Comment** | `commentModel.ts` | `userId`, `orgId`, `targetType`, `targetId`, `content`, `parentId` |

---

### Financial Data

| Model                | File                       | Key Fields                                                                                               |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Transaction**      | `transactionModel.ts`      | `userId`, `orgId`, `amount`, `category`, `merchant`, `date`, `accountId`, `tags[]`, `isRecurring`        |
| **Account**          | `accountModel.ts`          | `userId`, `orgId`, `name`, `type` (checking/savings/credit/investment), `balance`, `currency`            |
| **FinancialProfile** | `financialProfileModel.ts` | `userId`, `income`, `expenses`, `savings`, `debts[]`, `goals[]`, `riskTolerance`, `investmentExperience` |
| **BudgetAllocation** | `budgetAllocationModel.ts` | `userId`, `orgId`, `periodKey`, `category`, `allocated`, `spent`                                         |
| **RecurringRule**    | `recurringRuleModel.ts`    | `userId`, `orgId`, `amount`, `category`, `frequency`, `nextOccurrence`                                   |
| **Merchant**         | `merchantModel.ts`         | `orgId`, `name`, `category`, `logoUrl`                                                                   |
| **MonthClose**       | `monthCloseModel.ts`       | `userId`, `orgId`, `periodKey`, `income`, `expenses`, `savings`, `netWorth`, `closedAt`                  |
| **JournalEntry**     | `journalEntryModel.ts`     | `userId`, `orgId`, `content`, `mood`, `tags[]`, `financialImpact`                                        |

---

### Calendar

| Model                | File                       | Key Fields                                                       |
| -------------------- | -------------------------- | ---------------------------------------------------------------- |
| **CalendarReminder** | `calendarReminderModel.ts` | `userId`, `orgId`, `date`, `title`, `description`, `isCompleted` |

---

### Auto-Categorization

| Model            | File                   | Key Fields                                                                        |
| ---------------- | ---------------------- | --------------------------------------------------------------------------------- |
| **CategoryRule** | `categoryRuleModel.ts` | `orgId`, `pattern`, `category`, `matchField`, `priority`, `isActive`, `createdBy` |

---

### AI & Chat

| Model               | File                      | Key Fields                                                                         |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| **ChatSession**     | `chatSessionModel.ts`     | `userId`, `orgId`, `title`, `lastMessageAt`, `messageCount`                        |
| **ChatMessage**     | `chatMessageModel.ts`     | `sessionId`, `role` (user/assistant/system), `content`, `toolCalls[]`, `metadata`  |
| **AgentOutput**     | `agentOutputModel.ts`     | `userId`, `agentType`, `input`, `output`, `context`, `duration`, `tokensUsed`      |
| **AiResponseCache** | `aiResponseCacheModel.ts` | `cacheKey`, `response`, `expiresAt`                                                |
| **MemoryRecord**    | `memoryRecordModel.ts`    | `userId`, `orgId`, `content`, `embedding`, `source`, `relevanceScore`              |
| **ToolExecution**   | `toolExecutionModel.ts`   | `userId`, `toolName`, `input`, `output`, `status`, `executedAt`                    |
| **AutopilotRun**    | `autopilotRunModel.ts`    | `userId`, `orgId`, `plan`, `status` (pending/approved/running/completed), `result` |

---

### Tasks & Workflows

| Model           | File                  | Key Fields                                                                                                          |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Task**        | `taskModel.ts`        | `userId`, `orgId`, `title`, `description`, `category`, `status`, `priority`, `suggestedAction`, `impact`, `dueDate` |
| **Workflow**    | `workflowModel.ts`    | `orgId`, `name`, `description`, `trigger`, `steps[]`, `schedule`, `isActive`, `lastRunAt`                           |
| **WorkflowRun** | `workflowRunModel.ts` | `workflowId`, `orgId`, `status`, `stepResults[]`, `startedAt`, `completedAt`                                        |

---

### Content

| Model           | File                  | Key Fields                                                                                   |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| **BlogPost**    | `blogPostModel.ts`    | `title`, `slug`, `content`, `author`, `tags[]`, `category`, `readTime`, `publishedAt`        |
| **GrowthStory** | `growthStoryModel.ts` | `title`, `slug`, `content`, `protagonist`, `milestones[]`, `financialJourney`, `publishedAt` |
| **ShareLink**   | `shareLinkModel.ts`   | `userId`, `resourceType`, `resourceId`, `token`, `expiresAt`, `accessCount`                  |

---

### Receipts & Media

| Model       | File              | Key Fields                                                                                                           |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Receipt** | `receiptModel.ts` | `userId`, `orgId`, `imageFileId` (GridFS), `ocrText`, `extractedData` (vendor, amount, date, items), `transactionId` |

---

### Billing & Monetization

| Model                  | File                         | Key Fields                                                                      |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| **Subscription**       | `subscriptionModel.ts`       | `userId`, `orgId`, `plan`, `stripeSubscriptionId`, `status`, `currentPeriodEnd` |
| **BillingAccount**     | `billingAccountModel.ts`     | `orgId`, `stripeCustomerId`, `defaultPaymentMethod`                             |
| **UsageEvent**         | `usageEventModel.ts`         | `userId`, `orgId`, `eventType`, `quantity`, `metadata`, `timestamp`             |
| **UsageLedger**        | `usageLedgerModel.ts`        | `orgId`, `periodKey`, `feature`, `used`, `limit`                                |
| **CreditGrant**        | `creditGrantModel.ts`        | `orgId`, `amount`, `remaining`, `source`, `expiresAt`                           |
| **Entitlement**        | `entitlementModel.ts`        | `orgId`, `plan`, `features{}`, `limits{}`, `overrides{}`                        |
| **ReferralCode**       | `referralCodeModel.ts`       | `userId`, `code`, `redemptionCount`                                             |
| **ReferralRedemption** | `referralRedemptionModel.ts` | `codeId`, `redeemedBy`, `creditGrantId`, `redeemedAt`                           |

---

### Marketplace & Integrations

| Model                     | File                            | Key Fields                                                                    |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| **MarketplacePlugin**     | `marketplacePluginModel.ts`     | `key`, `name`, `description`, `author`, `version`, `category`, `configSchema` |
| **PluginInstall**         | `pluginInstallModel.ts`         | `orgId`, `pluginKey`, `config`, `installedBy`, `isActive`                     |
| **IntegrationConnection** | `integrationConnectionModel.ts` | `orgId`, `provider`, `credentials`, `status`, `lastSyncAt`                    |
| **IntegrationSyncRun**    | `integrationSyncRunModel.ts`    | `connectionId`, `status`, `recordsProcessed`, `errors[]`                      |

---

### Observability & Audit

| Model            | File                   | Key Fields                                                                                 |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| **AuditEvent**   | `auditEventModel.ts`   | `orgId`, `actorId`, `action`, `resource`, `resourceId`, `metadata`, `ip`                   |
| **AuditLog**     | `auditLogModel.ts`     | `userId`, `orgId`, `action`, `severity`, `metadata`, `ip`, `userAgent`, `ttl`              |
| **DomainEvent**  | `domainEventModel.ts`  | `orgId`, `type`, `payload`, `processedAt`                                                  |
| **Notification** | `notificationModel.ts` | `userId`, `title`, `body`, `type`, `isRead`, `link`                                        |
| **FeatureFlag**  | `featureFlagModel.ts`  | `key`, `orgId`, `enabled`, `variant`, `conditions`                                         |
| **ExportJob**    | `exportJobModel.ts`    | `userId`, `orgId`, `type` (csv/pdf), `status`, `fileId` (GridFS), `filters`, `completedAt` |

---

## Migration & Seeding Scripts

| Script                    | Command                        | Purpose                                             |
| ------------------------- | ------------------------------ | --------------------------------------------------- |
| `migrateTransactions.ts`  | `npm run migrate:transactions` | Add `orgId` and `accountId` to legacy transactions  |
| `migrateOrgIds.ts`        | `npm run migrate:orgids`       | Backfill `orgId` across all user-scoped collections |
| `seed.ts`                 | `npm run seed`                 | Core database seeding                               |
| `seedMockContent.ts`      | `npm run seed:content`         | Seed demo blogs, growth stories, and sample data    |
| `seedBlogs.ts`            | `npm run seed:blogs`           | Seed blog posts                                     |
| `seedGrowthStories.ts`    | `npm run seed:stories`         | Seed growth story content                           |
| `generateOpenApiPaths.ts` | `npm run openapi:generate`     | Generate OpenAPI path definitions from routes       |

---

_See also_: [API.md](./API.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)
