# Server Test Inventory

Static source index, generated from the release worktree on 23 November 2026. Declarations are not test results.

## `server/src/test/agentOutputsRecent.test.ts`

- Line 12: `describe("recent agent outputs API", () => {`
  - Source: `server/src/test/agentOutputsRecent.test.ts:12`

- Line 35: `it("returns compact recent outputs with linked task ids", async () => {`
  - Source: `server/src/test/agentOutputsRecent.test.ts:35`

## `server/src/test/aiCanary.test.ts`

- Line 10: `describe("Continuous Production Canary & Number Safety Invariant Verification", () => {`
  - Source: `server/src/test/aiCanary.test.ts:10`

- Line 28: `it("GET /api/ai/canary/number-safety returns 200 with canary telemetry", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:28`

- Line 43: `it("POST /api/ai/canary/validate verifies valid candidate narrative and balance sheet", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:43`

- Line 67: `it("POST /api/ai/canary/validate catches hallucinated numbers and reports invariant violation", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:67`

- Line 89: `it("POST /api/ai/canary/validate checks zero-sum budget rebalancing conservation and detects leaks", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:89`

- Line 123: `it("POST /api/ai/canary/validate rejects empty payload with 400 status", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:123`

- Line 137: `it("does not expose one user's financial canary values in another user's health summary", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:137`

- Line 153: `it("redacts client-controlled source names from shared AI Core health", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:153`

- Line 173: `it("does not fabricate a passing canary probe suite when the AI service is unavailable", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:173`

- Line 188: `it("GET /api/ai-core/canary/number-safety returns 200 via aiRoutes proxy path", async () => {`
  - Source: `server/src/test/aiCanary.test.ts:188`

## `server/src/test/aiConcurrencySlot.test.ts`

- Line 11: `describe("acquireAiCoreSlot", () => {`
  - Source: `server/src/test/aiConcurrencySlot.test.ts:11`

- Line 16: `it("holds the per-user slot until released", async () => {`
  - Source: `server/src/test/aiConcurrencySlot.test.ts:16`

- Line 39: `it("release is idempotent and does not free more than one slot", async () => {`
  - Source: `server/src/test/aiConcurrencySlot.test.ts:39`

- Line 70: `it("does not let one user's streams block another user", async () => {`
  - Source: `server/src/test/aiConcurrencySlot.test.ts:70`

## `server/src/test/aiCoreCircuitBreaker.test.ts`

- Line 16: `describe("AI Core circuit breaker", () => {`
  - Source: `server/src/test/aiCoreCircuitBreaker.test.ts:16`

- Line 23: `it("does not open the shared breaker when AI Core rejects a bad payload with 4xx", async () => {`
  - Source: `server/src/test/aiCoreCircuitBreaker.test.ts:23`

- Line 34: `it("still opens the breaker after repeated 5xx failures", async () => {`
  - Source: `server/src/test/aiCoreCircuitBreaker.test.ts:34`

## `server/src/test/aiCoreResilience.test.ts`

- Line 22: `describe("CircuitBreaker", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:22`

- Line 23: `it("opens after the failure threshold and refuses requests while open", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:23`

- Line 36: `it("goes open -> half_open -> closed when the single probe succeeds", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:36`

- Line 54: `it("re-opens immediately when the half-open probe fails", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:54`

- Line 67: `it("a neutral outcome frees the probe slot without closing or opening", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:67`

- Line 77: `it("treats a probe that never reports as lost after the open window", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:77`

- Line 87: `it("a success in the closed state resets the failure streak", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:87`

- Line 98: `describe("retry helpers", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:98`

- Line 99: `it("computeBackoffMs grows exponentially with jitter inside [ceiling/2, ceiling]", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:99`

- Line 108: `it("parseRetryAfterMs handles seconds, HTTP dates and garbage", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:108`

- Line 116: `it("only a 503 carrying Retry-After counts as an AI Core shed", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:116`

- Line 122: `it("retries connect failures and 502/503/504 but not read timeouts, 4xx or 500", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:122`

- Line 133: `describe("connect timeout agents", () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:133`

- Line 134: `it("destroys a socket that does not connect within the timeout", async () => {`
  - Source: `server/src/test/aiCoreResilience.test.ts:134`

## `server/src/test/aiCoreRetry.test.ts`

- Line 31: `describe("AI Core client retries and shedding", () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:31`

- Line 50: `it("retries an idempotent call once on a connect failure and returns the real result", async () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:50`

- Line 59: `it("does not retry a read timeout (work may still be running upstream)", async () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:59`

- Line 68: `it("never retries a non-idempotent call on a transient error", async () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:68`

- Line 77: `it("honours AI Core 503 + Retry-After by retrying once, even for non-idempotent work", async () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:77`

- Line 89: `it("surfaces 503 + Retry-After (not a fallback payload) when AI Core sheds twice, and leaves the breaker closed", async () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:89`

- Line 102: `it("walks the breaker closed -> open -> half_open -> closed", async () => {`
  - Source: `server/src/test/aiCoreRetry.test.ts:102`

## `server/src/test/aiCoreTraceMetrics.test.ts`

- Line 11: `describe("AI Core trace metrics contract", () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:11`

- Line 16: `it("sends conversational turns directly to the work endpoint", async () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:16`

- Line 30: `it("preserves an explicit PDF page citation from Python", async () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:30`

- Line 38: `it.each([0, -1, 1.5, true, "4", Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:38`

- Line 46: `it("preserves Python per-agent metrics in the server response", async () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:46`

- Line 57: `it("accepts old trace entries and rejects invalid numeric metrics", async () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:57`

- Line 69: `it("derives a coherent total and ignores malformed provider counters", async () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:69`

- Line 80: `it("authenticates requests when AI Core has internal token protection enabled", async () => {`
  - Source: `server/src/test/aiCoreTraceMetrics.test.ts:80`

## `server/src/test/aiCoreTransport.test.ts`

- Line 5: `describe("aiCoreActorHeaders", () => {`
  - Source: `server/src/test/aiCoreTransport.test.ts:5`

- Line 6: `it("derives the tenant actor headers from a payload with org_id and user_id", () => {`
  - Source: `server/src/test/aiCoreTransport.test.ts:6`

- Line 13: `it("trims whitespace", () => {`
  - Source: `server/src/test/aiCoreTransport.test.ts:13`

- Line 20: `it("uses the request-local privacy decision even when the cache disagrees", () => {`
  - Source: `server/src/test/aiCoreTransport.test.ts:20`

- Line 30: `it("returns no headers unless both ids are present, so partial actors are never half-sent", () => {`
  - Source: `server/src/test/aiCoreTransport.test.ts:30`

## `server/src/test/aiLearning.test.ts`

- Line 25: `describe("redactFreeText", () => {`
  - Source: `server/src/test/aiLearning.test.ts:25`

- Line 26: `it("strips emails, amounts and long digit runs and caps length", () => {`
  - Source: `server/src/test/aiLearning.test.ts:26`

- Line 40: `it("keeps short numbers like percentages", () => {`
  - Source: `server/src/test/aiLearning.test.ts:40`

- Line 45: `describe("forwardFeedbackEvent", () => {`
  - Source: `server/src/test/aiLearning.test.ts:45`

- Line 50: `it("retries network errors and 5xx, then succeeds", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:50`

- Line 64: `it("stops on 404 and never throws when retries are exhausted", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:64`

- Line 84: `describe("learning metadata helpers", () => {`
  - Source: `server/src/test/aiLearning.test.ts:84`

- Line 85: `it("builds a sanitised event with no raw note and a redacted correction", () => {`
  - Source: `server/src/test/aiLearning.test.ts:85`

- Line 100: `it("extracts attribution when present and tolerates absence", () => {`
  - Source: `server/src/test/aiLearning.test.ts:100`

- Line 107: `it("adds the opt-out header only for opted-out orgs", () => {`
  - Source: `server/src/test/aiLearning.test.ts:107`

- Line 117: `describe("AI learning API", () => {`
  - Source: `server/src/test/aiLearning.test.ts:117`

- Line 165: `describe("feedback", () => {`
  - Source: `server/src/test/aiLearning.test.ts:165`

- Line 166: `it("persists reason + correction, queues for review and forwards a sanitised event", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:166`

- Line 194: `it("never fails the user's request when AI Core is down or lacks the endpoint", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:194`

- Line 206: `it("thumbs up clears a pending review", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:206`

- Line 220: `it("rejects invalid reason codes and over-long corrections", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:220`

- Line 230: `it("does not forward when the org opted out, but still records locally", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:230`

- Line 240: `it("marks AI runs opted out when the organization lookup fails", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:240`

- Line 255: `it("toggles the opt-out through org settings", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:255`

- Line 261: `describe("review queue", () => {`
  - Source: `server/src/test/aiLearning.test.ts:261`

- Line 262: `it("lists org-scoped pending negative feedback and lets admins decide", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:262`

- Line 290: `it("forbids non-admin members", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:290`

- Line 299: `describe("AI Core registry proxy", () => {`
  - Source: `server/src/test/aiLearning.test.ts:299`

- Line 300: `it("proxies status with admin actor headers", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:300`

- Line 316: `it("passes artifact filters and report limits and validates them", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:316`

- Line 325: `it("promotes with actor + note and audits the attempt", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:325`

- Line 338: `it.each(["PROMOTION_SUGGEST_ONLY", "GATE_NOT_PASSED"])("maps AI Core 409 %s to a clean 409", async (code) => {`
  - Source: `server/src/test/aiLearning.test.ts:338`

- Line 346: `it("rolls back, runs the optimizer in org scope and maps outages to 502", async () => {`
  - Source: `server/src/test/aiLearning.test.ts:346`

## `server/src/test/aiScheduler.test.ts`

- Line 20: `describe("AiScheduler admission control", () => {`
  - Source: `server/src/test/aiScheduler.test.ts:20`

- Line 21: `it("serves queued work by lane priority (chat > autopilot > batch), FIFO within a lane", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:21`

- Line 54: `it("sheds with 503 + retryAfterSeconds when the queue is full", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:54`

- Line 71: `it("evicts the newest lower-priority waiter when a higher-priority request arrives at a full queue", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:71`

- Line 93: `it("sheds a flooding user with 429 before they fill the shared queue", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:93`

- Line 111: `it("sheds a request that waits longer than the max wait", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:111`

- Line 124: `it("removes an aborted waiter from the queue", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:124`

- Line 138: `it("per-user cap does not block other users and release is idempotent", async () => {`
  - Source: `server/src/test/aiScheduler.test.ts:138`

## `server/src/test/aiStreamProxy.test.ts`

- Line 23: `describe("proxyAiStream", () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:23`

- Line 24: `it("replaces legacy conversational completions with a retryable error before persistence", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:24`

- Line 48: `it("forwards events in order and injects fields returned by onComplete into the complete result", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:48`

- Line 80: `it("reassembles events split across arbitrary chunk boundaries", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:80`

- Line 99: `it("forwards the complete event unchanged when onComplete throws", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:99`

- Line 121: `it("passes non-JSON data and comment/heartbeat events through untouched", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:121`

- Line 134: `it("stops reading and destroys the upstream when the client disconnects, without persisting", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:134`

- Line 173: `it("emits an error event and ends the stream when the upstream fails", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:173`

- Line 201: `it("waits for drain instead of buffering the whole stream when the client is slow", async () => {`
  - Source: `server/src/test/aiStreamProxy.test.ts:201`

## `server/src/test/analyticsBalances.test.ts`

- Line 12: `describe("analytics account balances", () => {`
  - Source: `server/src/test/analyticsBalances.test.ts:12`

- Line 22: `it("includes opening balances and applies signed expenses and investments once", async () => {`
  - Source: `server/src/test/analyticsBalances.test.ts:22`

## `server/src/test/analyticsHeatmap.test.ts`

- Line 12: `describe("analytics spending heatmap", () => {`
  - Source: `server/src/test/analyticsHeatmap.test.ts:12`

- Line 24: `it("aggregates daily expenses and excludes income and older records", async () => {`
  - Source: `server/src/test/analyticsHeatmap.test.ts:24`

## `server/src/test/analyticsMultiCurrency.test.ts`

- Line 13: `describe("analytics multi-currency FX localization & reporting", () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:13`

- Line 25: `it("converts spending heatmap to EUR using fixed FX rate", async () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:25`

- Line 64: `it("converts category trends to JPY with integer rounding", async () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:64`

- Line 104: `it("converts income vs expense summary to GBP", async () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:104`

- Line 160: `it("converts account balances and calculates normalized net worth in INR", async () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:160`

- Line 199: `it("converts top merchants spend to CAD", async () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:199`

- Line 246: `it("returns multi-currency summary and complete 7-currency conversion matrix", async () => {`
  - Source: `server/src/test/analyticsMultiCurrency.test.ts:246`

## `server/src/test/apiKeyQuota.test.ts`

- Line 13: `describe("api key quota enforcement", () => {`
  - Source: `server/src/test/apiKeyQuota.test.ts:13`

- Line 29: `it("blocks API key requests when api_requests quota is exhausted", async () => {`
  - Source: `server/src/test/apiKeyQuota.test.ts:29`

## `server/src/test/appIngress.test.ts`

- Line 11: `describe("API ingress", () => {`
  - Source: `server/src/test/appIngress.test.ts:11`

- Line 21: `it.each([primaryOrigin, aliasOrigin])("allows credentialed preflights from %s", async (origin) => {`
  - Source: `server/src/test/appIngress.test.ts:21`

- Line 33: `it.each(["get", "options"] as const)("rejects %s from an unlisted origin with a traceable 403", async (method) => {`
  - Source: `server/src/test/appIngress.test.ts:33`

- Line 45: `it("accepts requests without an Origin header", async () => {`
  - Source: `server/src/test/appIngress.test.ts:45`

- Line 50: `it("attaches the request ID to JSON parser errors", async () => {`
  - Source: `server/src/test/appIngress.test.ts:50`

- Line 62: `it("tracks authentication limits independently for two clients behind both proxies", async () => {`
  - Source: `server/src/test/appIngress.test.ts:62`

## `server/src/test/atomicQuota.test.ts`

- Line 34: `describe("atomic quota reservation", () => {`
  - Source: `server/src/test/atomicQuota.test.ts:34`

- Line 48: `it("20 parallel reservations against a limit of 5 admit exactly 5", async () => {`
  - Source: `server/src/test/atomicQuota.test.ts:48`

- Line 67: `it("20 parallel reserve+record cycles never overshoot and bill only admitted calls", async () => {`
  - Source: `server/src/test/atomicQuota.test.ts:67`

- Line 85: `it("releases the reservation when the work fails", async () => {`
  - Source: `server/src/test/atomicQuota.test.ts:85`

- Line 106: `it("an idempotent retry bills once and returns its reservation", async () => {`
  - Source: `server/src/test/atomicQuota.test.ts:106`

- Line 127: `it("applies the delta when actual units differ from the reserved units", async () => {`
  - Source: `server/src/test/atomicQuota.test.ts:127`

- Line 134: `it("rejects requests larger than the whole limit and honours boolean features", async () => {`
  - Source: `server/src/test/atomicQuota.test.ts:134`

## `server/src/test/authAccount.test.ts`

- Line 17: `describe("auth account endpoints: validation + role escalation", () => {`
  - Source: `server/src/test/authAccount.test.ts:17`

- Line 56: `it("POST /auth/password with missing fields returns 400, not 500", async () => {`
  - Source: `server/src/test/authAccount.test.ts:56`

- Line 62: `it("POST /auth/password enforces the registration password policy", async () => {`
  - Source: `server/src/test/authAccount.test.ts:62`

- Line 71: `it("POST /auth/password succeeds with a strong new password and rejects a wrong current one", async () => {`
  - Source: `server/src/test/authAccount.test.ts:71`

- Line 76: `it("PUT /auth/profile rejects non-string names and malformed phone numbers", async () => {`
  - Source: `server/src/test/authAccount.test.ts:76`

- Line 84: `it("PUT /auth/profile keeps the Settings contract and ignores identity fields", async () => {`
  - Source: `server/src/test/authAccount.test.ts:84`

- Line 105: `it("an org admin cannot grant the owner role", async () => {`
  - Source: `server/src/test/authAccount.test.ts:105`

## `server/src/test/authCache.test.ts`

- Line 30: `describe("request-path auth cache", () => {`
  - Source: `server/src/test/authCache.test.ts:30`

- Line 51: `it("checks both user MFA state and memberships freshly on authenticated requests", async () => {`
  - Source: `server/src/test/authCache.test.ts:51`

- Line 69: `it("checks fresh user and memberships for each concurrent request", async () => {`
  - Source: `server/src/test/authCache.test.ts:69`

- Line 84: `it("invalidates cached memberships when a role changes", async () => {`
  - Source: `server/src/test/authCache.test.ts:84`

- Line 98: `it("invalidates the cached user on profile/password updates and hydrates a savable document", async () => {`
  - Source: `server/src/test/authCache.test.ts:98`

- Line 120: `it("denies a member revoked on another replica even with a warm local cache", async () => {`
  - Source: `server/src/test/authCache.test.ts:120`

- Line 135: `it("denies admin-only routes after a role downgrade on another replica", async () => {`
  - Source: `server/src/test/authCache.test.ts:135`

- Line 149: `it("still rejects unknown org ids and non-member orgs", async () => {`
  - Source: `server/src/test/authCache.test.ts:149`

## `server/src/test/autopilot.test.ts`

- Line 12: `describe("autopilot API", () => {`
  - Source: `server/src/test/autopilot.test.ts:12`

- Line 48: `it("creates a plan, simulates, approves, and executes tool calls", async () => {`
  - Source: `server/src/test/autopilot.test.ts:48`

## `server/src/test/billingDunning.test.ts`

- Line 14: `describe("Multi-Currency Billing & Automated Dunning Retry Workflows", () => {`
  - Source: `server/src/test/billingDunning.test.ts:14`

- Line 36: `it("retrieves clean dunning state when subscription is active", async () => {`
  - Source: `server/src/test/billingDunning.test.ts:36`

- Line 59: `it("simulates payment failure, initiates 7-day grace period, and checks dunning status", async () => {`
  - Source: `server/src/test/billingDunning.test.ts:59`

- Line 111: `it("executes payment retry recovery, restores active subscription, and creates invoice", async () => {`
  - Source: `server/src/test/billingDunning.test.ts:111`

- Line 166: `it("lists invoices with multi-currency localized conversion and formats", async () => {`
  - Source: `server/src/test/billingDunning.test.ts:166`

## `server/src/test/billingWebhookAlias.test.ts`

- Line 6: `describe("versioned Stripe webhook route", () => {`
  - Source: `server/src/test/billingWebhookAlias.test.ts:6`

- Line 7: `it("preserves the raw request body for the canonical /api/v1 alias", async () => {`
  - Source: `server/src/test/billingWebhookAlias.test.ts:7`

## `server/src/test/budgetHealth.test.ts`

- Line 15: `describe("Budget Health & Guardrails - Predictive Spending Limits", () => {`
  - Source: `server/src/test/budgetHealth.test.ts:15`

- Line 28: `it("calculates predictive spending limits, safe daily allowance, and dynamically detects overshoot risk", async () => {`
  - Source: `server/src/test/budgetHealth.test.ts:28`

- Line 200: `it("returns clean empty predictive limits when no budgets are defined", async () => {`
  - Source: `server/src/test/budgetHealth.test.ts:200`

- Line 226: `it("generates proactive debt payoff acceleration recommendation when debts with high APR exist", async () => {`
  - Source: `server/src/test/budgetHealth.test.ts:226`

- Line 273: `it.each([`
  - Source: `server/src/test/budgetHealth.test.ts:273`

- Line 298: `it("uses the active debt facts without imposing a minimum savings amount", async () => {`
  - Source: `server/src/test/budgetHealth.test.ts:298`

- Line 325: `it("executes POST /api/finance/budgets/:periodKey/rebalance preserving total planned budget across envelopes", async () => {`
  - Source: `server/src/test/budgetHealth.test.ts:325`

- Line 390: `it("rejects invalid rebalancing requests with 400", async () => {`
  - Source: `server/src/test/budgetHealth.test.ts:390`

## `server/src/test/calendarReminders.test.ts`

- Line 9: `describe("Calendar Reminders API & Batch Management", () => {`
  - Source: `server/src/test/calendarReminders.test.ts:9`

- Line 34: `it("creates reminders, lists with date range filters, and toggles completion", async () => {`
  - Source: `server/src/test/calendarReminders.test.ts:34`

- Line 109: `it("supports batch completing and clearing completed reminders", async () => {`
  - Source: `server/src/test/calendarReminders.test.ts:109`

- Line 171: `it("enforces multi-tenant organization and user isolation", async () => {`
  - Source: `server/src/test/calendarReminders.test.ts:171`

## `server/src/test/chatDocumentRequest.test.ts`

- Line 4: `describe("Chat document request titles", () => {`
  - Source: `server/src/test/chatDocumentRequest.test.ts:4`

- Line 5: `it.each([`
  - Source: `server/src/test/chatDocumentRequest.test.ts:5`

- Line 12: `it("preserves explicit content and quoted punctuation", () => {`
  - Source: `server/src/test/chatDocumentRequest.test.ts:12`

- Line 17: `it("keeps existing unquoted title and format support", () => {`
  - Source: `server/src/test/chatDocumentRequest.test.ts:17`

## `server/src/test/chatV1.test.ts`

- Line 74: `describe("chat v1 API", () => {`
  - Source: `server/src/test/chatV1.test.ts:74`

- Line 102: `it("routes general Bharat Voice questions through AI Core and leaves ledger questions local", async () => {`
  - Source: `server/src/test/chatV1.test.ts:102`

- Line 130: `it("disables local demo sign-in by default", async () => {`
  - Source: `server/src/test/chatV1.test.ts:130`

- Line 137: `it("sends only the explicit public question to web research and rejects file attachments", async () => {`
  - Source: `server/src/test/chatV1.test.ts:137`

- Line 172: `it("answers a current-month spending question from the caller’s ledger without AI Core", async () => {`
  - Source: `server/src/test/chatV1.test.ts:172`

- Line 230: `it("surfaces AI overload as retryable without storing an orphan question", async () => {`
  - Source: `server/src/test/chatV1.test.ts:230`

- Line 243: `it("does not save or reuse canned advice if conversational inference is unavailable", async () => {`
  - Source: `server/src/test/chatV1.test.ts:243`

- Line 263: `it("keeps ledger questions available after AI quota is exhausted and reports quota details for model requests", async () => {`
  - Source: `server/src/test/chatV1.test.ts:263`

- Line 282: `it("regenerates an answer without storing a second user question", async () => {`
  - Source: `server/src/test/chatV1.test.ts:282`

- Line 303: `it("keeps safe provider recovery details after reloading a conversation", async () => {`
  - Source: `server/src/test/chatV1.test.ts:303`

- Line 322: `it("creates a real PDF from chat, persists its card, and enforces file ownership", async () => {`
  - Source: `server/src/test/chatV1.test.ts:322`

- Line 353: `it("downloads a local PDF with no Files record and preserves ownership", async () => {`
  - Source: `server/src/test/chatV1.test.ts:353`

- Line 378: `it("drafts a cloud text file with one model call and keeps it in Files", async () => {`
  - Source: `server/src/test/chatV1.test.ts:378`

- Line 402: `it("indexes verified physical pages of a generated multipage PDF", async () => {`
  - Source: `server/src/test/chatV1.test.ts:402`

- Line 421: `it("keeps the PDF usable without inventing pages when verification fails", async () => {`
  - Source: `server/src/test/chatV1.test.ts:421`

- Line 442: `it("creates a saved-activity PDF using only the current user's records", async () => {`
  - Source: `server/src/test/chatV1.test.ts:442`

- Line 483: `it("asks for document contents instead of creating an unrelated financial plan", async () => {`
  - Source: `server/src/test/chatV1.test.ts:483`

- Line 495: `it("keeps previous document questions as context when summarizing conversations", async () => {`
  - Source: `server/src/test/chatV1.test.ts:495`

- Line 547: `it("creates, sends, lists, renames, and deletes chat sessions on /api", async () => {`
  - Source: `server/src/test/chatV1.test.ts:547`

- Line 623: `it("retains attached PDF citations and confidence in the response and reloaded conversation", async () => {`
  - Source: `server/src/test/chatV1.test.ts:623`

- Line 651: `it("persists an autopilot run when tool calls are present", async () => {`
  - Source: `server/src/test/chatV1.test.ts:651`

- Line 729: `describe("explicit chat document intent", () => {`
  - Source: `server/src/test/chatV1.test.ts:729`

- Line 730: `it.each(["How do I create a PDF?", "Don't create a document. Explain fees.", "Show the PDF fee", "Explain this text: Create a document. Content: do something", "Create a spreadsheet titled Budget. Content: 25"])("does not create files for %s", message => {`
  - Source: `server/src/test/chatV1.test.ts:730`

- Line 733: `it("uses only the creation instruction for title and preserves the supplied body", () => {`
  - Source: `server/src/test/chatV1.test.ts:733`

- Line 737: `it("accepts a quoted document title", () => {`
  - Source: `server/src/test/chatV1.test.ts:737`

## `server/src/test/clientErrors.test.ts`

- Line 26: `describe("client error ingestion", () => {`
  - Source: `server/src/test/clientErrors.test.ts:26`

- Line 27: `it("acknowledges a structured report and writes one correlated event", async () => {`
  - Source: `server/src/test/clientErrors.test.ts:27`

- Line 37: `it("rejects raw messages, URL-bearing frames, and non-JSON reports", async () => {`
  - Source: `server/src/test/clientErrors.test.ts:37`

- Line 45: `it("caps the number of reports logged per source IP", async () => {`
  - Source: `server/src/test/clientErrors.test.ts:45`

## `server/src/test/commandCenter.test.ts`

- Line 12: `describe("Financial Command Center - Multi-Account Consolidated Netting", () => {`
  - Source: `server/src/test/commandCenter.test.ts:12`

- Line 24: `it("calculates multi-account consolidated netting across liquid, investment, and credit accounts", async () => {`
  - Source: `server/src/test/commandCenter.test.ts:24`

- Line 111: `it("detects credit deficit state and triggers act_now priority signal", async () => {`
  - Source: `server/src/test/commandCenter.test.ts:111`

- Line 154: `it("detects high credit utilization (>50% of cash reserve) and triggers review_this_week signal", async () => {`
  - Source: `server/src/test/commandCenter.test.ts:154`

## `server/src/test/conversationInsightsCache.test.ts`

- Line 47: `describe("conversation insight result reuse", () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:47`

- Line 48: `it("reuses unchanged context despite key order and request timestamps", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:48`

- Line 60: `it.each([`
  - Source: `server/src/test/conversationInsightsCache.test.ts:60`

- Line 74: `it("separates users and workspaces in both key and database scope", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:74`

- Line 82: `it("enforces expiry before MongoDB's TTL cleanup", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:82`

- Line 89: `it("explicit Refresh bypasses a valid snapshot", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:89`

- Line 97: `it("limits degraded replies to fifteen seconds", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:97`

- Line 105: `it("coalesces concurrent requests for the same owned context", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:105`

- Line 116: `it("does not cache a failed computation or leave it in flight", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:116`

- Line 123: `it("cache storage failures do not fail a successful AI response", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:123`

- Line 129: `it("can disable caching without bypassing AI execution", async () => {`
  - Source: `server/src/test/conversationInsightsCache.test.ts:129`

## `server/src/test/csrf.test.ts`

- Line 7: `describe("csrf protection", () => {`
  - Source: `server/src/test/csrf.test.ts:7`

- Line 14: `it("issues a csrf token cookie and echoes the token", async () => {`
  - Source: `server/src/test/csrf.test.ts:14`

- Line 23: `it("allows unsafe requests without CSRF when JWT cookie is absent", async () => {`
  - Source: `server/src/test/csrf.test.ts:23`

- Line 27: `it("blocks unsafe cookie-authenticated requests without a matching csrf header", async () => {`
  - Source: `server/src/test/csrf.test.ts:27`

## `server/src/test/deadLetterQueue.test.ts`

- Line 7: `it("records handled receipt-event failures and existing background failures in the same queue", async () => {`
  - Source: `server/src/test/deadLetterQueue.test.ts:7`

- Line 18: `it("evicts the oldest failure at the queue bound", () => {`
  - Source: `server/src/test/deadLetterQueue.test.ts:18`

## `server/src/test/documentAuthorship.test.ts`

- Line 16: `describe("Document Authorship & Rich Layout API (POST /api/files/authored-document)", () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:16`

- Line 38: `it("rejects unauthenticated requests with 401", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:38`

- Line 45: `it("does not invent financial figures when the owner has no saved profile", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:45`

- Line 56: `it("uses workspace currency, retains zero balances and reports negative cash flow", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:56`

- Line 75: `it("rejects invalid request body with 400", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:75`

- Line 88: `it("authors an Executive Financial Brief with KPI cards and table schedules", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:88`

- Line 137: `it("authors a Tax Preparation Summary pre-populated with user financial profile data", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:137`

- Line 172: `it("authors a Cash Flow & Envelope Burn Audit document with variance calculations", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:172`

- Line 213: `it("authors a Debt Amortization Schedule with Avalanche priority ordering", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:213`

- Line 242: `it("authors a Consolidated Balance Sheet with Assets - Liabilities = Net Worth conservation", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:242`

- Line 272: `it("authors a Standard Custom Document parsing rich markdown blocks, tables, and callouts", async () => {`
  - Source: `server/src/test/documentAuthorship.test.ts:272`

## `server/src/test/documentQA.test.ts`

- Line 16: `describe("Document Q&A Semantic Evaluation & Grounding API (POST /api/files/qa)", () => {`
  - Source: `server/src/test/documentQA.test.ts:16`

- Line 37: `it("rejects unauthenticated requests with 401", async () => {`
  - Source: `server/src/test/documentQA.test.ts:37`

- Line 44: `it("rejects invalid request body with 400", async () => {`
  - Source: `server/src/test/documentQA.test.ts:44`

- Line 57: `it("preserves source currency and does not invent physical pages for unpaginated text", async () => {`
  - Source: `server/src/test/documentQA.test.ts:57`

- Line 80: `it("answers tax questions with exact physical page retention and citations", async () => {`
  - Source: `server/src/test/documentQA.test.ts:80`

- Line 139: `it("quotes adjacent checklist items from the same physical page", async () => {`
  - Source: `server/src/test/documentQA.test.ts:139`

- Line 158: `it("scopes question answering to explicitly selected files", async () => {`
  - Source: `server/src/test/documentQA.test.ts:158`

- Line 232: `it("safely handles out-of-scope inquiries with clean non-hallucination rejection", async () => {`
  - Source: `server/src/test/documentQA.test.ts:232`

- Line 277: `it("strictly enforces multi-tenant isolation across different organizations", async () => {`
  - Source: `server/src/test/documentQA.test.ts:277`

## `server/src/test/e2e/tier1_feature_coverage.test.ts`

- Line 29: `describe("Tier 1: Feature Coverage — FinWise Bharat Voice", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:29`

- Line 46: `describe("1.1 Indic Dialect Speech-to-Text Recognition (Prisma v3.0)", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:46`

- Line 63: `it('transcribes spoken audio in ${dialect.name} (${dialect.code})', async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:63`

- Line 84: `it("transcribes audio payload via JSON audioBase64 encoding", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:84`

- Line 108: `describe("1.2 Prisma STT Operating Modes", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:108`

- Line 109: `it("handles mode 'transcribe' with normalized Indic grammar", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:109`

- Line 126: `it("handles mode 'code-mix' preserving Hinglish technical & brand terms", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:126`

- Line 142: `it("handles mode 'verbatim' capturing spoken utterance nuances", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:142`

- Line 158: `it("handles mode 'transliterate' with phonetic Romanized representation", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:158`

- Line 174: `it("handles language 'auto' by detecting primary Indic language profile", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:174`

- Line 194: `describe("1.3 Timbre Text-to-Speech Synthesis & Voice Options", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:194`

- Line 195: `it("synthesizes natural female voice in Hindi (hi-IN) with valid WAV buffer", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:195`

- Line 219: `it("synthesizes male voice in Tamil (ta-IN) with pitch & speed modulations", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:219`

- Line 238: `it("synthesizes celebratory emotion with <emphasis> audio tags", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:238`

- Line 256: `it("synthesizes cautionary alert with <pauses> tag for budget overrun", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:256`

- Line 274: `it("synthesizes assertive BFSI debt collection prosody with numerical clarity", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:274`

- Line 296: `describe("1.4 Evon Reasoning & Financial Entity Extraction", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:296`

- Line 297: `it("extracts Kirana provision expense and commits to ledger", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:297`

- Line 319: `it("extracts food & dining expense from Hinglish Swiggy utterance", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:319`

- Line 338: `it("extracts multi-item Kirana purchase (atta and cooking oil)", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:338`

- Line 356: `it("extracts rural Mandi agricultural input purchase", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:356`

- Line 374: `it("extracts high-value gold investment in Telugu", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:374`

- Line 393: `it("extracts transport commute fare via Ola cabs on credit card", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:393`

- Line 411: `it("extracts utility electricity bill payment via net banking", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:411`

- Line 433: `describe("1.5 BFSI Khata & Localized Debt Reminders", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:433`

- Line 434: `it("extracts informal Hindi debt note and generates spoken collection reminder", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:434`

- Line 454: `it("extracts Telugu debt record and generates spoken Telugu reminder", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:454`

- Line 473: `it("extracts debt repayment collected record in Tamil", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:473`

- Line 491: `it("extracts Hinglish merchant credit with weekly due date", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:491`

- Line 509: `it("extracts borrowed loan record from friend", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:509`

- Line 531: `describe("1.6 Conversational Voice Q&A & Ledger Reasoning", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:531`

- Line 532: `it("answers Hindi monthly remaining balance inquiry", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:532`

- Line 551: `it("identifies top spending category in Hindi query", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:551`

- Line 568: `it("answers Telugu monthly total expenditure inquiry", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:568`

- Line 585: `it("answers Tamil savings query with localized voice response", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:585`

- Line 601: `it("evaluates high-level budget status from Hinglish voice query", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:601`

- Line 621: `describe("1.7 Speech Acoustics & Compliance Analytics", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:621`

- Line 622: `it("measures acoustics, SNR improvement, and positive sentiment", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:622`

- Line 641: `it("verifies RBI Fair Practices debt collection code compliance", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:641`

- Line 659: `it("verifies authentic human liveness via Voice Biometrics shield", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:659`

- Line 675: `it("evaluates Indic dialect phonetic fidelity and Dravidian regional classification", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:675`

- Line 691: `it("computes code-mixed loan word ratio for Hinglish utterance", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:691`

- Line 710: `describe("1.8 Platform Telemetry & Languages Catalog", () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:710`

- Line 711: `it("returns supported Indic languages catalog with native scripts (GET /api/v1/voice/languages)", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:711`

- Line 728: `it("returns platform status, 5000 credits, and sovereign model registry (GET /api/v1/voice/status)", async () => {`
  - Source: `server/src/test/e2e/tier1_feature_coverage.test.ts:728`

## `server/src/test/e2e/tier2_boundary_corner.test.ts`

- Line 34: `describe("Tier 2: Boundary & Corner Cases — FinWise Bharat Voice", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:34`

- Line 51: `describe("2.1 Empty & Zero-Length Audio Buffers & Missing Inputs", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:51`

- Line 52: `it("rejects request lacking both audio recording and transcript with HTTP 400 MISSING_INPUT", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:52`

- Line 66: `it("rejects voice query lacking both audio recording and query text with HTTP 400 MISSING_QUERY", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:66`

- Line 80: `it("rejects Khata request lacking both audio recording and transcript with HTTP 400 MISSING_TRANSCRIPT", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:80`

- Line 94: `it("handles 44-byte WAV header with 0 data samples gracefully without server crash", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:94`

- Line 109: `it("rejects multipart request lacking both audio file and transcript fields with HTTP 400", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:109`

- Line 125: `describe("2.2 Corrupted Audio Bytes & Broken Magic Bytes", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:125`

- Line 126: `it("handles truncated 12-byte RIFF header safely without unhandled exception", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:126`

- Line 139: `it("handles arbitrary ASCII text payload safely without buffer decoder crash", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:139`

- Line 151: `it("handles spoofed JPEG file uploaded as audio/wav safely", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:151`

- Line 163: `it("handles corrupted fmt chunk (subchunk1Size = 0) with graceful fallback", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:163`

- Line 175: `it("handles odd byte-length PCM stream without 16-bit word boundary alignment failure", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:175`

- Line 191: `describe("2.3 Narrowband 8kHz Telephonic Audio & Frequency Filtering", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:191`

- Line 192: `it("processes 8kHz audio with telephonic=true and logs 21.6 dB SNR improvement", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:192`

- Line 210: `it("processes 8kHz audio with telephonic=false without failure", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:210`

- Line 226: `it("filters 50Hz electrical hum in telephonic audio pipeline", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:226`

- Line 242: `it("evaluates speech analytics for telephonic audio streams", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:242`

- Line 260: `it("extracts expense from telephonic audio with code-mixed Hinglish", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:260`

- Line 280: `describe("2.4 High Background Street & Bazaar Noise", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:280`

- Line 281: `it("applies noise suppression on low SNR (3 dB) street audio", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:281`

- Line 298: `it("extracts expense cleanly despite simulated traffic rumble", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:298`

- Line 315: `it("verifies confidence remains high (>= 0.88) on noisy audio input", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:315`

- Line 330: `it("evaluates silence ratio and speech rate in background noise environment", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:330`

- Line 348: `it("verifies anti-spoof human liveness verification in noisy environments", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:348`

- Line 367: `describe("2.5 Zero, Negative & Extreme Numerical Amounts", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:367`

- Line 368: `it("rejects a zero-rupee expense", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:368`

- Line 383: `it("parses salary and sales credit as income transaction", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:383`

- Line 400: `it("normalizes colloquial Indic fraction 'dedh hazaar' to 1500", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:400`

- Line 416: `it("normalizes colloquial Indic fraction 'dhai sau' to 250", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:416`

- Line 432: `it("handles large high-value property or gold amount (15,00,000) without integer overflow", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:432`

- Line 453: `describe("2.6 Missing, Invalid & Expired Credentials", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:453`

- Line 454: `it("rejects unauthenticated request with HTTP 401 Unauthorized", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:454`

- Line 462: `it("rejects request with malformed JWT token with HTTP 401 Unauthorized", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:462`

- Line 470: `it("rejects state-mutating POST with mismatched CSRF token with HTTP 403 CSRF_FAILED", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:470`

- Line 482: `it("rejects request with malformed hexadecimal x-org-id with HTTP 400 or 403", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:482`

- Line 493: `it("operates gracefully in deterministic fallback mode when GNANI_API_KEY is unset", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:493`

- Line 521: `describe("2.7 Payload Size Limits & Text Constraints", () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:521`

- Line 522: `it("rejects oversized audio upload (>10MB) via Multer limit", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:522`

- Line 534: `it("rejects speech synthesis text exceeding 4,000 characters with HTTP 400", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:534`

- Line 550: `it("rejects synthesis speaking rate exceeding maximum 2.0 with HTTP 400", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:550`

- Line 564: `it("rejects synthesis pitch exceeding maximum +10 with HTTP 400", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:564`

- Line 578: `it("rejects synthesis empty or whitespace-only text with HTTP 400", async () => {`
  - Source: `server/src/test/e2e/tier2_boundary_corner.test.ts:578`

## `server/src/test/e2e/tier3_cross_feature.test.ts`

- Line 33: `describe("Tier 3: Cross-Feature Pipelines — FinWise Bharat Voice", () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:33`

- Line 47: `it("leaves expense drafts out of the ledger and saves the reviewed amount only once", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:47`

- Line 69: `describe("3.1 Complete Speech-to-Ledger Commitment Pipeline", () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:69`

- Line 70: `it("ingests spoken Hindi audio, transcribes, extracts via Evon, commits to ledger, and confirms via Timbre", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:70`

- Line 121: `describe("3.2 Telephonic Ingestion + Noise Suppression + Hinglish Extraction + Expressive TTS", () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:121`

- Line 122: `it("processes narrowband 8kHz audio with telephonic DSP filtering and Hinglish extraction", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:122`

- Line 159: `describe("3.3 BFSI Khata Debt Note -> Spoken WhatsApp Reminder -> Settlement", () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:159`

- Line 160: `it("tracks informal Indian debt note, synthesizes localized WhatsApp audio reminder, and reconciles settlement", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:160`

- Line 206: `describe("3.4 Conversational Voice Financial Health Check over Live Ledger", () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:206`

- Line 207: `it("reports a cash flow shortfall from the ledger with honest fallback attribution", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:207`

- Line 263: `describe("3.5 Multi-Profile Simulation Engine & Resilience Switching", () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:263`

- Line 264: `it("executes lightning-fast offline mock pipeline in < 200ms", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:264`

- Line 282: `it("synthesizes valid audible chime (~25KB) in offline mock TTS mode", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:282`

- Line 302: `it("leaves the ledger intact when live transcription is unavailable", async () => {`
  - Source: `server/src/test/e2e/tier3_cross_feature.test.ts:302`

## `server/src/test/e2e/tier4_real_world.test.ts`

- Line 25: `describe("Tier 4: Real-World Personas — FinWise Bharat Voice", () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:25`

- Line 42: `describe("Scenario 4.1: Kirana Store Daily Cash & UPI Sales Tally", () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:42`

- Line 43: `it("records daily evening shop closing sales and inventory restock payment", async () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:43`

- Line 94: `describe("Scenario 4.2: Street Commuter Auto Fare & Shared Travel Split", () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:94`

- Line 95: `it("records urban auto-rickshaw commute fare paid by cash", async () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:95`

- Line 124: `describe("Scenario 4.3: Rural Mandi Harvest Sales & Agricultural Inputs", () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:124`

- Line 125: `it("records APMC Mandi harvest crop income and tractor fuel expense", async () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:125`

- Line 164: `describe("Scenario 4.4: Informal Micro-Merchant Hand Loans (Udhar / Baki Khata)", () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:164`

- Line 165: `it("manages tea stall vendor Udhar credit and WhatsApp collection reminder lifecycle", async () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:165`

- Line 209: `describe("Scenario 4.5: Festival Shopping & Gold Purchase", () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:209`

- Line 210: `it("records Dhanteras gold jewellery purchase in Telugu via PhonePe UPI", async () => {`
  - Source: `server/src/test/e2e/tier4_real_world.test.ts:210`

## `server/src/test/ensureProfileRace.test.ts`

- Line 11: `describe("ensureProfile concurrent first access", () => {`
  - Source: `server/src/test/ensureProfileRace.test.ts:11`

- Line 17: `it("returns the profile created by a concurrent request when create hits E11000", async () => {`
  - Source: `server/src/test/ensureProfileRace.test.ts:17`

- Line 27: `it("still surfaces non-duplicate errors", async () => {`
  - Source: `server/src/test/ensureProfileRace.test.ts:27`

- Line 33: `it("creates a default profile scoped to org and user when none exists", async () => {`
  - Source: `server/src/test/ensureProfileRace.test.ts:33`

## `server/src/test/envConfig.test.ts`

- Line 34: `describe("environment config", () => {`
  - Source: `server/src/test/envConfig.test.ts:34`

- Line 35: `it.each([["0", 0], ["1", 1], ["2", 2], ["true", true], ["false", false]])(`
  - Source: `server/src/test/envConfig.test.ts:35`

- Line 43: `it("treats localhost and 127.0.0.1 as equivalent local origins", () => {`
  - Source: `server/src/test/envConfig.test.ts:43`

- Line 53: `it("rejects wildcard credentialed CORS configuration", () => {`
  - Source: `server/src/test/envConfig.test.ts:53`

- Line 58: `it("requires the AI Core token in production", () => {`
  - Source: `server/src/test/envConfig.test.ts:58`

## `server/src/test/errorHandler.test.ts`

- Line 51: `describe("errorHandler", () => {`
  - Source: `server/src/test/errorHandler.test.ts:51`

- Line 62: `it.each([`
  - Source: `server/src/test/errorHandler.test.ts:62`

- Line 72: `describe("HttpError handling", () => {`
  - Source: `server/src/test/errorHandler.test.ts:72`

- Line 73: `it("returns correct status code for HttpError", () => {`
  - Source: `server/src/test/errorHandler.test.ts:73`

- Line 87: `it("returns 401 for unauthorized errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:87`

- Line 94: `it("returns 403 for forbidden errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:94`

- Line 101: `it("returns 404 for not found errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:101`

- Line 108: `it("includes details when provided", () => {`
  - Source: `server/src/test/errorHandler.test.ts:108`

- Line 123: `describe("ZodError handling", () => {`
  - Source: `server/src/test/errorHandler.test.ts:123`

- Line 124: `it("returns 400 with VALIDATION_ERROR code", () => {`
  - Source: `server/src/test/errorHandler.test.ts:124`

- Line 141: `describe("upload errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:141`

- Line 142: `it("returns 413 FILE_TOO_LARGE for oversized uploads instead of 500", () => {`
  - Source: `server/src/test/errorHandler.test.ts:142`

- Line 148: `it("returns 400 INVALID_UPLOAD for other multer limits", () => {`
  - Source: `server/src/test/errorHandler.test.ts:148`

- Line 155: `describe("Mongoose errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:155`

- Line 156: `it("handles CastError with 400 status", () => {`
  - Source: `server/src/test/errorHandler.test.ts:156`

- Line 169: `it("does not expose Mongoose validation values or messages", () => {`
  - Source: `server/src/test/errorHandler.test.ts:169`

- Line 184: `describe("Unknown errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:184`

- Line 185: `it("returns 500 for unknown errors", () => {`
  - Source: `server/src/test/errorHandler.test.ts:185`

- Line 198: `it("does not expose internal error details", () => {`
  - Source: `server/src/test/errorHandler.test.ts:198`

- Line 208: `describe("response format", () => {`
  - Source: `server/src/test/errorHandler.test.ts:208`

- Line 209: `it("always includes success, message, code, and request_id", () => {`
  - Source: `server/src/test/errorHandler.test.ts:209`

- Line 223: `it("includes null data field", () => {`
  - Source: `server/src/test/errorHandler.test.ts:223`

## `server/src/test/exports.test.ts`

- Line 17: `describe("exports API", () => {`
  - Source: `server/src/test/exports.test.ts:17`

- Line 46: `it("blocks exports on free plan", async () => {`
  - Source: `server/src/test/exports.test.ts:46`

- Line 57: `it("creates and downloads a transactions CSV export", async () => {`
  - Source: `server/src/test/exports.test.ts:57`

- Line 98: `it("supports custom column selection in transactions CSV export", async () => {`
  - Source: `server/src/test/exports.test.ts:98`

- Line 147: `it("creates and downloads a monthly summary PDF export", async () => {`
  - Source: `server/src/test/exports.test.ts:147`

## `server/src/test/exportSchemas.test.ts`

- Line 4: `describe("createExportBodySchema transactions_csv date window", () => {`
  - Source: `server/src/test/exportSchemas.test.ts:4`

- Line 7: `it("accepts open-ended and forward date windows", () => {`
  - Source: `server/src/test/exportSchemas.test.ts:7`

- Line 13: `it("rejects inverted or empty windows that can only produce an empty export", () => {`
  - Source: `server/src/test/exportSchemas.test.ts:13`

- Line 20: `it("leaves monthly PDF exports unaffected", () => {`
  - Source: `server/src/test/exportSchemas.test.ts:20`

## `server/src/test/fileTextExtraction.test.ts`

- Line 11: `describe("PDF text extraction", () => {`
  - Source: `server/src/test/fileTextExtraction.test.ts:11`

- Line 12: `it("retains physical page boundaries including leading, middle and trailing blank pages", async () => {`
  - Source: `server/src/test/fileTextExtraction.test.ts:12`

- Line 29: `it("gives an explicitly parsed single-page PDF page 1 without inventing pages for old text", async () => {`
  - Source: `server/src/test/fileTextExtraction.test.ts:29`

- Line 36: `it("does not turn a blank PDF into page-marker evidence", async () => {`
  - Source: `server/src/test/fileTextExtraction.test.ts:36`

- Line 44: `it("keeps extraction bounded and warns when later content is omitted", async () => {`
  - Source: `server/src/test/fileTextExtraction.test.ts:44`

## `server/src/test/financeBudgets.test.ts`

- Line 17: `describe("finance budget allocation endpoints", () => {`
  - Source: `server/src/test/financeBudgets.test.ts:17`

- Line 48: `it("lists, upserts, and deletes budget allocations with tenant isolation", async () => {`
  - Source: `server/src/test/financeBudgets.test.ts:48`

- Line 143: `it("validates input formats and rejects unauthorized modifications", async () => {`
  - Source: `server/src/test/financeBudgets.test.ts:143`

## `server/src/test/financeIntelligence.test.ts`

- Line 19: `describe("finance intelligence endpoints", () => {`
  - Source: `server/src/test/financeIntelligence.test.ts:19`

- Line 50: `it("returns budget envelopes with spent and remaining", async () => {`
  - Source: `server/src/test/financeIntelligence.test.ts:50`

- Line 130: `it("detects recurring candidates from transactions", async () => {`
  - Source: `server/src/test/financeIntelligence.test.ts:130`

- Line 160: `it("returns a baseline forecast projection", async () => {`
  - Source: `server/src/test/financeIntelligence.test.ts:160`

- Line 248: `it("returns critical cashflow alerts when projected runway is low", async () => {`
  - Source: `server/src/test/financeIntelligence.test.ts:248`

## `server/src/test/financeMultiCurrencyBudgets.test.ts`

- Line 16: `describe("Finance OS Multi-Currency FX Budgets, Envelopes & Forecast", () => {`
  - Source: `server/src/test/financeMultiCurrencyBudgets.test.ts:16`

- Line 30: `it("normalizes a native INR allocation and invalidates a previously read envelope", async () => {`
  - Source: `server/src/test/financeMultiCurrencyBudgets.test.ts:30`

- Line 51: `it("converts budget allocations and envelopes across global currencies (EUR, GBP, JPY, INR) with tenant isolation", async () => {`
  - Source: `server/src/test/financeMultiCurrencyBudgets.test.ts:51`

## `server/src/test/financeSchemasValidation.test.ts`

- Line 9: `describe("finance period keys", () => {`
  - Source: `server/src/test/financeSchemasValidation.test.ts:9`

- Line 10: `it("accepts real months and rejects month 00/13", () => {`
  - Source: `server/src/test/financeSchemasValidation.test.ts:10`

- Line 19: `describe("recurring rule bodies", () => {`
  - Source: `server/src/test/financeSchemasValidation.test.ts:19`

- Line 20: `it("rejects unparsable cron expressions", () => {`
  - Source: `server/src/test/financeSchemasValidation.test.ts:20`

- Line 27: `it("rejects amount_min greater than amount_max", () => {`
  - Source: `server/src/test/financeSchemasValidation.test.ts:27`

## `server/src/test/fixtureDatabase.test.ts`

- Line 6: `describe("sample content database", () => {`
  - Source: `server/src/test/fixtureDatabase.test.ts:6`

- Line 7: `it("requires an explicit isolated local fixture database", () => {`
  - Source: `server/src/test/fixtureDatabase.test.ts:7`

- Line 13: `it.each([`
  - Source: `server/src/test/fixtureDatabase.test.ts:13`

## `server/src/test/followThrough.test.ts`

- Line 22: `describe("Personalized Follow-Through & Activity Signal Ranking Engine", () => {`
  - Source: `server/src/test/followThrough.test.ts:22`

- Line 46: `describe("Service Tier: Follow-Through Engine", () => {`
  - Source: `server/src/test/followThrough.test.ts:46`

- Line 47: `it("extracts multi-source signals and enforces deterministic priority scoring [0, 100]", async () => {`
  - Source: `server/src/test/followThrough.test.ts:47`

- Line 134: `it("strictly ranks overdue tasks ahead of future tasks", async () => {`
  - Source: `server/src/test/followThrough.test.ts:134`

- Line 177: `it("learns preferences from feedback and boosts upvoted domain score", async () => {`
  - Source: `server/src/test/followThrough.test.ts:177`

- Line 219: `it("filters out dismissed signals from recommendation list", async () => {`
  - Source: `server/src/test/followThrough.test.ts:219`

- Line 252: `describe("REST API Endpoints", () => {`
  - Source: `server/src/test/followThrough.test.ts:252`

- Line 253: `it("GET /api/follow-through/recommendations returns 200 with ranked items", async () => {`
  - Source: `server/src/test/followThrough.test.ts:253`

- Line 283: `it("POST /api/follow-through/feedback records user action and updates preferences", async () => {`
  - Source: `server/src/test/followThrough.test.ts:283`

- Line 303: `it("GET and PUT /api/follow-through/preferences mutates user focus domains", async () => {`
  - Source: `server/src/test/followThrough.test.ts:303`

- Line 334: `it("enforces tenant boundary isolation between different organizations", async () => {`
  - Source: `server/src/test/followThrough.test.ts:334`

- Line 366: `it("rejects unauthenticated requests with 401 Unauthorized", async () => {`
  - Source: `server/src/test/followThrough.test.ts:366`

## `server/src/test/goalDeadlineSchema.test.ts`

- Line 6: `describe("goal deadline validation", () => {`
  - Source: `server/src/test/goalDeadlineSchema.test.ts:6`

- Line 7: `it("accepts calendar dates and ISO timestamps", () => {`
  - Source: `server/src/test/goalDeadlineSchema.test.ts:7`

- Line 13: `it("rejects strings that are not dates", () => {`
  - Source: `server/src/test/goalDeadlineSchema.test.ts:13`

## `server/src/test/goalsAndDebtsMultiCurrency.test.ts`

- Line 9: `describe("goals & debts multi-currency FX localization", () => {`
  - Source: `server/src/test/goalsAndDebtsMultiCurrency.test.ts:9`

- Line 34: `it("normalizes goals and debts into EUR with 0.92 FX conversion and euro currency metadata", async () => {`
  - Source: `server/src/test/goalsAndDebtsMultiCurrency.test.ts:34`

- Line 90: `it("normalizes goals and debts into JPY with integer rounding", async () => {`
  - Source: `server/src/test/goalsAndDebtsMultiCurrency.test.ts:90`

- Line 122: `it("strictly validates currency query bounds", async () => {`
  - Source: `server/src/test/goalsAndDebtsMultiCurrency.test.ts:122`

## `server/src/test/googleAuth.test.ts`

- Line 39: `describe("Google OAuth sign-in", () => {`
  - Source: `server/src/test/googleAuth.test.ts:39`

- Line 93: `it("GET /auth/providers reflects configuration", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:93`

- Line 107: `it("derives the callback URL from CLIENT_URL when GOOGLE_CALLBACK_URL is unset", () => {`
  - Source: `server/src/test/googleAuth.test.ts:107`

- Line 114: `it("starts the flow with state + PKCE and a signed httpOnly state cookie", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:114`

- Line 128: `it("creates a new user + personal org and issues the session cookies", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:128`

- Line 149: `it("requires 2FA after Google OAuth, expires the challenge, and consumes it only once", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:149`

- Line 179: `it("honours a sanitised ?next= and ignores open-redirect attempts", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:179`

- Line 191: `it("links an existing e-mail account when Google reports the e-mail as verified", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:191`

- Line 210: `it("drops unproven credentials when linking a never-verified e-mail account", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:210`

- Line 228: `it("rejects a Google e-mail that is not verified (no user, no session)", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:228`

- Line 237: `it("does not link an account already bound to a different Google id", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:237`

- Line 251: `it("rejects a state mismatch, a missing state cookie and a tampered cookie", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:251`

- Line 271: `it("redirects with google_denied when the user cancels at Google", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:271`

- Line 278: `it("redirects with google_failed when the token exchange fails", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:278`

- Line 286: `it("a Google-only account cannot sign in with a password", async () => {`
  - Source: `server/src/test/googleAuth.test.ts:286`

## `server/src/test/healthDeep.test.ts`

- Line 7: `describe("GET /healthz/deep", () => {`
  - Source: `server/src/test/healthDeep.test.ts:7`

- Line 10: `it("probes database, dead letters, and external services", async () => {`
  - Source: `server/src/test/healthDeep.test.ts:10`

## `server/src/test/httpPath.test.ts`

- Line 4: `describe("HTTP log and metric paths", () => {`
  - Source: `server/src/test/httpPath.test.ts:4`

- Line 5: `it.each([`
  - Source: `server/src/test/httpPath.test.ts:5`

## `server/src/test/idempotency.test.ts`

- Line 58: `describe("idempotency middleware", () => {`
  - Source: `server/src/test/idempotency.test.ts:58`

- Line 59: `it("is a no-op without an Idempotency-Key header", async () => {`
  - Source: `server/src/test/idempotency.test.ts:59`

- Line 66: `it("replays the stored response for a retry with the same key and body", async () => {`
  - Source: `server/src/test/idempotency.test.ts:66`

- Line 82: `it("rejects a reused key carrying a different body with 422", async () => {`
  - Source: `server/src/test/idempotency.test.ts:82`

- Line 93: `it("runs the work once when duplicates arrive concurrently (second gets 409)", async () => {`
  - Source: `server/src/test/idempotency.test.ts:93`

- Line 118: `it("releases the key after a 5xx so the client's retry re-runs the work", async () => {`
  - Source: `server/src/test/idempotency.test.ts:118`

- Line 140: `it("scopes keys per user: the same key from two users runs twice", async () => {`
  - Source: `server/src/test/idempotency.test.ts:140`

- Line 147: `it("does not replay a financial response across organizations for the same user and key", async () => {`
  - Source: `server/src/test/idempotency.test.ts:147`

- Line 174: `it("does not replay a cached response when tenant resolution fails", async () => {`
  - Source: `server/src/test/idempotency.test.ts:174`

- Line 184: `it("rejects malformed keys with 400", async () => {`
  - Source: `server/src/test/idempotency.test.ts:184`

- Line 194: `it("ignores the header for unauthenticated requests", async () => {`
  - Source: `server/src/test/idempotency.test.ts:194`

- Line 201: `it("refuses a duplicate key on streaming routes instead of replaying", async () => {`
  - Source: `server/src/test/idempotency.test.ts:201`

- Line 220: `it("fails open when the store is unavailable", async () => {`
  - Source: `server/src/test/idempotency.test.ts:220`

- Line 234: `it("does not store responses larger than the replay cap, so a retry re-runs instead of replaying garbage", async () => {`
  - Source: `server/src/test/idempotency.test.ts:234`

- Line 250: `describe("MemoryIdempotencyStore", () => {`
  - Source: `server/src/test/idempotency.test.ts:250`

- Line 253: `it("claims atomically and honours TTL", async () => {`
  - Source: `server/src/test/idempotency.test.ts:253`

## `server/src/test/internalTools.test.ts`

- Line 10: `describe("internal tools API", () => {`
  - Source: `server/src/test/internalTools.test.ts:10`

- Line 38: `it("requires AI_CORE_TOOLS_TOKEN and bearer token", async () => {`
  - Source: `server/src/test/internalTools.test.ts:38`

- Line 56: `it("simulates and executes a tool call", async () => {`
  - Source: `server/src/test/internalTools.test.ts:56`

## `server/src/test/invites.test.ts`

- Line 15: `describe("org invites + audit API", () => {`
  - Source: `server/src/test/invites.test.ts:15`

- Line 72: `it("creates invite for unknown email, accepts it, and records audit events", async () => {`
  - Source: `server/src/test/invites.test.ts:72`

## `server/src/test/jobQueueHardening.test.ts`

- Line 36: `describe("job retry policy", () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:36`

- Line 37: `it("backs off exponentially with jitter inside [exp/2, exp] and caps at max", () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:37`

- Line 46: `it("treats validation-style failures as permanent", () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:46`

- Line 54: `describe("leader election", () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:54`

- Line 65: `it("redis: only one holder at a time, holder renews, release hands over", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:65`

- Line 74: `it("mongo fallback: atomic claim, renewal, and takeover after expiry", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:74`

- Line 85: `it("mongo fallback: concurrent contenders produce exactly one leader", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:85`

- Line 92: `it("falls back to mongo when redis throws", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:92`

- Line 106: `describe("queued job retries, dead-letter and replay", () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:106`

- Line 126: `it("requeues with backoff until max attempts, then dead-letters once", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:126`

- Line 156: `it("dead-letters immediately on permanent errors and clears the stored quota reservation on retry", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:156`

- Line 173: `it("admin lists dead letters (cursor paginated) and replays one exactly once", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:173`

- Line 221: `describe("newsletter delivery claim", () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:221`

- Line 229: `it("compare-and-set on lastSentAt lets exactly one replica claim a day's send", async () => {`
  - Source: `server/src/test/jobQueueHardening.test.ts:229`

## `server/src/test/jobRecovery.test.ts`

- Line 13: `describe("Job Recovery Service", () => {`
  - Source: `server/src/test/jobRecovery.test.ts:13`

- Line 29: `it("recovers orphaned running jobs older than the threshold", async () => {`
  - Source: `server/src/test/jobRecovery.test.ts:29`

- Line 128: `it("requeues a stale job with backoff while attempts remain (visibility timeout)", async () => {`
  - Source: `server/src/test/jobRecovery.test.ts:128`

## `server/src/test/journal.test.ts`

- Line 61: `describe("financial journal API", () => {`
  - Source: `server/src/test/journal.test.ts:61`

- Line 86: `it("recognizes handwriting and stores annotations", async () => {`
  - Source: `server/src/test/journal.test.ts:86`

- Line 105: `it("generates journal insights via AI core", async () => {`
  - Source: `server/src/test/journal.test.ts:105`

- Line 126: `it("patches recognized text and recomputes parsed intent", async () => {`
  - Source: `server/src/test/journal.test.ts:126`

## `server/src/test/journalIndexes.test.ts`

- Line 7: `describe("journal entry clientDraftId indexes", () => {`
  - Source: `server/src/test/journalIndexes.test.ts:7`

- Line 19: `it("allows many recognized entries without a draft id while deduplicating offline drafts", async () => {`
  - Source: `server/src/test/journalIndexes.test.ts:19`

- Line 27: `it("upgrades the legacy sparse index idempotently without losing records", async () => {`
  - Source: `server/src/test/journalIndexes.test.ts:27`

## `server/src/test/journalOfflineSyncAndSemanticSearch.test.ts`

- Line 10: `describe("Financial Journal Offline Sync & Semantic Vector Search API", () => {`
  - Source: `server/src/test/journalOfflineSyncAndSemanticSearch.test.ts:10`

- Line 50: `it("synchronizes offline notes batch and deduplicates by clientDraftId", async () => {`
  - Source: `server/src/test/journalOfflineSyncAndSemanticSearch.test.ts:50`

- Line 124: `it("performs semantic vector search with cosine similarity scoring and tag filtering", async () => {`
  - Source: `server/src/test/journalOfflineSyncAndSemanticSearch.test.ts:124`

- Line 178: `it("enforces strict multi-tenant isolation on batch sync and semantic search", async () => {`
  - Source: `server/src/test/journalOfflineSyncAndSemanticSearch.test.ts:178`

## `server/src/test/lifecycle.test.ts`

- Line 21: `describe("server timeouts", () => {`
  - Source: `server/src/test/lifecycle.test.ts:21`

- Line 22: `it("applies the keep-alive safe values to a real http.Server", () => {`
  - Source: `server/src/test/lifecycle.test.ts:22`

- Line 32: `it("keeps the orderings that prevent load-balancer 502s and invalid Node configs", () => {`
  - Source: `server/src/test/lifecycle.test.ts:32`

- Line 42: `describe("resolveShutdownConfig", () => {`
  - Source: `server/src/test/lifecycle.test.ts:42`

- Line 43: `it("is fast outside production", () => {`
  - Source: `server/src/test/lifecycle.test.ts:43`

- Line 48: `it("drains and waits long enough for in-flight AI calls in production", () => {`
  - Source: `server/src/test/lifecycle.test.ts:48`

- Line 56: `it("honours overrides and ignores invalid values", () => {`
  - Source: `server/src/test/lifecycle.test.ts:56`

- Line 69: `describe("/readyz draining", () => {`
  - Source: `server/src/test/lifecycle.test.ts:69`

- Line 80: `it("is ready before shutdown starts (control for the draining case)", async () => {`
  - Source: `server/src/test/lifecycle.test.ts:80`

- Line 87: `it("reports draining (503) once shutdown starts, even though the database is still healthy", async () => {`
  - Source: `server/src/test/lifecycle.test.ts:87`

- Line 99: `it("keeps /healthz (liveness) green while draining so the orchestrator does not kill the pod early", async () => {`
  - Source: `server/src/test/lifecycle.test.ts:99`

## `server/src/test/memoryIndexMigration.test.ts`

- Line 10: `describe("memoryRecord text index migration", () => {`
  - Source: `server/src/test/memoryIndexMigration.test.ts:10`

- Line 19: `it("replaces the legacy unscoped text index with the orgId-scoped one, idempotently", async () => {`
  - Source: `server/src/test/memoryIndexMigration.test.ts:19`

## `server/src/test/merchantEmbeddingClustering.test.ts`

- Line 18: `describe("Machine Learning Merchant Embedding Clustering Service (Batch 36)", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:18`

- Line 19: `it("generates 64-dimensional L2-normalized vector embeddings", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:19`

- Line 34: `it("sanitizes noisy bank statements and strips terminal codes", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:34`

- Line 44: `it("calculates high cosine similarity for merchant variants and low for orthogonal sectors", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:44`

- Line 57: `it("clusters noisy bank descriptions into canonical brand clusters with high semantic similarity", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:57`

- Line 90: `it("resolves canonical name using existing merchants in database", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:90`

- Line 113: `describe("Merchant Embedding Clustering API Integration (Batch 36)", () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:113`

- Line 179: `it("serves ML-clustered merchants with semantic similarity and confidence", async () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:179`

- Line 198: `it("applies merchant cluster normalization and clears review flags", async () => {`
  - Source: `server/src/test/merchantEmbeddingClustering.test.ts:198`

## `server/src/test/monetization.test.ts`

- Line 16: `describe("monetization APIs", () => {`
  - Source: `server/src/test/monetization.test.ts:16`

- Line 43: `it("returns plan catalog and resolved entitlements", async () => {`
  - Source: `server/src/test/monetization.test.ts:43`

- Line 57: `it("ingests internal usage events and updates usage counters", async () => {`
  - Source: `server/src/test/monetization.test.ts:57`

- Line 81: `it("never grants a credit pack without a verified payment", async () => {`
  - Source: `server/src/test/monetization.test.ts:81`

- Line 108: `it("keeps an empty invoice list read-only even for an active paid-tier subscription", async () => {`
  - Source: `server/src/test/monetization.test.ts:108`

- Line 117: `it("blocks stub checkout and simulated payment recovery in production", async () => {`
  - Source: `server/src/test/monetization.test.ts:117`

- Line 141: `it("revokes paid quotas for canceled and past-due plans without waiting for the cache TTL", async () => {`
  - Source: `server/src/test/monetization.test.ts:141`

- Line 161: `it("refuses annual Stripe checkout instead of billing the monthly recurring price", async () => {`
  - Source: `server/src/test/monetization.test.ts:161`

- Line 183: `it("creates a development-only stub checkout record without claiming a verified payment", async () => {`
  - Source: `server/src/test/monetization.test.ts:183`

## `server/src/test/newsletter.test.ts`

- Line 14: `describe("Newsletter Service, Personalized Dynamic HTML Charts & API", () => {`
  - Source: `server/src/test/newsletter.test.ts:14`

- Line 44: `it("collects financial data with rolling 7-day velocity trend, category percentages, and health pillars", async () => {`
  - Source: `server/src/test/newsletter.test.ts:44`

- Line 128: `it("renders personalized dynamic HTML email with 7-day velocity chart, category distribution bars, and health pillar meters", () => {`
  - Source: `server/src/test/newsletter.test.ts:128`

- Line 218: `it("handles GET /api/newsletter/preferences, PUT /preferences, and POST /preview with dynamic chart HTML", async () => {`
  - Source: `server/src/test/newsletter.test.ts:218`

## `server/src/test/noSqlInjection.test.ts`

- Line 64: `describe("NoSQL injection prevention", () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:64`

- Line 81: `it("strips $gt operator from request body", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:81`

- Line 92: `it("strips $ne operator from request body", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:92`

- Line 101: `it("strips $regex operator from request body", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:101`

- Line 110: `it("strips $in operator from request body", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:110`

- Line 119: `it("strips keys containing dots from request body", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:119`

- Line 132: `it("sanitizes nested objects with $ operators", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:132`

- Line 150: `it("sanitizes arrays containing objects with $ operators", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:150`

- Line 165: `it("allows legitimate data to pass through unchanged", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:165`

- Line 188: `it("handles null and primitive values in body correctly", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:188`

- Line 207: `it("full app strips $ operators from transaction creation body", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:207`

- Line 239: `it("strips deeply nested $ operators (3 levels deep)", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:239`

- Line 257: `it("strips mixed $ operators and dot keys in same object", async () => {`
  - Source: `server/src/test/noSqlInjection.test.ts:257`

## `server/src/test/openapiRoutesCoverage.test.ts`

- Line 37: `describe("OpenAPI contract drift", () => {`
  - Source: `server/src/test/openapiRoutesCoverage.test.ts:37`

- Line 38: `it("documents all mounted /api routes (path + method)", async () => {`
  - Source: `server/src/test/openapiRoutesCoverage.test.ts:38`

## `server/src/test/orgIsolation.test.ts`

- Line 27: `describe("org isolation across key endpoints", () => {`
  - Source: `server/src/test/orgIsolation.test.ts:27`

- Line 80: `it("keeps transactions, dashboard, exports, chat, and AI outputs scoped by X-Org-Id", async () => {`
  - Source: `server/src/test/orgIsolation.test.ts:80`

## `server/src/test/orgScopeEnforcement.test.ts`

- Line 13: `describe("orgScopePlugin enforcement", () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:13`

- Line 29: `it("is warn-only by default in tests and switchable via ORG_SCOPE_ENFORCE", async () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:29`

- Line 40: `describe("with enforcement on", () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:40`

- Line 45: `it("blocks unscoped reads on every newly guarded model, allows scoped ones", async () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:45`

- Line 57: `it("blocks unscoped aggregates and writes", async () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:57`

- Line 69: `it("bypass is explicit, requires a reason, and is scoped to the callback's async context", async () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:69`

- Line 85: `it("legacy no-org usage path (entitlements) keeps working under enforcement", async () => {`
  - Source: `server/src/test/orgScopeEnforcement.test.ts:85`

## `server/src/test/orgSeats.test.ts`

- Line 16: `describe("org team plan and seat enforcement", () => {`
  - Source: `server/src/test/orgSeats.test.ts:16`

- Line 44: `it("blocks team org creation on non-team plans", async () => {`
  - Source: `server/src/test/orgSeats.test.ts:44`

- Line 55: `it("blocks adding members when org plan is not team", async () => {`
  - Source: `server/src/test/orgSeats.test.ts:55`

- Line 82: `it("enforces team seat limits on member add and invite acceptance", async () => {`
  - Source: `server/src/test/orgSeats.test.ts:82`

## `server/src/test/outboundWebhook.test.ts`

- Line 5: `describe("outbound webhook validation", () => {`
  - Source: `server/src/test/outboundWebhook.test.ts:5`

- Line 6: `it.each([`
  - Source: `server/src/test/outboundWebhook.test.ts:6`

## `server/src/test/planContract.test.ts`

- Line 8: `describe("plan contract fixture", () => {`
  - Source: `server/src/test/planContract.test.ts:8`

- Line 9: `it("parses server/docs/contracts/plan.example.json", async () => {`
  - Source: `server/src/test/planContract.test.ts:9`

## `server/src/test/platformMetrics.test.ts`

- Line 36: `describe("platform metrics", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:36`

- Line 48: `it("exposes SSE, cache-layer, token/cost, canary, event-bus and DLQ series", async () => {`
  - Source: `server/src/test/platformMetrics.test.ts:48`

- Line 72: `it("emits per-org series only when METRICS_ORG_LABELS=true", async () => {`
  - Source: `server/src/test/platformMetrics.test.ts:72`

- Line 78: `it("is a no-op when metrics are disabled", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:78`

- Line 85: `it("tracks Mongo pool checkout pressure from driver CMAP events", async () => {`
  - Source: `server/src/test/platformMetrics.test.ts:85`

- Line 104: `describe("request id and traceparent", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:104`

- Line 105: `it("accepts conservative ids and replaces anything else", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:105`

- Line 115: `it("derives a stable trace id from the request id", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:115`

- Line 123: `it("aiCoreHeaders forwards X-Request-Id and traceparent together", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:123`

- Line 131: `describe("summary capacity configuration", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:131`

- Line 138: `it("keeps the previous defaults when no env is set", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:138`

- Line 150: `it("reads overrides and ignores invalid values", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:150`

- Line 158: `it("derives a measured estimate (Little's law) once enough samples exist, capped by the ceiling", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:158`

- Line 172: `it("flags saturation using the configured latency threshold", () => {`
  - Source: `server/src/test/platformMetrics.test.ts:172`

## `server/src/test/portfolioMultiCurrencyWht.test.ts`

- Line 9: `describe("portfolio multi-currency FX and dividend WHT localization", () => {`
  - Source: `server/src/test/portfolioMultiCurrencyWht.test.ts:9`

- Line 34: `it("normalizes portfolio totals and applies 15% DTAA dividend withholding tax in EUR", async () => {`
  - Source: `server/src/test/portfolioMultiCurrencyWht.test.ts:34`

- Line 143: `it("normalizes portfolio totals to JPY with integer rounding and 30% statutory withholding", async () => {`
  - Source: `server/src/test/portfolioMultiCurrencyWht.test.ts:143`

- Line 195: `it("validates currency and wht_rate input bounds strictly", async () => {`
  - Source: `server/src/test/portfolioMultiCurrencyWht.test.ts:195`

- Line 215: `it("ensures strict organization tenant isolation for portfolio analytics", async () => {`
  - Source: `server/src/test/portfolioMultiCurrencyWht.test.ts:215`

## `server/src/test/rateLimiting.test.ts`

- Line 20: `describe("rate limiting", () => {`
  - Source: `server/src/test/rateLimiting.test.ts:20`

- Line 23: `it("shares the credential attempt limit across canonical and compatibility login paths", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:23`

- Line 48: `it("allows requests under the rate limit", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:48`

- Line 54: `it("returns rate limit headers with each response", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:54`

- Line 63: `it("decrements remaining count on successive requests", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:63`

- Line 73: `it("blocks requests with 429 when general API rate limit is exceeded", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:73`

- Line 111: `it("auth rate limiter uses tighter limits than general rate limiter", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:111`

- Line 129: `it("rate limit key separates unauthenticated requests by IP", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:129`

- Line 142: `it("profile and CSRF reads do not exhaust credential-attempt limits; login still does", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:142`

- Line 162: `it("rate limit key uses user ID for authenticated requests", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:162`

- Line 175: `it("returns correct RATE_LIMITED code and message when blocked", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:175`

- Line 209: `it("health check endpoint is subject to rate limiting like other routes", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:209`

- Line 217: `it("diagnostics endpoint reports system health and dead letter stats", async () => {`
  - Source: `server/src/test/rateLimiting.test.ts:217`

## `server/src/test/rateLimitStore.test.ts`

- Line 62: `describe("shared rate-limit store", () => {`
  - Source: `server/src/test/rateLimitStore.test.ts:62`

- Line 63: `it("counts across two limiter instances (replicas) that share one Redis", async () => {`
  - Source: `server/src/test/rateLimitStore.test.ts:63`

- Line 74: `it("keeps separate counters per prefix", async () => {`
  - Source: `server/src/test/rateLimitStore.test.ts:74`

- Line 82: `it("returns undefined (default in-memory store) when Redis is not configured", () => {`
  - Source: `server/src/test/rateLimitStore.test.ts:82`

- Line 86: `it("falls back to a local counter when Redis fails, then recovers", async () => {`
  - Source: `server/src/test/rateLimitStore.test.ts:86`

- Line 118: `it("falls back when a Redis command is slower than the timeout", async () => {`
  - Source: `server/src/test/rateLimitStore.test.ts:118`

## `server/src/test/receipts.test.ts`

- Line 71: `describe("receipts OCR API", () => {`
  - Source: `server/src/test/receipts.test.ts:71`

- Line 96: `it("parses, confirms, and serves receipt media", async () => {`
  - Source: `server/src/test/receipts.test.ts:96`

- Line 159: `it("does not serve owned media from another active workspace or after membership revocation", async () => {`
  - Source: `server/src/test/receipts.test.ts:159`

- Line 184: `it("rejects confirmation with non-positive total amount via schema validation", async () => {`
  - Source: `server/src/test/receipts.test.ts:184`

- Line 209: `it("rejects a non-image upload before OCR, storage, or quota use", async () => {`
  - Source: `server/src/test/receipts.test.ts:209`

- Line 221: `it("defaults OCR currency hint to org currency when omitted", async () => {`
  - Source: `server/src/test/receipts.test.ts:221`

- Line 236: `it("deletes parsed receipts and blocks deletion after confirmation", async () => {`
  - Source: `server/src/test/receipts.test.ts:236`

## `server/src/test/redisEventBus.test.ts`

- Line 54: `describe("RedisEventBus (two replicas)", () => {`
  - Source: `server/src/test/redisEventBus.test.ts:54`

- Line 55: `it("delivers an event published on replica A to subscribers on replica B and A exactly once each", async () => {`
  - Source: `server/src/test/redisEventBus.test.ts:55`

- Line 74: `it("is tenant scoped: other orgs never see the event", async () => {`
  - Source: `server/src/test/redisEventBus.test.ts:74`

- Line 93: `it("stops delivering after the last local subscriber closes (unsubscribes the channel)", async () => {`
  - Source: `server/src/test/redisEventBus.test.ts:93`

- Line 111: `it("never loses same-replica delivery when Redis publishing fails", async () => {`
  - Source: `server/src/test/redisEventBus.test.ts:111`

- Line 126: `describe("scanDelete", () => {`
  - Source: `server/src/test/redisEventBus.test.ts:126`

- Line 151: `it("deletes only matching keys, paging with SCAN + UNLINK (never KEYS)", async () => {`
  - Source: `server/src/test/redisEventBus.test.ts:151`

- Line 162: `it("is non-fatal when Redis errors", async () => {`
  - Source: `server/src/test/redisEventBus.test.ts:162`

## `server/src/test/referrals.test.ts`

- Line 9: `describe("referrals", () => {`
  - Source: `server/src/test/referrals.test.ts:9`

- Line 25: `it("grants credits to both orgs on redemption (idempotent)", async () => {`
  - Source: `server/src/test/referrals.test.ts:25`

## `server/src/test/responseContext.test.ts`

- Line 8: `describe("responseContext middleware", () => {`
  - Source: `server/src/test/responseContext.test.ts:8`

- Line 21: `it("adds request_id to successful object responses", async () => {`
  - Source: `server/src/test/responseContext.test.ts:21`

- Line 28: `it("adds default error code when missing on error responses", async () => {`
  - Source: `server/src/test/responseContext.test.ts:28`

## `server/src/test/retrievalLifecycle.test.ts`

- Line 21: `describe("workspace retrieval lifecycle", () => {`
  - Source: `server/src/test/retrievalLifecycle.test.ts:21`

- Line 29: `it("indexes concurrent requests idempotently and repairs partial writes", async () => {`
  - Source: `server/src/test/retrievalLifecycle.test.ts:29`

- Line 42: `it("refreshes changed text, removes old tail chunks and clears stale page metadata", async () => {`
  - Source: `server/src/test/retrievalLifecycle.test.ts:42`

- Line 55: `it("retrieves relevant finance clauses without leaking another org, user, or deleted file", async () => {`
  - Source: `server/src/test/retrievalLifecycle.test.ts:55`

- Line 70: `it("keeps explicit selections scoped and does not widen an invalid selection", async () => {`
  - Source: `server/src/test/retrievalLifecycle.test.ts:70`

- Line 84: `it("deletes only chunks belonging to the requested file and owner", async () => {`
  - Source: `server/src/test/retrievalLifecycle.test.ts:84`

## `server/src/test/retrievalMultiModal.test.ts`

- Line 25: `describe("Multi-Modal Vector Indexing & Grounded Retrieval", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:25`

- Line 45: `describe("Unit: Modality Detection & Entity Extraction", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:45`

- Line 46: `it("detects table modality from CSV lines and markdown pipe tables", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:46`

- Line 54: `it("detects image_ocr modality from receipt markers and image sources", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:54`

- Line 59: `it("detects structured_data from JSON strings", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:59`

- Line 64: `it("detects standard prose as text modality", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:64`

- Line 69: `it("detects query modality intent", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:69`

- Line 76: `it("extracts financial entities: amounts, dates, currencies, and merchants", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:76`

- Line 87: `describe("Unit: 64-D Vector Embeddings & Hybrid Scoring", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:87`

- Line 88: `it("generates unit-length normalized vector embeddings", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:88`

- Line 100: `it("computes cosine similarity accurately between financial concepts", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:100`

- Line 112: `it("scores chunks with hybrid formula and verifies grounding threshold G >= 0.70", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:112`

- Line 136: `describe("Integration: End-to-End POST /api/files/search", () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:136`

- Line 137: `it("indexes multi-modal chunks and returns filtered results with citations", async () => {`
  - Source: `server/src/test/retrievalMultiModal.test.ts:137`

## `server/src/test/retrievalService.test.ts`

- Line 6: `describe("retrievalService", () => {`
  - Source: `server/src/test/retrievalService.test.ts:6`

- Line 7: `it("bounds unbroken OCR text and preserves its contents through overlapping windows", () => {`
  - Source: `server/src/test/retrievalService.test.ts:7`

- Line 16: `it("does not create a redundant overlap chunk at the end of an exact window", () => {`
  - Source: `server/src/test/retrievalService.test.ts:16`

- Line 20: `it("preserves page boundaries supplied by the extractor, including empty pages", () => {`
  - Source: `server/src/test/retrievalService.test.ts:20`

- Line 27: `it("omits blank chunks and removes null bytes", () => {`
  - Source: `server/src/test/retrievalService.test.ts:27`

- Line 33: `it("chunks long workspace text into multiple retrieval chunks", () => {`
  - Source: `server/src/test/retrievalService.test.ts:33`

- Line 51: `describe("pdfRequestServer", () => {`
  - Source: `server/src/test/retrievalService.test.ts:51`

- Line 52: `it("extracts headings and body sections from prompt text", () => {`
  - Source: `server/src/test/retrievalService.test.ts:52`

## `server/src/test/routeInventory.test.ts`

- Line 6: `describe("API route inventory", () => {`
  - Source: `server/src/test/routeInventory.test.ts:6`

- Line 7: `it("includes routes from the root-mounted domain routers", () => {`
  - Source: `server/src/test/routeInventory.test.ts:7`

- Line 21: `it("joins root routes and ignores middleware", () => {`
  - Source: `server/src/test/routeInventory.test.ts:21`

## `server/src/test/scenarios.test.ts`

- Line 44: `describe("scenario API", () => {`
  - Source: `server/src/test/scenarios.test.ts:44`

- Line 69: `it("accepts v2 scenario contract and returns normalized request context", async () => {`
  - Source: `server/src/test/scenarios.test.ts:69`

- Line 92: `it("keeps backward compatibility for legacy scenario payloads", async () => {`
  - Source: `server/src/test/scenarios.test.ts:92`

## `server/src/test/scheduledExports.test.ts`

- Line 14: `describe("Scheduled Recurring Exports & Automated Email Dispatch", () => {`
  - Source: `server/src/test/scheduledExports.test.ts:14`

- Line 42: `it("creates, lists, updates, runs on-demand, and deletes scheduled recurring export reports", async () => {`
  - Source: `server/src/test/scheduledExports.test.ts:42`

- Line 150: `it("blocks free tier organizations without export_access", async () => {`
  - Source: `server/src/test/scheduledExports.test.ts:150`

- Line 171: `it("validates input data when creating scheduled exports", async () => {`
  - Source: `server/src/test/scheduledExports.test.ts:171`

- Line 197: `it("creates, triggers on-demand, and verifies automated webhook push export delivery", async () => {`
  - Source: `server/src/test/scheduledExports.test.ts:197`

- Line 307: `it("rejects unconfigured cloud storage instead of reporting a false delivery", async () => {`
  - Source: `server/src/test/scheduledExports.test.ts:307`

## `server/src/test/secondFactorLogin.test.ts`

- Line 13: `describe("password sign-in with enabled 2FA", () => {`
  - Source: `server/src/test/secondFactorLogin.test.ts:13`

- Line 33: `it("withholds a session until the TOTP is verified and prevents reuse of that time step", async () => {`
  - Source: `server/src/test/secondFactorLogin.test.ts:33`

- Line 48: `it("consumes a recovery code only once across concurrent sign-ins", async () => {`
  - Source: `server/src/test/secondFactorLogin.test.ts:48`

- Line 57: `it("revokes pre-enrollment sessions even if another replica cached the user", async () => {`
  - Source: `server/src/test/secondFactorLogin.test.ts:57`

- Line 67: `it("enrollment rotates the session and invalidates its setup code", async () => {`
  - Source: `server/src/test/secondFactorLogin.test.ts:67`

- Line 101: `it("rejects wrong passwords even when the second factor is valid", async () => {`
  - Source: `server/src/test/secondFactorLogin.test.ts:101`

## `server/src/test/securityHeaders.test.ts`

- Line 44: `describe("security headers middleware", () => {`
  - Source: `server/src/test/securityHeaders.test.ts:44`

- Line 53: `it("sets X-Content-Type-Options to nosniff", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:53`

- Line 58: `it("sets X-Frame-Options to DENY", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:58`

- Line 63: `it("sets X-XSS-Protection to 0 (disabled in favor of CSP)", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:63`

- Line 68: `it("sets Referrer-Policy to strict-origin-when-cross-origin", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:68`

- Line 73: `it("sets Cache-Control to no-store", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:73`

- Line 80: `it("sets Pragma to no-cache for HTTP/1.0 backward compatibility", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:80`

- Line 85: `it("sets HSTS header when hsts option is enabled (production)", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:85`

- Line 93: `it("does NOT set HSTS header when hsts option is disabled (non-production)", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:93`

- Line 98: `it("removes X-Powered-By header", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:98`

- Line 103: `it("sets Permissions-Policy to disable camera, microphone, geolocation, payment, usb", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:103`

- Line 114: `it("full app also removes X-Powered-By", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:114`

- Line 120: `describe("security headers on full app (createApp)", () => {`
  - Source: `server/src/test/securityHeaders.test.ts:120`

- Line 123: `it("full app sets X-Content-Type-Options to nosniff", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:123`

- Line 128: `it("full app sets X-Frame-Options to DENY", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:128`

- Line 133: `it("full app sets Cache-Control with no-store", async () => {`
  - Source: `server/src/test/securityHeaders.test.ts:133`

## `server/src/test/services/gnaniVoiceService.test.ts`

- Line 40: `describe("Gnani AI Voice & Indic Speech Service", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:40`

- Line 41: `it("provides 12 supported Indic languages including Hindi, Telugu, Tamil and Hinglish", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:41`

- Line 51: `it("returns Challenge platform telemetry and 5,000 credits", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:51`

- Line 65: `it("transcribes audio using Prisma v3.0 in simulated/live mode with telephonic flag", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:65`

- Line 78: `it("synthesizes speech using Timbre in regional Indian voice", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:78`

- Line 91: `it("extracts structured financial transactions from Hindi spoken transcript", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:91`

- Line 102: `it("extracts structured investment transactions from Telugu spoken transcript", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:102`

- Line 113: `it("extracts structured dining transactions from Tamil spoken transcript", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:113`

- Line 123: `it("answers the spoken ledger question with one speech synthesis call", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:123`

- Line 144: `it("answers Telugu voice financial queries with localized synthesis", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:144`

- Line 159: `it("answers the remaining-budget question with saved limits and the top category", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:159`

- Line 178: `it("handles a naturally worded remaining-budget question", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:178`

- Line 187: `it("routes unsupported voice questions to Finance Chat when an educator is unavailable", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:187`

- Line 198: `it("returns a model-generated voice answer without speaking or displaying Markdown", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:198`

- Line 211: `it("extracts informal BFSI Khata/Udhar debt and generates collection speech reminder", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:211`

- Line 231: `it("qualifies MSME Mudra loans from spoken Hindi for Kanpur Tier-2 Kirana store with DSCR and EMI", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:231`

- Line 253: `it("qualifies spoken Telugu pharmacy loan for Warangal Tier-2 city with localized voice output", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:253`

- Line 268: `it("qualifies spoken Hinglish boutique loan in Indore with working capital credit line", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:268`

- Line 283: `it("analyzes speech acoustics, SNR improvement, sentiment, and RBI compliance", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:283`

- Line 300: `it("classifies BFSI debt collection intent with urgent sentiment and RBI debt code verification", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:300`

- Line 313: `describe("Synthetic Audible PCM Chime Generator", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:313`

- Line 314: `it("synthesizes valid 16kHz linear PCM WAV audio with canonical 44-byte RIFF header", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:314`

- Line 334: `it("generates non-silent, audible acoustic waveform with ascending harmonic chords", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:334`

- Line 353: `describe("MockGnaniVoiceProvider & Multi-Profile Simulation", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:353`

- Line 360: `it("executes STT, TTS, and NLU in instant mode within milliseconds (<25ms)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:360`

- Line 373: `it("synthesizes valid audio buffer and base64 string matching Timbre specs", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:373`

- Line 383: `it("injects deterministic chaos errors via keyword tags in chaos_error profile", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:383`

- Line 392: `it("supports profile switching and getter/setter", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:392`

- Line 400: `describe("Indic Multi-Script Numeral Normalization & Rural Presets", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:400`

- Line 407: `it("normalizes and extracts Devanagari numerals (४५० रुपये)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:407`

- Line 416: `it("extracts a complete Hindi rupee amount when speech recognition spells it out", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:416`

- Line 424: `it("normalizes and extracts Bengali numerals (৮৫০ টাকা)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:424`

- Line 433: `it("normalizes and extracts Telugu numerals (౨౫౦౦౦ రూపాయలు)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:433`

- Line 442: `it("extracts rural agriculture livelihood presets (khad, beej, mandi)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:442`

- Line 452: `it("extracts farm machinery fuel presets (tractor diesel)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:452`

- Line 461: `describe("BFSI Customer Care & UPI Dispute Redressal", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:461`

- Line 462: `it("extracts UTR, amount, and applies RBI T+1 TAT & ₹100/day penalty", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:462`

- Line 478: `it("handles Telugu UPI QR payment dispute with localized Timbre voice note", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:478`

- Line 491: `describe("Gnani Assist Real-Time Co-Pilot", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:491`

- Line 492: `it("generates Next-Best-Action and battle cards for Khata collections", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:492`

- Line 506: `it("generates Next-Best-Action for UPI disputes with RBI circular guidelines", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:506`

- Line 517: `it("generates Next-Best-Action for Tax Optimization and Vyapar Invoicing", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:517`

- Line 534: `describe("Spoken Bharat Tax & GST Copilot", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:534`

- Line 535: `it("computes FY 2024-25 New Regime tax with ₹75k standard deduction and Section 87A rebate", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:535`

- Line 551: `it("computes tax accurately for 8.5 Lakh income and compares Old vs New Regime", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:551`

- Line 565: `it("identifies Kirana 1% GST Composition eligibility from spoken query", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:565`

- Line 576: `describe("Autonomous Spoken Vyapar Billing & GST Invoicing", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:576`

- Line 577: `it("parses multi-item store basket and computes itemized totals with 18% GST", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:577`

- Line 596: `describe("Jan Kalyan Government Schemes Voice Navigator", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:596`

- Line 597: `it("evaluates street vendor query and recommends PM SVANidhi micro-credit with MoHUA guidelines", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:597`

- Line 612: `it("evaluates farmer query and recommends PM Kisan Samman Nidhi DBT", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:612`

- Line 624: `it("evaluates girl child query and recommends Sukanya Samriddhi Yojana (SSY)", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:624`

- Line 636: `it("synthesizes regional spoken guidance in Telugu via Timbre", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:636`

- Line 648: `describe("Zero-Trust Voice Biometrics & Liveness Authentication Shield", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:648`

- Line 649: `it("verifies genuine speaker passphrase with high spectral match and liveness token", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:649`

- Line 665: `it("detects and rejects loudspeaker acoustic replay and spoof attempts", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:665`

- Line 679: `describe("auditBpoContactCenterCallFromVoice (Gnani Aura Call QA)", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:679`

- Line 680: `it("evaluates a customer support call across 8 compliance checkpoints and calculates AQS", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:680`

- Line 701: `it("evaluates Healthcare Spoken Clinical Intake & Ayushman Bharat PM-JAY cashless hospital coverage", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:701`

- Line 718: `it("processes Connected Automobile In-Cabin Voice and FASTag recharge command with road noise filtering", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:718`

- Line 735: `it("evaluates Real Estate Spoken Property EMI & PMAY Housing Subsidy with exact mathematical invariants", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:735`

- Line 754: `it("evaluates Hospitality Spoken Concierge & Dining Reservation with Timbre TTS", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:754`

- Line 771: `it("evaluates Consumer Durables Warranty & AMC Support Desk with technician dispatch", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:771`

- Line 790: `describe("Voice Ledger Context Decoupling & Pluggable Architecture", () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:790`

- Line 796: `it("allows setting custom mock provider and repository", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:796`

- Line 816: `it("MongooseVoiceLedgerRepository delegates to in-memory store when disconnected without delay", async () => {`
  - Source: `server/src/test/services/gnaniVoiceService.test.ts:816`

## `server/src/test/services/liveGnaniVoiceProvider.test.ts`

- Line 6: `describe("Live Gnani speech API contract", () => {`
  - Source: `server/src/test/services/liveGnaniVoiceProvider.test.ts:6`

- Line 64: `it("uploads audio, the model and language hints as multipart fields", async () => {`
  - Source: `server/src/test/services/liveGnaniVoiceProvider.test.ts:64`

- Line 89: `it("requests a named Timbre voice and returns playable PCM WAV bytes", async () => {`
  - Source: `server/src/test/services/liveGnaniVoiceProvider.test.ts:89`

- Line 120: `it("retries a malformed successful Timbre response once", async () => {`
  - Source: `server/src/test/services/liveGnaniVoiceProvider.test.ts:120`

## `server/src/test/shares.test.ts`

- Line 10: `describe("share links API", () => {`
  - Source: `server/src/test/shares.test.ts:10`

- Line 27: `it("creates a financial story share link and serves it publicly", async () => {`
  - Source: `server/src/test/shares.test.ts:27`

- Line 78: `it("can include goal names when requested", async () => {`
  - Source: `server/src/test/shares.test.ts:78`

## `server/src/test/sse.test.ts`

- Line 124: `describe("SSE streamEvents", () => {`
  - Source: `server/src/test/sse.test.ts:124`

- Line 133: `it("returns 401 when user is missing", async () => {`
  - Source: `server/src/test/sse.test.ts:133`

- Line 140: `it("returns 401 when org context is missing", async () => {`
  - Source: `server/src/test/sse.test.ts:140`

- Line 148: `it("sets correct SSE headers on connection", async () => {`
  - Source: `server/src/test/sse.test.ts:148`

- Line 170: `it("sends initial ready event on connection", async () => {`
  - Source: `server/src/test/sse.test.ts:170`

- Line 191: `it("sends heartbeat comments to keep connection alive", async () => {`
  - Source: `server/src/test/sse.test.ts:191`

- Line 210: `it("cleans up on client disconnect (close event)", async () => {`
  - Source: `server/src/test/sse.test.ts:210`

- Line 228: `it("cleans up on client abort event", async () => {`
  - Source: `server/src/test/sse.test.ts:228`

- Line 245: `it("does not send multiple heartbeats before interval elapses", async () => {`
  - Source: `server/src/test/sse.test.ts:245`

- Line 263: `it("returns 400 for invalid last-event-id header", async () => {`
  - Source: `server/src/test/sse.test.ts:263`

## `server/src/test/summaryEndpoints.test.ts`

- Line 9: `describe("summary endpoints", () => {`
  - Source: `server/src/test/summaryEndpoints.test.ts:9`

- Line 34: `it("returns dashboard and portfolio aggregates from live data", async () => {`
  - Source: `server/src/test/summaryEndpoints.test.ts:34`

## `server/src/test/tasks.test.ts`

- Line 11: `describe("tasks API", () => {`
  - Source: `server/src/test/tasks.test.ts:11`

- Line 40: `it("creates tasks from a plan idempotently and updates status", async () => {`
  - Source: `server/src/test/tasks.test.ts:40`

- Line 130: `it("applies task effects across transactions and profile entities", async () => {`
  - Source: `server/src/test/tasks.test.ts:130`

- Line 276: `it("creates a single task directly via POST /api/tasks", async () => {`
  - Source: `server/src/test/tasks.test.ts:276`

## `server/src/test/tasksRecurrence.test.ts`

- Line 11: `describe("Tasks Recurring Cadence Automation & Auto-Renewal", () => {`
  - Source: `server/src/test/tasksRecurrence.test.ts:11`

- Line 23: `it("creates a recurring task with cadence and auto-renews next cycle on completion", async () => {`
  - Source: `server/src/test/tasksRecurrence.test.ts:23`

- Line 95: `it("completing a non-recurring task does not generate a next task instance", async () => {`
  - Source: `server/src/test/tasksRecurrence.test.ts:95`

- Line 134: `it("supports weekly recurrence cadence rolling forward by 7 days", async () => {`
  - Source: `server/src/test/tasksRecurrence.test.ts:134`

## `server/src/test/tasksWebhook.test.ts`

- Line 12: `describe("Tasks External Webhook Triggers & Third-Party Sync API", () => {`
  - Source: `server/src/test/tasksWebhook.test.ts:12`

- Line 41: `it("retrieves or generates the organization task webhook token", async () => {`
  - Source: `server/src/test/tasksWebhook.test.ts:41`

- Line 57: `it("creates a task via inbound webhook without session cookies (third-party trigger)", async () => {`
  - Source: `server/src/test/tasksWebhook.test.ts:57`

- Line 100: `it("completes a task and auto-renews recurring instance via inbound webhook", async () => {`
  - Source: `server/src/test/tasksWebhook.test.ts:100`

- Line 147: `it("dispatches selected tasks to an external webhook with Linear and Todoist formats", async () => {`
  - Source: `server/src/test/tasksWebhook.test.ts:147`

- Line 204: `it("rejects inbound webhook with invalid token", async () => {`
  - Source: `server/src/test/tasksWebhook.test.ts:204`

## `server/src/test/toolsV2.test.ts`

- Line 19: `describe("v2 tool handlers", () => {`
  - Source: `server/src/test/toolsV2.test.ts:19`

- Line 54: `it("supports finance lookup tools", async () => {`
  - Source: `server/src/test/toolsV2.test.ts:54`

- Line 150: `it("detects recurring candidates via tool", async () => {`
  - Source: `server/src/test/toolsV2.test.ts:150`

- Line 190: `it("recommends and applies budget allocations", async () => {`
  - Source: `server/src/test/toolsV2.test.ts:190`

- Line 246: `it("closes the month and optionally creates an export job", async () => {`
  - Source: `server/src/test/toolsV2.test.ts:246`

- Line 280: `it("sends an in-app notification via tool", async () => {`
  - Source: `server/src/test/toolsV2.test.ts:280`

- Line 309: `it("lists notifications via v1 API", async () => {`
  - Source: `server/src/test/toolsV2.test.ts:309`

## `server/src/test/transactionApproval.test.ts`

- Line 25: `it("retains approval on subsequent reads and unchanged edits, but reopens materially changed records", async () => {`
  - Source: `server/src/test/transactionApproval.test.ts:25`

- Line 36: `it("reopens approved records changed through a bulk write, including splits", async () => {`
  - Source: `server/src/test/transactionApproval.test.ts:36`

- Line 45: `it("does not approve another user's record through either endpoint", async () => {`
  - Source: `server/src/test/transactionApproval.test.ts:45`

- Line 55: `it("keeps bulk-approved records out of the review queue after a reload", async () => {`
  - Source: `server/src/test/transactionApproval.test.ts:55`

## `server/src/test/transactionIndexes.test.ts`

- Line 7: `describe("transaction external ID indexes", () => {`
  - Source: `server/src/test/transactionIndexes.test.ts:7`

- Line 20: `it("allows multiple manual transactions while enforcing imported IDs per organization", async () => {`
  - Source: `server/src/test/transactionIndexes.test.ts:20`

- Line 28: `it("upgrades the legacy sparse index idempotently without losing records", async () => {`
  - Source: `server/src/test/transactionIndexes.test.ts:28`

## `server/src/test/transactions.test.ts`

- Line 9: `describe("transactions API", () => {`
  - Source: `server/src/test/transactions.test.ts:9`

- Line 34: `it("creates, lists, updates, deletes, and paginates transactions", async () => {`
  - Source: `server/src/test/transactions.test.ts:34`

- Line 158: `it("returns monthly summaries, caches responses, and invalidates cache when transactions change", async () => {`
  - Source: `server/src/test/transactions.test.ts:158`

- Line 258: `it("supports bulk-categorize and bulk-delete with isolation and validation", async () => {`
  - Source: `server/src/test/transactions.test.ts:258`

## `server/src/test/transactionsCsvImportV1.test.ts`

- Line 10: `describe("transactions CSV import v1 API", () => {`
  - Source: `server/src/test/transactionsCsvImportV1.test.ts:10`

- Line 36: `it("imports a CSV file with mapping and dedupes by externalId", async () => {`
  - Source: `server/src/test/transactionsCsvImportV1.test.ts:36`

- Line 111: `it("returns structured row_errors for rows with invalid amounts or dates", async () => {`
  - Source: `server/src/test/transactionsCsvImportV1.test.ts:111`

## `server/src/test/transactionsImport.test.ts`

- Line 9: `describe("transactions import API", () => {`
  - Source: `server/src/test/transactionsImport.test.ts:9`

- Line 34: `it("imports transactions in bulk and returns accurate monthly summary", async () => {`
  - Source: `server/src/test/transactionsImport.test.ts:34`

## `server/src/test/transactionsMultiCurrencyClustering.test.ts`

- Line 11: `describe("Transactions Multi-Currency FX, Merchant Clustering & Bank Feed Ingestion (Batch 30)", () => {`
  - Source: `server/src/test/transactionsMultiCurrencyClustering.test.ts:11`

- Line 107: `it("normalizes transactions into EUR (0.92 rate) and JPY (155 rate with integer rounding)", async () => {`
  - Source: `server/src/test/transactionsMultiCurrencyClustering.test.ts:107`

- Line 146: `it("normalizes transactions summary aggregates into target currency", async () => {`
  - Source: `server/src/test/transactionsMultiCurrencyClustering.test.ts:146`

- Line 158: `it("detects and computes merchant clusters, then batch applies normalization", async () => {`
  - Source: `server/src/test/transactionsMultiCurrencyClustering.test.ts:158`

- Line 206: `it("ingests inbound bank feed webhook with deduplication and tenant isolation", async () => {`
  - Source: `server/src/test/transactionsMultiCurrencyClustering.test.ts:206`

## `server/src/test/transactionSplits.test.ts`

- Line 9: `describe("Transaction Splits API", () => {`
  - Source: `server/src/test/transactionSplits.test.ts:9`

- Line 34: `it("creates a transaction with split categories and retrieves them", async () => {`
  - Source: `server/src/test/transactionSplits.test.ts:34`

- Line 75: `it("updates an existing transaction with new splits via PATCH", async () => {`
  - Source: `server/src/test/transactionSplits.test.ts:75`

- Line 109: `it("rejects invalid split schemas (non-positive amounts)", async () => {`
  - Source: `server/src/test/transactionSplits.test.ts:109`

## `server/src/test/transactionsQuerySchema.test.ts`

- Line 4: `describe("listTransactionsQuerySchema needs_review", () => {`
  - Source: `server/src/test/transactionsQuerySchema.test.ts:4`

- Line 5: `it("parses query-string booleans without treating \"false\" as true", () => {`
  - Source: `server/src/test/transactionsQuerySchema.test.ts:5`

- Line 13: `it("rejects non-boolean needs_review values", () => {`
  - Source: `server/src/test/transactionsQuerySchema.test.ts:13`

## `server/src/test/transactionsV1.test.ts`

- Line 10: `describe("transactions v1 API", () => {`
  - Source: `server/src/test/transactionsV1.test.ts:10`

- Line 37: `it("supports create/list/summary/dashboard on /api with request context", async () => {`
  - Source: `server/src/test/transactionsV1.test.ts:37`

## `server/src/test/unifiedContext.test.ts`

- Line 18: `describe("Unified Ranked Memory, Document & Transaction Retrieval Engine", () => {`
  - Source: `server/src/test/unifiedContext.test.ts:18`

- Line 40: `describe("Service: retrieveUnifiedContext", () => {`
  - Source: `server/src/test/unifiedContext.test.ts:40`

- Line 41: `it("fuses memories, workspace document chunks, and transactions with Reciprocal Rank Fusion", async () => {`
  - Source: `server/src/test/unifiedContext.test.ts:41`

- Line 122: `it("enforces strict multi-tenant isolation across all three silos", async () => {`
  - Source: `server/src/test/unifiedContext.test.ts:122`

- Line 160: `it("respects source filtering parameters", async () => {`
  - Source: `server/src/test/unifiedContext.test.ts:160`

- Line 210: `describe("HTTP Controller: /api/search/unified-context", () => {`
  - Source: `server/src/test/unifiedContext.test.ts:210`

- Line 211: `it("GET /api/search/unified-context returns 200 with ranked results", async () => {`
  - Source: `server/src/test/unifiedContext.test.ts:211`

- Line 237: `it("POST /api/search/unified-context supports JSON payload with source filters", async () => {`
  - Source: `server/src/test/unifiedContext.test.ts:237`

- Line 272: `it("returns 400 when query parameter is missing or empty", async () => {`
  - Source: `server/src/test/unifiedContext.test.ts:272`

## `server/src/test/vnextPlatform.test.ts`

- Line 10: `describe("vNext platform surface", () => {`
  - Source: `server/src/test/vnextPlatform.test.ts:10`

- Line 39: `it("exposes enterprise tier and expanded usage limits", async () => {`
  - Source: `server/src/test/vnextPlatform.test.ts:39`

- Line 64: `it("manages feature flags, plugins, integrations, automation events, and analytics", async () => {`
  - Source: `server/src/test/vnextPlatform.test.ts:64`

- Line 183: `it("meters api key requests and workflow runs in usage", async () => {`
  - Source: `server/src/test/vnextPlatform.test.ts:183`

## `server/src/test/workflows.test.ts`

- Line 11: `describe("v1 workflows API", () => {`
  - Source: `server/src/test/workflows.test.ts:11`

- Line 40: `it("creates and runs a workflow (inline)", async () => {`
  - Source: `server/src/test/workflows.test.ts:40`

- Line 87: `it("runs workflow actions: export_report + send_notification", async () => {`
  - Source: `server/src/test/workflows.test.ts:87`

- Line 156: `it("creates a webhook workflow and executes it via external webhook POST with payload interpolation and multi-step branch conditions", async () => {`
  - Source: `server/src/test/workflows.test.ts:156`

- Line 247: `it("rejects webhook execution if workflow is disabled or token is invalid", async () => {`
  - Source: `server/src/test/workflows.test.ts:247`

- Line 289: `it("executes multi-step delay timer actions and records delays_executed in run result", async () => {`
  - Source: `server/src/test/workflows.test.ts:289`

## `server/src/test/workflowScheduler.test.ts`

- Line 11: `describe("workflow scheduler", () => {`
  - Source: `server/src/test/workflowScheduler.test.ts:11`

- Line 24: `it("executes cron workflows and advances nextRunAt", async () => {`
  - Source: `server/src/test/workflowScheduler.test.ts:24`

## `server/src/test/workspaceFileLifecycle.test.ts`

- Line 13: `describe("workspace file indexing API lifecycle", () => {`
  - Source: `server/src/test/workspaceFileLifecycle.test.ts:13`

- Line 38: `it("keeps PDF page numbers through upload, storage, on-demand indexing and AI evidence", async () => {`
  - Source: `server/src/test/workspaceFileLifecycle.test.ts:38`

- Line 63: `it("returns a usable PDF download URL with the right parameter and ownership checks", async () => {`
  - Source: `server/src/test/workspaceFileLifecycle.test.ts:63`

- Line 79: `it("rejects an empty upload without storing a broken file record", async () => {`
  - Source: `server/src/test/workspaceFileLifecycle.test.ts:79`

- Line 88: `it("indexes a long uploaded document and removes its evidence on deletion", async () => {`
  - Source: `server/src/test/workspaceFileLifecycle.test.ts:88`

- Line 98: `it("rejects deletion by another user and retains the owner's evidence", async () => {`
  - Source: `server/src/test/workspaceFileLifecycle.test.ts:98`

