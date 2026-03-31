# FinWise — AI-Powered Personal Finance Platform

> A local-first, full-stack finance workspace with a React client, Express API, and Python AI Core. Turn your finances into a chat-first AI assistant with multi-agent reasoning, file uploads, conversation insights, and dual light/dark themes.

---

## Quick Links

- [Documentation Index](./docs/) — Complete documentation hub
- [Quick Start Guide](./docs/QUICK_START.md) — Get running in 5 minutes
- [Architecture Overview](./docs/ARCHITECTURE.md) — System design and structure
- [API Reference](./docs/API.md) — All REST endpoints
- [Setup Guide](./docs/SETUP.md) — Detailed environment configuration
- [User Manual](./docs/COMPREHENSIVE_USER_MANUAL.md) — End-user guide
- [Contributing](./docs/CONTRIBUTING.md) — How to contribute

---

## What FinWise Does

### Finance Management
- **Transactions** — Track income, expenses, and investments with auto-categorization
- **Budgets** — Envelope-based budgeting with period allocations and spending tracking
- **Goals & Debts** — Track financial goals, debt portfolios, and payoff strategies
- **Portfolio** — Investment portfolio overview and allocation analysis
- **Accounts** — Manage checking, savings, credit, and investment accounts
- **Merchants** — Merchant tracking with categorization
- **Recurring Rules** — Detect and manage recurring transactions
- **Monthly Close** — Period-end financial summaries and close operations

### AI-Powered Assistant
- **Multi-Agent Chat** — Route finance questions through specialist agents (budgeting, debt, investing, education, synthesis)
- **File Analysis** — Upload PDFs, spreadsheets, CSVs, images, and documents for AI analysis
- **Conversation Insights** — Extract themes, actions, and recommended next steps from chat history
- **What-If Scenarios** — Model financial scenarios and see projected outcomes
- **Financial Story** — AI-generated narrative of your financial journey
- **Actionable Insights** — AI-generated tasks and recommendations

### Workspace Features
- **Files** — Dedicated workspace for storing, organizing, and analyzing uploaded files
- **Tasks** — AI-generated action items with apply/reject workflows
- **Workflows** — Automation with cron, event, and manual triggers
- **Receipts** — OCR processing for receipt images with data extraction
- **Journal** — Financial journaling with mood tracking and handwriting support
- **Calendar** — Financial event calendar with reminders
- **Exports** — CSV and PDF data export jobs
- **Activity Feed** — Organization-wide activity stream
- **Comments** — Threaded discussions on financial items
- **Shares** — Public share links for financial stories
- **Notifications** — Real-time notification center

### Platform Features
- **Organizations** — Multi-tenant workspace with team collaboration
- **Billing** — Stripe integration with subscription management
- **Plugins** — Extensible plugin system with permission sandbox
- **Integrations** — External service connections with sync history
- **API Keys** — Scoped API key management
- **2FA** — TOTP-based two-factor authentication
- **Feature Flags** — Toggle features per organization
- **Audit Logs** — Comprehensive security and operational audit trail

---

## Architecture

```
personal-finance/
├── client/                 React 18 + Vite frontend (50 packages)
├── server/                 Express 5 + TypeScript API (55 packages)
│   └── AI_Core/            FastAPI + LangGraph AI service (24 packages)
├── packages/contracts/     Shared OpenAPI specs and typed contracts
├── docs/                   33 documentation files
├── research_references/    Academic and research materials
└── research_survey/        User research and survey data
```

### Three-Tier Architecture

| Tier        | Technology                    | Port  | Purpose                                    |
| ----------- | ----------------------------- | ----- | ------------------------------------------ |
| **Client**  | React 18 + Vite + TypeScript  | 5173  | Single-page application with PWA support   |
| **Server**  | Express 5 + TypeScript        | 3000  | REST API, auth, background workers, SSE    |
| **AI Core** | Python 3.11+ + FastAPI        | 8001  | Multi-agent LangGraph orchestration        |

### Data Stores

| Store         | Purpose                                    |
| ------------- | ------------------------------------------ |
| **MongoDB**   | Primary datastore (49 Mongoose models)     |
| **Redis**     | Rate limiting, BullMQ job queues           |
| **GridFS**    | File storage (receipts, exports, uploads)  |
| **SQLite**    | AI Core memory (user preferences, facts)   |

---

## Key Features in Detail

### Multi-Agent AI Flow

1. Client sends chat or file-analysis request to Express API
2. Server loads auth, organization, financial context, and attached files
3. Python AI Core chooses an available provider from configured `.env` keys
4. Master agent routes work to specialists (budgeting, debt, investing, education, synthesis)
5. Response returns with narrative, action items, workflow trace, and agent details

**Supported AI Providers** (failover order): Gemini → OpenRouter → Groq → Grok → Together → Mistral

### File Handling

The app stores any file type and extracts text when possible:

| File Type       | Extraction Method              |
| --------------- | ------------------------------ |
| Text/Markdown   | Direct read                    |
| CSV/JSON/XML    | Direct read + parsing          |
| Excel (XLSX)    | `xlsx` library                 |
| PDF             | `pdf-parse` library            |
| DOCX            | `mammoth` library              |
| Images          | AI Core OCR (PaddleOCR)        |
| Other binaries  | Stored without deep extraction |

### Dual Theme System

- **Light Theme** — Clean white design with subtle shadows
- **Dark Theme** — Pure black (#000) background with monochrome tokens, no grid patterns
- System preference detection and manual toggle
- CSS custom properties for all design tokens

---

## Local Setup

### Prerequisites

| Tool      | Minimum Version | Required For        |
| --------- | --------------- | ------------------- |
| Node.js   | 18.x LTS        | Server + Client     |
| npm       | 9.x             | Package management  |
| MongoDB   | 6.0+            | Primary datastore   |
| Redis     | 7.0+            | Queues + rate limit |
| Python    | 3.11+           | AI Core (optional)  |
| Git       | 2.30+           | Version control     |

### Quick Start

```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Configure environment
# Copy .env.example to .env in both server/ and client/
# Set MONGO_URI, JWT_SECRET, and other required vars

# 3. Start services (3 terminals)

# Terminal 1: AI Core (optional)
cd server/AI_Core
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
python api_service.py

# Terminal 2: Server
cd server
npm run dev

# Terminal 3: Client
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

### Full Setup Guide

See [SETUP.md](./docs/SETUP.md) for detailed instructions including database seeding, migrations, and troubleshooting.

---

## Development

### Scripts

**Server:**
```bash
npm run dev          # Start with hot reload
npm run build        # TypeScript compile
npm run check        # Type check only
npm test             # Run tests
npm run test:ci      # Run tests (CI mode)
npm run seed:content # Seed demo data
npm run migrate:transactions  # Run migrations
```

**Client:**
```bash
npm run dev          # Start Vite dev server
npm run build        # Type check + build
npm test             # Run tests
npm run lint         # ESLint check
npm run preview      # Preview production build
```

**AI Core:**
```bash
pytest tests/ -v     # Run AI Core tests
```

### Project Structure

```
client/src/
├── components/       36+ reusable UI components (Radix primitives)
├── features/         Feature modules (chat, journaling, workflows)
├── hooks/           13 custom React hooks
├── lib/             API client layer (14 domain modules)
├── pages/           34 route-level page components
├── stores/          6 Zustand state stores
├── routes/          Wouter router definitions
├── context/         Auth context provider
├── layouts/         AppShell and ChatLayout
└── types/           Shared TypeScript types

server/src/
├── config/          6 config modules (env, DB, Redis, passport, etc.)
├── controllers/     14 root + 30 v1 controllers
├── middleware/       13 middleware modules
├── models/          49 Mongoose models
├── routes/          17 route files (100+ endpoints)
├── schemas/         12 root + 23 v1 Zod validation schemas
├── services/        49 business-logic services
├── modules/         Domain modules (plugins, queue, realtime)
├── connectors/      External service connectors (stub)
├── worker/          BullMQ background worker
├── scripts/         Migration and seed scripts
└── test/            35 integration test files
```

---

## Documentation

### Getting Started
- [Quick Start](./docs/QUICK_START.md) — 5-minute setup
- [Setup Guide](./docs/SETUP.md) — Detailed environment configuration
- [Environment Variables](./docs/ENV_VARIABLES.md) — Complete env var reference

### Architecture & Design
- [Architecture](./docs/ARCHITECTURE.md) — System architecture and design decisions
- [Database](./docs/DATABASE.md) — All 49 Mongoose models
- [API Reference](./docs/API.md) — Complete REST API documentation
- [Frontend](./docs/Frontend.md) — React client architecture
- [Services](./docs/SERVICES.md) — Business logic service catalog
- [Middleware](./docs/MIDDLEWARE.md) — Express middleware stack

### AI System
- [AI Core](./docs/AI_CORE.md) — Multi-agent AI engine
- [AI Providers & Failover](./docs/AI_PROVIDERS_AND_FAILOVER.md) — Provider configuration

### Platform Features
- [Workflows](./docs/WORKFLOWS.md) — Automation system
- [Plugin System](./docs/PLUGIN_SYSTEM.md) — Extensibility architecture
- [Realtime](./docs/REALTIME.md) — SSE and domain events
- [Security](./docs/SECURITY.md) — Security architecture and 2FA

### Operations
- [Deployment](./docs/DEPLOYMENT.md) — Production deployment guide
- [Observability](./docs/OBSERVABILITY.md) — Monitoring and alerting
- [Testing](./docs/TESTING.md) — Testing strategy and commands

### User Guides
- [User Manual](./docs/COMPREHENSIVE_USER_MANUAL.md) — End-user documentation
- [Onboarding](./docs/COMPLETE_PROJECT_ONBOARDING.md) — Project onboarding
- [Dashboard & Theme](./docs/DASHBOARD_AND_THEME.md) — Dashboard and theming

### Reference
- [Mega Project Guide](./docs/MEGA_PROJECT_GUIDE.md) — Comprehensive reference
- [Mega Codebase Reference](./docs/MEGA_CODEBASE_REFERENCE.md) — Code-level details
- [Mega Data Model Compendium](./docs/MEGA_DATA_MODEL_COMPENDIUM.md) — Data models
- [Mega API Playbook](./docs/MEGA_API_PLAYBOOK.md) — API deep dive
- [Mega Frontend UI Atlas](./docs/MEGA_FRONTEND_UI_ATLAS.md) — UI components
- [Mega Developer Recipes](./docs/MEGA_DEVELOPER_RECIPES.md) — How-to guides
- [Mega Operations Runbook](./docs/MEGA_OPERATIONS_RUNBOOK.md) — Operations guide
- [Mega Security Runbook](./docs/MEGA_SECURITY_RUNBOOK.md) — Security details
- [Mega Testing Playbook](./docs/MEGA_TESTING_PLAYBOOK.md) — Testing guide
- [Mega AI Core Deep Dive](./docs/MEGA_AI_CORE_DEEP_DIVE.md) — AI system details

### Other
- [Contributing](./docs/CONTRIBUTING.md) — Contribution guidelines
- [Changelog](./docs/CHANGELOG.md) — Release history

---

## Tech Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Build:** Vite 7.3
- **Routing:** Wouter
- **State:** Zustand (client state) + React Query 5 (server state)
- **UI:** Radix UI primitives (30+), Tailwind CSS 3, class-variance-authority
- **Charts:** Recharts
- **Forms:** React Hook Form + Zod
- **Animation:** Framer Motion
- **Icons:** Lucide React
- **Markdown:** React Markdown + remark-gfm
- **PWA:** vite-plugin-pwa with Workbox caching

### Backend
- **Framework:** Express 5 with TypeScript
- **Database:** MongoDB (Mongoose 8) + Redis (ioredis)
- **Queue:** BullMQ
- **Validation:** Zod 4
- **Auth:** Passport (JWT + Google OAuth), TOTP 2FA
- **Security:** Helmet, rate limiting, CSRF, NoSQL injection sanitization
- **Logging:** Pino + Pino-HTTP
- **Metrics:** Prometheus (prom-client)
- **Tracing:** OpenTelemetry
- **Payments:** Stripe
- **Email:** Nodemailer
- **File Processing:** Multer, PDFKit, XLSX, Mammoth, PDF-parse, Papaparse

### AI Core
- **Framework:** FastAPI + Uvicorn
- **Orchestration:** LangGraph 0.2 + LangChain 0.3
- **LLMs:** Google Gemini, OpenRouter, Groq, Grok, Together, Mistral
- **Vision:** PaddleOCR, OpenCV, Pillow
- **Data:** Pandas, Pydantic 2
- **Testing:** pytest + ruff

---

## Validation

```bash
# Client
cd client
npm test
npm run build

# Server
cd server
npm run check
npm run test:ci

# AI Core
cd server/AI_Core
pytest tests/ -v
```

---

## Notes

- This project is optimized for local use and demonstration, not production hardening
- Some uploaded binary formats may be stored without deep text extraction but remain available in the Files workspace and chat attachments
- Bank connectors are stub implementations — real bank API integrations (Plaid, Yodlee, etc.) are not included
- The project was rebranded from "FinWise" to "Personal Finance" in v1.3.0; some internal references may still use the old name

---

## License

MIT License — see LICENSE file for details.
