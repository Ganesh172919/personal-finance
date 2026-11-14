# Code Surface & Documentation Coverage Matrix

**Date:** 2026-11-08  
**Scope:** Entire Monorepo (`server/`, `client/`, `server/AI_Core/`)

---

## Coverage Matrix Table

| Code Surface | Source in Code | Documentation Location | Status |
| :--- | :--- | :--- | :--- |
| **Unified Context Retrieval** | `server/src/controllers/v1/unifiedContextController.ts`, `unifiedContextRetrievalService.ts` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md` | Documented (100%) |
| **AI Canary Invariant Engine** | `server/src/controllers/v1/aiCanaryController.ts`, `server/AI_Core/evals/canary_validator.py` | `docs/API.md`, `docs/AI_CORE.md`, `docs/SERVICES.md`, `docs/FRONTEND.md` | Documented (100%) |
| **Personalized Follow-Through** | `server/src/controllers/v1/followThroughController.ts`, `server/AI_Core/utils/follow_through_ranking.py` | `docs/API.md`, `docs/AI_CORE.md`, `docs/SERVICES.md`, `docs/DATABASE.md` | Documented (100%) |
| **Multi-Modal Document QA & Studio** | `server/src/controllers/fileController.ts`, `documentQAService.ts`, `richDocumentRenderer.ts` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/FRONTEND.md` | Documented (100%) |
| **Merchant 64-D Clustering** | `server/src/services/merchantEmbeddingClustering.ts` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md` | Documented (100%) |
| **Offline Journal 64-D Vector Search** | `server/src/services/journalEmbeddingService.ts`, `Notes.tsx` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/FRONTEND.md` | Documented (100%) |
| **Zero-Sum Budget Rebalancing** | `server/src/controllers/v1/financeBudgetsController.ts`, `BudgetHealthCard.tsx` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md` | Documented (100%) |
| **Calendar Reminders & RFC 5545** | `server/src/controllers/v1/calendarReminderController.ts`, `FinancialCalendar.tsx` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md` | Documented (100%) |
| **Conversation Summary Coordination**| `server/src/controllers/v1/summaryCapacityController.ts`, `summaryCapacityService.ts` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/AI_CORE.md` | Documented (100%) |
| **Visual Workflows with Delay Timers**| `server/src/services/workflows.ts`, `Workflows.tsx` | `docs/ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/WORKFLOWS.md` | Documented (100%) |
| **Global Command Palette** | `client/src/components/CommandPalette.tsx` | `docs/FRONTEND.md`, `docs/ARCHITECTURE.md` | Documented (100%) |
| **AI Evaluation Suites** | `server/AI_Core/evals/` (19 tests) | `server/AI_Core/evals/README.md`, `docs/AI_CORE.md` | Documented (100%) |
| **Distributed Leader Election** | `server/src/services/leaderElection.ts`, `leaderLockModel.ts` | `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/DATABASE.md` | Documented (100%) |
| **Dead-Letter Queue Administration** | `server/src/routes/v1/deadLetterJobRoutes.ts`, `deadLetterJobs.ts` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/DATABASE.md` | Documented (100%) |
| **Continuous AI Learning Loop** | `server/src/routes/aiLearningRoutes.ts`, `server/AI_Core/learning/` | `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/AI_CORE.md`, `docs/SECURITY.md` | Documented (100%) |
| **Cross-Replica Realtime Event Bus** | `server/src/modules/realtime/redisEventBus.ts` | `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/REALTIME.md` | Documented (100%) |
| **Platform Telemetry & W3C Tracing** | `server/src/observability/platformMetrics.ts`, `tracing.ts` | `docs/OBSERVABILITY.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` | Documented (100%) |
| **Gateway AI Core Circuit Breaker** | `server/src/services/aiCoreResilience.ts`, `aiCoreTransport.ts` | `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, `docs/API.md` | Documented (100%) |

**Evidence:**
- `server/src/routes/v1Routes.ts`
- `server/src/routes/fileRoutes.ts`
- `server/AI_Core/evals/`
- `client/src/pages/`
