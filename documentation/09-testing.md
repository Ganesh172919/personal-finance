# 09 — Testing & Quality Engineering

> **Complete Testing Handbook for the FinWise Autonomous Personal Finance Platform**  
> *Unit Testing, Server Integration Suites, Supertest Mocking, Client RTL Tests, AI Core Evals, and CI/CD Automation*  
> **Runtime Specification:** Node.js `>=24.14.1 <25` · Python `3.11+` · Vitest `1.6` · Supertest `6.3` · Pytest `8.3`

---

> [!TIP]
> **Developer Testing Handbook:**  
> When creating new features, follow the pre-commit quality checklist and multi-tenant test recipes in [**docs/BUILDING_ON_THIS_PROJECT.md**](../docs/BUILDING_ON_THIS_PROJECT.md).

## 1. Testing Architecture Mindmap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#3b82f6', 'lineColor': '#60a5fa', 'secondaryColor': '#0f172a', 'tertiaryColor': '#1e1e2e'}}}%%
mindmap
  root((FinWise Quality Engineering))
    Server Tier Testing
      Vitest 1.6 + Supertest Harness
      In-Memory MongoDB Server
      Tenant Scoping Invariants OrgScopePlugin
      Canonical /api/v1 Endpoint Verification
      Mock Auth Helpers JWT & API Keys
    Client Tier Testing
      Vitest + React Testing Library
      Mock Service Worker MSW Handlers
      Zustand Store Unit Tests
      Component Render & Interaction Tests
      Accessibility axe-core Audits
    AI Core Tier Testing
      Pytest 8.3 + FastAPI TestClient
      Deterministic Math Calculators
      SubAgentManager Kahn Sort Concurrency
      Aggregator Conflict Resolution
      Evaluation Suite Invariant Harness
        Number Safety sum(Delta) == 0
        Candidate Digits Subset Verification
        Specialist Routing Accuracy >= 95%
        p50 & p95 Latency Benchmarks
    CI/CD Pipelines
      GitHub Actions Multi-Tier Matrix
      Node 24 LTS & Python 3.11 Runtimes
      Linting Ruff & TypeScript Check
      Automated Build & Asset Verification
```

---

## 2. Multi-Tier Test Pyramid ASCII Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FINWISE QUALITY TEST PYRAMID                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                ▲                                                │
│                                               / \                                               │
│                                              /   \     E2E / Browser Smoke Tests                │
│                                             /     \    (Playwright / Smoke Matrix)              │
│                                            /───────\                                            │
│                                           /         \   Server Integration Tests                │
│                                          /           \  (Vitest + Supertest + In-Memory Mongo)  │
│                                         /             \ (FastAPI TestClient + LangGraph)        │
│                                        /───────────────\                                        │
│                                       /                 \ Client Component & Store Tests        │
│                                      /                   \ (React Testing Library + MSW)        │
│                                     /                     \ (Zustand state slices & hooks)      │
│                                    /───────────────────────\                                    │
│                                   /                         \ AI Core Invariant Eval Harness    │
│                                  /                           \ (evals.runner, Number Safety)    │
│                                 └─────────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Server Integration Testing (Express 5 & Vitest)

### 3.1 Harness Setup & Architecture
The server integration test suite executes in `server/src/test/` using **Vitest** and **Supertest** against an ephemeral, in-memory MongoDB replica set initialized via `mongodb-memory-server`:

```typescript
// server/src/test/testDb.ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod: MongoMemoryServer;

export async function connectTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}
```

### 3.2 Multi-Tenant Data Isolation Test Blueprint
Every model and endpoint must strictly verify that cross-tenant access is blocked:

```typescript
// server/src/test/orgIsolation.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./testDb";
import { generateAuthToken } from "./authHelpers";
import { TransactionModel } from "../models/transactionModel";

describe("Tenant Data Isolation Verification", () => {
  let app: any;

  beforeAll(async () => {
    await connectTestDb();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("should prevent Tenant B from reading Tenant A's transactions", async () => {
    const orgA = "org_alpha_123";
    const orgB = "org_beta_456";
    const userA = "user_a";
    const userB = "user_b";

    // Seed transaction belonging to Tenant A
    await TransactionModel.create({
      orgId: orgA,
      userId: userA,
      amount: -125.50,
      category: "Groceries",
      merchant: "Whole Foods",
      date: new Date()
    });

    const tokenB = generateAuthToken({ userId: userB, orgId: orgB });

    const res = await request(app)
      .get("/api/v1/finance/transactions")
      .set("Authorization", `Bearer ${tokenB}`)
      .set("X-Org-ID", orgB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0); // Tenant B sees zero records
  });
});
```

---

## 4. Client Component & Store Testing (React 18 & RTL)

### 4.1 Mock Service Worker (MSW) Network Mocking
Client tests run inside `client/src/` using **Vitest**, **React Testing Library**, and **MSW** to intercept network calls:

```typescript
// client/src/test/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/v1/command-center", () => {
    return HttpResponse.json({
      success: true,
      data: {
        greeting: "Good morning",
        kpis: { runwayDays: 92, liquidBalance: 14500, avgDailyBurn: 157.60 },
        signals: [{ id: "sig_1", urgency: "act_now", title: "Urgent Review Required" }]
      }
    });
  }),
  http.get("/api/v1/budget-health", () => {
    return HttpResponse.json({
      success: true,
      data: {
        score: 84,
        breakdown: { adherenceScore: 36, cleanlinessScore: 18, goalScore: 16, debtScore: 14 }
      }
    });
  })
];
```

### 4.2 Component Render & Interaction Test Blueprint
```typescript
// client/src/pages/FinanceOS.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import FinanceOS from "./FinanceOS";
import { AppProviders } from "../app/providers/AppProviders";

describe("FinanceOS Operational Cockpit", () => {
  it("renders the 5 operational surface tabs and displays the health gauge", async () => {
    render(
      <AppProviders>
        <FinanceOS />
      </AppProviders>
    );

    // Verify tabs are present
    expect(screen.getByText(/Command Center/i)).toBeInTheDocument();
    expect(screen.getByText(/Review Queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Autopilot/i)).toBeInTheDocument();
    expect(screen.getByText(/Budget Coach/i)).toBeInTheDocument();
    expect(screen.getByText(/Copilot/i)).toBeInTheDocument();

    // Verify Command Center KPI metrics render from MSW
    await waitFor(() => {
      expect(screen.getByText("84")).toBeInTheDocument(); // Health score
      expect(screen.getByText(/92 days/i)).toBeInTheDocument(); // Runway days
    });
  });
});
```

---

## 5. AI Core Invariant Verification & Eval Suite

### 5.1 The Number Safety Invariant Test
The most critical safety test in the AI Core verifies that no AI agent can mutate monetary numbers or create money out of thin air:

```python
# server/AI_Core/evals/test_number_safety.py
import pytest
from agents.aggregator import AggregatorAgent

def test_zero_sum_budget_reallocation_invariant():
    aggregator = AggregatorAgent()
    
    # Baseline user budgets
    reference_envelopes = {"Dining": 500.0, "Groceries": 600.0, "Entertainment": 300.0}
    
    # AI proposed deltas
    proposed_plan = {
        "Dining": 400.0,         # -$100
        "Groceries": 700.0,      # +$100
        "Entertainment": 300.0   # $0
    }
    
    is_valid, reason = aggregator.verify_number_safety(
        baseline=reference_envelopes,
        proposed=proposed_plan
    )
    
    assert is_valid is True
    assert reason == "CONSERVED"

def test_hallucinated_money_rejection():
    aggregator = AggregatorAgent()
    baseline = {"Dining": 500.0, "Groceries": 600.0}
    
    # Proposes increasing Groceries without offsetting reduction (creating money)
    invalid_plan = {"Dining": 500.0, "Groceries": 800.0}
    
    is_valid, reason = aggregator.verify_number_safety(baseline, invalid_plan)
    assert is_valid is False
    assert "Zero-Sum Conservation Violated" in reason
```

### 5.2 Running the Full Test Suite

```bash
# 1. Run Server Integration Tests
cd server
npm run test:ci

# 2. Run Client Component Tests & Build Verification
cd ../client
npm test
npm run build

# 3. Run Python AI Core Tests & Invariant Evals
cd ../server/AI_Core
pytest tests/ -v
python -m evals.runner
```


---

## 6. End-to-End Load & Stress Testing (Artillery Suite)

To ensure the Express 5 gateway and Python FastAPI AI Core maintain sub-250ms p95 latency under high concurrent load, the platform utilizes **Artillery**:

```yaml
# tests/load/artillery-load-test.yml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 50
      name: "Ramp up to 50 concurrent users"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load of 50 req/sec"
  defaults:
    headers:
      Content-Type: "application/json"
  processor: "./artillery-processor.js"

scenarios:
  - name: "Authenticated Cockpit Flow"
    beforeRequest: "authenticateUser"
    flow:
      - get:
          url: "/api/v1/finance/summary"
          expect:
            - statusCode: 200
      - get:
          url: "/api/v1/budgets/health-score"
          expect:
            - statusCode: 200
      - post:
          url: "/api/v1/transactions"
          json:
            amount: 42.50
            category: "Dining"
            merchant: "Artillery Bistro"
            date: "{{ $isoDate }}"
          expect:
            - statusCode: 201
```

```javascript
// tests/load/artillery-processor.js
const jwt = require("jsonwebtoken");

module.exports = {
  authenticateUser: (requestParams, context, ee, next) => {
    const token = jwt.sign(
      { userId: "user_load_test", orgId: "org_load_test", role: "admin" },
      process.env.JWT_SECRET || "test-secret-at-least-32-characters-long",
      { expiresIn: "1h" }
    );
    requestParams.headers = requestParams.headers || {};
    requestParams.headers.Authorization = `Bearer ${token}`;
    requestParams.headers["X-Org-Id"] = "org_load_test";
    return next();
  }
};
```
