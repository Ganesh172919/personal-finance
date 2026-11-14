---
title: "System Threat Model (STRIDE & OWASP LLM 2025)"
description: "Production threat model covering trust boundaries, data flows, and AI risks for FinWise"
quadrant: record
audience: [security, developer]
owner: "@finwise/security"
status: reviewed
last_reviewed: 2026-11-08
review_every_days: 180
---

# System Threat Model: FinWise Platform

## 1. Trust Boundaries
* Boundary 1: Client Browser ➔ Ingress Gateway (HTTPS, TLS 1.3, CSP, CSRF Tokens).
* Boundary 2: Express API Gateway ➔ Internal Services (MongoDB, Redis, SQLite, FastAPI AI Core).
* Boundary 3: AI Core ➔ External LLM Providers (KeyPool masked tokens, zero-retention flags, SSL verification).

## 2. STRIDE Threats & Existing Controls
| Threat Category | Potential Attack | Existing Control in Code | Evidence Path |
| :--- | :--- | :--- | :--- |
| **Spoofing** | JWT forgery / impersonation | RSA-256 / HMAC-SHA256 signature verification | `server/src/routes/authRoutes.ts` |
| **Tampering** | Parameter manipulation | Zod strict schema validation & type coercion | `server/src/schemas/` |
| **Repudiation** | Denied ledger mutations | AuditLog Mongoose model logging actor org/userId | `server/src/models/auditLogModel.ts` |
| **Information Disclosure** | Cross-tenant data leakage | `OrgScopePlugin` tenant filter auto-injection | `server/src/plugins/orgScopePlugin.ts` |
| **Denial of Service** | LLM token runaway / brute force | Sliding-window rate limiter & token budgets | `server/src/middleware/rateLimiter.ts` |
| **Elevation of Privilege** | Tenant boundary breach | Role-based permission checks & org scoping | `server/src/middleware/auth.ts` |

## 3. OWASP Top 10 for LLM (2025) Controls
* **LLM01 (Prompt Injection)**: Guardrail pre-sanitization, delimited user prompt sections, and zero ungrounded statement gates.
* **LLM02 (Sensitive Information Disclosure)**: Masked secrets, tenant memory isolation in SQLite/MongoDB, and PII redaction.
* **LLM06 (Excessive Agency)**: All destructive actions (e.g. money movement, ledger deletions) require human-in-the-loop confirmation.
* **LLM10 (Unbounded Consumption)**: Strict timeout ceilings (`AI_CORE_TIMEOUT_MS: 45000`) and provider circuit breakers.

**Evidence:**
- `docs/SECURITY.md`
- `server/src/plugins/orgScopePlugin.ts`
- `server/src/services/aiCanaryService.ts`
