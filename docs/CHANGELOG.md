# Changelog

All notable changes to the Personal Finance project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] — 2026-03-03

### Added

- **Calendar Reminders** — new Mongoose model (`CalendarReminder`), CRUD controller, and v1 API routes (`GET/POST /v1/calendar-reminders`, `PATCH /v1/calendar-reminders/:id/toggle`, `DELETE /v1/calendar-reminders/:id`)
- Calendar reminder UI in Financial Calendar page: add, toggle, delete reminders per day
- Manual TOTP secret display for users who can't scan QR codes
- Auth endpoints: `PUT /auth/profile`, `POST /auth/password`
- Functional Preferences section in Settings: editable currency, locale, and timezone selectors with Save button

### Fixed

- **2FA QR Code** — `otpauth://` URI was used as `<img src>` (broken); now renders via Google Charts QR API
- **FinancialCalendar** — hardcoded `USD`/`en-US` currency replaced with org-level currency/locale from config
- **FinancialStory** — both `useQuery` calls missing `queryFn` (data never loaded)
- **ActivityFeed** — "Load More" button had no `onClick` handler; now functional with cursor pagination
- **Notes Recognition** — toast always showed "Recognized" even when AI core returned empty text; now shows warning
- **Settings alignment** — added proper flex layout and constrained width
- **Profile save** — replaced `window.location.reload()` with `checkAuthStatus()`
- Deprecated `apple-mobile-web-app-capable` meta tag replaced with `mobile-web-app-capable`

### Changed

- **Branding**: All "FinWise" references replaced with "Personal Finance" across 18+ files (TOTP, org service, invite emails, digest emails, export PDFs, tool catalog, PWA manifest, health check endpoint)
- 8 unused imports removed from `ActivityFeed.tsx`

---

## [1.2.0] — 2026-03-02

### Added

#### Collaboration & Social

- Activity feed page with real-time organization activity stream
- Comments & annotations system with threaded discussions on any resource
- Comment model (`commentModel.ts`) — 47th Mongoose model
- Activity feed controller and comment controller (v1)
- Collaboration API client module (`client/src/lib/api/v1/collaboration.ts`)

#### New Pages & Components

- Settings & Profile page with user account management
- Financial Calendar page with calendar view of transactions and events
- `CommentThread` component for threaded comment UI
- `NotificationCenter` component for real-time notifications
- `FinancialCopilot` AI assistant widget
- `BlogCard` and `GrowthStoryCard` preview components
- `LazyImage` progressive loading component

#### Frontend Enhancements

- `useAccessibility` hook for ARIA and focus management
- `useKeyboardShortcuts` hook for global shortcut registration
- `useNotifications` hook for real-time notification subscription
- `useVirtualList` hook for virtualized list rendering
- Analytics detail controller with extended analytics queries
- Notifications v1 API client module
- Analytics v1 API client module

### Changed

#### Documentation

- Complete rewrite of `SERVICES.md` — replaced 30+ phantom file references with actual 50 service files
- Updated all counts across documentation (47 models, 50 services, 44 controllers, 33 pages, 13 hooks)
- Added Activity Feed, Comments, and Settings/Profile sections to API reference
- Removed duplicate test entries from `TESTING.md`
- Added 4 new seed/migration scripts to `DATABASE.md`
- Expanded feature components and hooks tables in `FRONTEND.md`
- Added `features.test.ts` to client test catalog

---

## [1.1.0] — 2026-03-02

### Added

#### New Features

- Settings & Profile page with user account management
- Global search across transactions, tasks, and financial data (`GET /api/v1/search`)
- Category rules engine for automatic transaction categorization (CRUD endpoints)
- Analytics overview endpoint (`GET /api/v1/analytics/overview`)
- Budget envelope breakdown (`GET /api/v1/finance/budgets/:periodKey/envelopes`)
- Recurring transaction candidate detection (`GET /api/v1/finance/recurring/candidates`)

#### Security Hardening

- CSRF double-submit cookie protection (configurable via `CSRF_ENABLED`)
- Account lockout after 5 failed login attempts (15-min window)
- TOTP-based two-factor authentication with backup codes and status endpoint
- Security audit log with 26 event types, severity levels, and 365-day TTL
- Plugin permission sandbox with fail-closed enforcement and manifest validation
- Connector health monitoring with stale detection and success rate tracking
- Cookie security configuration (`COOKIE_SECRET`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`)

#### API Evolution

- vNext API migration: all routes now canonical under `/api/v1`
- Legacy `/api` routes include `X-API-Deprecation` headers
- Plugin management endpoints (`GET /api/v1/plugins`, update, uninstall, manifest validation)
- API key management endpoints (`GET/POST /api/v1/api-keys`, revoke)
- Integration listing (`GET /api/v1/integrations`), health summary
- Automation event listing (`GET /api/v1/automation/events`)
- Feature flag delete endpoint

#### Documentation

- Expanded documentation from 13 to 16 guides
- New: Middleware reference (13 modules)
- New: Services catalog (48 service files)
- New: Plugin system documentation
- Complete ENV_VARIABLES.md rewrite (~65 variables, up from ~25)
- Complete API.md rewrite (100+ endpoints with `/api/v1` paths)
- Updated all existing docs with corrected counts and new features

---

## [1.0.0] — 2026-03-02

### Added

#### Core Platform

- Full-stack monorepo with React 18 client, Express 5 server, and Python AI Core
- JWT + Google OAuth2 authentication with email verification and password reset
- TOTP-based two-factor authentication with backup codes
- Organization multi-tenancy with RBAC (owner/admin/member roles)
- Organization invitations with email-based accept flow

#### Financial Management

- Transaction CRUD with pagination, filtering, and category tagging
- Financial accounts management (checking, savings, credit, investment)
- Budget allocation system with period-based tracking
- Recurring transaction rules with cron-based scheduling
- Month-close summaries with income/expense/savings/net-worth snapshots
- Financial profile with goals, debts, risk tolerance, and investment experience
- Financial forecasting engine

#### AI & Intelligence

- Multi-agent AI system powered by Google Gemini via LangGraph
  - Income/Expense Analyzer, Budget Planner, Investment Advisor, Debt Optimizer, Financial Educator
- AI chat with session management and streaming responses (SSE)
- AI-generated financial insights, scenarios, and financial stories
- Receipt OCR and handwriting recognition (vision pipeline)
- Autopilot: plan → simulate → approve → execute workflow
- Tool simulation and execution framework (V2)
- AI memory system for contextual responses

#### Content & Community

- Blog system with slug-based routing and rich content
- Growth stories with financial journey narratives
- Public share links for financial stories
- Financial journaling with mood and financial impact tracking

#### Monetization & Billing

- Stripe integration (checkout, customer portal, webhooks)
- Subscription plans with entitlement-based feature gating
- Usage metering and ledger tracking
- Credit grants with expiration
- Referral code system with credit redemption

#### Marketplace & Integrations

- Plugin marketplace (browse catalog, install, configure, uninstall)
- Plugin permission sandbox with fail-closed enforcement
- Integration connectors with health monitoring
- CSV transaction import
- Webhook signature verification (HMAC-SHA256)

#### Automation & Workflows

- Workflow engine with trigger-based execution
- Workflow templates
- Cron-scheduled workflow runs
- Domain event automation system

#### Observability & Security

- Structured JSON logging (Pino + pino-http)
- Prometheus metrics (`/api/metrics`) with bearer token authentication
- OpenTelemetry auto-instrumentation (HTTP, MongoDB, Redis)
- Security headers via Helmet (HSTS, CSP, X-Frame-Options, etc.)
- CSRF double-submit cookie protection
- Account lockout after 5 failed login attempts
- Security audit log with 26 event types and 365-day TTL
- API key authentication with scoped permissions and quota enforcement
- Rate limiting per user/org/IP

#### Infrastructure

- BullMQ background workers for exports, digests, and workflow execution
- GridFS media storage for receipts and export files
- Server-Sent Events (SSE) for real-time updates and notifications
- Feature flags system
- Notification system with read status tracking
- Data export to CSV and PDF (PDFKit)

#### Developer Experience

- 34 server integration tests (Vitest + Supertest + mongodb-memory-server)
- Client test infrastructure (Vitest + Testing Library + MSW)
- AI Core test suite (Pytest)
- OpenAPI route coverage validation tests
- Migration scripts for transaction schema and org ID backfill
- Database seeding for demo content
- Comprehensive documentation (16 guides)

---

_See also_: [README.md](../README.md) · [CONTRIBUTING.md](./CONTRIBUTING.md)
