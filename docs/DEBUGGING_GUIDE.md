# FinWise Debugging Guide

> How to debug each tier of the FinWise application, interpret logs, and resolve common issues.

---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Overview

FinWise is a three-tier application (React client, Express server, Python AI Core). Each tier has its own logging, debugging tools, and common issues. This guide covers debugging strategies for each tier and cross-tier request tracing.

---

## Client (React)

### Browser DevTools

**Console Logging:**
- Development mode provides color-coded, timestamped logs
- Log levels: debug, info, warn, error
- Network requests are automatically logged with timing and status
- Set `VITE_LOG_LEVEL=warn` to reduce noise

**React DevTools:**
- Install [React DevTools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi)
- Component tree inspection
- Props and state inspection
- Profiler for performance analysis
- Highlight re-renders to identify unnecessary updates

**Network Tab:**
- Filter by `/api` to see all API requests
- Check `X-Request-Id` header for server-side log correlation
- Check `X-Org-Id` header for multi-tenancy context
- SSE connections appear as long-running requests to `/api/events/stream`
- Check `X-CSRF-Token` header on state-changing requests

**Performance Tab:**
- Use `startPerfMark(name)` and `endPerfMark(name)` from `@/lib/devLogger`
- Measures appear in the Performance tab timeline
- Identify slow renders and unnecessary re-renders

### React Query DevTools

React Query DevTools (if enabled) shows:
- All cached queries and their states
- Query staleness (fresh vs. stale)
- Active observers (components using each query)
- Cache invalidation events

### Zustand DevTools

Zustand stores can be inspected via Redux DevTools:
- Install Redux DevTools extension
- Each store appears as a separate slice
- Time-travel debugging for state changes

### Error Reporting

The error reporting service (`client/src/services/errorReporting.ts`) captures:
- Unhandled promise rejections
- Uncaught JavaScript errors
- Breadcrumb trail (last 30 user actions)

In development, errors are logged to the console with full context including breadcrumbs.

### Common Client Issues

| Issue | Debugging Steps |
|-------|----------------|
| Blank screen | Check console for React errors, verify AuthProvider is loading, check for missing providers |
| Stale data | Check SSE connection in Network tab, verify cache invalidation in React Query DevTools |
| CSRF errors | Check if CSRF token is being sent in `X-CSRF-Token` header, verify token freshness |
| Org context errors | Check `X-Org-Id` header, verify localStorage `finwise-org` value |
| 402 feature limit | Check `useAppDialogStore` state, verify plan entitlements |
| Infinite re-renders | Use React Profiler, check for missing dependency arrays in useEffect/useMemo |
| Route not loading | Check lazy import in routeDefinitions.tsx, verify component export |

---

## Server (Express)

### Structured Logging

All server logs are JSON-formatted via Pino for machine parsing:

```json
{
  "level": 30,
  "time": "2026-07-12T10:30:00.000Z",
  "requestId": "abc-123",
  "userId": "user_456",
  "orgId": "org_789",
  "msg": "GET /api/transactions completed",
  "responseTime": 45
}
```

### Log Levels

| Level | Value | When | Example |
|-------|-------|------|---------|
| `trace` | 10 | Extremely detailed | Raw DB queries |
| `debug` | 20 | Service entry/exit, DB queries | Transaction CRUD operations |
| `info` | 30 | Request/response, normal operations | API request completed |
| `warn` | 40 | Slow requests (>2s), 4xx errors | Rate limit approaching |
| `error` | 50 | 5xx errors, unhandled exceptions | Database connection failed |
| `fatal` | 60 | Application crash | Unrecoverable error |

### Request Correlation

Every request gets a `requestId` (from `X-Request-Id` header or auto-generated UUID). Use this to trace a request across logs:

```bash
# Search logs for a specific request
grep '"requestId":"abc-123"' logs/*.log

# Using jq for structured filtering
cat server.log | jq 'select(.requestId == "abc-123")'
```

### MongoDB Debugging

Enable Mongoose debug mode:
```bash
DEBUG=mongoose:* npm run dev
```

This logs all MongoDB operations including queries, updates, and aggregation pipelines.

### Redis Debugging

Check Redis connectivity:
```bash
redis-cli ping  # Should return PONG
redis-cli info  # Server information
```

### Common Server Issues

| Issue | Debugging Steps |
|-------|----------------|
| 500 errors | Check `error` level logs, look for stack trace, check MongoDB connection |
| Slow requests | Check for `warn` level "slow request" logs (>2s), profile MongoDB queries |
| Auth failures | Verify JWT cookie exists, check `X-CSRF-Token` header, verify token validity |
| DB connection | Check `MONGO_URI`, verify MongoDB is running, check connection pool |
| Rate limiting | Check rate limit headers (`X-RateLimit-Remaining`), verify Redis connectivity |
| CORS errors | Check `CORS_ORIGINS` in .env, verify client URL is included |

---

## AI Core (Python)

### Agent Tracing

Every LangGraph node execution is traced with:
- Agent name
- Start/end timestamps
- Status (success/error/retry)
- Error message (if failed)

Trace entries appear in the `workflow_trace` field of the API response and are streamed to the client via SSE for real-time visualization.

### LLM Call Logging

Each LLM call logs:
- Provider and model
- Token counts (input/output)
- Latency in milliseconds
- Cost estimation (USD)
- Fallback events (provider/model failover)
- Key rotation events

### Workflow Visualization

The client's `AgentWorkflowVisualizer` component renders workflow traces in real-time:
- Phase transitions: routing -> analyzing -> synthesizing -> complete
- Agent execution timeline with duration bars
- Error indicators for failed agents
- Retry indicators

### Python Logging Configuration

```bash
# Set log level
export LOG_LEVEL=DEBUG

# Enable request-id correlation
# Automatic via RequestIdFilter in utils/helpers.py
```

### Common AI Core Issues

| Issue | Debugging Steps |
|-------|----------------|
| LLM errors | Check API key validity, verify provider status, check circuit breaker state |
| Slow responses | Check LLM latency in logs, verify provider health, check for retries |
| Wrong routing | Check master agent keyword scoring, verify query text, check context enrichment |
| Number safety | Check if LLM introduced new numbers (look for "number safety" in logs) |
| Fallback mode | Check if any API keys are configured, verify provider health |
| Import errors | Verify Python path, check requirements.txt, ensure virtual environment is active |
| Session errors | Check SQLite file permissions, verify session manager initialization |

---

## Cross-Tier Debugging

### End-to-End Request Flow

```
Client -> Express Server -> AI Core -> LLM Provider
  |           |              |          |
Console    JSON Logs      Agent Logs  Provider Logs
  |           |              |          |
X-Request-Id correlation across all tiers
```

### Correlating Logs

1. Get `X-Request-Id` from client Network tab
2. Search server logs: `grep '"requestId":"<id>"' server.log`
3. Search AI Core logs: `grep '"request_id":"<id>"' ai_core.log`
4. Check `workflow_trace` in AI response for agent-level details

### Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /healthz` | Server liveness | `"ok"` |
| `GET /api/python-health` | AI Core connectivity | `{ "status": "healthy" }` |
| `GET /api/ai/status` | AI Core comprehensive diagnostics | Detailed status object |
| `GET /api/metrics` | Prometheus metrics (requires Bearer token) | Prometheus text format |

### SSE Connection Debugging

To debug SSE issues:

1. Open Network tab in browser DevTools
2. Filter by `EventStream` or search for `/api/events/stream`
3. Check connection status (should be `pending` while connected)
4. Inspect individual events in the response body
5. Check for reconnection attempts in console logs

---

## Environment-Specific Debugging

### Development

```bash
# Client: verbose logging enabled by default
# Server: set LOG_LEVEL=debug for maximum detail
export LOG_LEVEL=debug

# AI Core: set LOG_LEVEL=DEBUG
export LOG_LEVEL=DEBUG

# Enable React Query DevTools
# Already enabled in development mode

# Enable Mongoose debug
DEBUG=mongoose:* npm run dev
```

### Production

```bash
# Logs are JSON-formatted for log aggregation tools
# Use structured queries to filter:
# - By level: .level >= 50 (errors only)
# - By request: .requestId = "abc-123"
# - By user: .userId = "user_456"
# - By org: .orgId = "org_789"
```

---

## Performance Profiling

### Client

```typescript
import { startPerfMark, endPerfMark } from "@/lib/devLogger";

startPerfMark("loadDashboard");
// ... async operation
endPerfMark("loadDashboard"); // Logs: loadDashboard: 245ms
```

### Server

Prometheus metrics at `/api/metrics`:
- `http_request_duration_ms` -- Request latency histogram
- `finwise_ai_core_request_duration_ms` -- AI Core request latency
- `finwise_cache_hit_total` / `finwise_cache_miss_total` -- Cache efficiency
- `finwise_db_query_duration_ms` -- MongoDB query latency

### AI Core

- Workflow trace entries include per-agent timing
- LLM call logging includes token counts and latency
- Use `/api/ai/status` for real-time diagnostics
- Check `workflow_trace` in response for detailed timing

---

## Debugging Tools Reference

| Tool | Tier | Purpose |
|------|------|---------|
| Chrome DevTools | Client | Network, console, performance profiling |
| React DevTools | Client | Component tree, props, state, profiler |
| React Query DevTools | Client | Query cache, staleness, invalidation |
| Redux DevTools | Client | Zustand store state inspection |
| Pino | Server | Structured JSON logging |
| MongoDB Compass | Server | Database GUI for query debugging |
| Redis CLI | Server | Cache and queue inspection |
| Prometheus | Server | Metrics collection and alerting |
| pytest | AI Core | Agent unit and integration tests |
| LangSmith | AI Core | LLM call tracing (if configured) |

---

## Quick Debug Checklist

When something goes wrong, work through this checklist:

1. **Check the browser console** for client-side errors
2. **Check the Network tab** for failed API requests (status codes, timing)
3. **Check server logs** for error-level entries with the matching requestId
4. **Check AI Core logs** if the issue involves AI features
5. **Verify environment variables** are correctly set in all tiers
6. **Check service health** via health check endpoints
7. **Verify database connectivity** (MongoDB, Redis)
8. **Check for recent changes** that might have introduced the issue

---

_See also_: [CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md) | [AI_AGENTS_REFERENCE.md](./AI_AGENTS_REFERENCE.md) | [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) | [OBSERVABILITY.md](./OBSERVABILITY.md)

## Full-Stack Debugging & Diagnostics Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#dc2626', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#b91c1c', 'lineColor': '#8b5cf6', 'secondaryColor': '#f59e0b', 'tertiaryColor': '#10b981'}}}%%
mindmap
  root((🔍 FinWise Debugging Matrix))
    📱 Client Tier (React 18)
      Browser DevTools Console & Network Inspection
      DevLogger & RuntimeLogger tracing
      React Query DevTools (Stale time, Query Keys)
      Zustand getState() evaluation in console
    🛡️ Server Gateway (Node.js)
      X-Request-Id UUIDv4 Trace Correlation
      Pino JSON Structured Stack Logging
      Zod Formatted Schema Validation Errors
      authAny token expiry & OrgScopePlugin warnings
    🧠 AI Core Engine (FastAPI)
      LangGraph StateGraph Workflow Trace
      KeyPool Cooldown & Provider Error Logs
      SQLite Checkpoint & Session Memory Inspection
      Prometheus /metrics & /health probes
    🗄️ Persistence & Workers
      mongosh db.currentOp() & explain("executionStats")
      redis-cli monitor & memory usage
      BullMQ Failed Jobs & Dead Letter Queue (DLQ)
```

## Evidence-First Diagnostic Triage ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🔴 ERROR DETECTED: 500 Internal Server Error / Failed Mutation         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🔍 STEP 1: CAPTURE REQUEST CORRELATION METADATA                        │
│    ├─► Extract X-Request-Id from Browser DevTools Response Header      │
│    ├─► Note Endpoint: POST /api/v1/transactions/review-queue           │
│    └─► Note User Context: { userId, orgId, activeTenant }              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📜 STEP 2: CORRELATE SERVER & AI ENGINE LOGS                           │
│    ├─► Grep Node Gateway Log: grep "req_a7b8" server.log               │
│    │   ├── Zod Validation Fail? ──► Fix payload contract in schema     │
│    │   └── 500 AI Error? ──► Forward Correlation ID to AI Core log     │
│    └─► Grep AI Core Log: grep "req_a7b8" ai_core.log                   │
│        └── KeyPool Cooldown Trip? ──► Trigger Provider Failover        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧪 STEP 3: ISOLATED REPRODUCTION & REGRESSION TEST                     │
│    ├─► Reproduce via targeted Vitest / Pytest integration test         │
│    ├─► Apply bugfix in service or model schema                         │
│    └─► Run $ npm test && pytest to guarantee 0 regressions 🟢          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Debugging 2026 Enterprise Subsystems

### 6.1 Debugging BullMQ Dead Letter Queue (`bull:finwise-dlq`)

When background newsletter or chunking jobs fail repeatedly:

```bash
# 1. Connect to Redis CLI
redis-cli

# 2. Inspect DLQ queue length
LLEN bull:finwise-dlq:failed
LLEN bull:finwise-dlq:wait

# 3. View the latest failed job payload and scrubbed error
LRANGE bull:finwise-dlq:failed 0 0

# 4. Trigger replay via Express API
curl -X POST http://localhost:3000/api/v1/dlq/replay/<JOB_ID> \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

### 6.2 Debugging Kahn's Topological DAG Scheduler

If the multi-agent AI execution hangs or returns incomplete plans:

1. **Cycle Detection Check**: In `server/AI_Core/agents/sub_agent_manager.py`, if `len(results) != len(tasks)` when execution finishes, a cyclic dependency exists in `task_decomposer` output.
2. **Inspect Task In-Degrees**:
   ```python
   # Add temporary debug log in sub_agent_manager.py:
   logger.debug(f"[KahnDAG] In-degrees: {in_degree}")
   logger.debug(f"[KahnDAG] Active in-flight tasks: {list(in_flight.values())}")
   ```
3. **Reproduce via Unit Test**:
   ```bash
   cd server/AI_Core
   pytest tests/test_sub_agent_manager.py -vv -s
   ```

---

### 6.3 Debugging RAG BM25 Retrieval & Page Numbers

If retrieved evidence chunks are missing or physical page numbers are `null`:

1. **Check Form-Feed ASCII (`\f`) in Extracted Text**:
   ```bash
   mongosh personal-finance --eval "
     db.workspace_knowledge_chunks.findOne({ workspaceFileId: ObjectId('<FILE_ID>') }, { pageNumber: 1, charStart: 1, text: 1 })
   "
   ```
2. **Verify Text Search Indexes**:
   ```bash
   mongosh personal-finance --eval "db.workspace_knowledge_chunks.getIndexes()"
   # Confirm existence of: { text: 'text' }
   ```
3. **Test Retrieval Directly**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/retrieval/query \
     -H "Authorization: Bearer <USER_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"query": "quarterly revenue", "limit": 3}'
   ```

---

### 6.4 Debugging GridFS PDF Vector Streams

If PDF downloads are blank or terminate unexpectedly:

1. **Verify GridFS Stream Piping**: Ensure `doc.pipe(uploadStream)` is called *before* `doc.text()` or any writing commands.
2. **Check Chunk Continuity**:
   ```bash
   mongosh personal-finance --eval "
     const file = db['rendered_reports.files'].findOne({ _id: ObjectId('<FILE_ID>') });
     const chunkCount = db['rendered_reports.chunks'].countDocuments({ files_id: file._id });
     print('Expected chunks: ' + Math.ceil(file.length / file.chunkSize) + ' | Actual: ' + chunkCount);
   "
   ```
