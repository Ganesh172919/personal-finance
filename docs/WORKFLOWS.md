# Workflows

Comprehensive guide to the automated workflow system in Personal Finance.

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
3. `tickCronWorkflows()` queries due workflows (enabled=true, nextRunAt≤now)
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
