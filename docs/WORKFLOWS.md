# FinWise — Workflows

Comprehensive guide to the automated workflow system in FinWise.

## Overview

The workflow system enables automated financial management tasks including:
- **Scheduled tasks** via cron expressions
- **Event-driven automation** responding to domain events
- **Manual workflows** triggered on-demand
- **Multi-action sequences** with tasks, notifications, and exports

## Data Models

### Workflow Model

Defines the structure and configuration for workflow definitions.

**Key Fields:**
- `orgId`: Organization owner (required, indexed)
- `createdByUserId`: Creator (required)
- `name`: Workflow name (max 160 chars)
- `enabled`: Whether workflow is active (default: true)
- `trigger`: Trigger configuration (see Trigger Types)
- `scheduleTimezone`: Timezone for cron (IANA format)
- `nextRunAt`: Next scheduled execution (indexed)
- `lastRunAt`: Last execution timestamp
- `lastError`: Last error message (max 800 chars)
- `actions`: Array of actions (1-50 max)

### Workflow Run Model

Tracks individual workflow execution instances.

**Key Fields:**
- `workflowId`: Parent workflow reference
- `status`: `queued`, `running`, `succeeded`, or `failed`
- `idempotencyKey`: Deduplication key (unique per workflow)
- `requestId`: Correlation ID from trigger
- `startedAt` / `finishedAt`: Execution timing
- `result`: Execution results (tasks, exports, notifications)
- `error`: Failure reason (max 2000 chars)

## Trigger Types

### Manual Trigger

```typescript
{
  type: "manual"
}
```

Triggered explicitly via API endpoint. No automatic scheduling.

### Cron Trigger (Scheduled)

```typescript
{
  type: "cron",
  cron: "0 9 * * 1"  // Monday at 9 AM (POSIX format)
}
```

**Features:**
- Uses cron-parser library for validation
- Respects `scheduleTimezone` (defaults to org timezone or UTC)
- `nextRunAt` computed automatically
- Background scheduler runs every 15 seconds
- Scheduler backfills missing `nextRunAt`/`scheduleTimezone`

### Event Trigger (Domain Events)

```typescript
{
  type: "event",
  event_type: "TransactionCreated"
}
```

**Features:**
- Triggered by domain events (e.g., `TransactionCreated`, `WorkflowDisabled`)
- Matches workflows by `(orgId, userId, eventType)`
- Runs immediately via domain event processor or async worker

## Action Types

### Create Task Action

```typescript
{
  type: "create_task",
  bucket: 7 | 30 | 365,              // Task timeframe (days)
  title: string,                     // Max 160 chars
  why: string,                       // Max 800 chars
  steps: string[],                   // 0-20 steps, max 200 chars each
  priority: "low" | "medium" | "high",
  expected_impact: string,           // Max 1200 chars
  kind: "cashflow" | "budget" | "debt" | "invest" | "goal" | "education" | "generic",
  due_days?: number                  // Optional, 1-3650 days
}
```

**Behavior:**
- Creates or upserts tasks with idempotent IDs (SHA256 hash)
- Prevents duplicate task creation across workflow runs
- Tasks stored with status "open"

### Send Notification Action

```typescript
{
  type: "send_notification",
  channel: "email" | "in_app",
  subject: string,                   // Max 160 chars
  message: string                    // Max 2000 chars
}
```

**Behavior:**
- **Email**: Uses sendEmail utility, requires verified user email
- **In-app**: Creates NotificationModel entry with workflow metadata

### Export Report Action

```typescript
{
  type: "export_report",
  export_type: "transactions_csv" | "monthly_summary_pdf",
  params?: {
    period_key?: "YYYY-MM"           // Required for monthly_summary_pdf
  }
}
```

**Behavior:**
- Creates ExportJobModel with status "queued"
- Uses idempotency key to prevent duplicates
- Async processing if `ASYNC_JOBS_ENABLED=true`, otherwise inline
- Enforces "export_access" feature entitlement

## API Endpoints

All endpoints require JWT authentication and organization context.

### List Workflows

```http
GET /api/v1/workflows
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Weekly budget review",
      "enabled": true,
      "trigger": { "type": "cron", "cron": "0 9 * * 1" },
      "actions": [...],
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### Get Workflow Templates

```http
GET /api/v1/workflows/templates
```

Returns templates from installed plugins.

### Create Workflow

```http
POST /api/v1/workflows
Content-Type: application/json

{
  "name": "Weekly sync",
  "enabled": true,
  "trigger": { "type": "cron", "cron": "0 9 * * 1" },
  "actions": [
    {
      "type": "create_task",
      "bucket": 7,
      "title": "Run bank sync",
      "why": "Keep data fresh",
      "priority": "medium",
      "expected_impact": "Improves insights",
      "kind": "cashflow"
    }
  ]
}
```

**Requirements:**
- Requires **admin role** in organization
- Cron expressions validated and `nextRunAt` computed
- Actions validated against schema

### Run Workflow

```http
POST /api/v1/workflows/{id}/run
Content-Type: application/json

{
  "idempotency_key": "user-run-12345"  // Optional
}
```

**Requirements:**
- Requires **admin role**
- Enforces "workflow_runs" feature entitlement (1 unit per run)
- If idempotency key exists and run completed, returns existing result

**Response:**
```json
{
  "queued": false,
  "run": {
    "id": "607f1f77bcf86cd799439012",
    "status": "succeeded",
    "started_at": "2026-01-01T00:00:00Z",
    "finished_at": "2026-01-01T00:00:05Z",
    "result": {
      "tasks_created": ["task-id-1"],
      "exports_created": ["export-id-1"],
      "notifications_sent": [...]
    }
  }
}
```

## Execution Flow

### Manual Trigger Flow

1. Client calls `POST /workflows/{id}/run`
2. `enqueueWorkflowRun()` creates WorkflowRunModel with status="queued"
3. If `ASYNC_JOBS_ENABLED=false`: `processWorkflowRun()` executes inline
4. If `ASYNC_JOBS_ENABLED=true`: Worker picks up via database polling
5. Actions executed in sequence
6. WorkflowRunModel updated with result/error

### Cron Trigger Flow

1. `startWorkflowScheduler()` runs every 15s
2. `backfillCronWorkflowScheduleFields()` fills missing `nextRunAt`
3. `tickCronWorkflows()` queries due workflows (enabled=true, nextRunAtâ‰¤now)
4. For each due workflow:
   - Computes next run time
   - Calls `enqueueWorkflowRun()` with idempotency key
   - Updates `lastRunAt` and `nextRunAt`
5. Handles quota exceeded (402) by recording error
6. Updates or clears `lastError`

### Event Trigger Flow

1. Application publishes domain event via `publishDomainEvent()`
2. DomainEventModel stored with `processedAt=null`
3. `processDomainEventById()` called asynchronously
4. Query workflows matching `trigger.event_type`
5. For each match, call `enqueueWorkflowRun()`
6. Mark DomainEventModel.processedAt

## Workflow Templates

Templates are plugin-based and provide pre-configured workflows.

### Available Templates

#### Weekly Bank Sync
- **Key**: `bank_stub.weekly-sync-checkin`
- **Trigger**: Cron `0 9 * * 1` (Monday 9 AM)
- **Actions**: Create 7-day task "Run bank sync + review spending"

#### New Transaction Review
- **Key**: `bank_stub.new-transaction-review`
- **Trigger**: Event `TransactionCreated`
- **Actions**: Create 7-day task "Review your latest transaction"

**Fetch Templates:**
```http
GET /api/v1/workflows/templates
```

## Queue System Integration

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ASYNC_JOBS_ENABLED` | `false` | Enable async queue processing |
| `WORKER_CONCURRENCY` | `4` | Max concurrent jobs (1-64) |
| `WORKER_POLL_INTERVAL_MS` | `1000` | Database poll interval |
| `REDIS_URL` | - | Optional Redis for BullMQ |

### Processing Modes

**Synchronous** (`ASYNC_JOBS_ENABLED=false`):
- Actions executed inline during API request
- Response includes execution result
- Simple but may block for long operations

**Asynchronous** (`ASYNC_JOBS_ENABLED=true`):
- WorkflowRun created with status="queued"
- Worker polls database every `WORKER_POLL_INTERVAL_MS`
- Concurrent execution limited by `WORKER_CONCURRENCY`
- Uses BullMQ if `REDIS_URL` configured

## Best Practices

### Creating Workflows

1. **Use descriptive names**: "Weekly budget review" vs "Workflow 1"
2. **Set appropriate timezones**: Use user's timezone for cron triggers
3. **Limit action count**: Keep under 10 actions for better performance
4. **Test manually first**: Use manual trigger before enabling cron

### Cron Expressions

- Use [crontab.guru](https://crontab.guru/) to validate expressions
- Common patterns:
  - Daily at 9 AM: `0 9 * * *`
  - Weekly on Monday: `0 9 * * 1`
  - Monthly on 1st: `0 9 1 * *`

### Idempotency

- Always use `idempotency_key` for manual runs
- Actions are idempotent by default (tasks use SHA256 hash)
- Export jobs deduplicate by idempotency key

### Error Handling

- Check `lastError` field for workflow-level failures
- WorkflowRun status shows per-execution status
- Quota exceeded errors (402) recorded but don't block other workflows

## Monitoring

### Workflow Health

```typescript
// Check workflow status
const workflow = await Workflow.findById(workflowId);
console.log({
  enabled: workflow.enabled,
  lastRunAt: workflow.lastRunAt,
  nextRunAt: workflow.nextRunAt,
  lastError: workflow.lastError
});

// Check recent runs
const runs = await WorkflowRun.find({ workflowId })
  .sort({ createdAt: -1 })
  .limit(10);
```

### Metrics

- Monitor `workflowRuns` feature usage via `UsageLedgerModel`
- Track execution success rate via WorkflowRun.status
- Check scheduler health via workflow `lastRunAt` vs `nextRunAt`

## Related Documentation

- [Queue System](./QUEUE_SYSTEM.md) - Background job processing
- [Realtime Events](./REALTIME.md) - Domain event system
- [API Documentation](./API.md) - Complete API reference
- [Plugin System](./PLUGIN_SYSTEM.md) - Creating workflow templates

## Examples

See [EXAMPLES.md](./EXAMPLES.md) for practical code examples including:
- Creating a custom workflow
- Implementing a new action type
- Creating workflow templates in plugins

## Workflow Orchestration Architecture Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#8b5cf6', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#7c3aed', 'lineColor': '#06b6d4', 'secondaryColor': '#10b981', 'tertiaryColor': '#f59e0b'}}}%%
mindmap
  root((🔄 FinWise Workflow Engine))
    ⚡ Triggers
      Event-Driven (transaction.created, budget.threshold)
      Scheduled Cron (daily digest, weekly rebalance)
      Webhook & API Ingress (/api/v1/workflows/:id/run)
      Manual User Action (Command Center)
    📋 Execution Graph
      DAG Step Dependencies
      Condition Evaluators (JSONSchema filter)
      Context Hydration & Variable Injection
    🎯 Actions & Side-Effects
      Financial Rules (Auto-Categorize, Rebalance)
      AI Analysis (Generate Copilot Recommendation)
      Notification Delivery (Email, In-App, Push)
      Export Generation (PDF Statement, CSV)
    🛡️ Reliability & Tracking
      WorkflowRun Execution History
      Idempotency Key Verification
      Dead Letter Queue (DLQ) with Exponential Retry
      Metering via UsageLedgerModel
```

## Workflow Execution Pipeline & State Transition ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 WORKFLOW TRIGGER INITIATION                                         │
│    Trigger: Event (transaction.created) OR Scheduled Cron (0 8 * * 1)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🛡️ STAGE 1: QUOTA & TENANT VALIDATION                                  │
│    ├─► Verify tenant has remaining workflow execution quota            │
│    ├─► Load Workflow definition filtered by orgId                      │
│    └─► Check if Workflow is active (enabled: true)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📝 STAGE 2: WORKFLOW RUN RECORD CREATION                               │
│    ├─► Insert WorkflowRun { workflowId, orgId, status: "pending" }     │
│    ├─► Compile Step DAG into sequential execution steps                │
│    └─► Enqueue job into BullMQ workflow worker queue                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ ⚙️ STAGE 3: WORKER STEP EXECUTION & CONDITION EVALUATION               │
│    ├─► Step 1: Evaluate condition (e.g., amount > 500)                 │
│    │   ├── False? ──► Skip to next step ⏩                             │
│    │   └── True? ──► Execute Action: AI Categorize & Flag Risk         │
│    ├─► Step 2: Invoke Notification Service (Email alert to owner)      │
│    └── Failure? ──► Retry with backoff; escalate to DLQ if max retries │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🟣 STAGE 4: RUN COMPLETION & TELEMETRY                                 │
│    ├─► Update WorkflowRun status: "completed" with output artifacts    │
│    ├─► Increment usage ledger event counter                            │
│    └─► Emit realtime domain event for UI progress bar update 🟢        │
└────────────────────────────────────────────────────────────────────────┘
```


---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Production Implementation Blueprints

### 1. Workflow Execution Engine (`server/src/services/workflows.ts`)

```typescript
// Core workflow step execution with condition evaluation and action dispatch
export async function executeWorkflow(workflowId: string, orgId: string, triggerContext: Record<string, unknown>) {
  const workflow = await WorkflowModel.findOne({ _id: workflowId, orgId, enabled: true });
  if (!workflow) throw new Error("Workflow not found or disabled");

  const run = await WorkflowRunModel.create({
    workflowId: workflow._id,
    orgId,
    status: "running",
    startedAt: new Date(),
    idempotencyKey: `${workflowId}-${Date.now()}`
  });

  try {
    for (const action of workflow.actions) {
      if (action.type === "ai_evaluate") {
        await invokeAiCoreProcess({ prompt: action.prompt, orgId });
      } else if (action.type === "notification") {
        await sendEmail({ to: action.recipient, subject: action.subject, body: action.body });
      }
    }
    run.status = "succeeded";
    run.finishedAt = new Date();
    await run.save();
  } catch (err: any) {
    run.status = "failed";
    run.error = err.message;
    run.finishedAt = new Date();
    await run.save();
    throw err;
  }
}
```

### 2. Timezone-Aware Scheduled Cron Scheduler (`server/src/services/workflowScheduler.ts`)

```typescript
// Cron polling loop evaluating active scheduled workflows every 60 seconds
export async function pollScheduledWorkflows() {
  const now = new Date();
  const dueWorkflows = await WorkflowModel.find({
    enabled: true,
    "trigger.type": "cron",
    nextRunAt: { $lte: now }
  });

  for (const workflow of dueWorkflows) {
    await workflowQueue.add("run-workflow", {
      workflowId: workflow._id.toString(),
      orgId: workflow.orgId
    }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });

    // Compute next execution timestamp
    workflow.lastRunAt = now;
    workflow.nextRunAt = computeNextCronDate(workflow.trigger.cronExpression, workflow.scheduleTimezone);
    await workflow.save();
  }
}
```
