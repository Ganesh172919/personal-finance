# FinWise repository audit

**Audit date:** 4 November 2026
**Initial audit mode:** source and configuration review. The remediation update below records the implementation and verification performed after the audit.
**Repository reviewed:** `client/`, `server/`, `server/AI_Core/`, `packages/contracts/`, deployment files, CI, and the documentation trees.

## Executive assessment

FinWise is an ambitious three-tier personal-finance product: React client, Express/MongoDB API, and FastAPI/LangGraph AI service. It has a large implemented surface, good schema validation, tenant-aware data models, and numerous operational safeguards.

The security and delivery blockers found in the initial review have been remediated and the complete client, server, and AI-Core test suites now pass. The principal remaining release prerequisites are operational rather than unaddressed test failures: review and split the very large dirty change set, run the Compose stack with Docker in CI, and keep the intentionally unavailable bank-provider and cloud-storage integrations out of production claims.

The working tree remains a large uncommitted feature batch: **197 tracked/gitlink changes and 112 untracked files** at final verification. `git diff --check` reports **69** whitespace/EOF findings in that broader batch. They were preserved because they pre-date or are outside this focused remediation.

## Remediation update — 4 November 2026

The following release-blocking findings have been addressed in the working tree:

| Finding | Remediation |
| --- | --- |
| SEC-01 | Added a single AI Core transport-header helper and applied it to all Node-to-AI-Core proxy, status, canary, newsletter, and core-client calls. Production now fails fast if the shared internal token is absent; AI Core uses constant-time token comparison. |
| SEC-02 | Session list/detail/resume now derive user and organization from the authenticated Node request, pass internal actor headers, and verify ownership in AI Core. Cross-tenant sessions return 404. |
| SEC-03 / SEC-04 | Added HTTPS-only outbound-webhook policy with default-port, credential, loopback/private/link-local/reserved-IP, DNS-resolution, redirect, and timeout restrictions. Task dispatch accepts only an explicit Authorization value, not arbitrary headers. Scheduled webhook credentials are AES-256-GCM encrypted and never returned by the API. |
| REL-01 | `compose.yaml` now includes MongoDB, Redis, server, worker, AI Core, health checks, persistent volumes, and a root secret template in `compose.env.example`. The worker atomically claims workflow, integration, export, and due scheduled-export records from MongoDB. |
| FUN-01 | New cloud-storage schedules are rejected; historical cloud schedules return an explicit unsupported failure rather than a fabricated uploaded URI. |
| FUN-02 | The bank-feed UI and primary docs now label the route as a JWT-protected import simulator, not a live provider callback. |
| OPS-01 | `/api/v1` is mounted as the canonical route set while `/api` remains compatible. The generated OpenAPI path inventory now covers both. The main setup/deployment environment references use `MONGO_URI` and `PYTHON_API_URL`. |
| OPS-02 | Removed the unreferenced BullMQ queue implementation and dependency. Operational docs now describe the active MongoDB polling worker and optional Redis cache. |
| SEC-05 / SEC-06 | Wildcard CORS is rejected with credentialed requests, and Mongoose errors are reduced to safe field metadata. |

### Verification performed after remediation

- `cd server && npm run check` — passed.
- `cd client && npx tsc --noEmit` — passed.
- Full server suite: `cd server && npm test -- --run --reporter=dot` — **74 files, 318 tests passed**.
- Full client suite: `cd client && npm test -- --reporter=dot` — **51 files, 422 tests passed**.
- Full AI-Core suite: `cd server/AI_Core && .\\.venv\\Scripts\\python.exe -m pytest -q` — **240 passed** (one third-party deprecation warning).
- Targeted security/contract regression suite — **8 files, 45 tests passed**, including SSRF rejection, AI transport/session ownership, encrypted webhook credentials, `/api/v1` raw Stripe body handling, CORS, redaction, and OpenAPI coverage.
- `python -m py_compile server/AI_Core/api_service.py` — passed.
- `cd server && npm audit --omit=dev --json` — **0 vulnerabilities** after the lockfile remediation.
- `compose.yaml` parsed successfully and includes MongoDB, Redis, API, worker, client, and AI Core services.

The Docker CLI is unavailable in this environment, so Compose was not started or validated with `docker compose config`. A real bank-provider callback and genuine S3/GCS uploads remain intentionally unimplemented; the product no longer represents either as available.

## What the product can do today (source-backed feature map)

| Area | Implemented capabilities observed |
| --- | --- |
| Accounts and access | Email/password and OAuth-oriented authentication, HTTP-only JWT-cookie flow, CSRF protection for cookie mutations, API keys/scopes, organizations, memberships, invitations, audit records, rate limits, and request IDs. |
| Money workspace | Transactions, CSV import, review queue, merchant categorization rules and clustering, accounts, budgets/envelopes, recurring rules, forecasts, goals, debt tracking, portfolio views, analytics, scenarios, and multi-currency calculations. |
| Daily planning | Command Center, budget-health score, savings suggestions, calendar reminders with `.ics` export, tasks (including recurrence), and FinanceOS budget roll-forward/caps. |
| Documents and journals | File upload/extraction for common office formats, GridFS storage, retrieval chunks/citations, rendered PDF documents, receipts/OCR paths, journal entries, handwriting/offline draft sync, and semantic-search-oriented features. |
| AI assistance | Conversational AI, streamed responses, deterministic financial fallbacks, grounding context, response caching, AI activity/summaries, specialist-agent workflow, provider registry/failover, resumable SQLite sessions, and invariant/canary checks. |
| Automation and integrations | Workflow definitions, cron/event/manual/webhook triggers, conditional actions and interpolation, job records/worker, export scheduling, newsletters, public sharing, comments, notifications/SSE, billing/invoices, referrals, and plugin/marketplace scaffolding. |
| Engineering controls | Zod validation, Mongoose models/indexes, centralized errors/logging, Helmet/CORS/security headers, Mongo sanitization, OpenTelemetry/Prometheus hooks, Dockerfiles, GitHub Actions, TypeScript checks, Vitest, Pytest, Ruff, and client PWA/offline-aware behavior. |

The bank-feed route is a signed-in simulator/API route, not a verified live bank-provider connector. New cloud-storage scheduled exports are rejected and legacy schedules return an explicit unsupported-delivery failure rather than a fabricated uploaded URI.

## Initial findings and disposition

The evidence tables below preserve the original audit findings. SEC-01 through SEC-06, REL-01, FUN-01, FUN-02, OPS-01, and OPS-02 are remediated as recorded above; line references in those original observations describe the pre-remediation state.

### Initial P0 — remediated

| ID | Finding | Evidence | Why it matters | Required remediation |
| --- | --- | --- | --- | --- |
| SEC-01 | Several Node-to-AI-Core calls omit the required internal token. | The supported client sends `X-Internal-Token` in `server/src/services/aiCoreClient.ts:297-307`; FastAPI rejects protected paths in `server/AI_Core/api_service.py:499-512`. Direct `axios` calls in `server/src/routes/aiRoutes.ts:82-281`, `server/src/controllers/aiStatusController.ts:57-69`, `server/src/services/aiCanaryService.ts:102-316`, and `server/src/services/newsletterService.ts:430-445` do not send it. | The shipped Compose configuration requires `AI_CORE_INTERNAL_TOKEN`. With it set, AI status/providers, session operations, model list, canary calls, and AI newsletter calls fail upstream authorization (usually surfaced as 502 or fallback). Disabling the token to make these work removes the intended service boundary. | Route every AI-Core call through one authenticated client/factory; add the token in every call; test both valid and missing/invalid-token paths; never make production token enforcement optional. |
| SEC-02 | AI resumable sessions have no end-user or organization authorization boundary. | Node proxies caller-controlled `org_id` and `user_id` (`server/src/routes/aiRoutes.ts:118-140`), while direct detail/resume calls accept only `sessionId` (`:143-199`). FastAPI fetches/resumes by ID without checking session owner (`server/AI_Core/api_service.py:1151-1275`). | Any authenticated product user who can reach these proxy endpoints can request another user's/org's session data if IDs are known or obtained. Session checkpoints can contain financial context, decisions, and AI responses. | Derive user/org only from the authenticated Node request; include signed/verified actor context in the internal call; enforce session `org_id` and `user_id` ownership inside AI Core; remove client-supplied identity filters except privileged admin paths; add cross-org negative tests for list, detail, resume, and cleanup. |
| SEC-03 | Outbound task webhooks are SSRF and data-exfiltration primitives. | User input accepts any valid URL and arbitrary headers (`server/src/schemas/taskSchemas.ts:203-210`), then posts task content to it (`server/src/controllers/taskController.ts:702-801`). | An authenticated attacker can make the server reach internal hosts or cloud metadata endpoints and send task data and selected headers there. URL validation alone does not prevent private-IP, DNS-rebinding, redirect, credential, or unusual-port abuse. | Build a shared outbound-URL policy: HTTPS-only, DNS resolution plus private/link-local/loopback/reserved-IP rejection, allowed ports, redirect disabled/revalidated, short timeout/body limits, secret-header allowlist, audit logging, and preferably per-tenant allowlisted webhook destinations. |
| REL-01 | `compose.yaml` is not the full self-contained production stack claimed by the root README. | It defines only `web`, `server`, and `ai-core`; it has no MongoDB, Redis, or worker service. The server needs an external production `MONGO_URI`; background execution needs the worker (`compose.yaml:1-40`, `server/src/worker/worker.ts`). A required root token interpolation is present but no root `.env` exists in this workspace. | `docker compose up -d --build` cannot provide the persistence/queue services described by the docs. Without a reachable MongoDB the production server cannot become ready; no worker means queued/scheduled background work cannot be relied upon. | Either ship a complete, secured Compose stack including Mongo, Redis, worker, volumes/backups and health checks, or rename this to an application-only Compose file and make external managed-service requirements explicit. Add a CI Compose smoke test. |

### Initial P1 — remediated, except release hygiene

| ID | Finding | Evidence | Why it matters | Recommended fix |
| --- | --- | --- | --- | --- |
| SEC-04 | Scheduled-export webhooks repeat the SSRF issue and can disclose report metadata. | `webhook_url` is accepted in `server/src/schemas/v1/scheduledExportSchemas.ts:3-54`; `fetch(webhookUrl)` occurs in `server/src/services/scheduledExportService.ts:116-191`. | Scheduled runs make repeated server-side calls to arbitrary targets, and saved auth headers/report metadata increase the blast radius. | Reuse the hardened outbound-delivery service from SEC-03; encrypt sensitive destination credentials at rest; redact them from API responses/audit logs; require re-validation on updates. |
| FUN-01 | “Cloud storage export delivery” is a stub, not a cloud upload. | The branch only constructs `s3://`/`gcs://` text, marks delivery successful, persists metadata, and returns it (`server/src/services/scheduledExportService.ts:195-231`); no S3/GCS SDK/upload exists. | Users can believe a financial report was stored remotely when no object was sent anywhere. | Either implement provider-specific uploads with credentials, retries, checksum verification, and tests, or hide/remove this destination until it is real. Mark status as unsupported rather than success. |
| FUN-02 | The advertised “inbound real-time bank connector webhook” is actually JWT-protected, user-scoped ingestion with no provider signature verification. | `financialDataRoutes` applies JWT middleware before `/transactions/bank-feed` (`server/src/routes/financialDataRoutes.ts:88,116-119`); tests call it with a cookie and CSRF token (`server/src/test/transactionsMultiCurrencyClustering.test.ts:230-248`). | A real provider cannot call this endpoint as documented. Removing JWT without a signed-webhook design would create an ingestion security flaw. | Keep the simulator as a signed-in tool; create a separate connector endpoint with provider-specific HMAC/signature verification, replay/timestamp defense, connection-to-org mapping, IP policy where appropriate, and an idempotency ledger. |
| OPS-01 | Deployment, setup, and API docs substantially drift from runtime code. | Runtime mounts the API under `/api`, not `/api/v1` (`server/src/routes/routeRegistry.ts:89-124`), while `docs/API.md`, `README.md`, and `docs/QUICK_START.md` repeatedly advertise `/api/v1`. Deployment samples use obsolete `DATABASE_URL` and `AI_CORE_URL` names while code reads `MONGO_URI` and `PYTHON_API_URL`. | New clients, curl instructions, deploy scripts, and API consumers hit 404s or run with ignored configuration. | Choose one versioning policy. If `/api/v1` is intended, mount and migrate to it with redirects/deprecation tests; otherwise regenerate all references/contracts/examples to `/api`. Establish one doc source of truth and CI checks for endpoint/config examples. |
| OPS-02 | The documentation promises BullMQ/Redis behavior while the active worker uses a MongoDB polling queue; both patterns coexist. | `server/src/worker/worker.ts` claims jobs from MongoDB; `server/src/modules/queue/jobQueue.ts` separately defines BullMQ workflow queue behavior; docs describe BullMQ broadly. | Operations teams cannot know which service must run, how recovery works, or which datastore is authoritative for a job. | Select one queue architecture per job class, document it precisely, add queue-specific health metrics/DLQ behavior, and delete or quarantine the unused path. |
| SEC-05 | Configuration permits unsafe CORS if `CORS_ORIGINS=*` is set together with credentialed requests. | `server/src/app.ts:214-225` accepts all origins when `*` appears and also enables `credentials: true`. | Browser behavior is inconsistent for wildcard-plus-credentials; a permissive production setting undermines a cookie-auth posture and makes errors easy to miss. | Reject wildcard CORS in production when credentials are enabled; require explicit HTTPS origins; cover configuration rejection in tests. |
| SEC-06 | Mongoose validation details are returned verbatim. | `server/src/middleware/errorHandler.ts:145-163` returns `err.errors` and cast-error text. | Validation internals can reveal schema field names, constraints, and values in edge cases. This is lower impact than P0 items but unnecessary exposure for a financial API. | Map errors to a bounded public field/error format; retain full details only in structured server logs. |
| REL-02 | The current working tree cannot yet be treated as a reviewed release artifact. | Final verification found 197 tracked/gitlink changes, 112 untracked files, 69 `git diff --check` findings, and a modified `prime-agent` gitlink with no `.gitmodules` mapping. | Scope is too broad for safe release review. Untracked security/features may be excluded from a commit; submodule status and noisy docs increase reproducibility risk. | Split the batch by feature, explicitly add intended files, resolve/remove the malformed gitlink, clean mechanical formatting, and require a clean diff plus green CI before merge. |

### P2 — quality, maintainability, and product clarity

| ID | Finding | Evidence | Impact | Recommended action |
| --- | --- | --- | --- | --- |
| MAINT-01 | Several page/controller files are monoliths. | `server/AI_Core/api_service.py` is 2,520 lines; `client/src/pages/Scenarios.tsx` 2,105; `Transactions.tsx` 2,086; `Files.tsx` 2,049; `FinanceOS.tsx` 1,902; `financialDataController.ts` 1,867. | Features become difficult to test, review, load, and change safely; conflicts are likely in the current large batch. | Split by domain/view model into services, hooks, presentational components, and route modules; set size/complexity review thresholds. |
| MAINT-02 | Identical documentation files are duplicated under differently cased/spaced names. | SHA-256 hashes match for `PROJECT_EXPLANATION.md` / `project explanation.md`, `PROJECT_FLOW.md` / `project flow .md`, `PROJECT_PRESENTATION.md` / `project presentation.md`, and the two `BUILDING_ON_THIS_PROJECT.md` copies. | Duplicates create merge noise and behave differently on case-insensitive filesystems. | Preserve one canonical file, redirect/link from legacy locations if needed, then delete duplicates in a dedicated cleanup change. |
| MAINT-03 | Documentation is unusually voluminous and contains historical/conflicting architecture claims. | 112 tracked Markdown files plus multiple overlapping handbook/“mega” trees; `docs/KNOWN_ISSUES_AND_DRIFT.md` already acknowledges source drift. | Contributors must search prose rather than code to find the current interface; false confidence is likely. | Keep a short canonical README, generated API/config reference, task-oriented guides, and clearly label archived/design documents as non-authoritative. |
| UX-01 | Client bundle size is already identified as large. | `docs/KNOWN_ISSUES_AND_DRIFT.md` records an approximately 672 kB minified entry chunk; several route pages exceed 1,000 lines. | Slower cold load and worse mobile experience. | Establish a performance budget, collect production/staging Web Vitals, split heavy visualizations/editors, and defer noncritical feature code. |
| QA-01 | Current suite status is verified on this working tree. | Full client (**51/422**), server (**74/318**), and AI-Core (**240**) suites passed, along with both TypeScript checks. | Historical prose is no longer the only evidence of behavior. | Run the same checks in clean CI against a commit SHA before release. |
| QA-02 | Negative coverage now protects the remediated boundaries. | Targeted tests cover missing/valid AI internal auth, session ownership, blocked private/credentialed/non-default webhook targets, encrypted scheduled-webhook credentials, CORS rejection, redacted Mongoose errors, and versioned raw Stripe webhook handling. | The high-risk boundaries now have regression coverage. | Add live Compose and controlled DNS-rebinding/network-policy tests in CI. |

## Current architecture, in one view

```text
React/Vite SPA
    │  cookies + CSRF + REST/SSE
    ▼
Express API (`/api/v1/*`; compatible `/api/*` aliases)
    ├── MongoDB: product records, GridFS, job records
    ├── Redis: optional cache and rate-limit backing
    ├── Mongo polling worker: workflows, exports, integration runs
    └── FastAPI AI Core: LangGraph, providers, SQLite session/memory
```

The code and checked-in Compose configuration support this architecture. The internal AI boundary is enforced with a shared token and authenticated actor context; Compose startup remains unverified here because Docker is unavailable.

## Remaining release work

1. **Stabilize the change set.** Review/split the 197 tracked/gitlink changes and 112 untracked files, resolve the `prime-agent` gitlink state, and address the 69 existing `git diff --check` findings before merge.
2. **Validate the deployment in CI.** Run `docker compose config`, start the services, wait for health checks, and exercise API/worker/AI-core connectivity with production-like secrets.
3. **Keep unsupported integrations disabled.** Implement provider-signed bank ingestion and actual S3/GCS uploads only with credentials, idempotency, audit events, and integration tests; until then, preserve the simulator/unsupported labels.
4. **Complete documentation consolidation.** The maintained index now names the runtime sources of truth; remove or archive duplicate historical documents in a dedicated change rather than making operational claims in old “mega” guides.
5. **Harden outbound delivery further.** The current policy validates DNS answers and blocks redirects, private/reserved targets, non-default ports, and embedded credentials. Production deployments that face DNS rebinding threats should route delivery through an egress proxy or an allowlisted, IP-pinned transport.

## High-value next features after stabilization

These are worthwhile only after the security/deployment work above:

- Real bank aggregation through a provider adapter with consent, connection lifecycle, signed events, retries, reconciliation, and revocation/deletion.
- Genuine cloud export delivery with AWS/GCP SDKs, per-tenant credentials or managed destinations, encryption, retention, and delivery confirmation.
- Read-only financial-data mode, data export/deletion workflows, consent records, retention policy, and privacy controls suitable for real finance data.
- Stronger financial safety controls: provenance shown for every calculation, configurable risk/profile assumptions, jurisdiction-specific tax disclaimers, human approval before external actions, and immutable audit events.
- Operations maturity: database migrations, scheduled backups/restore drills, SLOs, alerting, centralized secret management, dependency/security scanning, and staged deployments.
- Product refinement: mobile performance budget, a concise onboarding flow, accessibility audit, analytics/error monitoring, and feature flags with staged rollout/kill switches.

## Verification notes and limitations

- This remediation changed source, configuration, tests, and documentation, then ran the full client/server/AI-Core suites and static checks recorded above.
- Docker is not installed in the audit environment, so the Compose services were parsed but not launched.
- No live bank provider, cloud-storage account, production email service, or external webhook target was contacted. Those integrations remain intentionally unavailable or test-only.
- No audit can prove the absence of every defect. The remaining concerns above are concrete operational/release prerequisites rather than known failing automated checks.

## Useful starting points

- Route truth: `server/src/routes/routeRegistry.ts`
- Environment truth: `server/src/config/env.ts`
- Node-to-AI transport: `server/src/services/aiCoreClient.ts`
- AI-Core internal authentication: `server/AI_Core/api_service.py`
- Product capability register: `docs/PRODUCT_CAPABILITY_STATUS.md`
- Existing drift register: `docs/KNOWN_ISSUES_AND_DRIFT.md`
- CI workflow: `.github/workflows/test.yml`

