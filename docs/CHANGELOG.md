# Changelog

All notable changes to the FinWise project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `INDEX.md` as central documentation hub with quick reference tables
- `DEVELOPMENT.md` with development guidelines, conventions, and workflows
- `TROUBLESHOOTING.md` with comprehensive troubleshooting guide
- Enhanced `README.md` with complete project overview, tech stack, and feature details
- Enhanced `ARCHITECTURE.md` with data flow diagrams, security architecture, and module dependencies
- Enhanced `AI_CORE.md` with complete agent documentation, provider failover, and tool call system
- Enhanced `DATABASE.md` with WorkspaceFile model (49 total models)
- Enhanced `QUICK_START.md` with corrected env var names and troubleshooting
- Updated `FRONTEND.md` with Vite 7.3 version and component structure

### Changed
- Standardized project naming to "FinWise" across documentation
- Fixed env var naming inconsistency (`MONGO_URI` not `MONGODB_URI`)
- Corrected model count to 49 across all documentation
- Corrected middleware count to 13 across all documentation

---

## [1.5.0] - 2026-03-19

### Added

- `COMPLETE_PROJECT_ONBOARDING.md` as a detailed outsider-friendly onboarding manual covering repository layout, runtime boot flow, client and server architecture, AI Core architecture, end-to-end request flows, debugging, and common engineering tasks
- `AI_PROVIDERS_AND_FAILOVER.md` documenting provider selection, environment variables, model fallback, provider-chain failover, health endpoints, and related tests
- `DASHBOARD_AND_THEME.md` documenting the simplified dashboard layout, dark monochrome theme system, media helpers, image fallback behavior, and realtime invalidation rules

### Changed

- Rewrote the root `README.md` into a cleaner project guide with practical setup commands, validation commands, architecture summary, and focused documentation links
- Documented the recent dashboard simplification, dark-only UI direction, blog/growth-story media hardening, and multi-provider AI runtime behavior

## [1.4.0] - 2026-03-12

### Changed

- `DATABASE.md`: corrected Mongoose model count from 47 to 48 and added the missing `CalendarReminder` model entry
- `ARCHITECTURE.md`: corrected controller counts and updated the documentation guide count
- `README.md`: expanded the documentation index and corrected architecture references

## [1.3.0] - 2026-03-03

### Added

- Calendar reminders model, routes, and UI support
- Manual TOTP secret display for users who cannot scan QR codes
- Auth endpoints for profile update and password change
- Functional settings preferences for currency, locale, and timezone

### Fixed

- 2FA QR rendering
- Financial calendar currency and locale formatting
- Financial story data loading
- Activity feed pagination
- Notes recognition messaging
- Settings layout alignment
- Profile save reload behavior

### Changed

- Replaced "FinWise" branding references with "Personal Finance" across the product

## [1.2.0] - 2026-03-02

### Added

- Activity feed page and collaboration system
- Comments and annotations
- Settings and profile page
- Financial calendar page
- Notification center
- Blog and growth story preview components
- `LazyImage` progressive image loading component

### Changed

- Expanded and corrected multiple documentation guides including services, API, database, frontend, and testing references

## [1.1.0] - 2026-03-02

### Added

- Settings and profile page
- Global search
- Category rules engine
- Analytics overview
- Budget envelope breakdown
- Recurring transaction candidate detection
- CSRF protection
- Account lockout
- TOTP two-factor authentication
- Security audit log
- Plugin permission sandbox
- Connector health monitoring
- Canonical `/api/v1` API surface
- Plugin, API key, integration, and workflow-related endpoints

### Changed

- Expanded the documentation set and refreshed existing guides for new features

## [1.0.0] - 2026-03-02

### Added

- React client, Express server, and Python AI Core monorepo
- Authentication, organizations, invitations, and RBAC
- Transactions, budgets, goals, debts, forecasting, and exports
- AI chat, AI insights, scenarios, financial stories, OCR, and memory
- Workflows, automation, background jobs, and SSE updates
- Billing, referrals, plugins, integrations, and observability foundations
