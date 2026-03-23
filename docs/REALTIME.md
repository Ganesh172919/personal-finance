# Realtime Events

Comprehensive guide to the realtime events system using Server-Sent Events (SSE) and domain event pub/sub.

## Overview

The realtime system enables instant updates across the application:
- **Server-Sent Events (SSE)** for client communication
- **Domain events** for decoupled system integration
- **Event-driven workflows** for automation
- **React Query invalidation** for UI updates

## Architecture

```
Domain Event Published → Database
         ↓
Domain Event Fanout (watches/polls DB)
         ↓
In-Memory Event Bus (pub/sub)
         ↓
SSE Stream to Clients (/api/v1/events/stream)
         ↓
useRealtimeEvents Hook → React Query Invalidation
```

## Domain Event Model

**Location:** `server/src/models/domainEventModel.ts`

**Schema:**
```typescript
interface IDomainEvent {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  eventType: string;              // e.g., "TransactionCreated"
  aggregateType: string;          // e.g., "transaction", "goal"
  aggregateId: string;            // ID of the changed resource
  actionLinkId?: string;          // Links related actions
  requestId?: string;             // Correlation ID
  payload: Record<string, unknown>; // Event-specific data
  processedAt?: Date;             // Workflow trigger timestamp
  createdAt: Date;
  updatedAt: Date;
}
```

## Publishing Events

**Location:** `server/src/services/domainEvents.ts`

### Basic Usage

```typescript
import { publishDomainEvent } from "../services/domainEvents";

await publishDomainEvent({
  orgId: orgId,
  userId: userId,
  eventType: "TransactionCreated",
  aggregateType: "transaction",
  aggregateId: transactionId.toString(),
  actionLinkId: "action-uuid",      // Optional
  requestId: req.requestId,         // Optional
  payload: {
    source: { origin: "receipt_ocr" },
    transaction_type: "expense",
    category: "Food",
    amount: -25.50,
  },
  session: mongoSession,            // Optional for transactions
});
```

### Publication Flow

1. Document saved to `DomainEvent` collection
2. If not in transaction:
   - Event published to in-memory event bus
   - Triggers workflow processing
3. Event fanout broadcasts to connected clients

## Available Event Types

| Event Type | Aggregate | When Triggered |
|-----------|-----------|----------------|
| **TransactionCreated** | transaction | Transaction created |
| **TransactionImported** | transaction | CSV/bank import |
| **TaskApplied** | task | Task effects applied |
| **GoalUpserted** | goal | Goal created/updated |
| **DebtUpserted** | debt | Debt created/updated |
| **BudgetAllocationsRecommendedApplied** | budget | Budget allocations |
| **MonthClosed** | profile | Month close |
| **NotificationSent** | notification | Notification sent |
| **WorkflowCreated** | workflow | Workflow created |
| **WorkflowDisabled** | workflow | Workflow disabled |
| **WorkflowRunCompleted** | workflow | Workflow completed |
| **ReceiptConfirmed** | receipt | Receipt confirmed |
| **ScenarioEvaluated** | scenario | Scenario evaluated |
| **AutopilotRunPlanned** | autopilot | Autopilot planned |
| **AutopilotRunSimulated** | autopilot | Autopilot simulated |
| **AutopilotRunExecuted** | autopilot | Autopilot executed |
| **InsightGenerated** | insight | AI insight generated |
| **IntegrationSynced** | integration | Bank sync |

## Server-Side SSE Endpoint

**Route:** `GET /api/v1/events/stream`

**Location:** `server/src/controllers/v1/eventsController.ts`

### Connection Setup

```typescript
// Client connects
GET /api/v1/events/stream
Authorization: Bearer <jwt-token>

// Server responds
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no

event: ready
data: {"ok":true,"request_id":"req-123"}

: keep-alive 1705319400000
```

### Reconnection & Event Replay

**Query Parameters:**
- `after`: Resume from event ID (MongoDB ObjectId)

**Headers:**
- `Last-Event-ID`: Resume from event ID

Server replays up to 1000 missed events from database.

### SSE Message Format

```
id: 507f1f77bcf86cd799439011
event: domain_event
data: {"id":"507f...","type":"TransactionCreated","aggregate_type":"transaction","aggregate_id":"507f...","payload":{...},"created_at":"2026-01-15T10:30:00.000Z"}

: keep-alive 1705319400000
```

## Event Bus (In-Memory Pub/Sub)

**Location:** `server/src/modules/realtime/eventBus.ts`

### Interface

```typescript
export type EventBusEvent = {
  kind: "domain_event";
  orgId: string;
  event: {
    id: string;
    type: string;
    aggregate_type: string;
    aggregate_id: string;
    payload: Record<string, unknown>;
    created_at: string | null;
  };
};

interface EventBus {
  publish: (event: EventBusEvent) => void;
  subscribe: (params: { 
    orgId: string; 
    onEvent: (event: EventBusEvent) => void 
  }) => EventBusSubscription;
}
```

### Usage

```typescript
const bus = getEventBus();

// Publish to all subscribers for this org
bus.publish({
  kind: "domain_event",
  orgId: "507f1f77bcf86cd799439011",
  event: { /* ... */ }
});

// Subscribe to org's events
const subscription = bus.subscribe({
  orgId: "507f1f77bcf86cd799439011",
  onEvent: (event) => {
    console.log("Event received:", event);
  }
});

// Unsubscribe
subscription.close();
```

### Features

- **Org Isolation**: Events only sent to matching orgId subscribers
- **Deduplication**: 10-minute TTL, max 2000 events per org
- **Error Safety**: Listener errors don't crash publisher

## Domain Event Fanout

**Location:** `server/src/modules/realtime/domainEventFanout.ts`

Watches database for new events and publishes to event bus.

### Operation Modes

**Change Stream** (MongoDB native):
- Real-time insert operations
- Requires MongoDB replica set
- Most efficient

**Polling** (fallback):
- Polls every 1000ms (configurable)
- Queries events with `_id > lastSeenId`
- Processes 250 events per tick max
- Works with any MongoDB setup

### Configuration

```bash
# .env
DOMAIN_EVENT_FANOUT_ENABLED=true
DOMAIN_EVENT_FANOUT_MODE=auto              # "auto", "poll", "change_stream"
DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS=1000
```

### Startup

```typescript
import { startDomainEventFanout } from "./modules/realtime/domainEventFanout";

// In server.ts
const fanoutController = startDomainEventFanout();

// On shutdown
fanoutController.stop();
```

## Client-Side Integration

**Location:** `client/src/hooks/useRealtimeEvents.ts`

### Setup

```typescript
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

export function App() {
  useRealtimeEvents(); // Call once in top-level component
  
  return <YourApp />;
}
```

### How It Works

1. Connects to SSE stream when user logs in
2. Listens for `domain_event` messages
3. Invalidates React Query keys to refetch data
4. Auto-reconnects after 5s if connection fails
5. Cleans up on logout

### Implementation Example

```typescript
export function useRealtimeEvents() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user) return;

    const connect = () => {
      const es = new EventSource("/api/v1/events/stream", {
        withCredentials: true,
      });

      esRef.current = es;

      es.addEventListener("domain_event", (e: MessageEvent) => {
        const evt = JSON.parse(e.data);
        
        // Invalidate relevant React Query keys
        const keys = buildInvalidationKeys(evt);
        keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      });

      es.onerror = () => {
        es.close();
        setTimeout(connect, 5000); // Reconnect after 5s
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [user, qc]);
}
```

## Event Invalidation Mapping

Maps event types to React Query keys for automatic refetching.

```typescript
// Event type → Query keys
const EVENT_INVALIDATION_MAP = {
  TransactionCreated: [
    ["/api/transactions"],
    ["/api/transactions/recent"],
    ["/api/transactions/summary"],
    ["/api/dashboard/summary"],
    ["/api/portfolio/summary"],
    ["/api/financial-profiles/me"],
    ["analytics"],
    ["activity-feed"],
  ],
  GoalUpdated: [
    ["/api/financial-profiles/me"],
    ["/api/dashboard/summary"],
    ["goals"],
    ["activity-feed"],
  ],
  // ... etc
};

// Aggregate type → Query keys (fallback)
const AGGREGATE_INVALIDATION_MAP = {
  transaction: [ /* same as TransactionCreated */ ],
  receipt: [ /* receipt-related */ ],
  task: [["tasks"], ["/api/tasks"]],
  workflow: [["workflow-runs"], ["v1/workflows"]],
};
```

## Workflow Integration

Events automatically trigger matching workflows.

**Location:** `server/src/services/domainEventTriggers.ts`

```typescript
export const processDomainEventById = async (domainEventId: string) => {
  const event = await DomainEventModel.findById(domainEventId);
  if (!event || event.processedAt) return;

  // Find workflows matching this event
  const workflows = await WorkflowModel.find({
    orgId: event.orgId,
    enabled: true,
    createdByUserId: event.userId,
    "trigger.type": "event",
    "trigger.event_type": event.eventType,
  });

  // Enqueue workflow runs
  for (const workflow of workflows) {
    await enqueueWorkflowRun({
      orgId: event.orgId,
      workflowId: workflow._id,
      triggeredByUserId: event.userId,
      idempotencyKey: `evt:${event._id}`.slice(0, 128),
    });
  }

  // Mark as processed
  await DomainEventModel.updateOne(
    { _id: event._id },
    { $set: { processedAt: new Date() } }
  );
};
```

## Best Practices

### Publishing Events

1. **Use descriptive event types**: `TransactionCreated` not `transaction_created`
2. **Include correlation IDs**: Use `requestId` for tracing
3. **Group related actions**: Use `actionLinkId` to link events
4. **Keep payloads small**: Only essential data
5. **Use transactions**: Pass `session` for atomic operations

### Event Types

```typescript
// Good: Specific and actionable
eventType: "TransactionCreated"
eventType: "GoalAchieved"
eventType: "BudgetExceeded"

// Bad: Generic or unclear
eventType: "update"
eventType: "change"
eventType: "transaction"
```

### Client-Side

1. **Call useRealtimeEvents once**: At app root only
2. **Let React Query handle refetching**: Don't manually fetch
3. **Trust the invalidation mapping**: Covers common cases
4. **Monitor connection**: Check browser DevTools → Network → EventStream

## Monitoring

### Server-Side

```typescript
// Check active SSE connections
const bus = getEventBus();
const stats = bus.getStats(); // Returns subscriber count per org

// Monitor event publication
logger.info("Event published", {
  eventType: event.eventType,
  orgId: event.orgId,
  aggregateId: event.aggregateId,
});
```

### Client-Side

```typescript
// Browser DevTools → Network → Filter: "stream"
// Shows SSE connection status and messages

// React Query DevTools
// Shows invalidated queries and refetch status
```

### Database

```typescript
// Check recent events
const recentEvents = await DomainEventModel
  .find({ orgId })
  .sort({ createdAt: -1 })
  .limit(100);

// Check unprocessed events
const unprocessed = await DomainEventModel
  .find({ processedAt: null })
  .sort({ createdAt: 1 });
```

## Troubleshooting

**SSE connection fails:**
- Check JWT authentication is valid
- Verify organization context is set
- Check CORS and proxy configuration

**Events not received in client:**
- Verify `useRealtimeEvents()` is called
- Check browser console for EventSource errors
- Verify domain event fanout is enabled

**Workflow not triggering:**
- Check workflow `enabled=true`
- Verify event type matches `trigger.event_type`
- Check `orgId` and `userId` match
- Look for `processedAt` timestamp in DomainEventModel

**High memory usage:**
- Event bus caches 2000 events per org (10min TTL)
- Ensure fanout is running to prevent event buildup
- Monitor database size for old domain events

## Related Documentation

- [Workflows](./WORKFLOWS.md) - Event-triggered workflows
- [Queue System](./QUEUE_SYSTEM.md) - Background job processing
- [API Documentation](./API.md) - SSE endpoint details
- [Services](./SERVICES.md) - Domain event services

## Examples

See [EXAMPLES.md](./EXAMPLES.md) for practical code examples including:
- Publishing custom events
- Creating event-triggered workflows
- Adding client invalidation mappings
- Testing SSE connections
