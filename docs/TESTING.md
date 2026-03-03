# Personal Finance — Testing Guide

> How to run, write, and maintain tests across the Personal Finance monorepo.

---

## Overview

| Subsystem   | Framework                      | Runner | Test Count | Location                |
| ----------- | ------------------------------ | ------ | ---------- | ----------------------- |
| **Server**  | Vitest + Supertest             | Vitest | 34 files   | `server/src/test/`      |
| **Client**  | Vitest + Testing Library + MSW | Vitest | —          | `client/src/test/`      |
| **AI Core** | Pytest                         | Pytest | —          | `server/AI_Core/tests/` |

---

## Server Tests

### Running

```bash
cd server
npm test              # Single run (CI-friendly)
npm run test:watch    # Watch mode — re-runs on file changes
npm run test:ci       # Alias for single run in CI pipelines
```

### Test Infrastructure

| File             | Purpose                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `setup.ts`       | Global Vitest setup — bootstraps the test environment                                |
| `testDb.ts`      | Connects/disconnects `mongodb-memory-server` — gives each suite a fresh in-memory DB |
| `authHelpers.ts` | Utility to create authenticated users and generate JWT tokens for protected routes   |

### How Tests Work

1. **In-Memory Database**: Tests use [`mongodb-memory-server`](https://github.com/nodkz/mongodb-memory-server) — no external MongoDB or Redis needed.
2. **HTTP Integration**: [`supertest`](https://github.com/ladjs/supertest) fires real HTTP requests against the Express app.
3. **Isolation**: Each test file gets a clean database — `testDb.ts` handles connect/teardown.
4. **Mocking**: External services (Stripe, SMTP, Gemini AI) are mocked to avoid real network calls.

### Test File Catalog

| Test File                         | Covers                                            |
| --------------------------------- | ------------------------------------------------- |
| `transactions.test.ts`            | Transaction CRUD, pagination, filtering           |
| `transactionsV1.test.ts`          | V1 transaction endpoints                          |
| `transactionsCsvImportV1.test.ts` | CSV import via integration connector              |
| `transactionsImport.test.ts`      | Legacy transaction import                         |
| `chatV1.test.ts`                  | Chat sessions and message CRUD                    |
| `tasks.test.ts`                   | AI-generated tasks CRUD and action application    |
| `workflows.test.ts`               | Workflow CRUD and execution                       |
| `workflowScheduler.test.ts`       | Cron-based workflow scheduling                    |
| `receipts.test.ts`                | Receipt upload and OCR processing                 |
| `exports.test.ts`                 | Export job creation and status                    |
| `scenarios.test.ts`               | What-if financial scenario simulation             |
| `autopilot.test.ts`               | Autopilot plan, simulate, approve, execute        |
| `toolsV2.test.ts`                 | V2 tool simulation and execution framework        |
| `internalTools.test.ts`           | Internal tool registry tests                      |
| `financeIntelligence.test.ts`     | AI-powered finance intelligence service           |
| `orgIsolation.test.ts`            | Multi-tenant data isolation (largest test: 11 KB) |
| `orgSeats.test.ts`                | Organization seat limits and membership           |
| `invites.test.ts`                 | Organization invite flow                          |
| `monetization.test.ts`            | Billing, subscription, and usage metering         |
| `referrals.test.ts`               | Referral code creation and redemption             |
| `shares.test.ts`                  | Public share link generation and access           |
| `journal.test.ts`                 | Financial journal CRUD                            |
| `csrf.test.ts`                    | CSRF double-submit cookie protection              |
| `apiKeyQuota.test.ts`             | API key rate limiting and quota enforcement       |
| `apiDeprecationHeaders.test.ts`   | Legacy API deprecation header injection           |
| `responseContext.test.ts`         | Response context middleware (request IDs, timing) |
| `summaryEndpoints.test.ts`        | Dashboard summary and aggregation endpoints       |
| `agentOutputsRecent.test.ts`      | Recent AI agent output retrieval                  |
| `planContract.test.ts`            | Subscription plan contract validation             |
| `openapiRoutesCoverage.test.ts`   | Ensures all routes are documented in OpenAPI spec |
| `vnextPlatform.test.ts`           | Next-generation platform feature tests            |

---

## Client Tests

### Running

```bash
cd client
npm test              # Single run
npm run test:watch    # Watch mode
npm run lint          # ESLint — also catches type errors and bad patterns
```

### Test Infrastructure

| File / Directory    | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `src/test/setup.ts` | Global Vitest setup — imports Testing Library matchers |
| `src/test/mocks/`   | MSW (Mock Service Worker) handlers for API mocking     |

### Stack

- **[Vitest](https://vitest.dev/)** — Test runner (same config as server)
- **[@testing-library/react](https://testing-library.com/react)** — Component rendering and querying
- **[@testing-library/user-event](https://testing-library.com/docs/user-event/intro)** — Simulates user interactions
- **[MSW](https://mswjs.io/)** — Intercepts network requests at the service worker level
- **[jsdom](https://github.com/jsdom/jsdom)** — Browser environment simulation

### Client Test Files

| Test File            | Covers                                       |
| -------------------- | -------------------------------------------- |
| `useAuth.test.tsx`   | Authentication hook (login, logout, loading) |
| `stores.test.ts`     | Zustand stores unit tests                    |
| `Dashboard.test.tsx` | Dashboard component rendering                |
| `features.test.ts`   | Feature flag and entitlement logic           |

### Writing a Client Test

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MyComponent } from "@/components/MyComponent";

describe("MyComponent", () => {
  it("renders the title", () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("handles click", async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Clicked!")).toBeInTheDocument();
  });
});
```

---

## AI Core Tests (Python)

### Running

```bash
cd server/AI_Core

# Activate the virtual environment first
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pytest tests/ -v          # Verbose output
pytest tests/ -x          # Stop on first failure
pytest tests/ -k "test_budget"  # Run matching tests only
```

---

## Writing New Tests

### Conventions

| Convention             | Rule                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| **File name**          | `<feature>.test.ts` (server/client) or `test_<module>.py` (AI Core)          |
| **Location (server)**  | `server/src/test/`                                                           |
| **Location (client)**  | Co-located with component or in `client/src/test/`                           |
| **Location (AI Core)** | `server/AI_Core/tests/`                                                      |
| **Structure**          | `describe` → `it` blocks with clear descriptions                             |
| **Database setup**     | Import and use `testDb.ts` helpers — never connect to a real DB              |
| **Authentication**     | Use `authHelpers.ts` to create users and get tokens                          |
| **External services**  | Always mock Stripe, SMTP, Gemini — never make real API calls in tests        |
| **Assertions**         | Prefer specific matchers (`toHaveProperty`, `toContain`) over generic `toBe` |

### Server Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDb, closeTestDb } from "./testDb.js";
import { createTestUser } from "./authHelpers.js";

describe("GET /api/v1/my-feature", () => {
  let token: string;

  beforeAll(async () => {
    await connectTestDb();
    const user = await createTestUser();
    token = user.token;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("returns data for authenticated user", async () => {
    const res = await request(app)
      .get("/api/v1/my-feature")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/v1/my-feature");
    expect(res.status).toBe(401);
  });
});
```

---

## CI Integration

Tests can be run as part of a CI pipeline:

```bash
# Server
cd server && npm run test:ci

# Client
cd client && npm test

# AI Core
cd server/AI_Core && pytest tests/

# Type checking (no emit)
cd server && npm run check
cd client && npm run build
```

---

_See also_: [CONTRIBUTING.md](./CONTRIBUTING.md) · [SETUP.md](./SETUP.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)
