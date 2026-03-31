# Performance

FinWise is engineered for responsiveness, efficiency, and graceful degradation under load. This document details every layer of the performance stack — from database indexes to service worker caching — with concrete configuration values, architectural diagrams, and operational guidance.

---

## Table of Contents

1. [Performance Overview](#1-performance-overview)
2. [Caching Strategy](#2-caching-strategy)
3. [Database Optimization](#3-database-optimization)
4. [Frontend Performance](#4-frontend-performance)
5. [Background Processing](#5-background-processing)
6. [Real-Time Communication](#6-real-time-communication)
7. [API Performance](#7-api-performance)
8. [AI Performance](#8-ai-performance)
9. [Scalability Considerations](#9-scalability-considerations)
10. [Monitoring & Metrics](#10-monitoring--metrics)
11. [Performance Benchmarks](#11-performance-benchmarks)
12. [Optimization Checklist](#12-optimization-checklist)

---

## 1. Performance Overview

### Philosophy

FinWise follows a **deterministic-first, cache-everything, stream-when-possible** philosophy:

| Principle | Rationale |
|---|---|
| **Deterministic-first** | Financial calculations use pure functions; LLMs are reserved for narrative and classification only, avoiding unnecessary latency and cost |
| **Cache at every layer** | Four independent caching tiers ensure repeated requests never hit the same backend path twice |
| **Stream incrementally** | AI responses and real-time updates are streamed via SSE, delivering perceived instantaneity even for long-running operations |
| **Graceful degradation** | Every subsystem has a fallback path (BullMQ → p-queue, ChangeStream → polling, strict DB → in-memory) |
| **Measure before optimizing** | Prometheus metrics and OpenTelemetry traces provide objective baselines for every optimization decision |

### Key Performance Indicators

| Metric | Target | Measurement |
|---|---|---|
| **Time to First Byte (TTFB)** | < 200 ms (cached), < 800 ms (cold) | Pino request duration |
| **Time to Interactive (TTI)** | < 2.5 s on 4G | Lighthouse / Web Vitals |
| **Largest Contentful Paint (LCP)** | < 2.5 s | Lighthouse / Web Vitals |
| **Cumulative Layout Shift (CLS)** | < 0.1 | Lighthouse / Web Vitals |
| **First Input Delay (FID)** | < 100 ms | Lighthouse / Web Vitals |
| **AI response latency (streaming)** | < 500 ms to first token | Server-side timing |
| **AI response latency (full)** | < 8 s for comprehensive analysis | Server-side timing |
| **Dashboard load** | < 1 s (cached), < 3 s (cold) | Client-side React Query |
| **Transaction list render** | < 200 ms for 1 000 rows (virtual) | Client-side profiling |
| **Worker job throughput** | 5 concurrent jobs, < 30 s per job | Worker logs |

### Monitoring Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                     Observability Stack                         │
├─────────────────┬──────────────────┬────────────────────────────┤
│     Metrics     │      Traces      │          Logs              │
├─────────────────┼──────────────────┼────────────────────────────┤
│  Prometheus     │  OpenTelemetry   │  Pino (async, structured)  │
│  /api/metrics   │  W3C Trace       │  Request-scoped context    │
│  Histograms     │  Context Prop.   │  JSON output               │
│  Gauges         │  Span nesting    │  Log levels: info/warn/err │
│  Counters       │  Cross-service   │  Redacted PII              │
└─────────────────┴──────────────────┴────────────────────────────┘
```

All three signals share a common `requestId` for correlation across tiers.

---

## 2. Caching Strategy

FinWise employs a **four-layer caching architecture** that covers server-side, client-side, and edge-level caching. Each layer has a distinct responsibility and TTL, ensuring that data is fresh without redundant computation.

### Layer Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1: PWA Service Worker (Workbox)                               │
│  ─────────────────────────────────────────                           │
│  Scope: Browser                                                      │
│  Strategies:                                                         │
│    - API routes: NetworkFirst (5 min TTL, 50 entries)                │
│    - Images:     CacheFirst  (30 day TTL, 100 entries)               │
│    - Static:     CacheFirst  (versioned hashes)                      │
│  Hit → Serve from Cache Storage API (instant)                        │
│  Miss → Forward to network                                           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2: React Query Client-Side Cache                              │
│  ─────────────────────────────────────────                           │
│  Scope: In-memory (per tab)                                          │
│  Default staleTime: 30 s                                             │
│  Default gcTime: 5 min (Garbage Collection)                          │
│  Retry: 2 attempts for 5xx errors                                    │
│  Hit → Serve from memory (no network)                                │
│  Stale → Background refetch, serve cached immediately                │
│  Miss → Fetch from server                                            │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3: Redis Response Cache (responseCache service)               │
│  ─────────────────────────────────────────                           │
│  Scope: Server-side (shared across API instances)                    │
│  TTLs by endpoint:                                                   │
│    - transactionsSummary: 15 min                                     │
│    - dashboardSummary:   2 min                                       │
│    - portfolioSummary:   5 min                                       │
│  Cache keys: SHA-256 of orgId + userId + params + updatedAt hashes   │
│  Hit → Return cached JSON (skips DB + aggregation)                   │
│  Miss → Compute, store, return                                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 4: AI Response Cache (AiResponseCacheModel)                   │
│  ─────────────────────────────────────────                           │
│  Scope: MongoDB (persistent, survives restarts)                      │
│  TTL: expiresAt field with MongoDB TTL index (auto-cleanup)          │
│  Schema: { orgId, userId, cacheKey, endpoint, responseData, expiresAt }│
│  Indexes:                                                            │
│    - { cacheKey: 1 } unique                                          │
│    - { expiresAt: 1 } TTL (expireAfterSeconds: 0)                    │
│    - { orgId: 1, userId: 1, createdAt: -1 } compound                 │
│  Hit → Return cached AI response (avoids LLM call)                   │
│  Miss → Call AI Core, cache result, return                           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MONGODB (source of truth)                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### Layer 1: PWA Service Worker Caching (Workbox)

Configured in `client/vite.config.ts` via `vite-plugin-pwa`:

| Pattern | Strategy | Cache Name | Max Entries | Max Age |
|---|---|---|---|---|
| `/api/v1/*` | NetworkFirst | `api-cache` | 50 | 300 s (5 min) |
| `*.(png\|jpg\|jpeg\|svg\|gif\|webp)` | CacheFirst | `image-cache` | 100 | 2 592 000 s (30 days) |
| `*.(js\|css\|html\|ico\|png\|svg\|woff2)` | CacheFirst (build-time) | — | — | Versioned |

```typescript
// Workbox runtime caching configuration
{
  runtimeCaching: [
    {
      urlPattern: /^\/api\/v1\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "image-cache",
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
}
```

**NetworkFirst** for API endpoints ensures the user always gets fresh data when online, with cached fallback during connectivity issues. The 10-second network timeout prevents hanging on slow connections.

**CacheFirst** for images is appropriate because static assets (receipt thumbnails, avatars, icons) rarely change. The 30-day TTL with 100-entry cap prevents unbounded cache growth.

**Service worker update strategy:** `registerType: "autoUpdate"` — new service workers activate immediately when available, ensuring users always run the latest code.

### Layer 2: React Query Client-Side Caching

Configured in `client/src/lib/queryClient.ts`:

| Setting | Value | Rationale |
|---|---|---|
| `staleTime` | 30 000 ms (30 s) | Data is considered fresh for 30 s; subsequent reads during this window don't trigger refetches |
| `refetchInterval` | `false` | No automatic polling; refetches are triggered by mutations or window focus |
| `refetchOnWindowFocus` | `false` | Prevents unnecessary refetches when the user switches tabs |
| Query `retry` | 2 attempts for 5xx errors | Transient server errors are retried; 4xx errors fail immediately |
| Mutation `retry` | 1 attempt for 5xx errors | Mutations retry once to handle transient failures without double-submitting |

**Cache invalidation strategy:** Mutations explicitly invalidate related query keys via `queryClient.invalidateQueries()`. SSE events from the server also trigger invalidation when relevant domain events arrive (e.g., `transaction.created` invalidates the transactions list).

**Per-query overrides:** Individual queries can override defaults:

```typescript
// Example: dashboard data with shorter stale time
useQuery({
  queryKey: ['dashboard', orgId, monthKey],
  queryFn: () => fetchDashboard(orgId, monthKey),
  staleTime: 60_000, // 1 min — dashboard data changes frequently
});
```

### Layer 3: Redis Response Cache (`responseCache` service)

Located at `server/src/services/responseCache.ts`. This layer sits between the Express controller and the database, caching expensive aggregation results.

**Cache key construction:** SHA-256 hash of all relevant parameters:

```typescript
// Dashboard summary cache key
sha256(
  `dashboard-summary|${orgId}|${userId}|${monthKey}|${profileUpdatedAt}|${txUpdatedAt}|${tasksUpdatedAt}`
)
```

Including `updatedAt` timestamps in the cache key ensures automatic invalidation when underlying data changes — no manual cache busting required.

**TTL configuration by endpoint:**

| Endpoint | TTL | Rationale |
|---|---|---|
| `transactionsSummary` | 15 min | Transaction aggregates change slowly; 15 min balances freshness with DB load |
| `dashboardSummary` | 2 min | Dashboard is the most-visited page; 2 min keeps data reasonably fresh |
| `portfolioSummary` | 5 min | Investment data changes infrequently; 5 min is safe |

**Storage:** Uses `AiResponseCacheModel` (MongoDB) as the backing store with `findOneAndUpdate` upsert for atomic writes.

### Layer 4: AI Response Cache (`AiResponseCacheModel`)

Located at `server/src/models/aiResponseCacheModel.ts`. This is the most expensive layer to miss, as it avoids full LLM invocations.

**Schema:**

| Field | Type | Index |
|---|---|---|
| `orgId` | ObjectId | Single-field index |
| `userId` | ObjectId | Single-field index |
| `cacheKey` | String | **Unique** index |
| `endpoint` | String | — |
| `responseData` | Mixed | — |
| `expiresAt` | Date | **TTL** index (`expireAfterSeconds: 0`) |
| `createdAt` | Date (auto) | Part of compound index |

**TTL cleanup:** MongoDB's built-in TTL index automatically deletes expired documents. The `expireAfterSeconds: 0` setting means documents are removed as soon as `expiresAt` is in the past. MongoDB's TTL monitor runs every 60 seconds.

**Compound index** `{ orgId: 1, userId: 1, createdAt: -1 }` supports efficient lookups of all cached responses for a given user, sorted by recency.

---

## 3. Database Optimization

### Indexing Strategy

FinWise uses four index types across its 49 Mongoose models:

#### Single-Field Indexes

Applied to frequently queried foreign keys and lookup fields:

```typescript
// aiResponseCacheModel.ts
orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
```

#### Compound Indexes

Support multi-field queries efficiently:

```typescript
// aiResponseCacheModel.ts
aiResponseCacheSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
```

This index supports queries that filter by `orgId` and `userId` and sort by `createdAt` descending — the exact pattern used when retrieving a user's cached AI responses.

#### Unique Indexes

Enforce data integrity and enable fast exact-match lookups:

```typescript
cacheKey: { type: String, required: true, unique: true },
```

#### TTL Indexes

Automatic cleanup of time-sensitive data:

```typescript
aiResponseCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

| Model | TTL Field | Purpose |
|---|---|---|
| `AiResponseCache` | `expiresAt` | Auto-delete expired AI response caches |
| `DomainEvent` | (expected) | Auto-clean old events to prevent unbounded growth |
| `AuditEvent` | (expected) | Retention policy for audit trails |

### Query Optimization

#### Selective Field Projection

The domain event fanout uses projection to minimize data transfer:

```typescript
DomainEventModel.find(query)
  .sort({ _id: 1 })
  .limit(250)
  .select({
    _id: 1, orgId: 1, eventType: 1, aggregateType: 1,
    aggregateId: 1, actionLinkId: 1, requestId: 1,
    payload: 1, createdAt: 1,
  })
  .lean();
```

Only the fields needed for event publishing are retrieved. The `payload` field is included because it's required for fanout, but all other non-essential fields are excluded.

#### Lean Queries

All read-only queries use `.lean()` to return plain JavaScript objects instead of Mongoose documents:

```typescript
// worker.ts — job claiming
const claimed = await WorkflowRunModel.findOneAndUpdate(
  { status: "queued" },
  { $set: { status: "running", startedAt: new Date() } },
  { sort: { createdAt: 1 }, new: true }
)
  .select({ _id: 1 })
  .lean();
```

Lean queries skip Mongoose's document hydration overhead, reducing memory usage by 50-70% and improving query speed by 2-3x for read-heavy operations.

#### Minimal Projection on Claims

The worker's job-claiming queries only select `_id`:

```typescript
.select({ _id: 1 })
```

This is the minimal data needed to identify the claimed job. The full document is fetched separately during execution, keeping the claim operation fast and reducing lock contention.

### Connection Pooling

```typescript
// database.ts
await mongoose.connect(uri, {
  serverSelectionTimeoutMS: 10_000,
  maxPoolSize: 20,
});
```

| Setting | Value | Rationale |
|---|---|---|
| `maxPoolSize` | 20 | Sufficient for the Express server's concurrent request load; each connection handles multiple in-flight operations |
| `serverSelectionTimeoutMS` | 10 000 | 10-second timeout for selecting a server in replica sets; balances failover speed with tolerance for transient network issues |

**Pool sizing guidance:**

| Deployment | API Processes | Pool Size per Process | Total Connections |
|---|---|---|---|
| Development | 1 | 20 | 20 |
| Small production | 2 | 20 | 40 |
| Medium production | 4 | 20 | 80 |
| Large production | 8+ | 20 | 160+ |

MongoDB's default `maxIncomingConnections` is 65 536, so even large deployments won't hit server limits.

### Aggregation Pipeline Optimization

Financial dashboards rely on MongoDB aggregation pipelines. Optimization patterns:

| Pattern | Application |
|---|---|
| **`$match` first** | Filter documents before any expensive stages |
| **`$project` early** | Reduce document size before `$group` or `$sort` |
| **Index-covered queries** | When possible, design pipelines that can be satisfied entirely by indexes |
| **`$limit` before `$sort`** | When only top-N results are needed, limit before sorting |
| **Response caching** | Aggregation results are cached via `responseCache` service (2-15 min TTLs) |

### Pagination Strategies

| Strategy | Use Case | Implementation |
|---|---|---|
| **Offset-based** | Transaction lists, activity feeds | `skip` + `limit` with count query |
| **Cursor-based** | Large datasets, infinite scroll | `_id`-based pagination (`_id > lastSeenId`) |
| **Time-window** | Analytics, reports | Date-range filtering with pre-computed aggregates |

The domain event fanout uses cursor-based pagination via `_id` comparison:

```typescript
const query: any = {};
if (lastSeenId) {
  query._id = { $gt: lastSeenId };
}
```

This approach is O(1) regardless of dataset size, unlike offset-based pagination which degrades as the offset grows.

---

## 4. Frontend Performance

### Lazy-Loaded Routes

All 34 routes use `React.lazy()` for code splitting. The route table is defined in `client/src/routes/routeDefinitions.tsx`:

```typescript
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
// ... 31 more lazy imports
```

**Route inventory by layout:**

| Layout | Routes | Count |
|---|---|---|
| `app` | Dashboard, Scenarios, FinancialStory, Portfolio, AllInsights, Transactions, FinanceOS, GoalsAndDebts, Exports, Workflows, Tasks, Receipts, Onboarding, GrowthStories, GrowthStoryDetail, Blogs, BlogDetail, Notes, Billing, Organization, Documentation, Files, Settings, Analytics, FinancialCalendar, ActivityFeed | 26 |
| `chat` | ChatPage, ChatPage (with sessionId) | 2 |
| `public` | Login, Register, VerifyEmail, AcceptInvite, SharedFinancialStory | 5 |
| **Total** | | **34** |

Each route is loaded on-demand when the user navigates to it. The initial bundle contains only the shell (header, sidebar, router), keeping the first load minimal.

### Code Splitting by Route

Vite automatically creates separate chunks for each lazy-loaded route. The build output structure:

```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js          # Shell + shared dependencies
│   ├── index-[hash].css         # Critical CSS
│   ├── Dashboard-[hash].js      # Dashboard route chunk
│   ├── Transactions-[hash].js   # Transactions route chunk
│   ├── Portfolio-[hash].js      # Portfolio route chunk
│   └── ...                      # 31 more route chunks
```

**Shared chunk optimization:** Vite automatically extracts shared dependencies (React, Radix UI, Tailwind) into a common chunk that is cached across all routes.

### Virtual Lists (`useVirtualList`)

Located at `client/src/hooks/useVirtualList.ts`. Renders only visible items plus an overscan buffer, reducing DOM nodes from thousands to dozens.

```typescript
const { visibleItems, containerProps, totalHeight } = useVirtualList({
  items: allTransactions,  // 10,000 items
  itemHeight: 56,          // Fixed height per row
  overscan: 5,             // Extra items above/below viewport
});
// visibleItems: ~15 items (viewport + overscan)
```

**How it works:**

| Step | Mechanism |
|---|---|
| 1. Measure | `ResizeObserver` tracks container height changes |
| 2. Scroll tracking | Passive scroll listener updates `scrollTopRef` |
| 3. Calculate visible range | `startIndex = floor(scrollTop / itemHeight) - overscan` |
| 4. Render subset | Only items in `[startIndex, endIndex]` are rendered |
| 5. Spacer element | `totalHeight` creates a scrollable container of the correct size |

**Performance impact:**

| Scenario | Without Virtualization | With Virtualization |
|---|---|---|
| 1 000 transactions | 1 000 DOM nodes | ~25 DOM nodes |
| 10 000 transactions | 10 000 DOM nodes | ~25 DOM nodes |
| Initial render time | ~500 ms | ~20 ms |
| Scroll FPS | Drops to 30-40 fps | Consistent 60 fps |
| Memory usage | ~5 MB | ~0.5 MB |

### Image Lazy Loading (`LazyImage`)

Located at `client/src/components/LazyImage.tsx`. Uses `IntersectionObserver` with a 200px pre-load margin.

**Features:**

| Feature | Implementation |
|---|---|
| Viewport detection | `IntersectionObserver` with `rootMargin: "200px"` |
| Shimmer placeholder | CSS `animate-pulse` on a `bg-muted` div |
| Blur-up effect | Low-res `placeholderSrc` with `blur-lg scale-105` |
| Fallback handling | Automatic `fallbackSrc` on error, then gradient surface |
| Native lazy loading | `loading="lazy"` + `decoding="async"` on the `<img>` element |
| Smooth transition | `transition-opacity duration-500` from `opacity-0` to `opacity-100` |

**Loading sequence:**

```
1. Shimmer placeholder (immediate)
2. IntersectionObserver detects element approaching viewport (200px margin)
3. Low-res blur placeholder fades in (if provided)
4. Full image loads asynchronously
5. Image fades in with 500ms transition
6. Shimmer and blur placeholder removed
```

### Debounced Inputs (`useDebounce`)

Located at `client/src/hooks/useDebounce.ts`. Prevents excessive API calls from rapid user input (search filters, amount inputs, etc.).

```typescript
const [search, setSearch] = useState("");
const debouncedSearch = useDebounce(search, 300); // 300ms delay

useEffect(() => {
  // Only fires 300ms after the user stops typing
  fetchTransactions({ search: debouncedSearch });
}, [debouncedSearch]);
```

**Configuration guidance:**

| Input Type | Recommended Delay | Rationale |
|---|---|---|
| Search filters | 300 ms | Balances responsiveness with API call reduction |
| Amount inputs | 500 ms | Users type numbers quickly; longer delay prevents premature queries |
| Text areas / notes | 1 000 ms | Auto-save scenarios; longer delay reduces write frequency |

### Memoization Patterns

| Pattern | Usage | Example |
|---|---|---|
| `React.memo` | Pure presentational components | Chart components, table rows, summary cards |
| `useMemo` | Expensive calculations | Financial aggregations, sorted/filtered lists |
| `useCallback` | Stable function references | Event handlers passed to memoized children |
| `useRef` | Mutable values without re-renders | Scroll positions, timer IDs, previous values |

**Guidelines:**

- Memoize components that receive stable props and render frequently (e.g., transaction rows in a virtual list)
- Use `useMemo` for computations that run on every render and process large arrays (sorting, filtering, grouping)
- Avoid premature memoization; profile first to identify actual bottlenecks

### Bundle Size Optimization (Vite)

**Build configuration** (`client/vite.config.ts`):

| Technique | Configuration | Impact |
|---|---|---|
| Tree shaking | Automatic (ESM) | Removes unused code from dependencies |
| Code splitting | `React.lazy()` per route | Initial bundle contains only shell |
| Asset inlining | Vite default (< 4 KB) | Small assets inlined as data URIs |
| Minification | Vite default (esbuild) | ~60% size reduction |
| Dead code elimination | `process.env.NODE_ENV` checks | Removes dev-only code in production |

**Estimated bundle breakdown:**

| Chunk | Estimated Size (gzipped) | Contents |
|---|---|---|
| Vendor (React, Radix, etc.) | ~80 KB | Shared dependencies |
| Shell (router, layout, stores) | ~25 KB | App framework |
| Per-route average | ~8-15 KB | Route-specific code |
| Largest route (Dashboard) | ~25 KB | Charts, widgets, insights |
| **Total initial load** | **~105 KB** | Vendor + Shell only |

---

## 5. Background Processing

### Architecture Overview

FinWise uses a **dual-queue system** for background processing:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Background Processing Architecture               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐          ┌──────────────────────────────────┐    │
│  │  API Server  │          │       Worker Process             │    │
│  │              │          │  (separate Node.js process)      │    │
│  │ Creates job  │─────────▶│                                  │    │
│  │ record in DB │          │  ┌────────────────────────────┐  │    │
│  │              │          │  │  Polling Loop              │  │    │
│  │              │          │  │  (every POLL_INTERVAL_MS)  │  │    │
│  │              │          │  └────────────┬───────────────┘  │    │
│  └──────────────┘          │               │                   │    │
│                             │  ┌────────────▼───────────────┐  │    │
│                             │  │  Round-Robin Claim         │  │    │
│                             │  │  workflow → sync → export  │  │    │
│                             │  └────────────┬───────────────┘  │    │
│                             │               │                   │    │
│                             │  ┌────────────▼───────────────┐  │    │
│                             │  │  p-queue (concurrency: N)  │  │    │
│                             │  │  ┌────────┐ ┌────────┐    │  │    │
│                             │  │  │ Job 1  │ │ Job 2  │ ... │  │    │
│                             │  │  └────────┘ └────────┘    │  │    │
│                             │  └────────────────────────────┘  │    │
│                             └──────────────────────────────────┘    │
│                                                                     │
│  Optional: BullMQ queue (when Redis is available)                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  BullMQ "workflow-runs" queue                               │   │
│  │  - 3 attempts, exponential backoff (2s base)                │   │
│  │  - Remove on complete (keep 100), remove on fail (keep 200) │   │
│  │  - Falls back to p-queue if Redis unavailable               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Job Types

| Job Type | Model | Processor | Trigger |
|---|---|---|---|
| **Workflow Run** | `WorkflowRunModel` | `processWorkflowRun()` | Workflow trigger (schedule, event, manual) |
| **Integration Sync** | `IntegrationSyncRunModel` | `processIntegrationSyncRun()` | Integration connection, manual sync |
| **Export Job** | `ExportJobModel` | `processExportJob()` | User-requested data export (CSV/PDF/XLSX) |

### Polling-Based Claim System

The worker polls MongoDB for queued jobs using a **round-robin** strategy across job kinds:

```typescript
// worker.ts — round-robin claim cursor
const jobKinds: WorkerJob["kind"][] = ["workflow_run", "integration_sync_run", "export_job"];
let claimCursor = 0;

const claimNextJob = async (): Promise<WorkerJob | null> => {
  for (let offset = 0; offset < jobKinds.length; offset += 1) {
    const kind = jobKinds[(claimCursor + offset) % jobKinds.length]!;
    const claimed = await claimJobForKind(kind);
    if (claimed) {
      claimCursor = (claimCursor + offset + 1) % jobKinds.length;
      return claimed;
    }
  }
  return null;
};
```

**Atomic claiming** uses `findOneAndUpdate` with a status filter:

```typescript
WorkflowRunModel.findOneAndUpdate(
  { status: "queued" },
  { $set: { status: "running", startedAt: new Date() } },
  { sort: { createdAt: 1 }, new: true }
)
```

The atomic update ensures that only one worker instance can claim a given job, even with multiple worker processes running.

### Concurrency Control (p-queue)

```typescript
const queue = new PQueue({ concurrency: env.WORKER_CONCURRENCY });
```

| Setting | Source | Default | Rationale |
|---|---|---|---|
| `concurrency` | `WORKER_CONCURRENCY` env var | Configurable | Limits parallel job execution to prevent resource exhaustion |
| Capacity check | `WORKER_CONCURRENCY - (pending + size)` | — | Only claims jobs when there's available capacity |

The worker calculates available capacity on each tick:

```typescript
const capacity = Math.max(0, env.WORKER_CONCURRENCY - (queue.pending + queue.size));
```

This ensures the worker never over-commits and respects the configured concurrency limit.

### BullMQ Integration

When Redis is available, workflow runs can use BullMQ for more robust queue management:

```typescript
// jobQueue.ts
new Queue("workflow-runs", {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
```

| Setting | Value | Purpose |
|---|---|---|
| `attempts` | 3 | Retry failed jobs up to 3 times |
| `backoff.type` | `exponential` | Increasing delay between retries (2s, 4s, 8s) |
| `backoff.delay` | 2000 ms | Base delay for exponential backoff |
| `removeOnComplete` | 100 | Keep last 100 completed jobs for debugging |
| `removeOnFail` | 200 | Keep last 200 failed jobs for investigation |

**Fallback behavior:** If Redis is unavailable, `getWorkflowQueue()` returns `null` and the system falls back to the p-queue-based MongoDB polling system. This ensures background processing works in all deployment scenarios.

### Retry and Failure Handling

| Layer | Mechanism | Configuration |
|---|---|---|
| **BullMQ** | Automatic retries with exponential backoff | 3 attempts, 2s base delay |
| **Worker (p-queue)** | Error logged, job marked failed | Logged with `duration_ms` and error details |
| **Graceful shutdown** | Wait for in-flight jobs, 15s timeout | `SIGINT`/`SIGTERM` handlers |
| **Uncaught exceptions** | Process shutdown with logging | `uncaughtException` and `unhandledRejection` handlers |

**Graceful shutdown sequence:**

```
1. SIGINT/SIGTERM received
2. Set shuttingDown flag (stops accepting new jobs)
3. Stop polling timer
4. Stop workflow scheduler
5. Wait for queue.onIdle() (all in-flight jobs complete)
6. 15-second force-exit timeout
7. Close DB connection
8. Process exit
```

---

## 6. Real-Time Communication

### Server-Sent Events (SSE)

FinWise uses SSE for real-time updates from server to client. The flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT                                                             │
│  useRealtimeEvents() hook                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 1. Creates EventSource to /api/v1/events/stream               │ │
│  │ 2. Sends auth cookie with request                             │ │
│  │ 3. Receives SSE events as they are published                  │ │
│  │ 4. Dispatches to Zustand store for UI updates                 │ │
│  │ 5. Automatic reconnection on disconnect (browser native)      │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ text/event-stream
        │
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER — eventsController.streamEvents()                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 1. Authenticate client, resolve orgId                         │ │
│  │ 2. Subscribe to EventBus for this orgId                       │ │
│  │ 3. Write SSE events:                                          │ │
│  │    event: <type>\ndata: <JSON>\n\n                            │ │
│  │ 4. On disconnect: clean up subscription                       │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ EventBus.publish()
        │
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER — Domain Event Fanout                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Mode: "auto" (preferred), "change_stream", or "poll"          │ │
│  │                                                               │ │
│  │ ChangeStream (preferred):                                     │ │
│  │   - DomainEventModel.watch() on insert operations             │ │
│  │   - Real-time detection, no polling overhead                  │ │
│  │   - Falls back to polling on failure                          │ │
│  │                                                               │ │
│  │ Polling (fallback):                                           │ │
│  │   - Interval: DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS            │ │
│  │   - Query: { _id: { $gt: lastSeenId } }                       │ │
│  │   - Batch size: 250 documents per tick                        │ │
│  │   - Projection: Only required fields                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ DomainEventModel.create()
        │
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER — Services                                                  │
│  Emit domain events on state changes:                               │
│  - transaction.created, transaction.updated, transaction.deleted    │
│  - budget.updated, goal.updated, workflow.completed                 │
│  - notification.created, receipt.processed                          │
└─────────────────────────────────────────────────────────────────────┘
```

### EventBus Deduplication

The in-memory event bus (`server/src/modules/realtime/eventBus.ts`) includes built-in deduplication:

| Setting | Value | Purpose |
|---|---|---|
| `EVENT_DEDUP_TTL_MS` | 600 000 (10 min) | Events seen within this window are considered duplicates |
| `EVENT_DEDUP_MAX_PER_ORG` | 2 000 | Maximum tracked event IDs per organization before cleanup |

**Deduplication algorithm:**

1. On `publish(event)`, check if `event.id` was seen within the TTL window
2. If seen, drop the event (duplicate)
3. If not seen, record the timestamp and deliver to all listeners for that `orgId`
4. Periodically clean up expired entries when the map exceeds 2 000 entries

**Error isolation:** Listener errors are caught silently — a failing listener must never crash the publisher path.

### AI Response Streaming

AI responses are streamed via SSE from the AI Core through the Express server to the client:

```
AI Core (Python) ──HTTP stream──▶ aiCoreClient ──SSE──▶ Client (EventSource)
```

The `aiStream` service in the client handles:
- Opening the SSE connection with auth headers
- Parsing incremental response chunks
- Updating the UI incrementally as tokens arrive
- Handling connection errors and reconnection

### Connection Management

| Aspect | Implementation |
|---|---|
| **Authentication** | Auth cookie sent with EventSource request (via `withCredentials`) |
| **Reconnection** | Browser-native EventSource automatic reconnection with exponential backoff |
| **Cleanup** | Server removes EventBus subscription when SSE connection closes |
| **Scoping** | Events are routed by `orgId` — users only receive events for their organization |
| **Heartbeat** | (Recommended) Periodic comment messages to keep connections alive through proxies |

---

## 7. API Performance

### Response Compression

| Layer | Configuration |
|---|---|
| **HTTP compression** | Express compression middleware (gzip/deflate) |
| **Compression threshold** | Responses > 1 KB are compressed |
| **Compressed types** | `application/json`, `text/*`, `application/javascript` |
| **Expected reduction** | 60-80% for JSON API responses |

### Request Validation Overhead (Zod)

Zod validation runs in the middleware layer before controllers:

```typescript
// validate middleware
validate({ body: someSchema, params: someParamsSchema, query: someQuerySchema })
```

**Performance characteristics:**

| Aspect | Detail |
|---|---|
| Validation cost | Sub-millisecond for typical request bodies (< 1 KB) |
| Schema complexity | Linear with schema depth; deeply nested schemas add measurable overhead |
| Error path | Validation errors short-circuit the request before reaching the controller |
| Production impact | Negligible; Zod is highly optimized and runs synchronously |

**Optimization tips:**
- Keep validation schemas flat where possible
- Use `z.object().strict()` to reject unknown fields early
- Avoid expensive custom refinements in hot paths

### Rate Limiting Efficiency (Redis-Backed)

| Tier | Limit | Scope | Window |
|---|---|---|---|
| General API | 200 requests | Per user/org | 1 minute |
| Authentication | 20 requests | Per IP | 1 minute |
| AI endpoints | Configurable | Per user | 1 minute |

**Redis-backed rate limiting** uses `express-rate-limit` with the Redis store:

- O(1) check per request (Redis `INCR` + `EXPIRE`)
- Atomic operations prevent race conditions
- Keys auto-expire, no manual cleanup needed
- Sub-millisecond overhead per check

### Logging Overhead (Pino Async Logging)

Pino is the fastest Node.js JSON logger by design:

| Feature | Implementation |
|---|---|
| **Async logging** | Pino writes to stdout in a separate thread (via `pino.destination`) |
| **Structured output** | JSON format with request context (requestId, duration, method, path) |
| **Request context** | `requestContext` middleware attaches `requestId` and start time to every request |
| **HTTP logging** | `pino-http` middleware logs every request with response time |
| **Log levels** | `info` (production), `debug` (development), `warn`/`error` (always) |

**Request log format:**

```json
{
  "level": 30,
  "time": 1709251200000,
  "pid": 12345,
  "hostname": "server-1",
  "reqId": "abc-123",
  "method": "GET",
  "url": "/api/v1/transactions",
  "statusCode": 200,
  "responseTime": 45.2,
  "event": "request_completed"
}
```

**Overhead:** Pino adds < 0.1 ms per log line in production mode. The async destination ensures logging never blocks the request thread.

---

## 8. AI Performance

### Deterministic-First Design

The AI Core prioritizes deterministic computation over LLM calls:

| Operation | Approach | LLM Required? |
|---|---|---|
| Financial calculations (NPV, IRR, ratios) | Pure Python functions | No |
| Data aggregation (spending by category) | Pandas operations | No |
| Request classification | LLM (lightweight model) | Yes |
| Narrative generation | LLM (primary model) | Yes |
| Budget recommendations | Hybrid (rules + LLM narrative) | Partial |
| Receipt OCR | PaddleOCR (deterministic) | No |

**`fallback_used` flag:** Every AI response includes a flag indicating whether the deterministic path was used or an LLM was required. This enables monitoring of LLM dependency and cost tracking.

### Provider Failover

The AI Core supports multiple LLM providers with automatic failover:

| Provider | Role | Failover Order |
|---|---|---|
| Google Gemini | Primary | 1st |
| OpenRouter | Secondary | 2nd |
| Groq | Tertiary | 3rd |
| Grok (XAI) | Quaternary | 4th |
| Together | Quinary | 5th |
| Mistral | Senary | 6th |

**Failover benefits:**
- Reduces latency when the primary provider is experiencing issues
- Prevents complete AI service outages
- Enables A/B testing of provider quality and cost

### Response Caching

AI responses are cached at two levels:

| Level | Storage | TTL | Invalidation |
|---|---|---|---|
| **MongoDB cache** | `AiResponseCacheModel` | Per-request `expiresAt` | TTL index auto-cleanup |
| **Response cache** | `responseCache` service | 2-15 min | `updatedAt` hash in cache key |

**Cache key strategy:** SHA-256 hash of all input parameters ensures identical requests return cached results without LLM invocation.

### Concurrent Agent Execution (Comprehensive Analysis)

For complex financial analysis requests, the LangGraph workflow can execute multiple agents concurrently:

```
                    ┌──────────────┐
                    │ master_agent │
                    │  (classify)  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
    ┌─────────▼──┐  ┌──────▼──────┐  ┌──────▼──────┐
    │income_     │  │budget_      │  │investment_  │
    │analyzer    │  │planner      │  │advisor      │
    └─────────┬──┘  └──────┬──────┘  └──────┬──────┘
              │            │               │
    ┌─────────▼──┐  ┌──────▼──────┐        │
    │debt_       │  │comprehensive│        │
    │optimizer   │  │ analysis    │        │
    └─────────┬──┘  └──────┬──────┘        │
              │            │               │
              └────────────┼───────────────┘
                           │
                   ┌───────▼───────┐
                   │   synthesize  │
                   │ (master plan) │
                   └───────┬───────┘
                           │
                   ┌───────▼───────┐
                   │     END       │
                   └───────────────┘

  financial_educator ──────────────────▶ END (bypasses synthesis)
```

**Execution model:**
1. `master_agent` classifies the request and determines which specialists are needed
2. Relevant specialists execute (potentially in parallel within the LangGraph workflow)
3. Results are synthesized by the master agent into a comprehensive plan
4. `financial_educator` bypasses synthesis — it provides general education without personal data

### Streaming Responses

AI responses are streamed token-by-token via SSE:

| Benefit | Impact |
|---|---|
| Perceived latency | First token arrives in < 500 ms, even for long responses |
| Memory efficiency | Client processes tokens incrementally; no large response buffering |
| User experience | Typing animation provides feedback that the system is working |
| Timeout resilience | Long-running analyses don't hit HTTP timeout limits |

---

## 9. Scalability Considerations

### Horizontal Scaling (Stateless API Servers)

The Express API server is stateless — all state is externalized:

| State Type | Storage | Sharing |
|---|---|---|
| Session state | HTTP-only JWT cookies | N/A (client-held) |
| Data | MongoDB | Shared across all instances |
| Cache | MongoDB (`AiResponseCacheModel`) | Shared across all instances |
| Rate limits | Redis | Shared across all instances |
| Job queue | MongoDB + BullMQ/Redis | Shared across all instances |
| Events | In-memory EventBus | Per-instance (limitation) |

**Scaling limitation:** The in-memory EventBus does not share events across API instances. In a multi-instance deployment, SSE subscribers connected to different instances will not receive the same events.

**Mitigation strategies:**
- Use sticky sessions (load balancer affinity) to keep SSE connections on the same instance
- Replace in-memory EventBus with Redis Pub/Sub for cross-instance event distribution
- Deploy a dedicated SSE gateway service

### Database Scaling (MongoDB)

| Strategy | Description | When to Use |
|---|---|---|
| **Replica sets** | 3-node replica set for high availability and read scaling | Always — minimum production requirement |
| **Read preferences** | `secondaryPreferred` for read-heavy queries (analytics, reports) | When read load exceeds primary capacity |
| **Sharding** | Horizontal partitioning by `orgId` | When a single replica set exceeds capacity (> 1 TB or > 10K ops/s) |
| **Connection pooling** | 20 connections per API process | Scale pool size with instance count |

**Sharding key recommendation:** `orgId` is the natural shard key — all queries are org-scoped, ensuring data locality and efficient shard routing.

### Redis Clustering

| Strategy | Description |
|---|---|
| **Redis Sentinel** | High availability with automatic failover |
| **Redis Cluster** | Horizontal scaling with data partitioning |
| **Managed Redis** | AWS ElastiCache, GCP Memorystore, or Upstash for operational simplicity |

**Redis usage in FinWise:**
- Rate limiting (express-rate-limit store)
- BullMQ job queue (optional, with p-queue fallback)
- Response caching (optional, via `responseCache` service)

### CDN for Static Assets

| Asset Type | CDN Strategy |
|---|---|
| **Client build** | Vite produces versioned asset hashes; CDN caches indefinitely |
| **Images** | PWA service worker caches images; CDN for origin fetch |
| **PWA manifest/icons** | Cached by service worker and CDN |

**Recommended CDN configuration:**
- Cache-Control: `public, max-age=31536000, immutable` for versioned assets
- Cache-Control: `public, max-age=3600` for non-versioned assets
- Enable Brotli compression
- HTTP/2 or HTTP/3 for multiplexing

### Load Balancing Strategies

```
                    ┌─────────────┐
                    │   Client    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Load       │
                    │  Balancer   │
                    │  (NGINX/    │
                    │  ALB/Cloud) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──┐  ┌──────▼──┐  ┌──────▼──┐
       │ API #1  │  │ API #2  │  │ API #3  │
       │ :3000   │  │ :3000   │  │ :3000   │
       └─────┬───┘  └─────┬───┘  └─────┬───┘
             │            │            │
       ┌─────▼────────────▼────────────▼───┐
       │          MongoDB Replica Set       │
       │     Primary + 2 Secondaries        │
       └────────────────────────────────────┘
```

| Strategy | Configuration | Notes |
|---|---|---|
| **Round-robin** | Default | Even distribution across instances |
| **Sticky sessions** | Cookie-based affinity | Required for SSE if EventBus is in-memory |
| **Health checks** | `/api/health` endpoint | Remove unhealthy instances from rotation |
| **Connection draining** | 30-second timeout | Graceful removal during deployments |

---

## 10. Monitoring & Metrics

### Prometheus Metrics Endpoint (`/api/metrics`)

Exposed via `prom-client` at `/api/metrics`. Scrape interval: 15 seconds.

**Standard metrics:**

| Metric | Type | Description |
|---|---|---|
| `process_cpu_user_seconds_total` | Counter | User CPU time |
| `process_cpu_system_seconds_total` | Counter | System CPU time |
| `process_resident_memory_bytes` | Gauge | Resident memory size |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag |
| `nodejs_active_handles_total` | Gauge | Active handles (sockets, timers) |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `http_request_total` | Counter | Total requests by method/path/status |

**Custom metrics (recommended):**

| Metric | Type | Description |
|---|---|---|
| `ai_response_duration_seconds` | Histogram | AI Core response latency |
| `ai_cache_hit_total` | Counter | AI cache hits |
| `ai_cache_miss_total` | Counter | AI cache misses |
| `db_query_duration_seconds` | Histogram | MongoDB query latency |
| `worker_job_duration_seconds` | Histogram | Background job execution time |
| `worker_jobs_completed_total` | Counter | Successfully completed jobs |
| `worker_jobs_failed_total` | Counter | Failed jobs |
| `sse_connections_active` | Gauge | Current active SSE connections |
| `response_cache_hit_total` | Counter | Response cache hits |
| `response_cache_miss_total` | Counter | Response cache misses |

### OpenTelemetry Distributed Tracing

Configured in `server/src/config/telemetry.ts`. Traces span all three tiers:

```
Trace: abc123
  ├─ Span: GET /api/v1/dashboard (Express)
  │   ├─ Span: responseCache.get (Redis/MongoDB)
  │   ├─ Span: TransactionModel.aggregate (MongoDB)
  │   └─ Span: aiCoreClient.request (HTTP to Python)
  │       └─ Span: LangGraph workflow (Python)
  │           ├─ Span: master_agent.classify
  │           ├─ Span: income_analyzer.analyze
  │           └─ Span: synthesize
  └─ Span: response sent
```

**Context propagation:** W3C Trace Context headers (`traceparent`, `tracestate`) are propagated across HTTP boundaries (Express → AI Core).

### Pino Structured Logging

Every log entry is JSON with consistent fields:

```json
{
  "level": 30,
  "time": 1709251200000,
  "pid": 12345,
  "hostname": "server-1",
  "reqId": "abc-123",
  "service": "worker",
  "instance_id": "uuid-456",
  "event": "job_completed",
  "job": { "kind": "workflow_run", "id": "789" },
  "duration_ms": 1234,
  "msg": "Job processed"
}
```

| Field | Purpose |
|---|---|
| `reqId` | Correlates all log entries for a single request |
| `event` | Machine-parseable event identifier for alerting |
| `service` | Identifies the service (worker, server, etc.) |
| `instance_id` | Identifies the process instance in multi-instance deployments |
| `duration_ms` | Operation duration for performance analysis |

### Key Metrics to Monitor

| Category | Metric | Alert Threshold | Action |
|---|---|---|---|
| **Latency** | p95 response time > 1 s | Investigate slow queries, check DB indexes |
| **Error rate** | 5xx rate > 1% | Check logs, review recent deployments |
| **Cache hit rate** | AI cache hit rate < 30% | Review cache key strategy, TTL values |
| **Queue depth** | Worker queue depth > 100 | Scale worker processes, increase concurrency |
| **Memory** | RSS > 512 MB | Check for memory leaks, review pool sizes |
| **CPU** | Event loop lag > 100 ms | Profile hot paths, consider horizontal scaling |
| **Database** | Slow queries > 100 ms | Review query plans, add indexes |
| **SSE** | Active connections dropping > 10/min | Check load balancer timeouts, proxy settings |

---

## 11. Performance Benchmarks

### Target Performance Metrics

| Scenario | Target | Measurement Method |
|---|---|---|
| **Initial page load (cold cache)** | < 2.5 s TTI | Lighthouse, 4G throttling |
| **Initial page load (warm cache)** | < 1.0 s TTI | Lighthouse, cached service worker |
| **Dashboard API response (cached)** | < 200 ms | Server-side timing |
| **Dashboard API response (cold)** | < 800 ms | Server-side timing |
| **Transaction list (1 000 rows)** | < 200 ms render | Client-side profiling |
| **Transaction list (10 000 rows, virtual)** | < 200 ms render | Client-side profiling |
| **AI streaming — first token** | < 500 ms | Server-side timing |
| **AI streaming — full response** | < 8 s | Server-side timing |
| **AI cached response** | < 50 ms | Server-side timing |
| **Export job (10 000 transactions)** | < 30 s | Worker job duration |
| **Workflow run (simple)** | < 5 s | Worker job duration |
| **Integration sync** | < 60 s | Worker job duration |
| **SSE event delivery latency** | < 100 ms (ChangeStream), < 500 ms (polling) | End-to-end timing |
| **Rate limit check overhead** | < 1 ms | Redis INCR latency |

### Bundle Size Targets

| Metric | Target |
|---|---|
| Initial JS bundle (gzipped) | < 120 KB |
| Initial CSS bundle (gzipped) | < 20 KB |
| Largest route chunk (gzipped) | < 30 KB |
| Total app size (all chunks, gzipped) | < 500 KB |
| Time to interactive (3G) | < 4 s |

### Database Performance Targets

| Operation | Target | Notes |
|---|---|---|
| Simple document read | < 5 ms | Indexed query |
| Aggregation (1 000 docs) | < 50 ms | With proper indexes |
| Aggregation (100 000 docs) | < 500 ms | With proper indexes + caching |
| Write (single document) | < 10 ms | With write concern `w: 1` |
| Bulk insert (1 000 docs) | < 500 ms | Using `insertMany` |

---

## 12. Optimization Checklist

Use this checklist before deploying to production.

### Caching

- [ ] AI response cache TTLs are configured per endpoint
- [ ] Response cache keys include all relevant parameters (orgId, userId, updatedAt hashes)
- [ ] React Query `staleTime` is tuned per query type
- [ ] PWA service worker caching strategies are correct (NetworkFirst for API, CacheFirst for images)
- [ ] MongoDB TTL indexes are created for time-based cleanup
- [ ] Cache hit rates are monitored via Prometheus metrics

### Database

- [ ] All frequently queried fields have indexes
- [ ] Compound indexes match actual query patterns
- [ ] Queries use `.lean()` for read-only operations
- [ ] Queries use selective field projection (`.select()`)
- [ ] Connection pool size is appropriate for deployment scale
- [ ] MongoDB replica set is configured for production
- [ ] Slow query log is enabled and monitored
- [ ] Aggregation pipelines have `$match` as early as possible

### Frontend

- [ ] All routes use `React.lazy()` for code splitting
- [ ] Virtual lists are used for datasets > 100 items
- [ ] Images use `LazyImage` component with IntersectionObserver
- [ ] Search inputs use `useDebounce` to reduce API calls
- [ ] Expensive computations are wrapped in `useMemo`
- [ ] Callback props passed to memoized children use `useCallback`
- [ ] Bundle analysis has been run (`npx vite-bundle-visualizer`)
- [ ] Lighthouse score is > 90 for Performance, Accessibility, Best Practices

### Background Processing

- [ ] `WORKER_CONCURRENCY` is set appropriately for the deployment
- [ ] `WORKER_POLL_INTERVAL_MS` is tuned (not too aggressive, not too slow)
- [ ] BullMQ is configured when Redis is available
- [ ] Graceful shutdown is tested (SIGTERM handling)
- [ ] Failed jobs are logged with full context
- [ ] Worker process runs as a separate process from the API server

### Real-Time

- [ ] SSE endpoint is authenticated
- [ ] EventBus deduplication is configured
- [ ] Domain event fanout mode is set (`auto` recommended)
- [ ] ChangeStream fallback to polling is tested
- [ ] SSE reconnection behavior is verified
- [ ] Event payload does not contain sensitive data

### API

- [ ] Response compression is enabled
- [ ] Rate limits are configured per endpoint tier
- [ ] Zod validation schemas are complete for all endpoints
- [ ] Error responses follow the standardized format
- [ ] Request logging includes duration and requestId
- [ ] CORS is configured for the production domain only

### AI

- [ ] Multiple LLM providers are configured for failover
- [ ] Deterministic paths are used for financial calculations
- [ ] AI response caching is enabled
- [ ] Streaming is used for long-running AI responses
- [ ] AI costs are tracked via usage ledger
- [ ] Provider failover is tested

### Monitoring

- [ ] Prometheus metrics endpoint is accessible
- [ ] OpenTelemetry tracing is configured
- [ ] Pino logging is set to appropriate level (info for production)
- [ ] Alert thresholds are configured for key metrics
- [ ] Log aggregation is set up (ELK, Datadog, or equivalent)
- [ ] Dashboard for key metrics is created

### Security & Performance

- [ ] Helmet security headers are enabled
- [ ] CSRF protection is active for state-changing requests
- [ ] No sensitive data in logs (PII redaction verified)
- [ ] API keys have appropriate scopes
- [ ] Rate limiting prevents abuse

### Infrastructure

- [ ] MongoDB replica set is configured (minimum 3 nodes)
- [ ] Redis is configured for rate limiting and optional BullMQ
- [ ] CDN is configured for static assets
- [ ] Load balancer health checks are configured
- [ ] SSL/TLS is enforced
- [ ] Gzip/Brotli compression is enabled at the CDN/proxy level
- [ ] HTTP/2 is enabled

### Testing

- [ ] Load testing has been performed (k6, Artillery, or similar)
- [ ] Memory leak testing has been performed
- [ ] Database query plans have been reviewed with `explain()`
- [ ] Bundle size has been audited
- [ ] Lighthouse audit has been run on production build
- [ ] SSE connection stability has been tested under load

---

*This document should be reviewed and updated whenever significant performance-related changes are made to the codebase. All benchmark targets should be validated against actual measurements in the target deployment environment.*
