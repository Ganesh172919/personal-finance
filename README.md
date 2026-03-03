<div align="center">
  <h1>💰 Personal Finance Application</h1>
  <p><strong>Enterprise-Grade Financial Intelligence, Automation, and Management Platform</strong></p>
  <p>
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#documentation">Documentation</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

Welcome to the **Personal Finance Application**, a state-of-the-art, full-stack personal finance management and intelligence platform. This is not just a static expense tracker—it is a comprehensive financial ecosystem designed to aggregate, analyze, predict, and automate your financial life using advanced multi-agent AI algorithms, robust microservice-like architecture, and a rich, collaborative user interface.

Designed for individuals, households, and small organizations, the platform brings enterprise-grade financial observability, automation pipelines, and intelligent insights to everyday personal finance.

---

## 🌟 Executive Summary of Capabilities

The Personal Finance Application fundamentally redefines how you interact with your money. Unlike traditional applications that rely solely on manual entry and basic visualizations, this platform introduces:

- **Autopilot & Automation:** Schedule recurring transactions, execute trigger-based workflows, and use our AI Autopilot to simulate, approve, and execute entire financial plans.
- **Proactive Artificial Intelligence:** Chat with specialized, context-aware AI agents (Investments, Debt, Budgeting, Income) that analyze your specific financial data to generate actionable insights and structured plans.
- **Organizational Collaboration:** Build financial clarity together with threaded comments, real-time activity feeds, and Role-Based Access Control (RBAC) across shared workspaces.
- **Deep Extensibility:** A secure, container-like Plugin Sandbox allows developers to build and publish third-party extensions that safely interact with core banking, categorization, and reporting services.

---

## ✨ Comprehensive Feature Matrix

### 📊 1. Core Financial Management

At the core of the application is a robust double-entry-style ledger capable of handling complex financial data with granular detail.

- **Holistic Dashboard**: A centralized, customizable command center presenting your financial vitals (Net Worth, Monthly Cash Flow, Burn Rate) through interactive Recharts-powered data visualizations.
- **Transaction Engine**: Full CRUD lifecycle for transactions including rich metadata tagging, multi-tiered categorization, attachment handling (receipts/invoices), and bulk operations.
- **Financial Accounts Register**: Maintain synchronized balances across different account types: Checking, Savings, Credit Cards, Loans, and Investment Portfolios.
- **Advanced Budgeting**: Envelope budgeting implementation supporting period-based tracking (monthly/weekly), rollover budgets, and alerting thresholds.
- **Recurring Engine**: Automated detection and management of recurring subscriptions/bills using cron-like schedulers.

### 🤖 2. Multi-Agent AI System ("Financial Copilot")

Powered by Google Gemini and orchestrated via LangGraph in Python, the AI Core is an asynchronous service working alongside the primary API.

- **Income & Expense Analyzer**: Detects spending anomalies, inflationary impacts on specific categories, and uncovers stealth subscriptions.
- **Budget Planner**: Recommends reallocation of funds based on historical velocity and upcoming predictive liabilities.
- **Investment & Debt Optimizer**: Proposes avalanche/snowball debt payoff plans and models ROI scenarios for investment rebalancing based on your risk tolerance.
- **Receipt OCR & Handwriting Vision pipeline**: Upload photos of receipts or handwritten financial notes; the AI extracts vendors, confidence-scored amounts, taxes, and automatically drafts the transaction.
- **Simulate & Execute (Autopilot)**: The AI can draft a multi-step execution plan (e.g., "Move $500 from Checking to Savings and create a new Budget for Vacation"). You review the simulation and click to execute the workflow atomically.

### 🤝 3. Collaboration & Organization Workspaces

Bridging the gap between personal tracking and household finance.

- **Multi-Tenant Workspaces (Organizations)**: Create isolated environments for separate households or side-businesses, seamlessly switching between them.
- **Granular RBAC**: Owner, Admin, and Member roles with specific permission scopes (e.g., Members can add transactions but not modify budgets).
- **Real-Time Activity Feed**: An organization-wide timeline showing when accounts are reconciled, budgets are depleted, or large transactions occur.
- **Annotations & Comments**: Start threaded discussions directly on specific transactions, goals, or budget envelopes (e.g., "Is this invoice for the kitchen remodel?").

### ⚙️ 4. Workflows, Rules, & Automation

Reduce manual toil through a highly configurable rules engine.

- **Category Rules Engine**: Define regex or matching heuristics for merchant names/amounts to automatically categorize incoming bank data.
- **Event-Driven Workflows**: Trigger custom actions based on domain events (e.g., "When Account Balance drops below $1000, send Email Alert and notify Activity Feed").
- **Cron-Scheduled Jobs**: Run background aggregation tasks for scheduled data snapshots, backup generation, or end-of-month reconciliations.

### 🛠️ 5. Plugin Marketplace & Integrations

An extensible architecture designed to grow with your needs.

- **Plugin Sandbox**: Install third-party marketplace plugins that operate within a hardened, fail-closed v8-isolate-like sandbox where manifest permissions (e.g., `transactions:read`) are strictly enforced.
- **Integration Connectors**: Pluggable modules for external synchronization, currently supporting generic CSV banking exports with extensible translation layers.
- **Webhooks & API Keys**: Generate scoped API keys to build your own CLI tools or external automations, backed by HMAC-SHA256 authenticated Webhooks for real-time state pushes.

### 🔒 6. Security, Identity, & Compliance

Fintech-grade security protocols implemented natively.

- **Authentication Options**: Stateless JWT with sliding sessions, backed by Google OAuth2 integration and traditional password-hashing.
- **Multi-Factor Authentication (MFA/2FA)**: Time-based One Time Passwords (TOTP) with emergency recovery codes.
- **Brute-Force & Defensive Mitigations**: Account lockout after 5 failed attempts, strict Rate Limiting via Redis, and comprehensive IP-based throttling.
- **CSRF & Cookie Hardening**: Synchronizer token pattern with Double-Submit Cookies for modern SPA defense.
- **Security Audit Logging**: Immutable audit trails recording 26 classes of critical system events (logins, permission changes, exports) retained for 365 days.

### 📈 7. Observability, Export, & Data Ownership

You are never locked in. You own the data.

- **Comprehensive Exporting**: Generate robust CSV ledgers or beautiful, aggregated PDF reports using PDFKit for tax preparation.
- **Metrics & Monitoring**: Prometheus endpoints exposed at `/api/metrics`, integration with OpenTelemetry for distributed tracing, and structured JSON Pino logging.

---

## 🚀 Tech Stack deep-dive

Built with modern paradigms prioritizing type-safety, performance, and developer experience.

### Frontend (Client)

- **Framework:** React 18 initialized via Vite (HMR optimization).
- **Language:** TypeScript 5+ (Strict mode).
- **Styling & UI:** Tailwind CSS combined with Radix UI headless components, resulting in a cohesive, accessible `shadcn/ui` inspired design system.
- **State Management:** Zustand for global synchronous state, decoupled from React context trees.
- **Data Fetching & Synchronization:** React Query (TanStack) providing normalized caching, optimistic UI updates, and background refetching.
- **Form Handling:** React Hook Form coupled with Zod validation parsing for 100% type-safe inputs.
- **Visual Data/Animations:** Recharts for complex SVG visualizations and Framer Motion for highly kinetic micro-interactions.
- **Routing:** Wouter for a minimal, hook-based routing footprint.

### Backend (Server)

- **Runtime:** Node.js (v18+) and Express.js (v5).
- **Language:** TypeScript 5+.
- **Database:** MongoDB utilized via Mongoose, managing 48 specific domain models with complex referential constraints.
- **Caching & Queues:** Redis backing BullMQ, handling distributed background jobs (email sending, statement generation).
- **Authentication Toolkit:** Passport.js scaling across local and OAuth2 strategies.
- **Validation & Schemas:** Extensive Zod schemas enforcing DTO contracts across 100+ REST API endpoints.
- **Logging/Observability:** Pino for high-performance structured logging.
- **Services Engine:** Over 50 isolated business logic services minimizing fat-controller anti-patterns.

### AI Core (Python Service)

- **Runtime:** Python 3.11+.
- **Orchestration:** LangGraph / LangChain for DAG-based agent routing.
- **LLM Engine:** Google Gemini integration for multimodal and language tasks.
- **API Exposer:** FastAPI / Uvicorn (internal microservice).

---

## 🏗️ Architecture & Project Structure

The project is managed as a structured monorepo separating concerns across the stack while maintaining shared contracts.

```text
personal-finance/
├── client/                     # React Frontend Application
│   ├── src/                    # Component hierarchy, Hooks, Contexts, Pages
│   ├── package.json            # Client dependencies
│   └── vite.config.ts          # Vite build configuration
├── server/                     # Node.js/Express Backend API Layer
│   ├── AI_Core/                # Native Python Multi-Agent Service
│   │   ├── agents/             # Defs for Investor, Budgeter, OCR Extract
│   │   └── main.py             # Internal FastAPI server
│   ├── src/
│   │   ├── config/             # Environment, DB, Redis, Passport, Telemetry bootstrap
│   │   ├── connectors/         # External APIs (Bank feeds, Mailers, Stripe)
│   │   ├── controllers/        # REST Route handlers (44 total controllers)
│   │   ├── middleware/         # 13 Express Middlewares (Auth, CSRF, Rate-Limit, Audit)
│   │   ├── models/             # 48 Mongoose Database Object Models
│   │   ├── modules/            # Bounded context modules (Plugins, WebSockets)
│   │   ├── routes/             # v1 Canonical router definitions
│   │   ├── schemas/            # Zod Validation parameter boundaries
│   │   ├── services/           # 50 Domain-Driven feature logic services
│   │   ├── worker/             # Background task processing (BullMQ consumers)
│   │   └── server.ts           # Primary Express HTTP Listener
│   └── package.json            # Server dependencies
├── packages/                   # Monorepo Shared Packages
│   └── contracts/              # Shared TS Interfaces, Types, and OpenAPI specs
├── docs/                       # Extensive Markdown knowledge base (16 guides)
└── README.md                   # This master document
```

---

## 📚 Comprehensive Documentation

The application features over 16 detailed architectural and feature guides to assist developers, operators, and contributors.

| Document Title            | Description                                               | Link                                        |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| **System Architecture**   | Subsystem interaction, bounded contexts, and data flow.   | [ARCHITECTURE.md](./docs/ARCHITECTURE.md)   |
| **Setup & Local Dev**     | Environment bootstrapping, Docker, and troubleshooting.   | [SETUP.md](./docs/SETUP.md)                 |
| **API Reference**         | Complete OpenAPI compliant v1 REST endpoint catalog.      | [API.md](./docs/API.md)                     |
| **Database Models**       | Schema definitions for all 48 Mongoose collections.       | [DATABASE.md](./docs/DATABASE.md)           |
| **AI Core Internals**     | System prompt engineering, LangGraph states, and OCR.     | [AI_CORE.md](./docs/AI_CORE.md)             |
| **Frontend Architecture** | Component hierarchies, custom hooks, and state strategy.  | [FRONTEND.md](./docs/FRONTEND.md)           |
| **Middleware Pipeline**   | Authentication, sanitization, and request pipeline flow.  | [MIDDLEWARE.md](./docs/MIDDLEWARE.md)       |
| **Services Layer**        | Explanation of the 50 business logic abstraction files.   | [SERVICES.md](./docs/SERVICES.md)           |
| **Plugin Ecosystem**      | Building plugins, V8 isolation, and sandbox constraints.  | [PLUGIN_SYSTEM.md](./docs/PLUGIN_SYSTEM.md) |
| **Security Posture**      | Threat models, CSRF, TOTP 2FA, API Keys, and Auditing.    | [SECURITY.md](./docs/SECURITY.md)           |
| **Observability/SRE**     | Metrics scraping, tracing, and logging conventions.       | [OBSERVABILITY.md](./docs/OBSERVABILITY.md) |
| **Testing Strategy**      | Unit, Integration, E2E practices and coverage matrices.   | [TESTING.md](./docs/TESTING.md)             |
| **Env Var Reference**     | Detailed dictionary of all ~65 system configuration keys. | [ENV_VARIABLES.md](./docs/ENV_VARIABLES.md) |
| **Deployment & Ops**      | CI/CD pipelines, Docker swarm/K8s deployment guides.      | [DEPLOYMENT.md](./docs/DEPLOYMENT.md)       |
| **Contributing**          | Style guides, commit conventions, and branch strategies.  | [CONTRIBUTING.md](./docs/CONTRIBUTING.md)   |
| **Changelog**             | Historical release notes adhering to Semantic Versioning. | [CHANGELOG.md](./docs/CHANGELOG.md)         |

---

## 🛠️ Getting Started & Local Development

This is a brief overview. Please see the complete [Setup Guide](./docs/SETUP.md) for detailed configuration, seed scripts, and AI Core setup.

### Prerequisites Check

- **Node.js**: v18.0.0 or later (LTS recommended).
- **Database**: MongoDB 6.0+ instance (Local or Atlas).
- **Caching**: Redis 7.0+ (Required for workers and rate limiting).
- **Python**: v3.11+ (Optional, only required for the AI Copilot features).

### Quick Install

**1. Clone the repository**

```bash
git clone https://github.com/organization/personal-finance.git
cd personal-finance
```

**2. Setup Backend Server**

```bash
cd server
npm install
cp .env.example .env # Configure MONGO_URI, JWT_SECRET, etc.
```

**3. Setup Frontend Client**

```bash
cd ../client
npm install
cp .env.example .env # Configure VITE_API_BASE_URL
```

### Running Locally

To start the application, you need to run both environments simultaneously (we highly recommend using terminal multiplexers like `tmux` or multiple VSCode terminal split panes).

**Terminal 1: The Backend Express Server & Workers**

```bash
cd server
npm run dev
# The API will be available at http://localhost:3000
```

_(Optional) If background jobs (exports, triggers) are needed, run `npm run worker:dev` in another pane._

**Terminal 2: The Frontend Vite Dev Server**

```bash
cd client
npm run dev
# The UI will be available at http://localhost:5173
```

Navigate to `http://localhost:5173` in your browser.

---

## 🧪 Testing and Quality Assurance

The codebase employs a robust testing pyramid utilizing **Vitest** for unit/integration testing, **Supertest** for HTTP API assertions, and **Testing Library** for React component mounting.

**Running Server tests (includes API tests on a mongodb-memory-server):**

```bash
cd server
npm test
npm run test:watch # for interactive TDD mode
```

**Running Client tests:**

```bash
cd client
npm test
```

Please refer to the [Testing Documentation](./docs/TESTING.md) for guidelines on mocking services, faking timers, and generating seed test data.

---

## 🤝 Contributing to Personal Finance

We welcome contributions from the community, whether reporting bugs, requesting new enterprise features, or submitting Pull Requests. By participating in this project, you agree to abide by our Code of Conduct.

1. Review the [Contributing Guidelines](./docs/CONTRIBUTING.md) for code styling and branch naming.
2. Fork the repository and create your feature branch: `git checkout -b feature/amazing-feature`.
3. Ensure all tests pass: `npm test`.
4. Submit a Pull Request with a comprehensive description of changes.

---

## 📄 License and Legal

This project is licensed under the **MIT License**. This liberal license allows free usage, modification, and distribution for personal or commercial use. See the `LICENSE` file in the root directory for the complete license text.

---

<div align="center">
  <p>Built with ❤️ for financial clarity and independence.</p>
</div>
