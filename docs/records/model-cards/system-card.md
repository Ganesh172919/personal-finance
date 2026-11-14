---
title: "System Card: FinWise Autonomous Financial Intelligence Engine"
description: "Comprehensive system card for multi-agent financial reasoning, dual-layer canary validation, and grounded RAG"
quadrant: record
audience: [auditor, developer, security]
owner: "@finwise/ai-core"
status: reviewed
last_reviewed: 2026-11-08
review_every_days: 90
applies_to: ">=2.2.0"
---

# System Card: FinWise Autonomous Financial Intelligence Engine

## 1. Purpose and Intended Use
Provides autonomous personal finance analysis, spending categorization, budget health forecasting, debt payoff amortization, and grounded tax document Q&A. All synthesis passes through deterministic mathematical canary gates before client display.

## 2. Out-of-Scope and Prohibited Use
Not intended for automated high-frequency trading, legal tax filing execution without CPA review, or unauthorized credit underwriting.

## 3. Core AI Architecture & Components
| Component | Role | Technology / Model | Validation Check |
| :--- | :--- | :--- | :--- |
| **Router / Decomposer** | Intent classification | Gemini 2.0 Flash / Claude 3.5 Sonnet | Intent match score |
| **Specialist Agents** | 11 Domain specialists | Python LangGraph StateGraph | Pydantic V2 schemas |
| **Canary Invariant Engine**| 5 Mathematical identities | Dual-layer FastAPI + TS Fallback | Zero-tolerance invariant check |
| **RAG Chunker & Retriever**| Multi-modal grounded RAG | 1800-char window + BM25 + Cosine | $G \ge 0.70$ citation gate |
| **Follow-Through Ranker** | Priority signal ranking | Exponential time decay learner | Score bounding $[0, 100]$ |

## 4. Evaluation & Invariant Benchmarks
- All 19 test cases in `server/AI_Core/evals/` pass with 100% adherence:
  - `test_follow_through_eval.py`: 5 passed
  - `test_conversation_summary_eval.py`: 4 passed
  - `test_document_creation_eval.py`: 5 passed
  - `test_document_qa_eval.py`: 5 passed

**Evidence:**
- `server/AI_Core/evals/`
- `server/AI_Core/graph/workflow.py`
- `server/src/services/aiCanaryService.ts`
