# FinWise — AI Core & Multi-Agent System

> Comprehensive architectural reference for the Python-based multi-agent financial intelligence engine located in `server/AI_Core/`.

---

> [!TIP]
> **Extending the AI Core?**  
> For complete step-by-step blueprints on adding new specialist subagents, Pydantic V2 tool contracts, and LangGraph DAG nodes with number safety verification, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Overview

The **AI Core** provides the autonomous reasoning, financial calculation, and multi-agent coordination layer for FinWise. Built on **FastAPI**, **LangGraph**, and a custom **Topological SubAgent DAG Engine**, it coordinates domain specialists, enforces strict mathematical invariants, executes deterministic financial calculators, and provides multi-tiered failover across LLM providers.

Communication with the Node.js API gateway occurs over high-speed HTTP and Server-Sent Events (SSE) via the [`aiCoreClient`](file:///c:/Users/RAVIPRAKASH/personal-finance/server/src/services/aiCoreClient.ts) service.

---

## Directory Structure

```
server/AI_Core/
├── agents/
│   ├── __init__.py
│   ├── master_agent.py              # Central supervisor, intent classifier, synthesis coordinator
│   ├── sub_agent_manager.py         # Topological DAG scheduler, concurrent execution coordinator
│   ├── task_decomposer.py           # Intent parser into typed sub-task dependencies
│   ├── aggregator.py                # Multi-agent synthesis, conflict resolution, invariant checks
│   ├── income_expense_analyzer.py   # Spending patterns, anomaly detection, savings velocity
│   ├── budget_planner.py            # 50/30/20 & Zero-based budget generation and envelope adjustments
│   ├── investment_advisor.py        # Asset allocation, risk-adjusted returns, rebalancing models
│   ├── debt_optimizer.py            # Avalanche vs Snowball amortization and payoff schedules
│   ├── financial_educator.py        # Literacy, financial definitions, and tax explanations
│   └── newsletter_agent.py          # Curated digest generation and market summaries
├── evals/
│   ├── runner.py                    # Comprehensive test runner across all benchmarks
│   ├── metrics.py                   # Quantitative scoring, precision, recall, safety metrics
│   ├── test_number_safety.py        # Invariant verification: sum(Delta) == 0, non-negative bounds
│   ├── test_determinism.py          # Idempotency and reproducible output tests
│   ├── test_routing_accuracy.py     # Specialist intent classification precision
│   ├── test_plan_quality.py         # Financial plan coherence and actionable task validation
│   └── test_latency.py              # p50, p95, p99 latency benchmarks
├── lora/
│   ├── config.json                  # LoRA rank, alpha, dropout, target modules
│   ├── train.py                     # PEFT fine-tuning training loop
│   └── data/                        # Curated training and evaluation datasets
├── graph/
│   ├── state.py                     # AgentState TypedDict, AnalysisType enum, Pydantic models
│   └── workflow.py                  # LangGraph StateGraph with conditional routing and checkpoints
├── contracts/
│   ├── agent_outputs.py             # Pydantic V2 output contracts for specialist agents
│   ├── responses.py                 # Outward API response envelopes and schemas
│   ├── plan.py                      # Structured financial plan models
│   ├── trace.py                     # Execution trace, agent metadata, and timing models
│   └── tool_calls.py                # Actionable tool execution definitions
├── tools/
│   ├── financial_calculators.py     # Deterministic math: NPV, IRR, amortization, compound interest
│   ├── plan_builder.py              # Structured financial plan generator
│   └── data_processors.py           # Transaction filtering, aggregation, and statistical normalization
├── memory/
│   ├── state_store.py               # StateStore: MongoDB (default) or SQLite backend for sessions, checkpoints, memories
│   ├── store.py                     # MemoryStore facade: tenant-scoped lexical search over the StateStore
│   └── extract.py                   # Conversation memory, fact extraction, preference indexing
├── utils/
│   ├── agent_execution.py           # Execution wrappers, timeout handling, error containment
│   ├── agent_routing.py             # Capability-based model and task routing engine
│   ├── agent_telemetry.py           # Prometheus counters, histograms, latency tracking
│   ├── response_cache.py            # SHA-256 parameter hashing and 2ms cache lookups
│   ├── metric_answers.py            # Instant calculation answers for deterministic questions
│   ├── key_pool.py                  # Multi-key provider rotation, cooldowns, circuit breaking
│   ├── model_catalog.py             # 100+ entry capability model catalog loader and ranking
│   ├── model_health.py              # Per-model latency and error tracking
│   ├── session_manager.py           # Resumable sessions, checkpoints, rolling summaries
│   └── llm_wrapper.py               # Tiered provider failover and deterministic fallback
├── api_service.py                   # FastAPI REST and SSE streaming server
└── requirements.txt                 # Dependencies (FastAPI, LangGraph, Pydantic, etc.)
```

---

## Topological Subagent DAG Architecture

When complex queries require multi-domain reasoning, the system invokes the `SubAgentManager` (`sub_agent_manager.py`) and `TaskDecomposer` (`task_decomposer.py`):

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#3b82f6', 'lineColor': '#60a5fa', 'secondaryColor': '#0f172a', 'tertiaryColor': '#1e1e2e'}}}%%
flowchart TD
    UserQuery["User Ingress Query\n(e.g., 'How do I pay off $15k debt and invest?')"] --> Decomposer["Task Decomposer\n(task_decomposer.py)"]
    
    subgraph DAG["Topological Subagent Execution DAG"]
        direction TB
        Task1["Task 1: Cash Flow & Trends\n(IncomeExpenseAnalyzer)"]
        Task2["Task 2: Debt Payoff Plan\n(DebtOptimizer)"]
        Task3["Task 3: Reallocate Budget\n(BudgetPlanner)"]
        Task4["Task 4: Investment Strategy\n(InvestmentAdvisor)"]
    end
    
    Decomposer -->|Spawn Stage 1| Task1
    Task1 -->|Cash Flow Feeds| Task2
    Task1 -->|Surplus Feeds| Task3
    Task2 -->|Freed Capital Feeds| Task4
    Task3 -->|Discretionary Feeds| Task4
    
    Task2 & Task3 & Task4 --> Aggregator["Aggregator & Synthesis\n(aggregator.py)"]
    Aggregator --> InvariantCheck{"Number Safety\nInvariant Check"}
    InvariantCheck -->|Pass| FinalResponse["Structured Action Plan\n+ Workflow Trace"]
    InvariantCheck -->|Fail| AutoRemediate["Deterministic Remediation\n(Clamp & Re-balance)"]
    AutoRemediate --> FinalResponse
```

### Subagent Execution Mechanics
1. **Intent Decomposition**: The `TaskDecomposer` evaluates the user request and outputs a structured execution plan comprising typed subtasks with explicit dependencies (`depends_on`).
2. **Topological Sorting & Concurrency**: The `SubAgentManager` evaluates the directed acyclic graph (DAG) and executes tasks whose dependencies are resolved concurrently (up to `max_concurrency = 4`).
3. **Context Injection**: Each subagent receives the original prompt, relevant user financial profiles, and the accumulated outputs of its dependency tasks.
4. **Failure Containment**: Individual subagent failures do not crash the workflow; the aggregator synthesizes partial results and marks missing areas in the trace.

---

## Number Safety Invariant Enforcement

Financial plans must respect strict physical realities. The `Aggregator` (`aggregator.py`) and evaluation suites (`evals/test_number_safety.py`) enforce the **Number Safety Invariants**:

$$\sum_{i=1}^N \Delta B_i = 0 \quad \text{(Zero-Sum Reallocation)}$$

$$\forall i: B_i \ge 0 \quad \text{(Non-Negative Category Allocations)}$$

$$\sum \text{Expenses} + \sum \text{Savings} + \sum \text{Debt Service} \le \text{Net Income}$$

If any LLM proposes a reallocation that violates conservation of funds or creates negative allocations, the system detects the violation, rejects the invalid recommendation, and clamps values using deterministic mathematical algorithms.

---

## KeyPool & Multi-Tier Provider Failover

The AI Core implements a 4-tier resilience hierarchy managed by `utils/key_pool.py` and `utils/llm_wrapper.py`:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🟢 INCOMING INFERENCE REQUEST (e.g. Budget Optimization Synthesis)                     │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🥇 TIER 1: ACTIVE PROVIDER (Primary Key from KeyPool)                                  │
│    • Key: Groq LLaMA 3.3 70B (or Google Gemini 2.5 Flash)                              │
│    • Success? ──► Return inference output immediately (p50: 380ms)                     │
│    • Failure (HTTP 429 Rate Limit / HTTP 503 / Timeout 10s)?                           │
│      └──► Increment failure count; trip circuit breaker if consecutive failures >= 3    │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🥈 TIER 2: INTRA-PROVIDER KEY ROTATION                                                 │
│    • Rotate to next available key in Provider KeyPool (e.g., OPENROUTER_KEY_2)         │
│    • Cooldown applied to exhausted key (60s default)                                   │
│    • Success? ──► Return inference output; log failover in trace                       │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🥉 TIER 3: CROSS-PROVIDER FAILOVER CHAIN                                               │
│    • Transition to next vendor: Gemini ──► OpenRouter ──► Groq ──► Grok ──► Together    │
│    • Capability-based model selection: Map task intent to equivalent model tier        │
│    • Success? ──► Return inference output; update provider health score                │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ TIER 4: DETERMINISTIC FINANCIAL FALLBACK                                            │
│    • Activated when all LLM providers are unreachable or exhausted                    │
│    • Pure Python execution: financial_calculators.py & rule-based engine               │
│    • Generates 100% mathematically correct plans, tables, and amortizations           │
│    • Sets fallback_path = "deterministic_rule_engine" in response trace                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Evaluation & Invariant Verification Suite

Located in `server/AI_Core/evals/`, the automated evaluation suite ensures that all changes maintain high financial and operational standards:

| Benchmark | Script | Target Metric |
| :--- | :--- | :--- |
| **Number Safety** | `test_number_safety.py` | 100% conservation of funds ($\sum \Delta = 0$) |
| **Determinism** | `test_determinism.py` | 100% identical outputs for identical seeds |
| **Routing Accuracy** | `test_routing_accuracy.py` | $\ge 98\%$ correct specialist classification |
| **Plan Quality** | `test_plan_quality.py` | $\ge 95\%$ adherence to financial constraints |
| **Latency Benchmark** | `test_latency.py` | $p50 < 450\text{ms}, \quad p95 < 1200\text{ms}$ |

Execute the full suite locally:
```bash
cd server/AI_Core
python -m evals.runner
```

---

## AI Core Architectural Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#3b82f6', 'lineColor': '#60a5fa', 'secondaryColor': '#0f172a', 'tertiaryColor': '#1e1e2e'}}}%%
mindmap
  root((FinWise AI Core Engine))
    Subagent DAG Orchestration
      TaskDecomposer Intent Parser
      SubAgentManager Topological Execution
      Concurrent Execution max 4
      Aggregator Conflict Resolution
    Specialist Agents
      IncomeExpenseAnalyzer Spending Trends
      BudgetPlanner 50/30/20 & Zero-Based
      DebtOptimizer Avalanche & Snowball
      InvestmentAdvisor Asset Allocation
      FinancialEducator Financial Literacy
      NewsletterAgent Curated Digests
    Resilience & Failover
      KeyPool Multi-Key Rotation
      Model Health Scoring & Cooldowns
      Provider Failover Chain
      Deterministic Financial Fallback
    Evaluation Suite
      Number Safety Invariant Checks
      Routing Accuracy Benchmarks
      Determinism & Idempotency Tests
      Latency Profiling p50 & p95
```

---

## Subagent DAG Execution & Invariant Verification ASCII Flow

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🟢 INCOMING FINANCIAL ADVISORY REQUEST                                                          │
│    User Profile: Net Income $6,200/mo • Debt: $18,400 @ 19.8% • Goal: Emergency Fund $10,000   │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📋 STAGE 1: TASK DECOMPOSITION & DAG CONSTRUCTION (TaskDecomposer)                              │
│    Subtask A: Analyze cash flow surplus & expense anomalies (IncomeExpenseAnalyzer)            │
│    Subtask B: Build debt amortization schedule: Avalanche vs Snowball (DebtOptimizer)          │
│    Subtask C: Restructure discretionary spending into 50/30/20 envelopes (BudgetPlanner)       │
│    Subtask D: Calculate emergency fund runway & compound growth (InvestmentAdvisor)            │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚡ STAGE 2: TOPOLOGICAL CONCURRENT EXECUTION (SubAgentManager - max_concurrency = 4)           │
│    ├─► Subtask A [Running] ──► Surplus: $850/mo calculated                                      │
│    ├─► Subtask B [Running] ──► Avalanche saves $2,140 in interest over Snowball                 │
│    ├─► Subtask C [Running] ──► Dining out reduced by $250; Subscriptions cut by $60            │
│    └─► Subtask D [Waiting on C] ──► Allocates $310/mo savings to 4.5% APY High-Yield Savings   │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚖️ STAGE 3: AGGREGATION & CONSERVATION OF FUNDS VERIFICATION (Aggregator)                       │
│    Total Reductions: +$310/mo  ──►  Debt Overpayment: -$200/mo  ──►  HYSA Deposit: -$110/mo     │
│    Invariant Equation: +$310 - $200 - $110 = $0.00                                              │
│    ├─► Sum of Deltas = 0.00? ──► PASS ✅                                                        │
│    ├─► All Budget Envelopes >= 0? ──► PASS ✅                                                   │
│    └─► Debt Payoff Term Projected: 14 Months                                                    │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 STAGE 4: ACTIONABLE TOOL CALL GENERATION & RESPONSE EMISSION                                 │
│    Tool Calls: create_task(Update Budget), set_goal(Emergency Fund Milestone)                   │
│    Stream SSE tokens and structured JSON payload to Express server ──► Browser FinanceOS        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Production Implementation Blueprints

### 1. Kahn's Topological Sorter (`server/AI_Core/agents/sub_agent_manager.py`)

```python
def _topological_sort(self, subtasks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Sorts subtasks into parallel execution levels using Kahn's algorithm."""
    task_map = {s["id"]: s for s in subtasks}
    in_degree: Dict[str, int] = {s["id"]: 0 for s in subtasks}
    graph = defaultdict(list)

    for s in subtasks:
        for dep in s.get("dependencies", []):
            if dep in task_map:
                graph[dep].append(s["id"])
                in_degree[s["id"]] += 1

    queue = deque([sid for sid, deg in in_degree.items() if deg == 0])
    levels: List[List[Dict[str, Any]]] = []

    while queue:
        current_level = []
        for _ in range(len(queue)):
            sid = queue.popleft()
            current_level.append(task_map[sid])
            for dependent in graph[sid]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)
        levels.append(current_level)

    return levels
```

### 2. Number Safety Invariant Verification (`server/AI_Core/agents/aggregator.py`)

```python
def _numbers_are_subset(self, candidate: str, reference: str) -> bool:
    """Verifies that all numerical sequences in candidate exist in reference."""
    pattern = r"\b\d+(?:\.\d+)?\b"
    cand_numbers = set(re.findall(pattern, candidate))
    ref_numbers = set(re.findall(pattern, reference))
    # If candidate modifies or invents numbers, it fails immediately
    return cand_numbers.issubset(ref_numbers)
```

---

## Latest AI Core Architecture & Resiliency Modules

### 1. Multi-Key Provider KeyPool (`utils/key_pool.py`)
Thread-safe pool of API keys per provider to eliminate HTTP 429 rate limit disruption:
- **Discovery**: Auto-discovers single, numbered (`PROVIDER_API_KEY_1`, `_2`), and comma-separated keys.
- **Rotation Strategies**: `round_robin`, `least_used`, and `health_weighted` (prioritizing high success rates and low latency).
- **Cooldown Policies**: 60s cooldown for HTTP 429, 3600s cooldown for HTTP 403.
- **Circuit Breaker**: Trips from `CLOSED` to `OPEN` after 5 consecutive failures, excluding the key for 5 minutes before allowing a `HALF-OPEN` probe.

### 2. Universal Model Catalog (`utils/model_catalog.py`, `data/model_catalog.json`)
Centralized catalog resolving context window limits, token pricing, and modality capabilities across all major 2026 foundation models (Gemini 2.5/2.0, Claude 3.5 Sonnet, GPT-4o, Groq LLaMA 3.3 70B, DeepSeek V3/R1, Mistral, Ollama).

### 3. Real-Time Model Health Monitoring (`utils/model_health.py`)
Tracks live latency percentiles ($P_{50}$, $P_{95}$, $P_{99}$) and error rates over 10-minute sliding windows. Automatically demotes providers exceeding 15% error rates to secondary fallback status.

### 4. Resumable Session Checkpointing (`utils/session_manager.py`)
Multi-phase state checkpoints persisted through the `StateStore` (MongoDB in production, SQLite for local dev; `AI_CORE_STATE_BACKEND`) across `ROUTING`, `PLANNING`, `RESEARCH`, `EXECUTION`, `VERIFICATION`, and `SYNTHESIS`. Allows long-running workflows to pause, resume, and recover from failures without re-running completed specialist nodes.


### 5. Continuous Production AI Canary Invariant Validation Engine (`evals/canary_validator.py`)
Microservice endpoint `POST /canary/validate` exposing continuous mathematical auditing:
- **Number Safety**: $D_{\text{cand}} \subseteq D_{\text{ref}} \cup D_{\text{allowlist}}$, where allowlist = $\{0, 1, 2, 3, 4, 5, 7, 10, 12, 14, 30, 365\}$.
- **Zero-Sum Budget Conservation**: $\sum_{i=1}^{N} \Delta B_i = 0$ with $\text{Proposed}_i \ge 0$.
- **Balance Sheet Identity**: $|\text{Assets} - \text{Liabilities} - \text{Net Worth}| \le 0.01$.
- **Cash Flow Identity**: $|\text{Income} - \text{Expenses} - \text{Net Cash Flow}| \le 0.01$.
- **Debt Amortization Identity**: $|\text{Principal} + \text{Interest} - \text{Total Payment}| \le 0.01$.

```python
# server/AI_Core/evals/canary_validator.py
class CanaryValidationRequest(BaseModel):
    candidate_text: Optional[str] = None
    reference_numbers: Optional[List[float]] = None
    budget_changes: Optional[List[BudgetChange]] = None
    balance_sheet: Optional[BalanceSheetCheck] = None
    cash_flow: Optional[CashFlowCheck] = None
    debt_payment: Optional[DebtPaymentCheck] = None

def validate_invariants(req: CanaryValidationRequest, strict: bool = False) -> CanaryValidationResult:
    violations = []
    # 1. Number Safety Check
    if req.candidate_text and req.reference_numbers is not None:
        cand_nums = extract_numbers(req.candidate_text)
        ref_set = set(round(n, 2) for n in req.reference_numbers)
        allowed = {0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 7.0, 10.0, 12.0, 14.0, 30.0, 365.0}
        for val in cand_nums:
            if val not in ref_set and val not in allowed:
                violations.append(f"Number Safety: Unverified digit {val} detected.")
    # 2. Zero-Sum Check
    if req.budget_changes:
        sum_delta = sum(c.delta for c in req.budget_changes)
        if abs(sum_delta) > 0.01:
            violations.append(f"Zero-Sum: sum(delta) = {sum_delta} != 0.00")
    return CanaryValidationResult(valid=len(violations) == 0, violations=violations)
```

### 6. Persistent Memory Store & Rolling Summaries (`memory/store.py`, `memory/state_store.py`)
- `StateStore` backends: `MongoStateStore` (default when `AI_CORE_MONGO_URI`/`MONGO_URI` is set) and `SqliteStateStore` (local dev, `AI_CORE_STATE_BACKEND=sqlite`; `memory` selects in-process mongomock for tests).
- Mongo: sessions (TTL 24h on `updatedAt`), checkpoints (TTL 7d on `createdAt`) and memories; memory text search uses a text index prefixed by `orgId`/`userId`, and every query filters by org and user. Indexes are created idempotently at startup (fails soft); `/ready` reports `state_backend`.
- SQLite: `FTS5` virtual table with sanitised MATCH queries and `LIKE` fallback.
- Checkpoints are written at request start and end only (`AI_CORE_CHECKPOINT_MODE=boundary`); intermediate node progress is buffered in process and flushed on completion or failure.
- Env: `AI_CORE_STATE_BACKEND`, `AI_CORE_MONGO_URI`, `AI_CORE_MONGO_DB`, `AI_CORE_SESSION_TTL_SECONDS`, `AI_CORE_CHECKPOINT_TTL_SECONDS`, `AI_CORE_CHECKPOINT_MODE` (see `docs/ENV_VARIABLES.md`).
- The agent and sub-task response caches use Redis (`REDIS_URL`, tenant-scoped keys) when available and fall back to a local LRU.
- Automatic context compression: summarizes lengthy conversation histories into compressed semantic memory blocks when token count exceeds 4,000 tokens.


### 7. Personalized Multi-Domain Follow-Through & Ranking Engine (`utils/follow_through_ranking.py`, `evals/follow_through_evaluator.py`)
Provides dynamic activity signal extraction across 6 domains (`task`, `goal`, `budget`, `reminder`, `recurring`, `debt`):
- **Overdue Invariant**: Overdue obligations strictly rank ahead of future-dated events regardless of baseline weight.
- **Adaptive Preference Learning (`utils/preference_learning.py`)**: Feedback events (upvote, dismiss, complete) adjust domain affinity weights with half-life exponential time decay:
  $$w_{\text{decayed}}(t) = 1.0 + (w_{\text{event}} - 1.0) \cdot e^{-\lambda (t - t_0)}$$
- **Mathematical Bounding**: Composite priority scores $S$ are strictly bounded in $[0.0, 100.0]$.

### 8. Conversation Summary & Narration Sign-Off Evaluation Harness (`evals/conversation_summary_evaluator.py`)
Enforces strict production sign-off criteria on multi-agent conversation recaps:
- **Number Safety Invariant**: Numeric tokens in narration must strictly form a subset of reference context numbers ($D_{\text{cand}} \subseteq D_{\text{ref}}$).
- **Four Canonical Sections**: Output must contain `Conversation pulse`, `Repeated topics`, `Recommended next moves`, and `Suggested next prompt`.
- **Conciseness Bound**: Output word count $\le 240$ words (prompt target $\le 220$ words) to eliminate token inflation.
- **Deterministic Fallback**: Provides a deterministic factual fallback recap if any safety invariant is violated.

### 9. Multi-Format Financial Document Authorship & Rich Layout Engine (`evals/document_creation_evaluator.py`)
Generates structured financial statements across 6 domain schemas (`executive_brief`, `tax_prep_summary`, `cash_flow_audit`, `debt_payoff_schedule`, `net_worth_statement`, `standard`):
- **Layout Structure**: Automatic metadata banners, KPI metric cards, zebra-striped multi-column tables, and financial callouts.
- **Physical Page Pagination**: Emits form-feed markers (`\f`) with running page footers ("Page X of Y") and zero orphaned pages.
- **Accounting Conservation**: Validates that all presented totals adhere to Balance Sheet ($A - L = NW$) and Cash Flow identities.

### 10. Multi-Modal Document Q&A Semantic Grounding Invariant Engine (`evals/document_qa_evaluator.py`)
Processes IRS Tax Forms (1040, W-2), brokerage statements, noisy OCR receipts, and invoices:
- **Zero Hallucination Tolerance**: Asserted numbers in answers must strictly originate from retrieved passages.
- **Physical Page Attribution**: Every cited reference must match the ground-truth physical page number of the source document.
- **High-Precision Grounding**: Re-ranks candidate passages with dense semantic cosine similarity plus BM25 lexical alignment ($G \ge 0.70$).

### 11. Continuous Reinforcement & Offline Alignment Learning Engine (`learning/`)
Provides a complete closed-loop learning and self-improvement architecture:
- **Asynchronous Feedback Queue (`async_writer.py`)**: Buffered, non-blocking ingestion of thumbs-up/down ratings and user edits. Decouples fast inference response times from analytics persistence.
- **Contextual Multi-Armed Bandit (`bandit.py`)**: Implements Bayesian Thompson sampling across variant prompts and subagent configurations. Exploits high-performing templates while maintaining controlled exploration.
- **PII Redaction Guard (`redact.py`)**: Enforces Zero-PII ingestion. Strips credit card PANs, SSNs, phone numbers, and IBAN identifiers using compiled regular expressions before feedback enters dataset pools.
- **Memory Consolidation (`memory_consolidation.py`)**: Nightly batch worker clusters episodic conversation traces, identifies repeated user financial habits, and consolidates them into long-term factual profile memories.
- **Artifact Versioning & Canary Rollout (`rollout.py`, `reports.py`)**: Controls canary traffic percentages ($5\% \to 25\% \to 100\%$) for newly optimized system prompts. Automatically generates regression delta reports on number safety and latency.

### 12. Multimodal Financial Vision & Document OCR Pipeline (`vision/`)
Processes real-world financial documents, receipts, and stylus notes into structured transactional entities:
- **Receipt Parsing (`receipt_parser.py`)**: Extracts merchant name, transaction timestamp, line items, taxes, tips, and total amounts with confidence scores.
- **Handwriting Recognition (`handwriting_parser.py`)**: Parses cursive handwriting and stylus tablet entries from the Financial Journal (`Notes.tsx`), extracting dates, amounts, and category tags.
- **Image Preprocessing (`preprocess.py`, `engine.py`)**: Automatic orientation correction, grayscale normalization, adaptive thresholding, and contrast enhancement before OCR execution.

---

**Evidence:**
- `server/AI_Core/evals/` (`canary_validator.py`, `follow_through_evaluator.py`, `conversation_summary_evaluator.py`, `document_creation_evaluator.py`, `document_qa_evaluator.py`)
- `server/AI_Core/utils/` (`activity_signals.py`, `follow_through_ranking.py`, `preference_learning.py`)
- `server/src/services/` (`unifiedContextRetrievalService.ts`, `documentQAService.ts`, `richDocumentRenderer.ts`, `summaryCapacityService.ts`)
- `server/AI_Core/learning/` (`async_writer.py`, `bandit.py`, `memory_consolidation.py`, `redact.py`, `rollout.py`, `reports.py`)
- `server/AI_Core/vision/` (`engine.py`, `receipt_parser.py`, `handwriting_parser.py`, `preprocess.py`)