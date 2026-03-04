<!--
MEGA_AI_CORE_DEEP_DIVE.md

Why is this file so long?
- You requested large documentation, new files only, with >= 500 lines per file.
- AI systems are hard to debug; this doc is intentionally exhaustive and line-oriented.
-->

# FinWise AI Core Deep Dive (Mega)

This document explains how the AI Core works, how the Node server integrates with it, and how to extend it safely.

Related docs:
- `docs/AI_CORE.md` (shorter overview)
- `docs/MEGA_PROJECT_GUIDE.md` (system tour)
- `docs/MEGA_API_PLAYBOOK.md` (API usage + streaming notes)

---

## 1) What “AI Core” Means in This Repo

AI Core is a separate Python service located at `server/AI_Core/`.
The Node API server calls AI Core over HTTP.
The browser client usually does NOT talk to AI Core directly (it talks to the Node server).

Why a separate service:
- Keeps LLM orchestration and Python ecosystem tools isolated from the main API.
- Allows independent scaling of AI workloads.
- Allows failure isolation and safe fallback behavior.

---

## 2) Key Files and Entry Points

AI Core service entry:
- `server/AI_Core/api_service.py`

AI Core workflow wiring:
- `server/AI_Core/graph/workflow.py`
- `server/AI_Core/graph/state.py`

AI Core agent layer:
- `server/AI_Core/agents/*`

AI Core tools layer:
- `server/AI_Core/tools/*`

AI Core vision/OCR layer:
- `server/AI_Core/vision/*`

Node server AI client:
- `server/src/services/aiCoreClient.ts`

Node server request builder:
- `server/src/services/aiRequestBuilder.ts`

Node server concurrency limiter:
- `server/src/services/aiConcurrency.ts`

Node server error normalization:
- `server/src/middleware/errorHandler.ts`

---

## 3) AI Core HTTP Endpoints (Confirmed)

From `server/AI_Core/api_service.py`:

Health and metadata:
- `GET /health`
- `GET /api/providers`

Metrics:
- `GET /metrics` (token-protected via `AI_CORE_METRICS_TOKEN`)

Vision:
- `POST /api/vision/receipts/parse` (raw image bytes)
- `POST /api/vision/handwriting/recognize` (raw image bytes)

Rate limiter utilities:
- `GET /api/rate-limit/status`
- `POST /api/rate-limit/reset`

Agents:
- `POST /api/agents/process` (main “answer my question” endpoint)
- `POST /api/agents/process/stream` (streaming version)
- `POST /api/agents/what-if-scenario`
- `POST /api/agents/budget`
- `POST /api/agents/investment`
- `POST /api/agents/debt`

Operational note:
- The Node server primarily uses:
  - `/api/agents/process`
  - `/api/agents/what-if-scenario`
  - `/api/vision/receipts/parse`
  - `/health`

---

## 4) Node Server → AI Core Contract (Request Shape)

The Node server builds an `AiCoreProcessRequest` in:
- `server/src/services/aiCoreClient.ts` (type definitions)
- `server/src/services/aiRequestBuilder.ts` (construction)

Key fields:
- `user_input` (string)
- `user_profile` (object or null)
- `org_id` (string, optional)
- `user_id` (string, optional)
- `conversation_history` (array of `{ role, content }`, optional)
- `session_summary` (string, optional)
- `options` (object, optional; e.g. narrative/stream flags)

### 4.1 How user_profile is built (data minimization)

Builder:
- `buildAiCoreUserProfile` in `server/src/services/aiRequestBuilder.ts`

Normalization rules (confirmed):
- Transactions are normalized to:
  - amount (number)
  - category (string; defaults to "Other")
  - description (string)
  - date (YYYY-MM-DD)
  - type (income|expense|investment)
- Transactions older than `DEFAULT_TX_MAX_AGE_DAYS` are dropped (default 365 days).
- Only last `DEFAULT_TX_MAX_ITEMS` are sent (default 300).

Org settings merged into profile:
- currency (3-letter code, default USD)
- locale (default en-US)
- timezone (default UTC)

This matters because:
- It bounds prompt size.
- It reduces privacy exposure.
- It improves performance and predictability.

### 4.2 How the final process request is built

Builder:
- `buildProcessRequest` in `server/src/services/aiRequestBuilder.ts`

If profile is null:
- `user_profile: null`
- stats are zeroed

If profile exists:
- `user_profile` includes:
  - age
  - annual_income
  - monthly_expenses
  - savings
  - debts list
  - financial_goals list
  - risk_tolerance
  - investment_experience
  - time_horizon
  - transactions

---

## 5) AI Core → Node Server Contract (Response Shape)

The Node server expects an `AiCoreProcessResponse` shape in:
- `server/src/services/aiCoreClient.ts`

Important fields (confirmed):
- `success` (boolean)
- `final_output` (string)
- `agent` (string)
- `actionType` (string, optional)
- `priority` ("low"|"medium"|"high", optional)
- `plan` (object, optional)
- `usage` (tokens and cost fields, optional)
- `insights` (array of `{ agent, title, description, actionType, priority? }`)
- `analysis_type` (string)
- `agents_involved` (string[])
- `detailed_analysis` (object)
- `workflow_trace` (array of trace entries)
- `tool_calls` (array of tool call objects, optional)
- `fallback_used` (boolean)
- `llm_call_count` (number)
- `request_id` (string)

### 5.1 Tool calls (simulate → execute)

Tool call object shape (confirmed in Node types):
- `id` (string)
- `title` (string)
- `description` (string)
- `tool` (string, tool name)
- `args` (object)
- `requires_confirmation` (boolean)
- `risk` ("low"|"medium"|"high")

Operational implication:
- Tool calls should be safe-by-default.
- Most tool calls should require confirmation.
- The server can enforce tool policy thresholds before execution.

### 5.2 Trace entries

Trace entries capture which agents ran and timing.
Node type:
- `WorkflowTraceEntry` in `server/src/services/aiCoreClient.ts`

AI Core streaming endpoint also emits trace phase events.

---

## 6) Concurrency Control and Backpressure (Node)

Concurrency limiter:
- `server/src/services/aiConcurrency.ts`

Design:
- Global queue (`PQueue`) with adjustable concurrency (`AI_CORE_MAX_CONCURRENCY`).
- Per-user queues to prevent one user from starving others (`AI_CORE_MAX_CONCURRENCY_PER_USER`).
- Idle per-user queues are cleaned up after ~10 minutes.

Why this matters:
- AI calls are slow and expensive.
- Unbounded concurrency can DOS your own AI provider.

Operational tips:
- Start with small concurrency and scale up.
- Monitor latency + error rate + provider quota.

---

## 7) Health Checks, Circuit Breakers, and Fallback

### 7.1 Server-side health check behavior

`server/src/services/aiCoreClient.ts` performs a health check before requests.
If AI Core is unhealthy:
- It records metrics (when enabled).
- It returns a safe fallback response for non-stream endpoints.

### 7.2 Circuit breaker behavior

The server can fail fast when the AI Core is repeatedly failing.
The server error handler maps circuit-open to:
- 503 with code `SERVICE_UNAVAILABLE`

Files involved:
- `server/src/services/circuitBreaker.ts`
- `server/src/middleware/errorHandler.ts`

Operational guidance:
- A circuit breaker protects upstream providers and your server.
- A circuit breaker should be tuned to avoid flapping.

### 7.3 Safe fallback response

The Node server has a deterministic fallback response builder in:
- `buildFallbackResponse` inside `server/src/services/aiCoreClient.ts`

Fallback characteristics:
- Does not attempt risky actions.
- Emphasizes basic financial hygiene (cash flow, emergency fund, high-interest debt).
- Sets `fallback_used=true`.

---

## 8) AI Core Streaming: What It Emits

AI Core streaming endpoint:
- `POST /api/agents/process/stream`

Format:
- Emits SSE-like lines: `data: <json>\n\n`

Phases observed in code:
- token streaming events (one token at a time)
- trace events (`phase: "trace"`, with `entry`)
- final state synthesis at end

Node server streaming endpoint:
- See `streamAiCoreRequest` in `server/src/services/aiCoreClient.ts`

Operational warnings:
- Streaming endpoints are sensitive to proxy buffering.
- Ensure reverse proxies disable buffering for SSE.
- Ensure timeouts are configured higher than typical AI completion time.

---

## 9) AI Core Vision/OCR Endpoints

Receipts:
- `POST /api/vision/receipts/parse`
- Payload is raw image bytes.
- Enforces max bytes (AI Core config).
- Parameters include `lang` and `currencyHint`.

Handwriting:
- `POST /api/vision/handwriting/recognize`
- Similar raw image bytes flow.

Node server integration:
- `processAiCoreReceiptOcr` in `server/src/services/aiCoreClient.ts` posts raw bytes.

Operational note:
- If vision dependencies are missing, AI Core returns 503.
- Check AI Core `/health` response for vision status.

---

## 10) Memory and Personalization (AI Core)

AI Core optionally loads a persistent memory store:
- `server/AI_Core/memory/persistent_memory.py`

When enabled:
- AI Core searches memories by org_id + user_id + query.
- It appends a memory block to session_summary.
- It may upsert new extracted memories after processing.

Operational guidance:
- Treat memory store data as sensitive.
- Ensure it is scoped by org and user.
- Ensure retention policies are documented.

---

## 11) Adding a New AI Capability (Recommended Workflow)

This is the safest approach for maintainers.

Step 1: Decide where logic should live
- If it requires DB writes or strict policy enforcement → implement as a server tool.
- If it is pure analysis or planning → implement in AI Core.

Step 2: Add or extend a tool (if needed)
- Add tool implementation in `server/AI_Core/tools/*` (AI side), or
- Add tool implementation in `server/src/services/tools/*` (server side, if present).

Step 3: Wire the tool into the workflow/graph
- Update `server/AI_Core/graph/workflow.py` (or equivalent).
- Update state definitions in `server/AI_Core/graph/state.py` if needed.

Step 4: Update contracts
- Ensure AI Core returns tool calls in the shape Node expects.
- Ensure Node response normalization keeps fields stable.

Step 5: Add tests
- Add pytest tests under `server/AI_Core/tests/*`.
- Add server tests under `server/src/test/*` for integration flows.

Step 6: Ship behind a flag (recommended)
- Consider a feature flag or entitlement gate on the server side.

---

## 12) Debugging AI Issues (Practical)

### 12.1 When AI responses look wrong

Checks:
- Confirm the financial profile is populated.
- Confirm transactions are being included (not all dropped by age limit).
- Check the `stats` from `buildAiCoreUserProfile` (sent vs dropped).

### 12.2 When AI Core is unreachable

Checks:
- Call `GET /api/python-health` on the Node server.
- Call `GET /health` on AI Core directly.
- Confirm `PYTHON_API_URL` points to the right host/port.

### 12.3 When streaming is broken

Checks:
- Proxy buffering disabled.
- Server and AI Core timeouts sufficient.
- Client SSE parsing handles `data:` frames.

### 12.4 When tool calls are unsafe or surprising

Checks:
- Ensure tools default to `requires_confirmation=true`.
- Ensure tool policy thresholds are enforced (server side).
- Ensure simulate → execute path is used.

---

## 13) Privacy, Compliance, and Data Minimization Notes

Minimize what you send:
- Only send necessary transaction fields.
- Prefer aggregations over raw logs when possible.

Avoid:
- Sending raw receipts/images to LLM unless required.
- Logging full prompts in production.

Prefer:
- Request IDs for correlation.
- High-level “what we sent” counts, not raw values.

---

## 14) Padding Section (Intentional)

These checklists add line count while being useful for reviews and operations.

### 14.1 AI feature PR checklist

- Clear goal for the feature.
- Explicit safety and risk analysis.
- Bounded prompt size and context.
- Concurrency limits considered.
- Circuit breaker behavior verified.
- Fallback behavior acceptable.
- Tool calls require confirmation by default.
- Tests added for at least one happy path and one failure path.

### 14.2 AI production readiness checklist

- AI Core health endpoint monitored.
- AI Core metrics endpoint protected and scraped.
- Server metrics track AI fallback usage.
- Timeouts configured at:
  - client → server,
  - server → AI Core,
  - AI Core → LLM provider.
- Streaming buffering disabled in proxies.

### 14.3 AI incident triage checklist

- Capture `X-Request-Id` from client and server.
- Check server logs for AI call start/end and fallback_used.
- Check AI Core logs for the request ID.
- Identify whether failure is:
  - provider outage,
  - network,
  - rate limiting,
  - schema mismatch,
  - streaming proxy issue.

---

## 15) End-to-End Walkthrough (Client → Server → AI Core → Client)

This is the “follow the bytes” view.
Use it when debugging production behavior.

Step 0: Client chooses API base URL
- Client resolves `VITE_API_BASE_URL` (defaults to `/api`).
- Client uses `buildApiUrl` in `client/src/lib/apiBase.ts`.

Step 1: Client sends user message
- UI collects `command` or chat input.
- Client calls `apiClient` from `client/src/lib/api/core.ts`.
- Client automatically sends cookies (`credentials: include`).
- Client injects `X-Org-Id` if an active org is set.
- Client injects `X-CSRF-Token` for unsafe methods when it has a token.

Step 2: Server assigns request id
- `server/src/middleware/requestContext.ts` sets `req.requestId`.
- Response header `X-Request-Id` is set.

Step 3: Server attaches org context (if authenticated)
- `server/src/middleware/optionalJwtAuth.ts` may attach user for rate limiting keys.
- `server/src/middleware/orgContext.ts` resolves active org and role.

Step 4: Controller enforces entitlements (quota)
- Example in `server/src/controllers/aiController.ts`:
  - `enforceFeatureLimit(feature: "monthly_ai_calls")`

Step 5: Server fetches context
- Loads financial profile (or migrates/ensures it exists).
- Loads org settings (currency/locale/timezone).
- Loads transactions context (recent + bounded).
- Loads journal context summary (optional).

Step 6: Server builds AI request payload
- `server/src/services/aiRequestBuilder.ts` normalizes user_profile.
- Transactions are trimmed by age and max items.
- Dates normalized to YYYY-MM-DD.

Step 7: Server calls AI Core
- `server/src/services/aiCoreClient.ts` uses Axios with base URL `PYTHON_API_URL`.
- It sends `X-Request-Id` header for correlation.
- It calls `POST /api/agents/process` for main requests.

Step 8: AI Core attaches request id and metrics
- Middleware in `server/AI_Core/api_service.py`:
  - reads `x-request-id` header or generates UUID,
  - sets `X-Request-Id` header on response,
  - tracks request duration metrics.

Step 9: AI Core executes workflow
- AI Core creates/uses LangGraph workflow via `create_financial_workflow()`.
- It may consult persistent memory when configured.
- It may produce:
  - final_output,
  - insights,
  - plan,
  - tool_calls,
  - workflow_trace,
  - usage metadata.

Step 10: Server normalizes response
- `normalizeProcessResponse` in `server/src/services/aiCoreClient.ts`:
  - coerces types,
  - ensures arrays exist,
  - filters malformed tool calls,
  - ensures `request_id` is set.

Step 11: Server persists output (selected flows)
- `server/src/controllers/aiController.ts` writes:
  - `AgentOutputModel` entries,
  - possibly task suggestions,
  - caches responses in `AiResponseCacheModel`.

Step 12: Client renders output
- Client displays:
  - assistant response text,
  - insights cards,
  - tool call actions (simulate/apply),
  - trace visualizations where implemented.

---

## 16) AI Core Request Models (Pydantic) — What AI Core Expects

These are defined in `server/AI_Core/api_service.py`.
This section mirrors field intent (not every validation rule).

`ProcessRequest` fields:
- `user_input: str`
- `user_profile: Optional[UserProfileRequest]`
- `org_id: Optional[str]`
- `user_id: Optional[str]`
- `conversation_history: List[ConversationMessage]`
- `session_summary: Optional[str]`
- `options: ProcessOptions`

`UserProfileRequest` fields (high level):
- `age: int`
- `annual_income: float`
- `monthly_expenses: float`
- `savings: float`
- `debts: List[DebtRequest]`
- `financial_goals: List[FinancialGoalRequest]`
- `risk_tolerance: str`
- `investment_experience: str`
- `time_horizon: int`
- `transactions: List[TransactionRequest]`
- `currency: Optional[str]`
- `locale: Optional[str]`
- `timezone: Optional[str]`

Operational note:
- Keep Node’s `buildAiCoreUserProfile` aligned with AI Core’s expected shape.
- Shape drift is one of the most common AI integration failure modes.

---

## 17) AI Core Metrics and Request Middleware

AI Core middleware responsibilities (confirmed in `api_service.py`):
- Attach `request_id` to request state.
- Start request metrics tracking.
- Log request_started and request_completed events.
- Record request duration histogram labels.
- Add `X-Request-Id` header to responses.

AI Core metrics endpoint:
- `GET /metrics`
- Returns 404 if `AI_CORE_METRICS_TOKEN` is not set.
- Requires `Authorization: Bearer <token>` otherwise 403.

Operational note:
- Do not expose `/metrics` publicly without auth.

---

## 18) AI Core Rate Limiter Utilities (Debugging)

AI Core exposes utility endpoints:
- `GET /api/rate-limit/status`
- `POST /api/rate-limit/reset`

Use cases:
- Debug why requests are being throttled.
- Reset token buckets in a test environment.

Operational warning:
- Treat rate-limit reset as an admin-only capability.
- Do not expose it without authentication in production deployments.

---

## 19) Default Tool Calls (AI Core Fallback Helper)

AI Core contains a helper `_build_default_tool_calls(...)` in `server/AI_Core/api_service.py`.
Purpose:
- Improve retention and follow-through by proposing safe, low-risk automations.
- Provide deterministic tool calls when a routed agent produces none.

Characteristics (confirmed in code comments):
- Low risk.
- Requires explicit confirmation.
- Deterministic tool IDs derived from SHA-256 seeds.

Examples of default tool calls (observed in code):
- “Enable weekly money check-in” → `tool="workflows.create"` with cron trigger.
- “Emergency fund top-up” → creates a task via workflow actions.
- “Enable monthly debt payoff check-in” → cron trigger on 1st of month.
- “Enable new-transaction review (event trigger)” → trigger on transaction event.

Integration implication for Node:
- Node should treat these tool calls like any other:
  - show preview (simulate),
  - require user confirmation,
  - execute via tool executor.

---

## 20) Contract Compatibility Checklist (AI Core ↔ Node)

When changing AI Core responses:
- Keep `final_output` as a string (Node expects string-like).
- Keep `insights` as a list of objects with stable keys.
- Keep `workflow_trace` entries as objects with:
  - agent,
  - startedAt,
  - endedAt,
  - status,
  - optional error.
- Keep `tool_calls` entries as objects with:
  - id,
  - tool,
  - args.

When changing Node normalization:
- Be permissive in parsing (tolerate missing/extra fields).
- Be strict in filtering unsafe tool calls (missing id/tool).
- Keep request_id propagation stable.

When adding new optional fields:
- Default them safely in Node if missing.
- Avoid making the client depend on unstable fields.

---

## 21) Common Failure Modes (and Fast Fixes)

Endpoint mismatch:
- Symptom: 404 from AI Core.
- Fix: verify the exact path the Node server calls (`/api/agents/process` etc).

Timeouts too low:
- Symptom: AI requests fail under load.
- Fix: raise Node → AI Core timeout and ensure provider limits.

Streaming behind proxy:
- Symptom: tokens arrive in bursts or never arrive.
- Fix: disable proxy buffering for SSE and raise idle timeouts.

Serialization issues:
- Symptom: AI Core throws “Object not JSON serializable”.
- Fix: use `_simplify_for_json` pattern and avoid pandas objects in response.

Schema drift:
- Symptom: AI Core validates but Node normalization drops fields.
- Fix: update both sides and add contract tests.

Privacy regressions:
- Symptom: logs contain raw financial data or prompts.
- Fix: redact logs, log counts not contents.

