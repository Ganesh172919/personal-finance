# FinWise — Reusable Engineering Improvement Prompt & Runbook

> **Standardized Execution Framework for Continuous Architectural & Functional Improvement**  
> *Deterministic-First Verification, Multi-Tier Analysis, Invariant Protection, and Full-Stack Quality Gates*  
> **Target Runtimes:** Express 5 (Port `3000`) · FastAPI AI Core (Port `8001`) · React 18 SPA (Port `5173`)

---

> [!TIP]
> **Developer Extension Guide:**  
> For full-stack feature recipes and blueprints, consult the [**Master Developer Handbook: Building on This Project**](../../docs/BUILDING_ON_THIS_PROJECT.md).

## 1. Improvement Methodology Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#4f46e5', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#4338ca', 'lineColor': '#06b6d4', 'secondaryColor': '#ec4899', 'tertiaryColor': '#10b981'}}}%%
mindmap
  root((🛠️ FinWise Improvement Protocol))
    🔍 Analyze & Reproduce
      Inspect Git Status & Diffs
      Reproduce Bug with Minimal Test Case
      Verify Multi-Tenant Boundary (OrgScope)
    📋 Invariant Guardrails
      Number Safety: sum(Delta B_i) = 0
      RAG Grounding: G >= 0.70 Threshold
      Zero Token Bleed & PII Redaction
    💻 Targeted Implementation
      Atomic Service & Controller Edits
      Preserve Deterministic Calculations
      Maintain Express 5 & React 18 Standards
    🧪 Comprehensive Verification
      Vitest Integration Tests (Server & Client)
      Pytest AI Core Invariant Suites
      Visual & Accessibility Audit
```

---

## 2. Iterative Improvement ASCII Pipeline

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🔍 STAGE 1: SYSTEMATIC CODEBASE AUDIT & REGRESSION TRIAGE               │
│    Inspect working directory: git status & recent commits              │
│    Identify top-priority failure: correctness, security, or crash      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 📋 STAGE 2: MATHEMATICAL INVARIANT & BOUNDARY SPECIFICATION            │
│    Establish non-negotiables:                                          │
│    ├─► sum(Delta B_i) = 0 (Preserve exact financial envelopes)         │
│    ├─► Query scoping via OrgScopePlugin { orgId: req.orgId }           │
│    └─► CSRF Double-Submit token validation on mutative HTTP routes     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 💻 STAGE 3: ATOMIC CODE MODIFICATION & REGRESSION UNIT TEST            │
│    Implement fix in TypeScript / Python without speculative rewrites   │
│    Author isolated unit/integration test capturing the failure case    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 🧪 STAGE 4: PRODUCTION VERIFICATION GATES                              │
│    $ npm test --workspace=server ──► All suites green 🟢               │
│    $ cd server/AI_Core && pytest tests/ evals/ ──► Invariants hold 🟢  │
│    $ npm run check ──► TypeScript compiler reports 0 errors 🟢        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Canonical Master Improvement Prompt

Copy and paste the prompt below into new AI engineering sessions to ensure consistent execution:

```markdown
Improve FinWise through the strict cycle: Analyze ➔ Plan ➔ Implement ➔ Test ➔ Visually Inspect ➔ Reverify.

1. Review applicable instructions, git status, docs/IMPROVEMENT_PROGRESS.md, and docs/PRODUCT_CAPABILITY_STATUS.md. Preserve all uncommitted work.
2. Inspect the 3-tier architecture:
   - React 18 / TypeScript / Vite client (Port 5173)
   - Express 5 / Mongoose API Gateway (Port 3000)
   - Python 3.11+ / FastAPI LangGraph AI Core (Port 8001)
3. Resume the highest-impact reproducible issue. Complete one focused, reviewable batch per run. Prioritize:
   - Financial correctness and Number Safety invariants: sum(Delta B_i) = 0
   - Multi-tenant boundary isolation via OrgScopePlugin
   - Authentication, CSRF double-submit protection, and session lifecycle
   - Transaction review queues, budget envelopes, and CSV ingestion
   - RAG Phase 2 bounded chunk retrieval with verifiable page citations
4. Protect records, secrets, API contracts, and working features. Avoid speculative rewrites. Keep deterministic calculations authoritative over LLM outputs.
5. Run affected regression tests and applicable quality gates:
   - Server: npm run test:ci
   - Client: npm test && npm run build
   - AI Core: pytest tests/ evals/ && ruff check .
6. Update documentation and progress tracking with concrete, reproducible verification evidence.
```


---

## 4. Automated Verification Script Blueprint (`scripts/run-all-verifications.sh`)

```bash
#!/usr/bin/env bash
# Runs complete multi-tier regression tests and invariant evaluations
set -euo pipefail

echo "========================================================"
echo "  FinWise Multi-Tier Production Quality Verification    "
echo "========================================================"

# 1. Server Integration Tests (Port 3000)
echo "▶️ [1/3] Executing Server Vitest Integration Suites..."
cd server
npm test -- --run
cd ..

# 2. Client Component & Store Tests (Port 5173)
echo "▶️ [2/3] Executing Client RTL & MSW Suites..."
cd client
npm test -- --run
cd ..

# 3. AI Core Invariant & Topological DAG Evals (Port 8001)
echo "▶️ [3/3] Executing AI Core Pytest & Invariant Harness..."
cd server/AI_Core
pytest tests/ -v
python -m evals.runner
cd ../..

echo "========================================================"
echo "  ✅ ALL TIERS VERIFIED: 100% PASSING, ZERO REGRESSIONS  "
echo "========================================================"
```
