# Personal Finance Management Platform

### AI-Powered Financial Strategist (Mini Project)

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-f44336?style=for-the-badge&logo=langchain&logoColor=white)

---

## ðŸ‘¥ Our Team

- **M. Jagadeeswar Reddy** - 23BDS033
- **J. Ganesh Kumar Reddy** - 23BDS024
- **B. Varshith** - 23BDS011
- **Hari** - 23BEC021

---

## ðŸ“– About The Project

This **Personal Finance Management Platform** is a comprehensive mini-project designed to act as an intelligent financial co-pilot. Unlike traditional budgeting apps that merely track transactions, this platform utilizes advanced AI to provide personalized, actionable, and holistic financial advice. It empowers users to move beyond simple tracking and helps answer complex, context-aware questions such as, _"Based on my current spending and savings, can I afford a â‚¹50,000 vacation in 6 months?"_

The core of this platform is a sophisticated **multi-agent AI system**. Rather than relying on a single, monolithic AI model, the system employs a team of specialized agentsâ€”expert in budgeting, investing, debt management, and moreâ€”all coordinated by a "Master Strategist" agent. This architecture allows the platform to deconstruct complex financial inquiries, delegate tasks to the appropriate domain expert, and synthesize the results into a single, cohesive, and actionable plan for the user.

### âœ¨ Core Features

- **AI-Powered Dashboard:** A central "Strategist's Desk" that visualizes key financial vitals like cash flow, savings rate, and goal progress, all driven by live data.
- **Actionable Insights:** AI-generated cards that continuously monitor your finances and highlight specific risks and opportunities (e.g., "High spending in 'Dining Out'", "Opportunity to optimize debt").
- **Interactive Insight Details:** Deep-dive into AI analysis with clickable insight cards. Each card opens a detailed modal with full, markdown-rendered reports (e.g., "ðŸŽ¯ **YOUR COMPREHENSIVE FINANCIAL PLAN**").
- **Interactive AI Command Bar:** A natural language chat interface where users can ask complex financial questions and receive detailed, multi-step answers from the agent team.
- **What-If Scenarios:** A powerful simulation engine to test the financial impact of major life decisions, such as buying a vehicle or receiving a salary hike, before making them.
- **Dedicated Insight & Goal Tracking:** Comprehensive pages to review the history of AI recommendations and track progress towards diverse financial goals and portfolio growth.
- **Live Agent Visualization:** A unique sidebar widget (`AgentWorkflowVisualizer`) that provides transparency into the AI's "thought process," showing the agent network in real-time as they collaborate to solve user queries.
- **Secure Authentication:** Implementation of industry-standard security practices using Node.js, Passport.js, and httpOnly JWT cookies to ensure user data remains safe.

---

## ðŸ—ï¸ Project Architecture

The platform follows a robust **modular 3-tier architecture**, ensuring scalability, maintainability, and security. Each layerâ€”**Frontend**, **Backend**, and **AI Core**â€”is independently focused and communicates through secure APIs.

```text
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚      Frontend Client      â”‚      â”‚       Backend Server      â”‚      â”‚         AI Core API        â”‚
â”‚   (React + TypeScript)    â”‚      â”‚   (Node.js + Express)     â”‚      â”‚ (Python + FastAPI/LangGraph)â”‚
â”‚   (Vite @ localhost:5173) â”‚      â”‚  (Express @ localhost:3000)â”‚     â”‚   (FastAPI @ localhost:8001)â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
             â”‚                                   â”‚                                 â”‚
             â”‚  <â”€â”€â”€ UI / State Sync â”€â”€â”€>        â”‚                                 â”‚
             â”‚  <â”€â”€â”€ API Calls (React Query) â”€â”€â”€>â”‚                                 â”‚
             â”‚          (e.g. /api/agent-outputs/user/:id)                         â”‚
             â”‚                                   â”‚ <â”€â”€ Auth / DB Ops â”€â”€â”€> [MongoDB]â”‚
             â”‚                                   â”‚ <â”€â”€ AI Request (user_profile) â”€>â”‚
             â”‚  <â”€â”€ Structured JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚ <â”€â”€ AI Plan + Metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
             â”‚  <â”€â”€ Final Response (Serves JSON Data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
```

### 1. Frontend (Client)

The user interface is a fast, modern single-page application (SPA) built for a seamless user experience.

- **Stack:** **React**, **Vite**, **TypeScript**, **Tailwind CSS**
- **Data Fetching:** **React Query (TanStack Query)** manages server state, handling caching, refetching, and mutations to provide a snappy, instantaneous UI.
- **Routing:** **Wouter** offers a minimal, hook-based routing solution to manage application pages (Dashboard, Portfolio, Insights, etc.).
- **UI & UX:** Built with **shadcn/ui** for a robust component library (Cards, Buttons, Modals) and enhanced with **Framer Motion** for smooth, professional animations.
- **State Management:** Utilizes React Query for effective server state management and React Context (`useAuth`) for global client-side state.

### 2. Backend (Server)

The Node.js backend serves as the secure central hub, managing user data, authentication, and orchestrating communication between the client and the AI Core.

- **Stack:** **Node.js**, **Express**, **TypeScript**
- **Database:** **MongoDB** with **Mongoose** enables flexible, document-based storage for:
  - `userModel`: Secure storage of user credentials and profile information.
  - `financialProfileModel`: A rich, complex document structure containing transactions, goals, debts, and income streams.
  - `agentOutputModel`: Archives structured JSON outputs from AI interactions to build a historical repository of advice.
- **Authentication:** Implemented via **Passport.js** with a JWT (JSON Web Token) strategy. Tokens are issued as secure **httpOnly cookies**, ensuring they are automatically handled in API requests without client-side exposure.
- **Role:** It acts as a **secure gateway**, validating user input and data before constructing a sanitized `user_profile` object to forward to the AI Core. This ensures the client never interacts directly with the AI service.

### 3. AI Core (Python Microservice)

The "brain" of the platform is a dedicated microservice (`api_service.py`) optimized for heavy AI processing.

- **Stack:** **Python**, **FastAPI**, **LangGraph**
- **API:** **FastAPI** delivers a high-performance, asynchronous API layer to receive requests from the Node.js backend.
- **Orchestration:** **LangGraph** (by LangChain) defines a stateful _workflow graph_ (`workflow.py`). It intelligently routes queries to the correct specialized agent based on user intent.
- **The Agent Team:** A suite of specialized agents, each powered by **Google Gemini** and custom system prompts:
  - `MasterFinancialStrategistAgent`: The orchestrator that decomposes queries and synthesizes final reports.
  - `IncomeExpenseAnalyzerAgent`: Deep-dives into transaction history to identify patterns.
  - `BudgetPlannerAgent`: Constructs optimized 50/30/20 budgets.
  - `InvestmentAdvisorAgent`: Recommends portfolios based on risk tolerance.
  - `DebtOptimizerAgent`: Strategies debt payoff (Snowball vs. Avalanche).
  - `FinancialEducatorAgent`: Provides clear explanations of financial concepts.

---

## ðŸ“ Project Folder Structure

```bash
PERSONAL-FINANCE-PLATFORM/
â”œâ”€â”€ client/          # React + TypeScript Frontend Application
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ features/
â”‚   â”‚   â””â”€â”€ services/
â”‚   â””â”€â”€ ...
â””â”€â”€ server/          # Backend & AI Services
    â”œâ”€â”€ AI_Core/     # Python FastAPI + LangGraph Microservice
    â”‚   â”œâ”€â”€ agents/
    â”‚   â”œâ”€â”€ workflow.py
    â”‚   â””â”€â”€ api_service.py
    â””â”€â”€ src/         # Node.js + Express Backend
        â”œâ”€â”€ models/
        â”œâ”€â”€ routes/
        â””â”€â”€ middleware/
```

---

## ðŸš€ Getting Started (Localhost)

### Native dev (3 terminals)

Prerequisites:
- Node.js (v20+ recommended)
- Python (3.11+; 3.11 recommended for full OCR support)
- MongoDB (local or Atlas)

1) Backend (Node.js Server)

```bash
cd server
npm install
npm run dev
```

2) AI Core (Python Microservice)

```bash
cd server/AI_Core
pip install -r requirements.txt
uvicorn api_service:app --reload --port 8001
```

Notes:
- On Python 3.13+, core AI endpoints work normally; OCR endpoints run in graceful-degraded mode unless Paddle OCR dependencies are available.
- Check `GET /health` on AI Core for `vision.ready` and `vision.missing` dependency status.

3) Frontend (React Client)

```bash
cd client
npm install
npm run dev
```

Then open http://localhost:5173

### Helper scripts (Windows / PowerShell)

Start all services (writes PIDs + logs to `.tmp/`):

```powershell
./scripts/start-local.ps1
```

`start-local.ps1` now:
- auto-creates missing `.env` files from `.env.example` and backfills missing keys in existing env files
- installs Node/Python dependencies if they are missing
- auto-selects a Python launcher (`py -3.11`, then `py -3`, then `python`) unless `AI_CORE_PYTHON` is set
- creates and uses `server/AI_Core/.venv` for isolated AI Core dependencies/runtime
- defaults to dev OTP mode by clearing `EMAIL_*` at runtime (set `ALLOW_SMTP_IN_LOCAL=true` to keep SMTP)

Stop all services:

```powershell
./scripts/stop-local.ps1
```

Smoke test (assumes services already running):

```powershell
./scripts/smoke-running.ps1
```

`smoke-running.ps1` validates backend + AI workflows directly through `http://127.0.0.1:3000` and treats `http://127.0.0.1:5173` frontend reachability as a non-blocking probe.

#### Dev email verification (no SMTP required)

If `EMAIL_USER` / `EMAIL_PASSWORD` / `EMAIL_FROM` are not set and `NODE_ENV` is **not** `production`, the server runs in **console OTP** mode:
- `POST /api/auth/register` and `POST /api/auth/resend-verification` include `dev_otp` in the JSON response.

#### Google OAuth auto-detect

The client calls `GET /api/auth/providers` and only shows “Continue with Google” when:
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

### Containerized Run (Cloud-Like)

Build and run the full stack with Docker Compose:

```bash
docker compose up --build
```

Services:
- Client: `http://localhost:8080`
- Server API: `http://localhost:3000`
- AI Core: `http://localhost:8001`
- MongoDB: `mongodb://localhost:27017`

Production-oriented compose file (expects production-grade env secrets):

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

---

## ðŸš€ Demo Working App

This project comes with a fully functional flow demonstrating the power of multi-agent intelligence in personal finance. The demo showcases:

1.  **User Onboarding:** Secure account creation and financial profile setup.
2.  **Data Ingestion:** Real-time processing of income, expenses, and debts.
3.  **AI Analysis:** The "AgentWorkflowVisualizer" showing agents in action.
4.  **Strategic Output:** Comprehensive, actionable financial plans generated by the Master Strategist.

_A video demonstration or live link may be available upon request._

---

**Personal Finance Management Platform** â€” _Empowering smarter financial decisions through multi-agent intelligence_ ðŸ’¡

## Environment Variables (high level)

Templates:
- `server/.env.example` -> copy to `server/.env`
- `server/AI_Core/.env.example` -> copy to `server/AI_Core/.env`
- `client/.env.example` -> copy to `client/.env`

Server (`server/.env`):
- `JWT_SECRET` (required)
- `MONGO_URI` (required in production; non-production falls back to in-memory MongoDB if absent/unreachable)
- `PYTHON_API_URL` (defaults to `http://localhost:8001`)
- `CLIENT_URL` / `CORS_ORIGINS` (defaults to `http://localhost:5173`)
- `TRUST_PROXY` (`true|false|N`; enable for reverse proxies/load balancers)
- `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN` (cookie policy controls)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` (optional OAuth config)
- `EMAIL_USER` / `EMAIL_PASSWORD` / `EMAIL_FROM` (required together for SMTP mode)
- `EMAIL_SERVICE` (optional; default `gmail` when `EMAIL_HOST` is not provided)
- `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` / `EMAIL_REQUIRE_TLS` (optional explicit SMTP transport)

AI Core (`server/AI_Core/.env`):
- `GEMINI_API_KEY` (optional; AI Core runs in deterministic/fallback mode if missing)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs:
- Secret scanning with gitleaks
- Server typecheck
- Client build
- AI Core lint (`ruff`) and tests (`pytest`)
