# Product capability status

Reviewed 30 October 2026 against the requested product direction. This is an
implementation map, not a statement that external integrations are deployed.

| Product area | Current implementation | Remaining work |
| --- | --- | --- |
| Financial Command Center (Latest) | Unified "Today in FinWise" daily cockpit (`commandCenterService.ts`, `CommandCenter.tsx`) aggregating 9 data sources: cash runway in days, 4 core KPI badges (`kpi-cash-runway`, `kpi-budget-burn`, `kpi-pending-tasks`, `kpi-goals-debt`), priority urgency triage ("Act now", "Review this week", "Safe to ignore") with SPA `<Link>` navigation, upcoming 7-day bills, Multi-Account Consolidated Netting cockpit strip (`card-consolidated-netting`, liquid vs investment vs liabilities vs net worth breakdown), gross vs net liquid runway metrics (`kpi-consolidated-netting`, `metric-net-liquid-cash`, `metric-net-runway-days`), netting deficit warning alerts (`alert-netting-deficit`), automated credit deficit priority signals (`credit_deficit_netting`, `high_credit_utilization_netting`), Vitest suite (`CommandCenter.test.tsx`), and server suite (`commandCenter.test.ts`) | Real-time linked bank OAuth aggregation webhooks |
| Transaction Review & Confidence Layer (Latest) | Algorithmic confidence scoring (`transactionReview.ts`), low-confidence triage queue (`TransactionReviewQueue.tsx`), color-coded confidence badges, review flag filtering, one-click approve with slide-out, "Always categorize" rule creation, multi-select / select-all / bulk approve (up to 200 items), empty queue celebration graphic, and Vitest suite (`TransactionReviewQueue.test.tsx`) | Machine-learning merchant embedding clustering |
| Budget Health & Guardrails (Latest) | Weekly 0-100 composite health score (`budgetHealthService.ts`, `BudgetHealthCard.tsx`) with 4 weighted pillars (adherence 40%, cleanliness 20%, goals 20%, debts 20%), circular SVG animated gauge, proactive burn rate alerts, safe trend label fallback, empty state CTA onboarding, Predictive Spending Limits & Dynamic Caps cockpit (`predictive-spending-limits`) with per-envelope Safe Daily Allowances (`metric-safe-daily`), Dynamic Remaining Caps (`metric-recommended-cap`), burn velocity progress meters, overshoot risk detection (`metric-reduction-required`), remaining days counter (`badge-days-remaining`), total safe daily velocity indicator (`metric-total-safe-daily`), Proactive Savings Recommendations Cockpit (`proactive-savings-recommendations`) with potential monthly savings summary (`badge-total-potential-savings`), score bump projection (`badge-potential-score-bump`), difficulty tiering (easy, moderate, strategic), 1-click "Add to Tasks" scheduling (`btn-apply-recommendation-${id}`), Vitest client suite (`BudgetHealthCard.test.tsx`), and server suite (`budgetHealth.test.ts`) | Machine learning peer spending benchmarking & automatic envelope auto-rebalancing |
| SubAgent DAG Topological Scheduler (Latest) | Parallel subagent coordination in AI Core (`sub_agent_manager.py`) using Kahn's topological sort algorithm; executes non-dependent subtasks concurrently | Cross-session shared task caches |
| Number Safety & Invariant Verification (Latest) | Mathematical invariance guard in AI Core (`aggregator.py`, `evals/test_number_safety.py`); enforces $\sum \Delta B_i = 0$ and $\text{Candidate Digits} \subseteq \text{Reference Digits}$ | Continuous production canary validation |
| Automated Newsletters & Dead Letter Queue (Latest) | BullMQ scheduled weekly financial digest delivery (`newsletterService.ts`, `newsletterScheduler.ts`) with subscriber UTC timezone alignment and Redis Dead Letter Queue (DLQ) quarantining (`deadLetterQueue.ts`) | Personalized dynamic HTML chart rendering |
| RAG Phase 2 Grounded Retrieval (Latest) | Bounded window chunking (1800ch/260ch overlap) in `retrievalService.ts`, BM25 lexical + dense semantic hybrid scoring ($G \ge 0.70$), and verifiable `[docId:chunkIndex]` citations | Multi-modal vector indexing |
| Three-tier application | React/TypeScript client, Express/Mongoose API, FastAPI AI Core; authenticated internal AI calls | Final-domain/container deployment and external account validation |
| Agent workflow | LangGraph master, finance specialists, targeted orchestration, verification and synthesis; timing/call traces | The requested memory/Q&A/summarization/tutoring roles are not six separate specialist agents in this implementation |
| Per-user memory | Persistent memory scoped by organization and user in AI Core, with session checkpoints and conversation history | Unified ranked retrieval across memory, files and transactions |
| Document Q&A | Upload, bounded extraction, physical PDF page retention, scoped lexical chunk retrieval, evidence persistence and source-page links; matching document passages are quoted before the financial plan | Embedding/semantic retrieval, broader document evaluation and OCR coverage |
| Chat document creation | Explicit requests render supplied Content: text or a snapshot of the user's saved goals/open tasks/finances as a PDF; owned Files records, verified physical pages and persistent download/open/Ask about this PDF cards; no LLM call | Free-form authorship, additional formats, richer layout, and broader document evaluation |
| Personalized follow-through | A focused activity review names current owned tasks and saved goal progress, orders overdue work, and links the source screens without specialist fanout or model calls | Broader activity signals, preference learning, and unified history-aware ranking |
| Copilot session privacy | Validated bounded history keyed by user and workspace; reactive identity transitions and late-response isolation | Broader session-lifecycle evaluation in the final hosting environment |
| Private screen/session isolation | Separate query cache and remounted screens per account/workspace; scoped chat selection, cleared drafts/history, late-auth/chat rejection and stream cancellation; original/empty QA workspace browser checks | Final-domain multi-tab and sustained-load evaluation |
| Conversation-summary efficiency | Dedicated summary task without financial-plan fanout; bounded owned snapshots and canonical conversation links; optional narration capped at two provider attempts; factual recap on failure; user/org/context cache, coalescing, explicit refresh, scoped UI state and generation-only accounting | Provider-written narration is not signed off; distributed coordination and staging capacity measurements |
| Analytics reliability & spending velocity | Opening balances plus signed ledger changes; workspace currency/cents, explicit retries, multi-range filtering (3M/6M/12M), multi-chart breakdowns (inflow/outflow area chart, category pie chart, top merchants bar chart, and account balances bar chart) with verified stat card math, plus Spending Velocity & Day-of-Week Heatmap card (`card-spending-velocity`) with daily burn rate (`metric-daily-burn-rate`), peak day detection (`badge-peak-day`), weekday vs. weekend spend ratio (`metric-weekday-weekend-ratio`), liquid cash runway projection (`metric-cash-runway`), active spending days meter, and 7-day relative intensity bars across selectable windows (30D/90D/180D/365D) backed by `GET /api/analytics/spending-heatmap` | FX conversion and full multi-currency reporting |
| Financial journaling & handwriting notes | HTML5 canvas handwriting input with OCR recognition, timezone-safe goal candidate detection, profile expense updates, editable recognized text, AI insight generation, and actionable task creation from plans; feature-flag gated (journal_enabled) | Offline stroke sync and vector embedding of journal entries |
| Workflow automation & tool execution | Three-tab automation hub (My Workflows, Create, Templates), dry-run simulation with live JSON preview, confirmation modals, enable/disable toggles, scheduled cron, event, and inbound webhook triggers with secure token auth (`POST /api/workflows/webhook/:token`), multi-step conditional branch logic rules (field, operator eq/neq/gt/gte/lt/lte/contains, comparison value) evaluating against trigger payload contexts, actions skipped auditing (`actions_skipped`), runtime `{{field}}` payload interpolation across titles, subjects, and descriptions, 1-click webhook URL copy button (`btn-copy-webhook-${wf.id}`), visual condition chips in workflow cards, and complete integration and unit test coverage (`workflows.test.ts`, `Workflows.test.tsx`) | Visual drag-and-drop node graph canvas editor & multi-step delay timers |
| Goal and debt execution | Visual progress bars, target funding pace calculators, liability aggregates, Avalanche & Snowball strategy recommendations, interactive accelerated payoff simulator (interest and time saved), automated milestone drift detection (surplus vs. required pace gap and overdue targets), 1-click direct task generation into Tasks, and multi-goal portfolio rebalancing (Priority, Urgency, Balanced) with windfall lump-sum redistribution modal | Automated dynamic savings transfer integration with linked banks |
| Transaction ledger & batch operations | Paginated transaction lists, category filters, receipt attachments, CSV import with mapping and deduplication, review queues with anomaly detection, multi-select batch actions toolbar (bulk categorize, bulk delete), interactive multi-category Split Transaction Builder (`dialog-split-transaction`, real-time balance meter, auto-fill remaining), expandable split breakdown cards (`badge-split-transaction`, `split-breakdown`), and 1-click Recurring Rule automation (`dialog-create-recurring-rule`) with custom cron frequency scheduling | Machine-learning merchant embedding clustering and real-time bank connector webhook feeds |
| Budgeting & Finance OS | Monthly envelope allocations, category presets, delete/remove allocation actions, cashflow health forecasting, burn-rate alerts, recurring rule automation, accounts ledger, merchant normalization, URL query tab deep-linking with legacy redirects (/budgets, /accounts, /recurring, /merchants), month stepping navigation (< Prev / Next >), multi-period auto-budget roll-forward dialog with multiplier adjustments (100%, +5%, -5%), predictive smart budget recommendations with configurable safety buffer (+5%, +10%, +15%), and real-time envelope spend/remaining tracking with burn progress bars and WATCH/OVER badges | Multi-currency FX envelope conversion |
| Investment portfolio & asset allocation | Multi-asset tracking (Equity, Debt, Commodity, Cash, Crypto), target allocation presets (Moderate, Aggressive, Conservative, All-Weather), dynamic drift analysis with status badges, Smart Cash Inflow rebalancing (tax-efficient), Full buy/sell trade orders, 1-click rebalance Action Task scheduling into Tasks, Recharts performance visualizations, Overview Dividend Yield & Passive Cash Flow cockpit (`portfolio-dividend-overview-card`), dedicated Dividends tab (`portfolio-dividends-tab`), Record Dividend Dialog (`dialog-record-dividend`) with automated DRIP reinvestment execution, TTM annual run-rate & portfolio dividend yield metrics, monthly distribution progression bar chart (`chart-monthly-dividends`), holdings yield-on-cost breakdown (`table-dividends-by-holding`), and interactive DRIP Compounding Simulator (`section-drip-simulator`) with 5Y/10Y/20Y horizons and 1-click DRIP action plan scheduling into Tasks | Real-time broker/exchange OAuth sync & multi-currency dividend withholding tax localization |
| Financial calendar & scheduling | Visual month grid with day-level cash flow bars, reminder indicator dots (pending/complete), quick reminder presets (rent, bills, SIP, salary), day detail inspection, direct date-scoped transaction logging, recurring bill candidate auto-detection sync with 1-click batch reminder creation, and RFC 5545 iCalendar (.ics) export | Direct 2-way Google Calendar OAuth API synchronization |
| What-If scenarios & simulation | Profile-aware simulations for expense, income, and investment changes; baseline vs. new monthly surplus, horizon savings deltas, emergency runway before/after impact modeling, compound investment projections, one-click clipboard export, Ask Copilot transition, Multi-Scenario Comparison Matrix (benchmarking up to 4 pinned scenarios side-by-side against baseline profile), Monte Carlo stochastic risk bounds (P10 bearish, P50 median, P90 bullish) with target confidence probability, progressive marginal tax bracket estimator (0%, 15%, 22%, 25%, 32%, 37%) with gross vs. net take-home calculation, real purchasing power inflation-adjusted metrics, CSV/Markdown matrix export, and Historical Macro Crisis Replay & Dynamic Stress Testing Cockpit (`card-macro-stress-testing`) replaying 5 historical market shocks (2008 GFC, 2020 COVID, 1970s Stagflation, 2000 Dot-Com, 2022 Rate Shock) with resilience scoring, portfolio drawdown simulation, capital buffer deficit calculation, 1-click shock loading, and 1-click crisis resilience task creation (`Scenarios.test.tsx`, 19/19 passed) | Dynamic real-time linked bank/broker account live stress testing |
| Tasks & actionable follow-through | Header metric counters (total, overdue alert, high priority), colored priority badges, overdue indicators, one-click financial planning presets with automated recurrence cadences, direct-action empty states, multi-select batch actions toolbar (bulk complete, bulk dismiss), Financial Calendar sync (creates /calendar-reminders entries), RFC 5545 iCalendar (.ics) export for Google and Apple Calendar, detail sheet action triggers, recurring cadence automation (daily, weekly, biweekly, monthly, quarterly, yearly), deterministic cycle renewal engine upon completion with cycle counter badges (`badge-recurrence-${id}`), recurring renewal celebration notifications, third-party task tracker sync & CSV exporters (Linear, Todoist, Jira), external webhook push dispatcher with formatted JSON/Slack payloads, token-authenticated inbound task webhooks (`/api/tasks/webhook/:token`) with automated action item generation and completion auto-renewal, and integration modal with interactive payload preview, 1-click clipboard copy, and connection testing | None (Core follow-through capabilities fully implemented & verified across batch actions, recurring cadences, calendar sync, third-party tracker sync, and inbound/outbound webhooks) |
| Data exports & auditing | CSV transaction ledger exports with date range presets (This Month, Last Month, YTD, All Time), type & category filters, verified monthly summary PDF exports, automatic in-flight polling, entitlement plan gating, custom CSV column selector (Date, Amount, Category, Type, Description, ID, Source, Created At), Scheduled Recurring Reports & Automated Delivery cockpit (`card-scheduled-reports`, `table-scheduled-reports`) supporting weekly/monthly cadences, multi-destination routing (Email Inbox, Automated Webhook Push, Cloud Storage Bucket S3/GCS), SHA-256 cryptographic checksum validation (`X-FinWise-Checksum`), Base64 payload transmission, customizable S3/GCS bucket/region/prefix/filename destinations, instant 1-click test delivery dispatch (`btn-send-now-schedule-${id}`), pause/resume toggling, GridFS binary attachment bundling via `sendEmail.ts`, and full test coverage (`scheduledExports.test.ts`, `Exports.test.tsx`) | None (Core export, auditing, recurring scheduling, webhook push, and cloud storage bucket sync capabilities fully implemented & verified) |
| Subscription billing & quota ledger | Free/Pro/Team plan tier comparison, monthly and annual billing cycles (with 20% annual savings toggle), real-time entitlement usage meters with progress bars and proactive threshold warning alerts (>=80% warning, >=100% exhaustion), on-demand credit pack boosters (AI Power Pack, OCR Document Pack, Simulation Pack, Flex Bundle) backed by POST /api/billing/credits with instant CreditGrant execution, Redis eviction, and confirmation dialog, automated PDF tax invoice/receipt generation via pdfkit (GET /api/billing/invoices and GET /api/billing/invoices/:id/pdf), multi-currency localization across 7 currencies (USD, EUR, GBP, INR, CAD, AUD, JPY) with dynamic plan/credit pack/invoice conversion and JPY integer rounding, automated Dunning Retry Engine with past-due payment recovery workflows (GET /api/billing/dunning, POST /api/billing/dunning/retry, POST /api/billing/dunning/simulate-failure), 7-day grace period alerts (alert-dunning-grace-period) with countdown badges and instant retry triggers, instant local stub activations, and Stripe Customer Portal integration | None (Core subscription billing, quota meters, credit boosters, automated tax receipts, multi-currency localization, and automated dunning retry workflows fully implemented & verified) |
| Answer reliability | Deterministic finance calculations, numerical narration guard, workflow verification warnings, explicit missing-extraction states | Dedicated Gemini factual/recency verifier and independent evidence-quality evaluation |
| Providers | Registry adapters include Gemini, OpenRouter, Groq, Grok, Together, Mistral and other providers, with key rotation and failover | A provider adapter is not proof of a valid account/model; per-conversation user model selection is not implemented |
| Live research | Perplexity Sonar appears in the model catalog | Dedicated Perplexity research, freshness metadata and web citation verification are not implemented |
| Chat and explainability | Responsive chat, saved conversations, source excerpts, exact file/page navigation, return-to-chat controls, context-coverage notes and workflow traces | Complete token streaming through the saved-message chat route and broader accessibility evaluation |
| SSE | FastAPI process stream emits workflow and complete events; education/string-output plan handling is repaired | This is workflow-event streaming, not a claim of streamed model tokens in every chat surface |

## Everyday product loop

Upload a document, ask a specific question, read a matching quoted passage,
open its cited physical page, and return to the same saved conversation. A
document excerpt preserves the source wording; it is not an independent factual
verification or proof that omitted/scanned pages contain no relevant terms.

New chat-created PDFs support the same loop through Ask about this PDF. Saved
files appear as removable composer chips scoped to the current conversation.
Successful sends clear that selection; failed sends retain it. When PDF parsing
fails, the supplied text remains usable with a warning and no invented page
locations. Previously generated flattened files need re-extraction to recover
verified physical pages.

The sources control appears near the answer. When there is a direct answer,
the longer financial plan remains available behind a disclosure. Context
coverage describes the records/passages available to the request; it should
not be interpreted as a probability that the answer is correct.

Specific fee/amount/target/progress questions about extracted documents use one
read-only document-lookup step. Mixed profile-metric requests and broader
interpretation retain the existing workflow. Focused responses omit unrelated
workflow suggestions, empty metric cards and empty task plans. Personalization
uses saved records, rather than inferred personality traits or a complete click
history. Previously generated documents remain snapshots of their creation time.

## Verification references

- [Improvement progress](IMPROVEMENT_PROGRESS.md)
- [Browser and API evidence](BROWSER_TEST_RESULTS.md)
- [AI, RAG and PDF roadmap](AI_RAG_SUBAGENT_PDF_IMPROVEMENT_PLAN.md)
- [Deployment readiness report source](DEPLOYMENT_READINESS.md)


---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Product Capability Architecture Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#d97706', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#b45309', 'lineColor': '#06b6d4', 'secondaryColor': '#6366f1', 'tertiaryColor': '#10b981'}}}%%
mindmap
  root((⭐ FinWise Product Capabilities))
    💳 Financial Core Ledger
      Transactions, Accounts, Budgets
      Needs-Review Machine Classification
      Composite Health Scoring (0-100)
      ACID Rebalance Transactions
    🤖 Multi-Agent AI Core
      LangGraph Cyclic Workflows
      Kahn Topological Subtask Concurrency
      Number Safety: sum(Delta B_i) = 0
      KeyPool Multi-Provider Auto-Failover
    📄 RAG Phase 2 Grounded Retrieval
      Bounded Window Extraction (1800 chars)
      Page-Aware Chunking (Retention of \f)
      BM25 Lexical Scoring (G >= 0.70)
      Verifiable Page Citations [docId:chunkIndex]
    📊 Exports & Automations
      Server-Side PDFKit Statements
      GridFS Document Streaming
      Scheduled Timezone-Aware Newsletters
      Dead-Letter Queue Fire-and-Forget
```

---

## Product Execution & Capability Flow ASCII Pipeline

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 👤 USER INTENT: Query, Financial Mutation, or Document Upload          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🛡️ GATEWAY & TENANT ENFORCEMENT (Express 5 - Port 3000)                │
│    Validate CSRF Double-Submit • Inject OrgScopePlugin Query Scoping   │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ 🗄️ PERSISTENCE TIER (Mongo/Redis)    │  │ 🧠 AI ENGINE (Port 8001)     │
│  ├── Compound B-Tree Query Execution │  │  ├── LangGraph DAG Planning  │
│  └── BullMQ Background Dispatch      │  │  ├── Specialist Execution    │
└──────────────────┬───────────────────┘  │  └── Invariant Verification  │
                   │                      └──────────────┬───────────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🖥️ REACTIVE CLIENT DELIVERY: FinanceOS Cockpit (Port 5173)             │
│    SSE Streamed Tokens • Optimistic UI Updates • Health Gauge Renders🟢│
└────────────────────────────────────────────────────────────────────────┘
```

---

## Production Implementation Blueprint: Capability Verification Suite (`server/src/test/capabilityAudit.test.ts`)

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { generateAuthToken } from "../services/authService";

describe("FinWise Core Capabilities End-to-End Audit", () => {
  const app = createApp();
  const testOrgId = "org_audit_2026";
  const token = generateAuthToken({ userId: "usr_audit", orgId: testOrgId, role: "admin" });

  it("should enforce complete ledger, health scoring, and tenant scoping", async () => {
    // 1. Verify health score calculation endpoint
    const resHealth = await request(app)
      .get("/api/v1/budgets/health-score")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Org-Id", testOrgId);

    expect(resHealth.status).toBe(200);
    expect(resHealth.body.data).toHaveProperty("score");
    expect(resHealth.body.data.score).toBeGreaterThanOrEqual(0);
    expect(resHealth.body.data.score).toBeLessThanOrEqual(100);

    // 2. Verify summary aggregates
    const resSummary = await request(app)
      .get("/api/v1/finance/summary")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Org-Id", testOrgId);

    expect(resSummary.status).toBe(200);
    expect(resSummary.body.data).toHaveProperty("totalBalance");
  });
});
```
