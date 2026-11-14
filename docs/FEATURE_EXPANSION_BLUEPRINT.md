# FinWise Feature Expansion Blueprint

This document proposes new features that fit the current codebase and can be
documented or implemented incrementally.

The emphasis is on features that reuse existing assets:

- grounded AI
- file uploads and analysis
- workflows and tasks
- search
- exports
- collaboration and notifications

## 1. Feature groups

### Group A: Knowledge and retrieval

#### Ask Your Financial Documents

What it does:

- lets users ask questions against uploaded files and receive cited answers

Why it fits:

- existing file extraction pipeline
- existing file analysis flow
- existing evidence fields in AI responses

Primary docs/code touchpoints:

- `server/src/controllers/fileController.ts`
- `server/src/services/fileTextExtraction.ts`
- `server/src/services/financeGrounding.ts`
- `client/src/pages/Files.tsx`

#### Financial Knowledge Vault

What it does:

- organizes uploaded documents, insights, and memory into a searchable finance
  knowledge workspace

Why it fits:

- workspace files already exist
- AI memory already exists
- the app already has documentation, tasks, and collaboration patterns

### Group B: Guided financial operations

#### Monthly Review Copilot

What it does:

- assembles a month-end review from transactions, budgets, tasks, recurring
  candidates, and files

Why it fits:

- command center work already exists
- exports and reporting already exist
- finance grounding already aggregates the right sources

Suggested outputs:

- narrative summary
- budget wins and misses
- anomalies
- suggested actions
- exportable monthly packet

#### Proactive Risk Watchlist

What it does:

- flags upcoming bills, unusual spending spikes, low runway, duplicate-looking
  transactions, and potential missed obligations

Why it fits:

- recurring detection, reminders, tasks, and AI insights already exist

### Group C: Document intelligence

#### Statement Reconciliation Assistant

What it does:

- compares bank statements or credit card statements against imported
  transactions and highlights gaps

Why it fits:

- file extraction already handles PDFs
- transactions are already queryable
- review queue patterns already exist

#### Tax Packet Assistant

What it does:

- organizes uploaded tax documents, extracts key values, and produces a
  structured readiness checklist

Why it fits:

- document upload exists
- file analysis exists
- roadmap already includes tax optimization direction

### Group D: Collaboration and execution

#### Advisor Share Pack

What it does:

- packages a curated set of budgets, files, insights, and questions to share
  with an accountant, spouse, or advisor

Why it fits:

- share links, comments, orgs, and public/private content patterns already
  exist

#### Workflow Suggestions from AI

What it does:

- converts grounded AI recommendations into suggested workflows, not just text

Why it fits:

- tool calls and workflow creation patterns already exist
- AI responses already support `tool_calls` and `suggested_actions`

## 2. Highest-value additions by effort

### Small effort, high value

- expand global search beyond transactions
- show stronger evidence and confidence in the UI
- improve file analysis prompts by file type
- add saved AI summaries for common document classes

### Medium effort, very high value

- ask-your-files retrieval
- monthly review copilot
- statement reconciliation assistant
- workflow suggestion engine

### Larger strategic features

- knowledge vault
- advisor collaboration pack
- tax packet assistant
- unified retrieval across files, memory, and transactions

## 3. Features already partially enabled by the code

These are worth calling out because they are closer than they look.

### Search expansion

Current state:

- `server/src/services/searchService.ts` is intentionally structured to expand
- the controller and route surface already exist

Opportunity:

- add goals, debts, receipts, journal entries, files, and workflows to global
  search

### File-aware AI

Current state:

- file text extraction exists
- file analysis exists
- file snippets can already be passed into AI context

Opportunity:

- add chunk retrieval and typed document prompts

### Explainability

Current state:

- AI responses already carry workflow trace, evidence, and confidence data

Opportunity:

- expose them more deeply in the UI to improve user trust

### Automation

Current state:

- workflows, tasks, notifications, exports, and tool calls already exist

Opportunity:

- convert AI insight into executable automation more often

## 4. Documentation-first implementation suggestions

Since the current request is documentation-focused, the best next docs to add
after this blueprint would be:

- a retrieval data model spec
- a feature flag matrix
- a run-mode matrix for server and worker behavior
- an AI evidence UX guide for frontend work

## 5. Recommended next implementation order

1. Expand search scope.
2. Add file chunk retrieval and citations.
3. Build monthly review copilot on top of grounded AI.
4. Add AI-to-workflow conversion for executable suggestions.
5. Build knowledge vault capabilities once retrieval is stable.

## 6. Companion docs

- `docs/INNOVATION_ROADMAP.md`
- `docs/RAG_IMPLEMENTATION_PLAN.md`
- `docs/IMPLEMENTATION_MAP.md`

## Feature Expansion Blueprint Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#2563eb', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#1d4ed8', 'lineColor': '#8b5cf6', 'secondaryColor': '#059669', 'tertiaryColor': '#f59e0b'}}}%%
mindmap
  root((🚀 Feature Expansion Blueprint))
    🔍 Global Omnibox Search
      Unified search across Transactions, Budgets, Goals, Debts
      Workspace File & OCR receipt search
      Fuzzy merchant matching & phonetic filters
    📚 File-Aware RAG Engine
      Multi-modal statement ingestion & OCR
      Semantic chunk retrieval & citation pills
      Automated tax packet generation & export
    🧠 Explainable AI & Workflow Automation
      Interactive trace tree in FinanceOS
      AI insight-to-workflow converter (one-click automation)
      Proactive budget rebalancing triggers
    🏢 Collaboration & Household Packs
      Shared multi-user budgets & split payments
      Advisor read-only auditing views
```

## Feature Expansion Lifecycle & Phased Delivery ASCII Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🟢 STEP 1: CAPABILITY AUDIT & SCHEMA FREEZE                            │
│    Identify existing backend routes & models ready for expansion       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧪 STEP 2: INCREMENTAL DOMAIN EXTENSION                                │
│    ├─► Server: Expand service logic in searchService / retrievalService│
│    ├─► Add Zod schema validations & OpenAPI contract paths             │
│    └─► Run Vitest integration tests to verify org isolation 🟢         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🎨 STEP 3: FRONTEND UI & WORKSPACE COMPONENT INTEGRATION               │
│    ├─► Build React component widgets in FinanceOS dashboard            │
│    ├─► Connect to Zustand store slices & TanStack Query cache          │
│    └─► Verify accessibility (a11y) & responsive breakpoints 🟢         │
└────────────────────────────────────────────────────────────────────────┘
```


---

> [!TIP]
> **Developer Guide: Building & Extending on This Project**  
> For complete step-by-step blueprints, Mongoose models, Zod schemas, Express controllers, React hooks, and LangGraph subagents, see the [**Master Developer Handbook: Building on This Project**](./BUILDING_ON_THIS_PROJECT.md).

## Production Implementation Blueprint: Subscription Detection Service (`server/src/services/subscriptionService.ts`)

```typescript
import { TransactionModel } from "../models/transactionModel";
import { logger } from "../config/logger";

export interface RecurringSubscription {
  merchant: string;
  monthlyCost: number;
  annualizedCost: number;
  lastBilledDate: string;
  confidence: number;
}

/**
 * Analyzes transaction intervals and amounts to automatically detect active
 * recurring subscriptions and projected cost savings.
 */
export async function detectActiveSubscriptions(orgId: string): Promise<RecurringSubscription[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Group recurring debit transactions by merchant name
  const candidates = await TransactionModel.aggregate([
    { $match: { orgId, type: "expense", date: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: "$merchant",
        charges: { $push: { amount: "$amount", date: "$date" } },
        totalSpent: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: 3 } } },
  ]);

  const subscriptions: RecurringSubscription[] = [];

  for (const item of candidates) {
    const charges = item.charges.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const amounts = charges.map((c: any) => c.amount);
    const isUniformAmount = amounts.every((a: number) => Math.abs(a - amounts[0]) < 0.05);

    if (isUniformAmount) {
      const monthly = amounts[0];
      subscriptions.push({
        merchant: item._id,
        monthlyCost: monthly,
        annualizedCost: parseFloat((monthly * 12).toFixed(2)),
        lastBilledDate: charges[charges.length - 1].date.toISOString(),
        confidence: 0.95,
      });
    }
  }

  logger.info({ orgId, count: subscriptions.length }, "Detected recurring subscriptions");
  return subscriptions;
}
```

---

## Feature Expansion Mindmap & Horizons

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#3b82f6', 'lineColor': '#60a5fa', 'secondaryColor': '#0f172a', 'tertiaryColor': '#1e1e2e'}}}%%
mindmap
  root((🚀 FinWise Feature Horizons))
    🧠 Cognitive Intelligence
      Real-Time Voice Financial Copilot
      Multi-Agent Tax Loss Harvesting
      Monte Carlo Real Estate Scenarios
      Cross-Account Inter-Ledger Rebalancer
    📚 Document & Grounding
      Multi-Modal OCR Receipt Table Parser
      Automated 1099 and W2 Extraction
      Vector HNSW Dense Embedding Hybrid Search
      Interactive PDF Citation Canvas
    🏢 Corporate Treasury & Governance
      Multi-Entity Consolidated Ledgers
      Two-Person Rule Payment Approvals
      Automated Currency Hedging Calculators
      ERP Connectors SAP NetSuite QuickBooks
```

---

## Production Blueprint: Adding an Intelligent Tax Strategy Subagent to Kahn's DAG

Step-by-step implementation for extending the multi-agent AI Core with a specialized tax planning node:

```python
# server/AI_Core/agents/tax_strategy_agent.py
from pydantic import BaseModel, Field
from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from utils.llm_wrapper import invoke_llm_json

class TaxHarvestingOpportunity(BaseModel):
    asset_name: str
    unrealized_loss_usd: float = Field(gt=0.0)
    recommended_action: str
    tax_savings_estimate: float = Field(ge=0.0)

class TaxStrategyOutput(BaseModel):
    estimated_effective_rate: float
    deduction_suggestions: List[str]
    harvesting_opportunities: List[TaxHarvestingOpportunity]

TAX_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are an expert CPA and financial planner. Analyze taxable accounts and income brackets to suggest optimal deduction and loss-harvesting strategies. Return strict JSON."),
    ("user", "Income: {income}\nInvestments: {investments}\nContext: {finance_context}")
])

async def tax_strategy_node(state: Dict[str, Any]) -> Dict[str, Any]:
    income = state.get("income", {})
    investments = state.get("investments", [])
    context = state.get("finance_context", "")

    prompt = TAX_PROMPT.format(income=income, investments=investments, finance_context=context)
    result = await invoke_llm_json(prompt, schema=TaxStrategyOutput)
    return {"tax_strategy": result}
```

Registering the agent in `server/AI_Core/agents/sub_agent_manager.py`:

```python
from agents.tax_strategy_agent import tax_strategy_node

# Add to registry
AGENT_REGISTRY["tax_strategy"] = tax_strategy_node

# When task_decomposer outputs task dependencies:
# {
#   "income_analyzer": [],
#   "tax_strategy": ["income_analyzer"], # Runs after income is categorized
#   "aggregator": ["tax_strategy", "budget_planner"]
# }
```

---

## 6. Blueprint 5: Extending Machine Learning Vector Dimensions (64-D to 128-D Subword Embeddings)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#4f46e5', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#3730a3', 'lineColor': '#6366f1', 'secondaryColor': '#059669', 'tertiaryColor': '#d97706'}}}%%
mindmap
  root((Vector Expansion))
    Architecture
      64-D Base Hypersphere
      Expand to 128-D Hypersphere
    Taxonomy Allocation
      Dims 0-23: Expanded Sector Anchors
      Dims 24-55: Global Brand Anchors
      Dims 56-127: Subword 3-Gram & 4-Gram Hashing
    Invariant Check
      Norm Assertion ||v||2 == 1.0
      Dot Product Cosine Equivalence
```

When scaling the platform to accommodate millions of global merchants, expand the embedding space from 64 dimensions to 128 dimensions in `server/src/services/merchantEmbeddingClustering.ts`:

```typescript
export function generate128DMerchantEmbedding(rawMerchant: string): number[] {
  const vec = new Array<number>(128).fill(0);
  const clean = rawMerchant.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  const tokens = clean.split(/\s+/);

  // Dims 0-23: Extended Global Sector Anchors (Healthcare, Utilities, SaaS, etc.)
  for (const token of tokens) {
    if (EXTENDED_SECTOR_ANCHORS[token] !== undefined) {
      vec[EXTENDED_SECTOR_ANCHORS[token]] += 2.5;
    }
  }

  // Dims 24-55: Global Brand Anchor Signatures
  // Dims 56-127: 3-gram and 4-gram FNV-1a Subword Hash Space
  for (let i = 0; i <= clean.length - 3; i++) {
    const gram = clean.substring(i, i + 3);
    const hash = createHash('sha256').update(gram).digest().readUInt32BE(0);
    const dim = 56 + (hash % 72);
    vec[dim] += 1.0;
  }

  // Enforce L2 Unit Normalization: ||vec||2 = 1.0
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}
```

---

## 7. Blueprint 6: Adding a Custom Visual Workflow Action Node (Multi-Channel Webhook)

To add a new visual workflow action node (e.g., dispatching an incident webhook to Slack, Discord, or an external ERP):

1. **Extend Node Type Union in Contracts** (`packages/contracts/src/workflows.ts`):
   ```typescript
   export type WorkflowActionType = 'send_email' | 'rebalance_budget' | 'dispatch_webhook';
   ```

2. **Implement Node Execution Handler** (`server/src/services/workflows.ts`):
   ```typescript
   if (node.type === 'action' && node.config.actionType === 'dispatch_webhook') {
     const targetUrl = node.config.webhookUrl;
     const payload = {
       event: 'finwise.workflow.action',
       orgId: run.orgId,
       workflowId: run.workflowId,
       context: run.context,
       dispatchedAt: new Date().toISOString()
     };

     await fetch(targetUrl, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-signature': signPayload(payload) },
       body: JSON.stringify(payload)
     });
   }
   ```

---

## 8. Blueprint 7: Registering a New Currency in the Multi-Currency FX Engine

To support an additional fiat currency (e.g., Swiss Franc `CHF` or Singapore Dollar `SGD`):

1. **Update Currency Union & Rate Table** (`server/src/utils/currencyFx.ts`):
   ```typescript
   export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'CAD' | 'AUD' | 'JPY' | 'CHF' | 'SGD';

   export const FX_RATES_TO_USD: Record<SupportedCurrency, number> = {
     // ...existing rates...
     CHF: 1.145, // 1 CHF = 1.145 USD
     SGD: 0.760  // 1 SGD = 0.760 USD
   };
   ```

2. **Configure Formatting Rules**:
   Ensure decimal precision is enforced (CHF uses 2 decimal places with standard 0.05 Swiss rounding if cash cashflow, or standard 0.01 for digital ledgers).


---

## 9. Blueprint 8: Adding a New Mathematical Invariant to the AI Canary Engine

To add a new mathematical audit rule (e.g. Savings Rate Invariant: $\text{Savings Rate} = (\text{Income} - \text{Expenses}) / \text{Income}$):

1. **Extend Invariant Interface (`server/src/services/aiCanaryService.ts`)**:
   ```typescript
   export interface CanaryValidationRequest {
     // ...existing fields...
     savingsRateCheck?: { income: number; expenses: number; claimedSavingsRate: number };
   }
   ```

2. **Implement Evaluation Logic (`server/src/services/aiCanaryService.ts`)**:
   ```typescript
   if (req.savingsRateCheck) {
     const { income, expenses, claimedSavingsRate } = req.savingsRateCheck;
     if (income > 0) {
       const trueRate = (income - expenses) / income;
       if (Math.abs(trueRate - claimedSavingsRate) > 0.005) {
         violations.push(`Savings Rate Mismatch: Claimed ${claimedSavingsRate}, calculated ${trueRate.toFixed(4)}`);
       }
     }
   }
   ```

3. **Mirror in Python AI Core Validator (`server/AI_Core/evals/canary_validator.py`)**:
   Add corresponding verification in the Pydantic validator model and execute test suite: `pytest server/AI_Core/tests/test_canary_validator.py`.

---

## 10. Blueprint 9: Adding a Custom Data Source Silo to the Cross-Silo Unified Context Engine

To connect a new data silo (e.g. Investment Holdings or Recurring Debts):

1. **Extend Source Union (`server/src/services/unifiedContextRetrievalService.ts`)**:
   ```typescript
   export type UnifiedContextSourceType = 'memory' | 'file' | 'transaction' | 'holding';
   ```

2. **Implement Silo Retrieval & Scoring Function**:
   ```typescript
   async function scoreHoldingCandidates(orgId: Types.ObjectId, queryEmbedding: number[], terms: string[]) {
     const holdings = await HoldingModel.find({ orgId }).lean();
     return holdings.map(h => ({
       item: {
         id: String(h._id),
         sourceType: 'holding' as const,
         title: `${h.ticker} (${h.quantity} shares)`,
         snippet: `${h.ticker} · Value: $${(h.quantity * h.currentPrice).toFixed(2)}`,
         metadata: { ticker: h.ticker, value: h.quantity * h.currentPrice }
       },
       sourceScore: computeHoldingRelevance(h, queryEmbedding, terms)
     }));
   }
   ```

3. **Register in Reciprocal Rank Fusion (RRF)**:
   Add `rankSource(holdingCandidates, 'holding')` inside `retrieveUnifiedContext`.
