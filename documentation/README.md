# FinWise — AI-Powered Personal Finance Platform

> Your intelligent financial workspace. Track, analyze, and optimize your finances with AI-driven insights.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6%2B-green.svg)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [System Architecture](#system-architecture)
- [API Overview](#api-overview)
- [Database](#database)
- [Security](#security)
- [Performance](#performance)
- [Deployment](#deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Project Overview

FinWise is a comprehensive, full-stack personal finance management platform that combines traditional financial tracking with AI-powered analysis and recommendations. Built as a monorepo with a React frontend, Express backend, and Python-based AI engine, it provides users with a complete financial workspace.

### Target Users

- **Individuals** seeking to track income, expenses, investments, and financial goals
- **Families and small teams** managing shared finances through organization workspaces
- **Financially curious users** who want AI-driven insights and personalized recommendations
- **Developers** looking for an extensible, open-source finance platform with plugin support

### Core Purpose

FinWise addresses the gap between simple expense trackers and complex enterprise financial tools. It provides:

- **Holistic financial visibility** — transactions, budgets, goals, debts, investments in one place
- **AI-powered intelligence** — natural language queries, automated analysis, personalized plans
- **Automation** — recurring transactions, workflow triggers, scheduled reports
- **Collaboration** — multi-tenant organizations with role-based access
- **Extensibility** — plugin system, API access, webhook integrations

---

## Features

### User-Facing Features

| Feature | Description |
|---|---|
| **Dashboard** | Real-time financial overview with key metrics, recent activity, and actionable insights |
| **Transaction Management** | Add, categorize, split, and search transactions with provenance tracking |
| **Budget & Envelopes** | Period-based budgeting with category allocations and envelope tracking |
| **Goals & Debts** | Track financial goals (savings, investments) and debt repayment plans |
| **AI Financial Copilot** | Natural language chat interface for financial analysis and advice |
| **Financial Story** | Narrative-driven financial summaries and milestone tracking |
| **Investment Portfolio** | Track and analyze investment holdings and performance |
| **Scenario Planning** | What-if analysis for major financial decisions |
| **Receipt Scanning** | OCR-powered receipt parsing with PaddleOCR |
| **Financial Calendar** | Calendar view of upcoming bills, reminders, and financial events |
| **Workflows & Automation** | Create automated workflows with triggers and actions |
| **Task Management** | 7/30/365-day bucket task system for financial actions |
| **Analytics & Reports** | Spending heatmaps, category trends, income/expense breakdowns |
| **Exports** | Export data in CSV, PDF, and XLSX formats |
| **Notes & Journaling** | Financial journaling with mood tracking and handwriting support |
| **Multi-Organization** | Create and switch between personal and team organizations |
| **Growth Stories & Blog** | Educational content and financial literacy articles |
| **Notifications** | Real-time notifications via SSE for important financial events |
| **PWA Support** | Installable progressive web app with offline caching |
| **Dark/Light Themes** | System-aware theme with manual toggle |

### Developer Features

| Feature | Description |
|---|---|
| **RESTful API** | 100+ endpoints with OpenAPI specs and Zod validation |
| **Plugin System** | Sandboxed plugin architecture with manifest-based installation |
| **API Keys** | Scoped API key authentication for programmatic access |
| **Webhooks** | Stripe webhook integration and domain event system |
| **SSE Streaming** | Server-sent events for real-time updates |
| **TypeScript Contracts** | Shared typed contracts between frontend and backend |
| **OpenTelemetry** | Distributed tracing across all services |
| **Prometheus Metrics** | Built-in observability metrics endpoint |
| **Feature Flags** | Runtime feature toggling per organization |
| **Comprehensive Testing** | 35+ integration tests, unit tests, and MSW mocks |

---

## Tech Stack

### Frontend (`client/`)

| Category | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 7 |
| Routing | Wouter |
| Server State | TanStack React Query 5 |
| Client State | Zustand 5 |
| UI Components | Radix UI (30+ primitives) |
| Styling | Tailwind CSS 3 + CSS custom properties |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Animation | Framer Motion |
| Icons | Lucide React |
| PWA | vite-plugin-pwa + Workbox |
| Testing | Vitest + Testing Library + MSW |
| Command Palette | cmdk |
| Tables | TanStack Table |

### Backend (`server/`)

| Category | Technology |
|---|---|
| Framework | Express 5 + TypeScript |
| Runtime | Node.js (tsx for TypeScript execution) |
| Database | MongoDB (Mongoose 8) |
| Cache/Queue | Redis (ioredis) + BullMQ |
| Validation | Zod 4 |
| Authentication | Passport (JWT + Google OAuth), TOTP 2FA |
| Security | Helmet, express-rate-limit, CSRF protection, NoSQL injection sanitization |
| Logging | Pino + Pino-HTTP |
| Metrics | Prometheus (prom-client) |
| Tracing | OpenTelemetry |
| Payments | Stripe |
| Email | Nodemailer |
| File Processing | Multer, PDFKit, XLSX, Mammoth, PDF-parse, Papaparse |
| File Storage | MongoDB GridFS |
| Testing | Vitest + supertest + mongodb-memory-server |

### AI Core (`server/AI_Core/`)

| Category | Technology |
|---|---|
| Framework | FastAPI + Uvicorn |
| Orchestration | LangGraph 0.2 + LangChain 0.3 |
| LLM Providers | Google Gemini, OpenRouter, Groq, Grok (XAI), Together, Mistral |
| Vision/OCR | PaddleOCR, OpenCV, Pillow |
| Data Processing | Pandas, Pydantic 2 |
| Memory | SQLite |
| Testing | pytest + ruff |

### Infrastructure & DevOps

| Category | Technology |
|---|---|
| Containerization | Docker + Docker Compose |
| Package Management | npm workspaces |
| Code Quality | ESLint, Prettier, Ruff (Python) |

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd personal-finance

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp server/.env.example server/.env
cp client/.env.example client/.env

# 4. Start MongoDB and Redis (via Docker)
docker compose up -d mongo redis

# 5. Start all services
npm run dev
```

The application will be available at:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **AI Core:** http://localhost:8001

See [01-getting-started.md](./01-getting-started.md) for detailed setup instructions.

---

## Documentation

| Document | Description |
|---|---|
| [01 — Getting Started](./01-getting-started.md) | Prerequisites, installation, environment variables, running the app |
| [02 — Architecture](./02-architecture.md) | System design, folder structure, data flow, key modules |
| [03 — API Reference](./03-api-reference.md) | Complete REST API documentation with examples |
| [04 — Database Schema](./04-database-schema.md) | All 49 Mongoose models, relationships, ER diagram |
| [05 — AI System](./05-ai-system.md) | Multi-agent architecture, providers, memory, OCR |
| [06 — Security](./06-security.md) | Authentication, authorization, data protection |
| [07 — Performance](./07-performance.md) | Caching, optimization, scalability |
| [08 — Deployment](./08-deployment.md) | Hosting, CI/CD, production configuration |
| [09 — Testing](./09-testing.md) | Test strategy, running tests, writing tests |
| [10 — Troubleshooting](./10-troubleshooting.md) | Common errors and solutions |
| [11 — Contributing](./11-contributing.md) | Coding standards, branching, PR guidelines |
| [12 — Future Improvements](./12-future-improvements.md) | Planned features, known limitations |

---

## System Architecture

FinWise follows a **three-tier monorepo architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (React/Vite)                     │
│  Port: 5173 | React 18 + TypeScript + Tailwind CSS          │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / REST API
┌────────────────────────▼────────────────────────────────────┐
│                     Server (Express)                         │
│  Port: 3000 | Express 5 + TypeScript + MongoDB + Redis      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Controllers  │  │  Middleware  │  │    Services      │   │
│  │  (14 root +  │  │  (13 modules)│  │  (49 modules)    │   │
│  │  30 v1)      │  │              │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Models     │  │   Routes     │  │     Worker       │   │
│  │  (49 models) │  │  (17 files)  │  │  (background)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└────────┬──────────────────────────────┬──────────────────────┘
         │                              │
    ┌────▼────┐                  ┌──────▼──────┐
    │ MongoDB │                  │    Redis    │
    │ :27017  │                  │   :6379     │
    └─────────┘                  └─────────────┘
         │
         │ HTTP calls
┌────────▼────────────────────────────────────────┐
│              AI Core (FastAPI)                   │
│  Port: 8001 | Python + LangGraph + Multi-LLM    │
│                                                   │
│  ┌────────────┐  ┌───────────┐  ┌────────────┐  │
│  │   Agents   │  │  Graph    │  │   Tools    │  │
│  │   (6)      │  │ Workflow  │  │  + Memory  │  │
│  └────────────┘  └───────────┘  └────────────┘  │
└───────────────────────────────────────────────────┘
```

See [02-architecture.md](./02-architecture.md) for the complete architecture documentation.

---

## API Overview

The API is organized into the following route groups:

| Group | Prefix | Endpoints |
|---|---|---|
| Authentication | `/api/v1/auth` | Login, register, Google OAuth, 2FA |
| Organizations | `/api/v1/orgs` | CRUD, members, invites, settings |
| Finance | `/api/v1/finance/*` | Accounts, budgets, merchants, recurring, forecast |
| Transactions | `/api/v1/finance/transactions` | CRUD, CSV import, categorization |
| AI | `/api/v1/ai` | Command, streaming, scenario analysis |
| Chat | `/api/v1/chat` | Sessions, messages |
| Workflows | `/api/v1/workflows` | CRUD, execution, templates |
| Analytics | `/api/v1/analytics` | Overview, trends, heatmaps |
| Tasks | `/api/v1/tasks` | CRUD, bucket management |
| Receipts | `/api/v1/receipts` | Upload, OCR parsing |
| Files | `/api/v1/files` | Upload, list, download |
| Journal | `/api/v1/journal` | Entries with mood/handwriting |
| Billing | `/api/v1/billing` | Stripe checkout, portal, webhook |
| Notifications | `/api/v1/notifications` | List, mark read |
| Search | `/api/v1/search` | Global search |
| Exports | `/api/v1/exports` | Create, download (CSV/PDF/XLSX) |
| Plugins | `/api/v1/plugins` | Catalog, install, update |
| Integrations | `/api/v1/integrations` | Connect, sync, health |

See [03-api-reference.md](./03-api-reference.md) for the complete API documentation.

---

## Database

FinWise uses **MongoDB** as its primary datastore with **49 Mongoose models** organized into the following domains:

| Domain | Models |
|---|---|
| **User & Organization** | User, Organization, OrgMember, OrgInvite |
| **Finance** | Transaction, Account, BudgetAllocation, Merchant, RecurringRule, MonthClose, CategoryRule |
| **AI & Chat** | ChatSession, ChatMessage, AgentOutput, AIResponseCache, MemoryRecord |
| **Features** | Workflow, WorkflowRun, Task, Receipt, JournalEntry, ExportJob, WorkspaceFile, Comment, ShareLink, Notification, CalendarReminder, GrowthStory |
| **Platform** | Subscription, BillingAccount, Entitlement, UsageLedger, ApiKey, FeatureFlag, IntegrationConnection, PluginInstall, MarketplacePlugin, ReferralCode, AuditEvent, AutopilotRun, ToolExecution, DomainEvent, FinancialProfile, CreditGrant |

**Redis** is used for rate limiting, BullMQ job queues, and response caching.

**SQLite** powers the AI Core's memory system for user preferences and conversation facts.

**MongoDB GridFS** handles file storage for receipts, exports, and uploaded documents.

See [04-database-schema.md](./04-database-schema.md) for the complete schema documentation.

---

## Security

| Layer | Implementation |
|---|---|
| **Authentication** | JWT in HTTP-only cookies, Google OAuth 2.0, TOTP 2FA, scoped API keys |
| **Authorization** | Role-based access control (RBAC) at organization level |
| **Data Protection** | bcrypt password hashing, CSRF protection, NoSQL injection sanitization |
| **Headers** | Helmet security headers, configurable CORS |
| **Rate Limiting** | Multi-tier (200 req/min general, 20 req/min auth) with org/user/IP scoping |
| **Audit** | Comprehensive audit logging for user and organization actions |

See [06-security.md](./06-security.md) for the complete security documentation.

---

## Performance

| Strategy | Implementation |
|---|---|
| **Caching** | AI response caching, Redis response cache, React Query client-side caching |
| **Database** | Mongoose indexes, query optimization, connection pooling |
| **Frontend** | Lazy-loaded routes, virtual lists, image lazy loading, code splitting |
| **Background Jobs** | BullMQ queue for exports, workflow runs, and integration syncs |
| **PWA** | Workbox service worker with NetworkFirst/CacheFirst strategies |
| **Streaming** | SSE for real-time updates, AI response streaming |

See [07-performance.md](./07-performance.md) for details.

---

## Deployment

### Services & Ports

| Service | Port | Protocol |
|---|---|---|
| Client (Vite) | 5173 | HTTP |
| Server (Express) | 3000 | HTTP |
| AI Core (FastAPI) | 8001 | HTTP |
| MongoDB | 27017 | TCP |
| Redis | 6379 | TCP |

### Production Build

```bash
# Build frontend
npm run build --workspace=client

# Build backend
npm run build --workspace=server

# Start production server
npm run start --workspace=server
```

See [08-deployment.md](./08-deployment.md) for the complete deployment guide.

---

## Testing

| Layer | Framework | Files |
|---|---|---|
| **Server** | Vitest + supertest + mongodb-memory-server | 35 integration tests |
| **Client** | Vitest + Testing Library + MSW | Component and store tests |
| **AI Core** | pytest + ruff | 15 test files |

```bash
# Run all server tests
npm test --workspace=server

# Run all client tests
npm test --workspace=client

# Run AI Core tests
cd server/AI_Core && pytest
```

See [09-testing.md](./09-testing.md) for the complete testing guide.

---

## Troubleshooting

Common issues and their solutions are documented in [10-troubleshooting.md](./10-troubleshooting.md), including:

- MongoDB connection failures
- Redis unavailability
- AI Core connectivity issues
- CORS and cookie problems
- Port conflicts
- Environment variable misconfigurations

---

## Contributing

We welcome contributions! Please read [11-contributing.md](./11-contributing.md) for:

- Coding standards and conventions
- Branching strategy (GitFlow)
- Pull request guidelines
- Commit message format
- Code review process

---

## Future Improvements

Planned features and known limitations are documented in [12-future-improvements.md](./12-future-improvements.md), including:

- Bank account connectors (Plaid, Tink)
- Multi-currency support
- Mobile app (React Native)
- Advanced investment analytics
- Tax optimization engine
- Collaborative budgeting

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](../LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for financial clarity
</p>
