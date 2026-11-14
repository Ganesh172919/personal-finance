# System Profile: FinWise Personal Finance Platform

**Document Version:** 1.0 (Verified 2026-11-08)  
**Evidence Source:** Monorepo codebase analysis across `server/`, `client/`, and `server/AI_Core/`.

---

## 1. Core Profile & System Summary

* **Project Name:** FinWise Autonomous Personal Finance Platform
* **Project Type:** Full-stack, Multi-Agent AI System, Monorepo (`client/`, `server/`, `server/AI_Core/`, `packages/contracts/`)
* **Primary Audiences:** Software Engineers, Systems Operators & On-Call, API Consumers, Security Reviewers, AI Auditors, Contributors
* **License:** MIT License (`LICENSE`)
* **Compliance Context:** GDPR, DPDP (Zero-PII model card standards, personal data retention, client-side encryption options)
* **Deployment Targets:** Docker Compose (`compose.yaml`), Cloud Container Services (GCP Cloud Run / AWS ECS / Kubernetes)

---

## 2. Technology Stack & Runtimes

| Component | Technology | Version | Location / Config |
| :--- | :--- | :--- | :--- |
| **API Gateway** | Express on Node.js | Node `>=24.14.1 <25`, Express `5.x` | `server/package.json`, `server/src/app.ts` |
| **Frontend Client** | React, Vite, TypeScript | React `18.3`, Vite `6.x` | `client/package.json`, `client/vite.config.ts` |
| **AI Core Microservice** | FastAPI, Python, LangGraph | Python `3.11+`, FastAPI `0.115+` | `server/AI_Core/pyproject.toml`, `requirements.txt` |
| **Primary Datastore** | MongoDB Replica Set | MongoDB `7.0+` | `server/src/server.ts`, `server/src/models/` |
| **Blob / Object Store** | MongoDB GridFS | GridFS Bucket `fs.files` / `fs.chunks` | `server/src/services/gridfs.ts` |
| **Cache & Bus** | Redis (ioredis) | Redis `7.0+` (Optional / In-Memory Fallback) | `server/src/config/redis.ts` |
| **AI Checkpoints** | SQLite with FTS5 | SQLite `3.45+` | `server/AI_Core/memory/store.py` |
| **Queue / Background**| MongoDB Polling Worker | Concurrency: 4, Poll: 1000ms | `server/src/worker/worker.ts` |

---

## 3. Detected Signals & Code Surfaces

* **HTTP Routes:** Mounted via canonical `/api/v1` namespace with `/api` backward compatibility aliases (`server/src/routes/routeRegistry.ts`, `v1Routes.ts`).
* **Environment Variables:** Validated via Zod strict schemas in `server/src/config/env.ts` and `server/.env.example`.
* **Database Models:** 52 Mongoose models with multi-tenant `OrgScopePlugin` injection (`server/src/models/`).
* **Vector Store & Embeddings:** 64-dimensional L2-normalized dense embeddings for Merchant Clustering (`merchantEmbeddingClustering.ts`), Workspace Knowledge Chunks (`WorkspaceKnowledgeChunkModel.ts`), and Offline Journal Search (`journalEmbeddingService.ts`).
* **LLM Calls & Multi-Agent DAG:** LangGraph StateGraph workflow orchestrating 11 specialist agents (`Income`, `Budget`, `Debt`, `Invest`, `Education`, `Tax`, etc.) via `server/AI_Core/graph/workflow.py` and `sub_agent_manager.py`.
* **Provider KeyPool:** Multi-key rotation (`health_weighted`, `round_robin`) across Gemini, OpenRouter, Claude, Groq, and Ollama (`server/AI_Core/utils/key_pool.py`).
* **Canary Invariants:** Dual-layer FastAPI (`server/AI_Core/evals/canary_validator.py`) and TypeScript (`server/src/services/aiCanaryService.ts`) auditing 5 core identities.
* **Frontend Cockpits:** 5-surface workspace (Dashboard, Transactions, Budget Health, Goals & Debts, Scenarios, Workflows, Notes, Files, AiStatusDialog) in `client/src/pages/`.
* **Distributed Leader Election & Realtime Event Bus:** Redis Pub/Sub (`redisEventBus.ts`) and Redis Lua + Mongo TTL leases (`leaderElection.ts`, `leaderLockModel.ts`).
* **Resilience & Dead-Letter Recovery:** Gateway-to-AI-Core circuit breaker (`aiCoreResilience.ts`), idempotency locking (`idempotency.ts`), and administrative dead-letter queue (`deadLetterJobs.ts`, `deadLetterJobRoutes.ts`).
* **Platform Infrastructure Telemetry:** Prometheus metrics (`platformMetrics.ts`) and W3C distributed tracing with header sanitization (`tracing.ts`).

**Evidence:**
- `server/package.json`
- `client/package.json`
- `server/AI_Core/pyproject.toml`
- `compose.yaml`
- `server/src/routes/routeRegistry.ts`
