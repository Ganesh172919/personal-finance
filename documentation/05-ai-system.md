# 05 — AI System

> FinWise AI Core — multi-agent financial reasoning engine built on LangGraph + LangChain.

| Property | Value |
|---|---|
| **Runtime** | Python 3.10+ (Python < 3.13 for OCR stack) |
| **Framework** | FastAPI 0.115 + Uvicorn 0.32 |
| **Port** | `8001` |
| **Orchestration** | LangGraph 0.2.53 |
| **LLM SDK** | LangChain 0.3.9 |
| **OCR Engine** | PaddleOCR 2.7.3 + PaddlePaddle 2.6.2 |
| **Memory** | SQLite (FTS5) |
| **Entry point** | `server/AI_Core/api_service.py` (HTTP) / `server/AI_Core/main.py` (CLI) |

---

## Table of Contents

1. [AI System Overview](#1-ai-system-overview)
2. [Multi-Agent Architecture](#2-multi-agent-architecture)
3. [LangGraph Workflow](#3-langgraph-workflow)
4. [AI Provider Configuration & Failover](#4-ai-provider-configuration--failover)
5. [Memory System](#5-memory-system)
6. [Vision & OCR Engine](#6-vision--ocr-engine)
7. [Tools & Calculators](#7-tools--calculators)
8. [AI Request Flow](#8-ai-request-flow)
9. [Deterministic-First Design](#9-deterministic-first-design)
10. [Tool Calls Pattern](#10-tool-calls-pattern)
11. [AI Response Caching](#11-ai-response-caching)
12. [AI Core API Endpoints](#12-ai-core-api-endpoints)
13. [Error Handling](#13-error-handling)
14. [Testing the AI System](#14-testing-the-ai-system)

---

## 1. AI System Overview

The FinWise AI Core is a **deterministic-first, LLM-polished** financial reasoning engine. It receives natural-language queries from the FinWise web client, classifies intent, routes to one or more specialist agents, runs deterministic financial calculations, and optionally enriches the output with LLM-generated narrative text.

### Design Principles

| Principle | Description |
|---|---|
| **Deterministic-first** | All financial math, routing, and plan structure are computed without LLM calls. The LLM is used only for narrative polish. |
| **Multi-provider resilience** | Six LLM providers are configured in a failover chain. If the primary provider is unavailable, the system automatically falls back to the next configured provider. |
| **Number preservation** | LLM-generated narrative is validated against the deterministic plan. If the LLM introduces new numbers, the deterministic output is used instead. |
| **Safe-by-default tool calls** | AI-suggested actions (workflows, reminders) are always low-risk and require explicit user confirmation before execution. |
| **Local memory** | User preferences and facts are stored in a local SQLite database with FTS5 full-text search, avoiding external vector stores. |

### Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                        FinWise Web Client                        │
│                     (React + TypeScript)                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP (POST /api/agents/process)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     FinWise Backend Server                       │
│                    (Node.js / Express)                           │
│   Validates request → Forwards to PYTHON_API_URL (port 8001)    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   FinWise AI Core (port 8001)                    │
│                                                                  │
│  ┌────────────┐   ┌──────────────────────────────────────────┐  │
│  │ FastAPI    │   │              LangGraph                    │  │
│  │ Endpoints  │──▶│                                          │  │
│  └────────────┘   │  ┌────────────┐                          │  │
│                   │  │ Master     │──► Routing (deterministic)│  │
│                   │  │ Agent      │                          │  │
│                   │  └─────┬──────┘                          │  │
│                   │        │ Conditional Edges               │  │
│                   │  ┌─────▼──────────────────────────────┐  │  │
│                   │  │  Specialist Agents (4)             │  │  │
│                   │  │  + Financial Educator              │  │  │
│                   │  └─────┬──────────────────────────────┘  │  │
│                   │        │                                 │  │
│                   │  ┌─────▼──────┐                          │  │
│                   │  │ Synthesize │──► Deterministic plan    │  │
│                   │  │            │    + optional LLM polish │  │
│                   │  └────────────┘                          │  │
│                   └──────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ Memory   │ │ Vision   │ │ Tools    │ │ Provider Registry  │  │
│  │ (SQLite) │ │ (Paddle) │ │ (Calc)   │ │ (6 providers)      │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Agent Architecture

The system comprises **6 agents** coordinated by a LangGraph StateGraph. Each agent has a single responsibility and produces structured output.

| Agent | File | Lines | Responsibility |
|---|---|---|---|
| **MasterFinancialStrategistAgent** | `agents/master_agent.py` | 642 | Intent classification, routing, plan synthesis, tool-call generation |
| **IncomeExpenseAnalyzerAgent** | `agents/income_expense_analyzer.py` | — | Cash flow analysis, savings rate, spending patterns |
| **BudgetPlannerAgent** | `agents/budget_planner.py` | — | Budget plan generation, category allocations, savings targets |
| **InvestmentAdvisorAgent** | `agents/investment_advisor.py` | — | Portfolio recommendations, risk profiling, asset allocation |
| **DebtOptimizerAgent** | `agents/debt_optimizer.py` | — | Avalanche/snowball strategies, payoff timelines |
| **FinancialEducatorAgent** | `agents/financial_educator.py` | — | Financial concept explanations, educational content |

### Agent-to-Provider Mapping

To distribute load across free-tier quotas, each agent is mapped to a specific LLM provider:

| Agent Role | Provider | Default Model |
|---|---|---|
| `master` | Gemini | `gemini-2.5-flash` |
| `educator` | OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` |
| `analyzer` | Groq | `llama-3.3-70b-versatile` |
| `planner` | Gemini | `gemini-2.5-flash` |
| `advisor` | OpenRouter | `qwen/qwen3-235b-a22b:free` |
| `optimizer` | Groq | `llama-3.1-8b-instant` |

Configuration lives in `utils/llm_wrapper.py` as `AGENT_PROVIDER_MAP`. The `create_llm(agent_type)` factory resolves the correct provider and model for each agent.

---

## 3. LangGraph Workflow

The workflow is a **StateGraph** defined in `graph/workflow.py`. State is managed through the `AgentState` TypedDict (`graph/state.py`).

### State Schema

```python
class AgentState(TypedDict):
    user_input: str
    user_profile: Dict[str, Any]
    conversation_history: List[Dict[str, str]]
    session_summary: Optional[str]
    options: Dict[str, Any]
    current_analysis: Dict[str, Any]
    income_analysis: Optional[Dict[str, Any]]
    budget_plan: Optional[Dict[str, Any]]
    investment_advice: Optional[Dict[str, Any]]
    debt_optimization: Optional[Dict[str, Any]]
    financial_education: Optional[Dict[str, Any]]
    next_agent: str
    final_output: Optional[Any]
    fallback_used: bool
    workflow_trace: List[Dict[str, Any]]
    error: Optional[str]
```

### Analysis Types

```python
class AnalysisType(str, Enum):
    INCOME_EXPENSE = "income_expense"
    BUDGET_PLANNING = "budget_planning"
    INVESTMENT_ADVICE = "investment_advice"
    DEBT_OPTIMIZATION = "debt_optimization"
    FINANCIAL_EDUCATION = "financial_education"
    COMPREHENSIVE = "comprehensive"
```

### Workflow Diagram

```
                    ┌─────────────────┐
                    │   User Input    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Master Agent  │  (deterministic routing)
                    │  (classify &    │
                    │   route)        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────────┐
              │              │                  │
              ▼              ▼                  ▼
     ┌─────────────┐ ┌─────────────┐   ┌──────────────┐
     │income_expense│ │budget_planning│  │comprehensive │
     └──────┬──────┘ └──────┬──────┘   └──────┬───────┘
            │               │                 │
            ▼               ▼        ┌────────┼───────────────┐
     ┌─────────────┐ ┌─────────────┐ │        │               │
     │Income/Expense│ │Budget Planner│ │ Income  Budget   Invest│
     │  Analyzer    │ │             │ │ Analyzer Planner  Advisor│
     └──────┬──────┘ └──────┬──────┘ └────┬───┴──────┬────────┘
            │               │             │          │
            │               │      ┌──────▼──────────▼──────┐
            │               │      │    Debt Optimizer      │
            │               │      └──────────┬─────────────┘
            │               │                 │
            ▼               ▼                 ▼
     ┌─────────────────────────────────────────────────┐
     │              Synthesize Node                    │
     │  (Master Agent merges specialist outputs into   │
     │   deterministic plan + optional LLM narrative)  │
     └───────────────────────┬─────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   END / Response│
                    └─────────────────┘

  Financial Education path (bypasses synthesis):
    Master Agent → Financial Educator → END
```

### Comprehensive Analysis

When `AnalysisType.COMPREHENSIVE` is detected, the `_comprehensive_analysis_node` runs **all four specialist agents sequentially** within a single node, collecting their outputs before passing to synthesis:

1. `IncomeExpenseAnalyzer` — cash flow, savings rate
2. `BudgetPlanner` — category allocations, savings targets
3. `InvestmentAdvisor` — risk profile, portfolio
4. `DebtOptimizer` — repayment strategy

Each sub-agent execution is traced independently with timestamps and status.

### Routing Logic

The Master Agent uses **deterministic keyword/rule-based routing** (no LLM call):

```
User query → lowercase → score against domain keywords
                    → check for personal intent ("my", "should I")
                    → check for educational intent ("what is", "explain")
                    → check for amounts/timelines (₹, %, dates)
                    → select highest-scoring domain
                    → if 2+ domains match → COMPREHENSIVE
                    → if educational only → FINANCIAL_EDUCATION
                    → if no profile → FINANCIAL_EDUCATION
```

---

## 4. AI Provider Configuration & Failover

### Provider Chain

The system supports **6 LLM providers** in priority order:

| Priority | Provider | Env Var | Default Model | Type |
|---|---|---|---|---|
| 1 | Google Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` | Native |
| 2 | OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` | OpenAI-compatible |
| 3 | Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | OpenAI-compatible |
| 4 | Grok (xAI) | `XAI_API_KEY` | `grok-3-mini-fast` | OpenAI-compatible |
| 5 | Together AI | `TOGETHER_API_KEY` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | OpenAI-compatible |
| 6 | Mistral AI | `MISTRAL_API_KEY` | `mistral-small-latest` | OpenAI-compatible |

### How Failover Works

The `RateLimitedLLM` class (`utils/llm_wrapper.py`) implements a **two-level failover**:

1. **Model-level failover** — Within a provider, if the primary model returns 404, the next model in `model_candidates` is tried.
2. **Provider-level failover** — If all models for a provider fail (429, 403, 500), the next provider in the chain is tried.

```
Gemini (primary model)
  └─ model failover → Gemini (secondary model)
  └─ provider failover → OpenRouter (primary model)
    └─ model failover → OpenRouter (secondary model)
    └─ provider failover → Groq (primary model)
      └─ ... continues through chain
```

### Configuration

```bash
# Force a specific provider
LLM_PROVIDER=gemini

# Or let the system auto-detect (first configured key wins)
GEMINI_API_KEY=your-key-here
OPENROUTER_API_KEY=your-key-here

# Custom model override
LLM_MODEL=gemini-2.5-flash

# Provider priority override (comma-separated)
LLM_PROVIDER_PRIORITY=groq,gemini,openrouter
```

The provider registry (`utils/provider_registry.py`) auto-detects which providers have configured API keys and builds the failover chain at runtime.

---

## 5. Memory System

The memory system is a **local SQLite store** with FTS5 full-text search. It avoids external vector databases and keeps all user data on-disk.

### Schema

```sql
CREATE TABLE memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source     TEXT NOT NULL DEFAULT 'explicit',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX memories_uniq ON memories(org_id, user_id, key);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE memories_fts USING fts5(key, value, content='memories', content_rowid='id');
```

### Memory Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User Input │────▶│  Extract    │────▶│  Upsert     │
│  (query)    │     │  Memories   │     │  (SQLite)   │
└─────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐     ┌─────────────┐
                     │  Search     │◀────│  Next Query │
                     │  (FTS5)     │     │  (retrieve) │
                     └─────────────┘     └─────────────┘
```

### Extraction Rules (`memory/extract.py`)

The extraction is **fully deterministic** — no LLM calls:

| Pattern | Extracted Key | Confidence |
|---|---|---|
| "conservative", "low risk" | `risk_tolerance: low` | 0.8 |
| "moderate", "balanced" | `risk_tolerance: moderate` | 0.8 |
| "aggressive", "high risk" | `risk_tolerance: high` | 0.8 |
| "I prefer/like/love/avoid/hate …" | `preference: <verb>: <value>` | 0.7 |
| "envelope" / "envelopes" | `budgeting_style: envelope` | 0.75 |
| "in/for N months/years" | `time_horizon_months: N` | 0.65 |

Secrets (API keys, tokens, passwords) are explicitly filtered out.

### Retrieval During Processing

In `api_service.py`, before the workflow runs:

```python
memories = memory_store.search(
    org_id=org_id,
    user_id=user_id,
    query=user_input,
    limit=MEMORY_TOP_K,  # default: 8
)
```

Retrieved memories are appended to `session_summary` so agents have access to user preferences. After processing, new memories are extracted and upserted.

---

## 6. Vision & OCR Engine

The vision stack uses **PaddleOCR** for image text extraction. It powers three endpoints: receipt parsing, handwriting recognition, and generic OCR.

### Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Raw Image   │───▶│  Decode &    │───▶│  PaddleOCR   │───▶│  Line        │
│  (bytes)     │    │  Preprocess  │    │  Engine      │    │  Grouping    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                   │
                                    ┌──────────────────────────────┤
                                    ▼                              ▼
                             ┌──────────────┐              ┌──────────────┐
                             │ Receipt      │              │ Handwriting  │
                             │ Parser       │              │ Parser       │
                             └──────────────┘              └──────────────┘
```

### Receipt Parsing (`vision/receipt_parser.py`)

Heuristic-based extraction from OCR lines:

| Field | Detection Method |
|---|---|
| **Vendor** | Top 8 lines, scored by letter density, uppercase bonus, confidence |
| **Date** | Regex patterns (YYYY-MM-DD, DD/MM/YYYY) + `dateutil` parsing |
| **Total** | Keyword match ("total", "grand total", "amount due") → max amount fallback |
| **Tax** | Keyword match ("tax", "gst", "vat", "cgst", "sgst") |
| **Items** | Lines with descriptions + amounts, excluding known keywords |
| **Currency** | Symbol detection (₹→INR, $→USD, €→EUR, £→GBP) or hint parameter |
| **Category** | Rule-based keyword matching against vendor + item descriptions |

### Handwriting Recognition

Reuses the same OCR engine. The `handwriting_parser.py` module extracts recognized text and detects structured values (amounts, dates) from handwritten input.

### Generic OCR

The `/api/vision/ocr/extract` endpoint returns raw OCR lines with per-line confidence scores for arbitrary images.

### Configuration

```bash
VISION_LANG_DEFAULT=en
VISION_LANG_ALLOWED=en,hi
VISION_MAX_IMAGE_BYTES=10485760  # 10 MB
```

---

## 7. Tools & Calculators

### Financial Calculators (`tools/financial_calculators.py`)

| Calculator | Inputs | Outputs |
|---|---|---|
| **Compound Interest** | Principal, rate, years, compounding period | Final amount, interest earned |
| **Loan Payment** | Principal, annual rate, years | Monthly payment, total interest |
| **Debt Snowball** | List of debts (balance, rate, min payment) | Payoff timeline per debt |
| **Retirement Savings** | Current age, retirement age, savings, monthly contribution, return rate | Projected savings, growth |
| **Risk Profile Assessment** | Age, experience, time horizon, risk tolerance | Conservative / Moderate / Aggressive |

### Plan Builder (`tools/plan_builder.py`)

The `build_plan(PlanInputs)` function assembles a structured `Plan` object from specialist agent outputs. `render_plan_markdown(plan, currency_code)` produces the deterministic markdown output.

### Data Processors (`tools/data_processors.py`)

Utilities for normalizing transaction data, computing aggregates, and preparing inputs for the specialist agents.

---

## 8. AI Request Flow

End-to-end flow from client to response:

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  Server  │────▶│  AI Core │────▶│ LangGraph│────▶│ Response │
│  (React) │     │  (Node)  │     │(FastAPI) │     │ Workflow │     │  (SSE)   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │                │
     │ POST query     │ Validate       │ Parse          │ Route          │ Stream
     │                │ Forward        │ Memory lookup  │ Execute        │ events
     │                │ to port 8001   │ Build profile  │ Synthesize     │ back
```

### Step-by-Step

1. **Client** sends `POST /api/agents/process` with `user_input`, optional `user_profile`, `conversation_history`, and `org_id`/`user_id`.
2. **Server** (Node.js) validates the request and forwards it to `PYTHON_API_URL` (port 8001).
3. **AI Core** (`api_service.py`):
   - Attaches request ID and begins metrics collection
   - Retrieves memories from SQLite (if `org_id` + `user_id` provided)
   - Builds `UserProfile` Pydantic model
   - Invokes `workflow.process_request()`
4. **LangGraph Workflow**:
   - Master Agent classifies intent (deterministic)
   - Routes to specialist agent(s)
   - Each agent produces structured output
   - Synthesis node merges outputs into a `Plan`
   - Optional LLM narrative polish (with number validation)
5. **Response** is serialized as `ProcessResponse` and returned. The SSE streaming endpoint emits phase events (`routing`, `trace`, `complete`, `error`) for real-time progress.
6. **Post-processing**: New memories are extracted and upserted.

### SSE Streaming Events

```
data: {"phase": "routing", "request_id": "..."}

data: {"phase": "trace", "entry": {"agent": "master", "status": "running"}}

data: {"phase": "trace", "entry": {"agent": "income_expense_analyzer", "status": "success"}}

data: {"phase": "complete", "result": {...}}
```

---

## 9. Deterministic-First Design

The system prioritizes **deterministic computation over LLM calls** at every level:

### Keyword/Rule-Based Routing

Intent classification uses regex patterns and keyword scoring — **zero LLM calls**:

```python
# master_agent.py — deterministic routing
domain_keywords = {
    AnalysisType.INCOME_EXPENSE: ["expense", "spend", "income", "cash flow"],
    AnalysisType.BUDGET_PLANNING: ["budget", "save", "savings", "allocation"],
    AnalysisType.INVESTMENT_ADVICE: ["invest", "portfolio", "stock", "etf", "sip"],
    AnalysisType.DEBT_OPTIMIZATION: ["debt", "loan", "credit card", "interest", "emi"],
}
```

### Strict Number-Preservation Validation

When the LLM polishes the narrative, every number in the output is validated against the deterministic plan:

```python
def _numbers_are_subset(self, candidate: str, reference: str) -> bool:
    reference_nums = self._extract_numbers(reference)
    candidate_nums = self._extract_numbers(candidate)
    return candidate_nums.issubset(reference_nums)

def _extract_numbers(self, text: str) -> set[str]:
    tokens = re.findall(r"₹?\d[\d,]*(?:\.\d+)?%?", text)
    # ... normalize and return set
```

If the LLM introduces any new numbers, the deterministic markdown is used as-is.

### LLM Only for Narrative Polish

The LLM is invoked **only** in the synthesis step, with a strict prompt:

```
Rewrite the following financial plan for clarity and readability.

Rules (critical):
- Do NOT introduce any new numbers.
- Do NOT change currency/percent values.
- Keep the same structure and meaning.
```

If the LLM is unavailable, the deterministic plan is returned directly with `fallback_used: true`.

---

## 10. Tool Calls Pattern

AI responses include structured `tool_calls` — suggestions for client-side automations that require explicit user confirmation.

### Tool Call Schema

```python
class ToolCall(BaseModel):
    id: str
    title: str
    description: str
    tool: ToolName  # e.g., "workflows.create"
    args: Dict[str, Any]
    requires_confirmation: bool = True
    risk: Literal["low", "medium", "high"] = "low"
```

### Available Tool Names

| Tool | Description |
|---|---|
| `workflows.create` | Create a new automated workflow |
| `workflows.enable` | Enable an existing workflow |
| `workflows.run` | Manually trigger a workflow |
| `transactions.create` | Create a transaction |
| `goals.createOrUpdate` | Create or update a financial goal |
| `debts.createOrUpdate` | Create or update a debt |
| `budgets.recommendAllocations` | Get budget allocation recommendations |
| `exports.create` | Export financial data |
| `notifications.sendEmail` | Send email notification |
| `finance.detectRecurringCandidates` | Detect recurring transactions |

### Example Tool Calls

**Weekly Money Check-in** (always suggested):

```json
{
  "id": "a1b2c3d4e5f6",
  "title": "Enable weekly money check-in",
  "description": "Creates a weekly automation that adds a short review task so you stay on track.",
  "tool": "workflows.create",
  "requires_confirmation": true,
  "risk": "low",
  "args": {
    "name": "Weekly money check-in",
    "trigger": {"type": "cron", "cron": "0 9 * * 1"},
    "actions": [{
      "type": "create_task",
      "title": "Weekly money check-in",
      "steps": [
        "Review your last 7 days of transactions",
        "Check your cash flow vs. plan",
        "Apply or dismiss one high-impact task"
      ]
    }]
  }
}
```

**Emergency Fund Top-up** (only when runway < 3 months):

```json
{
  "id": "...",
  "title": "Enable emergency fund top-up reminder",
  "tool": "workflows.create",
  "risk": "low",
  "args": {
    "trigger": {"type": "cron", "cron": "0 9 1 * *"},
    "actions": [{"type": "create_task", "title": "Emergency fund top-up"}]
  }
}
```

**Debt Payoff Check-in** (only when debt > 0):

```json
{
  "id": "...",
  "title": "Enable monthly debt payoff check-in",
  "tool": "workflows.create",
  "risk": "low",
  "args": {
    "trigger": {"type": "cron", "cron": "0 9 1 * *"},
    "actions": [{"type": "create_task", "title": "Debt payoff check-in"}]
  }
}
```

**New Transaction Review** (only when cash flow is negative):

```json
{
  "id": "...",
  "title": "Enable new-transaction review (event trigger)",
  "tool": "workflows.create",
  "risk": "low",
  "args": {
    "trigger": {"type": "event", "event_type": "TransactionCreated"},
    "actions": [{"type": "create_task", "title": "Review your latest transaction"}]
  }
}
```

### Tool Call Validation

When `FINWISE_SERVER_URL` and `FINWISE_TOOLS_TOKEN` are configured, tool calls are validated against the FinWise server's internal tools endpoint. Ineligible calls are dropped, and the validation result is included in the response's `detailed_analysis.tool_validation` field.

---

## 11. AI Response Caching

### FinancialEducator Cache

The `FinancialEducatorAgent` implements an in-memory LRU cache for concept explanations. This is tested in `test_financial_educator_cache.py`. Frequently asked conceptual questions (e.g., "what is inflation?") are served from cache without re-invoking the LLM.

### Deterministic Plan Cache

The `build_plan()` and `render_plan_markdown()` functions are pure functions — given the same inputs, they always produce the same output. This means plan outputs are inherently cacheable at the HTTP layer.

### Cache Invalidation

- Memory upsertion (new user preferences) implicitly invalidates context-dependent responses on the next request.
- The `narrative: false` option bypasses LLM calls entirely, serving only deterministic output.
- The LLM wrapper tracks call counts and usage metadata per request, enabling cost-aware caching decisions.

### Response Contract

All responses conform to the `ProcessResponse` Pydantic model:

```python
class ProcessResponse(BaseModel):
    success: bool
    final_output: str
    agent: str
    actionType: Optional[str]
    priority: Literal["low", "medium", "high"]
    insights: List[Dict[str, Any]]
    analysis_type: str
    agents_involved: List[str]
    detailed_analysis: Dict[str, Any]
    workflow_trace: List[WorkflowTraceEntry]
    fallback_used: bool
    llm_call_count: int
    request_id: str
    plan: Plan
    usage: UsageMetadata
    tool_calls: List[ToolCall]
```

---

## 12. AI Core API Endpoints

All endpoints are served by FastAPI on port `8001`.

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns provider status, vision status, request ID |
| `GET` | `/api/providers` | List all LLM providers and their configuration status |
| `POST` | `/api/agents/process` | Main endpoint — process a financial query through the multi-agent system |
| `POST` | `/api/agents/process/stream` | SSE streaming variant of `/process` |
| `POST` | `/api/agents/what-if-scenario` | Run deterministic what-if financial scenarios |
| `POST` | `/api/agents/budget` | Get budget recommendations (direct budget planner call) |
| `POST` | `/api/agents/investment` | Get investment advice (direct advisor call) |
| `POST` | `/api/agents/debt` | Get debt optimization strategy (direct optimizer call) |

### Vision Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/vision/receipts/parse` | OCR + receipt field extraction from uploaded image |
| `POST` | `/api/vision/handwriting/recognize` | Handwriting recognition + intent extraction |
| `POST` | `/api/vision/ocr/extract` | Generic OCR for arbitrary images |

### Utility Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/metrics` | Prometheus metrics (requires `AI_CORE_METRICS_TOKEN`) |
| `GET` | `/api/rate-limit/status` | Current rate limiter status |
| `POST` | `/api/rate-limit/reset` | Reset rate limiter token buckets |

### Example: Process Request

```bash
curl -X POST http://localhost:8001/api/agents/process \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "Analyze my spending and suggest a budget",
    "user_profile": {
      "age": 30,
      "annual_income": 75000,
      "monthly_expenses": 3500,
      "savings": 10000,
      "debts": [
        {"name": "Student Loan", "balance": 25000, "interest_rate": 4.5, "minimum_payment": 300},
        {"name": "Credit Card", "balance": 5000, "interest_rate": 18.9, "minimum_payment": 150}
      ],
      "financial_goals": [
        {"name": "Emergency Fund", "target": 15000, "timeline_months": 12, "priority": 1}
      ],
      "risk_tolerance": "moderate",
      "investment_experience": "beginner",
      "time_horizon": 10,
      "transactions": []
    },
    "conversation_history": [],
    "options": {"narrative": true}
  }'
```

### Example: Receipt Parsing

```bash
curl -X POST "http://localhost:8001/api/vision/receipts/parse?lang=en&currencyHint=INR" \
  -H "Content-Type: image/jpeg" \
  --data-binary @receipt.jpg
```

---

## 13. Error Handling

### LLM Error Hierarchy

```
AIProviderError (base)
├── QuotaExceededError   (HTTP 429 — rate limited / quota exhausted)
├── AccessDeniedError    (HTTP 403 — invalid key / permission denied)
├── ModelNotFoundError   (HTTP 404 — model name incorrect)
└── (generic)            (HTTP 5xx — server errors)
```

### Failover Behavior

| Error Type | Action |
|---|---|
| Model 404 | Try next model in provider's `model_candidates` |
| Provider 429/403/500 | Try next provider in failover chain |
| All providers exhausted | Return deterministic fallback response |
| No API keys configured | Operate in deterministic-only mode (no LLM) |

### Workflow Error Handling

Each agent node is wrapped in `_execute_with_trace()`, which:

1. Records start timestamp
2. Catches exceptions and records them in `workflow_trace`
3. Re-raises so the workflow can handle at a higher level

The top-level `process_request()` catches all exceptions and returns a safe fallback:

```python
except Exception as exc:
    return {
        "final_output": f"I encountered an error while processing your request: {exc}",
        "fallback_used": True,
        "workflow_trace": initial_state.get("workflow_trace", []),
        "error": str(exc),
    }
```

### Vision Error Handling

Vision endpoints return `503 Service Unavailable` when OCR dependencies (PaddleOCR, PaddlePaddle, OpenCV) are not installed, with a clear error message. Image payloads exceeding `VISION_MAX_IMAGE_BYTES` (default 10 MB) return `413 Payload Too Large`.

### Fallback Responses

Pre-defined fallback responses exist for each analysis type in `utils/llm_wrapper.py`:

```python
FALLBACK_RESPONSES = {
    "financial_education": "...",
    "budget_plan": "50/30/20 rule baseline...",
    "investment_advice": "...",
    "debt_optimization": "Avalanche vs Snowball...",
    "synthesis": "4-step safe action plan...",
}
```

### Prometheus Metrics

The system exposes Prometheus metrics at `/metrics` (token-protected):

- `REQUEST_DURATION_MS` — request latency histogram
- `LLM_CALLS_TOTAL` — total LLM invocations
- `FALLBACK_TOTAL` — fallback activations (by endpoint)

---

## 14. Testing the AI System

### Test Suite

15 test files in `server/AI_Core/tests/`:

| Test File | Coverage |
|---|---|
| `conftest.py` | Shared fixtures and test configuration |
| `test_master_agent_routing.py` | Deterministic intent classification |
| `test_financial_calculators.py` | Compound interest, loan, snowball, retirement, risk profile |
| `test_data_processor.py` | Data normalization and aggregation |
| `test_plan_builder_actions.py` | Plan construction and rendering |
| `test_plan_contract_fixture.py` | Plan contract validation |
| `test_process_contract.py` | Process request/response contract |
| `test_scenario_contract.py` | What-if scenario contract |
| `test_memory_store.py` | SQLite memory CRUD and FTS5 search |
| `test_financial_educator_cache.py` | LRU cache for educator responses |
| `test_receipt_parser.py` | Receipt field extraction from OCR lines |
| `test_handwriting_parser.py` | Handwriting recognition |
| `test_vision_dependency_handling.py` | Graceful degradation when OCR deps missing |
| `test_provider_env.py` | Provider configuration and auto-detection |
| `test_metrics_auth.py` | Prometheus metrics authentication |

### Running Tests

```bash
cd server/AI_Core

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ -v --cov=. --cov-report=html

# Run specific test file
pytest tests/test_master_agent_routing.py -v
```

### Linting

```bash
# Lint with ruff
ruff check .

# Format with ruff
ruff format .
```

### Dependencies

All dependencies are pinned in `server/AI_Core/requirements.txt`:

```
langchain==0.3.9
langchain-google-genai==2.0.4
langchain-openai==0.3.0
langgraph==0.2.53
python-dotenv==1.0.1
pydantic==2.10.3
pandas==2.2.3
fastapi==0.115.6
uvicorn==0.32.1
paddleocr==2.7.3          # Python < 3.13
paddlepaddle==2.6.2       # Python < 3.13
opencv-python-headless==4.10.0.84
prometheus-client==0.20.0
pytest==8.3.4
ruff==0.7.4
```

---

*This document describes the AI Core as of the current codebase. For architectural context, see [02-architecture.md](./02-architecture.md). For API details that span the full stack, see [03-api-reference.md](./03-api-reference.md).*
