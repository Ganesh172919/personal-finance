<h1 align="center">💰 FinWise</h1>
<p align="center"><b>Personal finance workspace that shows where your money went, flags uncertain records, and turns decisions into trackable actions.</b></p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=react,ts,vite,tailwind,nodejs,express,mongodb,redis,python,fastapi,docker,sqlite,prometheus,vitest,pytest,github&perline=8" alt="Tech stack icons" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" /> <img src="https://img.shields.io/badge/Node.js-24%20LTS-339933?logo=nodedotjs&logoColor=white" alt="Node.js" /> <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white" alt="Python" /> <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /> <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI" /> <img src="https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb&logoColor=white" alt="MongoDB" /> <img src="https://img.shields.io/badge/LangGraph-0.2-1C3C3C?logo=langchain&logoColor=white" alt="LangGraph" />
</p>

---

## 📌 Overview
FinWise is a three-tier personal finance platform: a React 18 client, an Express 5 API gateway, and a Python FastAPI AI core, backed by MongoDB 7.0 and optional Redis 7.0.

## ✨ Key Features
- 🎛️ **Command Center**: composite Financial Health Score (0–100), savings rate, and debt payoff runway.
- 📥 **Transaction Review Queue**: rule-based auto-categorization with batch approval for uncertain records.
- 🧮 **Budget Coach**: envelope budgets (50/30/20, zero-based), overspend projections, and zero-sum auto-rebalancing.
- 🤖 **Autopilot & Workflows**: cron and event automations, a visual node-graph canvas, and token-authenticated webhooks.
- 💬 **Financial Intelligence**: AI copilot with RAG grounding, document citations, and confidence scoring.
- 🔮 **Scenarios**: Monte Carlo what-if comparisons and replays of five historical market shocks.
- 🧠 **Merchant Clustering**: 64-D embeddings group noisy bank descriptions into canonical merchants.
- 💱 **Multi-Currency FX**: ISO 4217 conversions across USD, EUR, GBP, INR, CAD, AUD, and JPY.
- 📓 **Financial Journal**: offline-first handwriting and Markdown notes with idempotent batch sync.
- 📅 **Financial Calendar**: recurring bill detection with RFC 5545 `.ics` export and reminders.

## 🎙️ Voice-First Finance with Gnani AI

FinWise integrates three Gnani AI models so users can log expenses and hear answers in their own language.

| Model | Role in FinWise | What it does |
| :--- | :--- | :--- |
| **Prisma v3.0 (STT)** | Speech-to-text | Transcribes live microphone input in Chat and the FinanceOS Cockpit |
| **Evon v3.3 (30B Reasoning LLM)** | Transaction extraction | Turns colloquial phrasing into structured transactions |
| **Timbre (TTS, beta)** | Text-to-speech | Speaks AI responses and confirmations back to the user |

### Voice Flow
```text
🎤 Speak → Prisma STT → Evon reasoning → Structured transaction → 🔊 Timbre confirmation
```

### Highlights
- 🎤 **Live recording**: the microphone works directly inside Chat and the FinanceOS Cockpit.
- 🗣️ **12+ Indic languages**: Hindi, Telugu, Tamil, Kannada, Marathi, Bengali, Gujarati, Malayalam, Punjabi, Odia, and Indian English.
- 🔀 **Code-mixed speech**: Hinglish and similar mixed-language phrasing is transcribed.
- 📞 **Noisy audio**: Prisma handles 8kHz telephonic audio with noise cancellation.
- 🧠 **First-class LLM provider**: Evon v3.3 is integrated into the Python AI Core.
- 🧾 **Structured extraction**: Evon returns `amount`, `category`, `merchant`, and `paymentMethod` from natural speech.
- 🔢 **Arithmetic accuracy**: extraction is designed to avoid arithmetic hallucinations.
- 🔊 **Spoken confirmations**: Timbre reads transaction confirmations back in the user's native dialect.

### Example (illustrative)
```json
{
  "spoken": "Aaj Swiggy pe 450 rupaye UPI se kharch kiye",
  "extracted": { "amount": 450, "category": "Food", "merchant": "Swiggy", "paymentMethod": "UPI" }
}
```

## 🧰 Tech Stack
| Layer | Technologies |
| :--- | :--- |
| **Frontend** | <img src="https://skillicons.dev/icons?i=react,ts,vite,tailwind" height="28" /><br/>React 18.3 · TypeScript 5.9 · Vite 7 · Tailwind · Zustand · TanStack Query v5 · Wouter · Recharts · Framer Motion |
| **API Gateway** | <img src="https://skillicons.dev/icons?i=nodejs,express,ts" height="28" /><br/>Node 24 · Express 5 · Zod 4 · Passport (JWT + Google OAuth) · TOTP 2FA · Helmet · Pino |
| **AI Core** | <img src="https://skillicons.dev/icons?i=python,fastapi,pandas,numpy,opencv" height="28" /><br/>FastAPI · LangGraph 0.2 · LangChain 0.3 · Pydantic 2 · PaddleOCR · Uvicorn |
| **Data** | <img src="https://skillicons.dev/icons?i=mongodb,redis,sqlite" height="28" /><br/>MongoDB 7 + Mongoose 8 · Redis (ioredis) · GridFS · SQLite session memory |
| **Testing** | <img src="https://skillicons.dev/icons?i=vitest,pytest" height="28" /><br/>Vitest · Testing Library · MSW · Supertest · Pytest · Ruff |
| **DevOps** | <img src="https://skillicons.dev/icons?i=docker,prometheus,github" height="28" /><br/>Docker Compose · Prometheus (prom-client) · OpenTelemetry · GitHub |

## 🏗️ Architecture
```text
┌────────────────────────────────────────────────────────┐
│ React 18 SPA (:5173) · FinanceOS Cockpit · SSE streams │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / SSE
                            ▼
┌────────────────────────────────────────────────────────┐
│ Express 5 Gateway (:3000)                              │
│ Helmet → Rate Limit → authAny → OrgScope → Zod         │
└─────────────┬──────────────────────────────┬───────────┘
              │ read / write                 │ HTTP
              ▼                              ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ MongoDB · Redis · GridFS │  │ FastAPI AI Core (:8001)  │
│ 52 tenant-scoped models  │  │ LangGraph DAG · KeyPool  │
└──────────────────────────┘  └──────────────────────────┘
```

## 🧠 AI Core
- **Task Decomposer** splits a question into subtasks with explicit dependencies.
- **Subagent DAG** runs specialists (income, budget, debt, invest, education) using Kahn's sort, with max concurrency 4.
- **Aggregator** merges specialist outputs, resolves conflicts, and enforces the number safety invariant.
- **KeyPool** rotates API keys on `429` and uses circuit breakers (CLOSED → OPEN → HALF-OPEN).
- **Failover chain**: Gemini → OpenRouter → Groq → xAI Grok → local vLLM → deterministic calculators.
- **Resumable sessions** use SQLite checkpoints for routing, planning, execution, and synthesis phases.

## 🛡️ Reliability & Invariants
The Continuous AI Canary validates every AI synthesis before it reaches the UI, with a TypeScript fallback if the AI Core is offline.
| # | Invariant | Rule |
| :-: | :--- | :--- |
| 1 | Number Safety | Candidate digits ⊆ reference ledger digits |
| 2 | Zero-Sum Budgets | ΣΔB = 0 and every proposed allocation ≥ 0 |
| 3 | Balance Sheet | Assets − Liabilities = Net Worth (±0.01) |
| 4 | Cash Flow | Income − Expenses = Net Cash Flow (±0.01) |
| 5 | Debt Amortization | Principal + Interest = Total Payment (±0.01) |

## 🔍 Grounded RAG
- Documents (PDF, CSV, XLSX, DOCX) are chunked into 1,800-character windows with 260-character overlap.
- PDF form-feed markers (`\f`) are preserved so citations point to physical pages.
- Retrieval is hybrid: BM25 lexical ranking plus 64-D dense cosine similarity.
- Grounding score: `G = 0.60 · R_lexical + 0.40 · S_semantic`; only `G ≥ 0.70` is shown as grounded.
- Answers carry `[docId:chunkIndex]` citations that open an evidence drawer.

## 🔐 Security & Multi-Tenancy
- Dual auth: JWT bearer tokens or SHA-256 peppered API keys, plus TOTP 2FA.
- `OrgScopePlugin` injects `{ orgId }` into every query for strict tenant isolation.
- Sliding-window rate limiting, Helmet headers, CSRF protection, and NoSQL injection defenses.
- A dead letter queue quarantines background jobs after 3 consecutive failures.

## 🚀 Quick Start
```bash
cd server && npm install && cp .env.example .env      # Express API
cd client && npm install && cp .env.example .env      # React client
cd server/AI_Core && pip install -r requirements.txt # AI Core (use a venv)
uvicorn api_service:app --port 8001 --reload          # Terminal 1: AI Core
cd server && npm run dev                              # Terminal 2: API (:3000)
cd client && npm run dev                              # Terminal 3: UI (:5173)
```

Open **http://localhost:5173** after startup, or run `docker compose up -d --build`. Licensed under MIT.
