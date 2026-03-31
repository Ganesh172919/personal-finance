# Future Improvements & Roadmap

> **Document:** 12-future-improvements.md  
> **Project:** FinWise — Personal Finance Management Platform  
> **Last Updated:** March 2026  
> **Status:** Living Document

---

## Table of Contents

- [1. Roadmap Overview](#1-roadmap-overview)
- [2. Planned Features](#2-planned-features)
- [3. Known Limitations](#3-known-limitations)
- [4. Technical Debt](#4-technical-debt)
- [5. Community Requests](#5-community-requests)
- [6. Priority Matrix](#6-priority-matrix)
- [7. Version Roadmap](#7-version-roadmap)
- [8. How to Contribute to Roadmap](#8-how-to-contribute-to-roadmap)

---

## 1. Roadmap Overview

### Vision

FinWise aims to become a comprehensive, AI-powered personal and small-business finance management platform that democratizes financial intelligence. The long-term vision is a single platform where individuals and organizations can track, analyze, optimize, and plan their financial lives with the assistance of artificial intelligence, automated data ingestion, and collaborative tools.

### Strategic Pillars

| Pillar | Description |
|--------|-------------|
| **Automation** | Reduce manual data entry through bank integrations, OCR, and AI-powered categorization |
| **Intelligence** | Provide actionable financial insights through AI analysis, predictive analytics, and smart recommendations |
| **Accessibility** | Make financial management accessible on any device, in any currency, for any user |
| **Collaboration** | Enable shared financial planning for families, teams, and organizations |
| **Extensibility** | Build an open ecosystem of integrations, APIs, and community contributions |

### Time Horizon

| Horizon | Timeline | Focus |
|---------|----------|-------|
| **Short-term** | 0–3 months | Core feature completion, stability improvements, user experience polish |
| **Mid-term** | 3–9 months | Bank integrations, mobile app foundation, advanced analytics, multi-currency |
| **Long-term** | 9–18 months | AI enhancements, collaborative features, integration ecosystem, enterprise capabilities |

---

## 2. Planned Features

### 2.1 Bank Integration

Automated bank connectivity eliminates manual transaction entry and ensures data accuracy through direct financial institution connections.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Plaid Integration** | Connect to 12,000+ North American financial institutions via Plaid API. Support for account linking, transaction pull, balance checks, and identity verification. | High | Planned |
| **Tink Integration** | European bank connectivity via Tink (Visa) covering 3,400+ banks across 18 countries. PSD2-compliant access with strong customer authentication (SCA). | Medium | Planned |
| **Automatic Transaction Import** | Scheduled daily sync of new transactions. Conflict resolution for duplicates. Historical transaction backfill (up to 24 months). | High | Planned |
| **Real-Time Balance Updates** | Push-based balance updates via webhooks where supported. Fallback to polling for institutions without webhook support. | Medium | Planned |
| **GoCardless (Nordigen)** | Open Banking API for EU/UK banks as a free alternative to paid aggregators. | Medium | Research |
| **Direct OAuth Connections** | Direct OAuth connections for major banks that support open APIs without third-party aggregators. | Low | Research |

**Architecture Considerations:**
- Provider abstraction layer to swap integrations without changing core logic
- Encrypted credential storage using application-level encryption
- Token refresh and session management for long-lived connections
- Graceful degradation when providers experience outages

---

### 2.2 Multi-Currency Support

Enable users to manage finances across multiple currencies with accurate conversion and reporting.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Live Exchange Rates** | Real-time FX rates from providers like ExchangeRate-API, Open Exchange Rates, or Frankfurter (free ECB data). Rates cached with configurable TTL. | High | Planned |
| **Multi-Currency Accounts** | Accounts denominated in non-base currencies. Automatic conversion to base currency for consolidated reporting. | High | Planned |
| **FX Gain/Loss Tracking** | Track unrealized and realized foreign exchange gains/losses on multi-currency holdings. FIFO and average cost methods. | Medium | Planned |
| **Currency Preference per Organization** | Each organization sets its own base currency. Reports generated in base currency with optional multi-currency display. | Medium | Planned |
| **Historical Rate Lookup** | Store historical exchange rates for accurate past transaction valuation. Rate snapshots taken daily. | Medium | Planned |
| **Multi-Currency Budgets** | Budgets that span multiple currencies with automatic conversion at budget creation time. | Low | Planned |

**Architecture Considerations:**
- All monetary values stored with currency code and minor units (e.g., cents)
- Conversion rates stored with timestamp and source for auditability
- Reports support both transaction currency and base currency views
- Database schema updates to add `currency` columns to all monetary fields

---

### 2.3 Mobile App

A native mobile experience for on-the-go financial management with offline capabilities.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **React Native Application** | Cross-platform mobile app for iOS and Android sharing business logic with the web frontend. TypeScript codebase with shared types. | High | Planned |
| **Offline-First Architecture** | Local database (WatermelonDB or SQLite) with sync engine. Full functionality without network connectivity. Conflict resolution on reconnect. | High | Planned |
| **Biometric Authentication** | Face ID, Touch ID, and Android biometric authentication for quick and secure app access. | Medium | Planned |
| **Push Notifications** | Budget alerts, bill reminders, unusual spending notifications, and AI insight alerts via Firebase Cloud Messaging and Apple Push Notification Service. | Medium | Planned |
| **Quick Transaction Entry** | Voice-to-text transaction entry, receipt photo capture with OCR, and widget-based quick add. | Medium | Planned |
| **Mobile-Optimized Dashboard** | Key financial metrics, recent transactions, and budget status optimized for small screens. | High | Planned |
| **Expense Snap** | Camera-based receipt capture with automatic merchant detection, amount extraction, and categorization. | Medium | Planned |

**Architecture Considerations:**
- Shared API client and type definitions between web and mobile
- Local-first data model with background sync
- Deep linking for notifications and shared content
- App Store and Play Store deployment pipelines

---

### 2.4 Advanced Investment Analytics

Comprehensive portfolio analysis tools for informed investment decisions.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **XIRR Calculation** | Extended Internal Rate of Return for portfolios with irregular cash flows. Accurate performance measurement for real-world investment scenarios. | High | Planned |
| **TWRR Calculation** | Time-Weighted Rate of Return eliminating the impact of external cash flows. Industry-standard performance metric for comparison. | Medium | Planned |
| **Asset Allocation Visualization** | Interactive pie charts, treemaps, and sunburst diagrams showing portfolio composition by asset class, sector, geography, and risk level. | High | Planned |
| **Benchmark Comparison** | Compare portfolio performance against indices (S&P 500, NASDAQ, MSCI World, etc.) and custom benchmarks. | Medium | Planned |
| **Dividend Tracking & Projection** | Track dividend income, yield on cost, and project future dividend payments based on historical patterns and announced schedules. | Medium | Planned |
| **Tax-Loss Harvesting Suggestions** | AI-powered identification of tax-loss harvesting opportunities. Wash sale rule compliance checking. Estimated tax savings calculation. | Low | Planned |
| **Risk Metrics** | Portfolio beta, Sharpe ratio, Sortino ratio, maximum drawdown, and Value at Risk (VaR) calculations. | Low | Planned |
| **Rebalancing Alerts** | Notifications when asset allocation drifts beyond defined thresholds. Suggested trades to rebalance. | Medium | Planned |

**Architecture Considerations:**
- Integration with market data providers (Alpha Vantage, Yahoo Finance, Polygon.io)
- Historical price data caching for performance calculations
- Pre-computed metrics updated on schedule for large portfolios
- Export capabilities for tax reporting

---

### 2.5 Tax Optimization Engine

Automated tax planning and reporting to minimize tax liability and simplify compliance.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Tax Category Mapping** | Automatic mapping of transactions to tax categories based on merchant, description, and user-defined rules. Support for multiple tax jurisdictions. | High | Planned |
| **Tax Report Generation** | Generate tax-ready reports for Schedule C, Schedule D, and other common tax forms. Export in formats accepted by popular tax software. | High | Planned |
| **Deduction Suggestions** | AI-powered identification of potential tax deductions based on spending patterns, occupation, and jurisdiction-specific rules. | Medium | Planned |
| **Tax Year Summaries** | Comprehensive annual tax summaries with income breakdown, deductible expenses, capital gains/losses, and estimated tax liability. | High | Planned |
| **Multi-Jurisdiction Support** | Support for federal, state/provincial, and local tax rules. Configurable tax rates and deduction limits per jurisdiction. | Medium | Planned |
| **Quarterly Estimated Tax Calculator** | Calculate and track quarterly estimated tax payments with reminders for upcoming deadlines. | Low | Planned |
| **Tax Document Storage** | Secure storage and organization of tax documents (W-2s, 1099s, receipts) with OCR for searchable text. | Low | Planned |

**Architecture Considerations:**
- Tax rule engine with configurable rules per jurisdiction
- Versioned tax rules for historical accuracy
- Disclaimer system clarifying that suggestions are informational, not professional tax advice
- Integration with tax filing software APIs where available

---

### 2.6 Collaborative Budgeting

Shared financial planning tools for families, teams, and organizations.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Shared Budget Management** | Multiple users can view and edit shared budgets. Real-time collaboration with presence indicators and change tracking. | High | Planned |
| **Budget Approval Workflows** | Configurable approval chains for budget changes. Role-based permissions (viewer, editor, approver, admin). Audit trail for all changes. | Medium | Planned |
| **Department/Team Budgets** | Hierarchical budget structure with organizational units. Roll-up reporting and allocation management. | Medium | Planned |
| **Budget Variance Alerts** | Notifications when spending approaches or exceeds budget thresholds. Configurable alert levels (80%, 90%, 100%). | High | Planned |
| **Comment & Discussion Threads** | Attach comments to budget line items and transactions for context and collaboration. @mentions for team communication. | Low | Planned |
| **Budget Templates** | Pre-built budget templates for common scenarios (household, startup, project, event). Community-shared template marketplace. | Low | Planned |

**Architecture Considerations:**
- Real-time sync using WebSockets or Server-Sent Events
- Conflict resolution with operational transforms or CRDTs
- Granular permission system extending the existing RBAC model
- Notification service for cross-user alerts

---

### 2.7 AI Enhancements

Expanded AI capabilities for deeper financial intelligence.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Additional LLM Providers** | Support for Claude, Gemini, Llama, and local models via Ollama. Provider fallback and cost optimization through intelligent routing. | High | Planned |
| **Voice Input Support** | Speech-to-text for transaction entry, queries, and commands. Integration with device-native speech recognition and Whisper API. | Medium | Planned |
| **Predictive Analytics** | Cash flow forecasting, spending trend prediction, and bill payment prediction using time-series models. Confidence intervals and scenario analysis. | High | Planned |
| **Anomaly Detection** | Automatic detection of unusual transactions, spending spikes, duplicate charges, and potential fraud. Alert generation with severity scoring. | Medium | Planned |
| **Personalized Financial Coaching** | AI financial coach providing personalized advice based on spending patterns, goals, and financial health scores. Conversational interface with memory. | Medium | Planned |
| **Natural Language Queries** | Ask questions about finances in plain English: "How much did I spend on dining last month?" or "What's my net worth trend?" | High | Planned |
| **Document Intelligence** | Extract structured data from financial documents (statements, invoices, contracts) using multimodal AI models. | Low | Planned |
| **Goal Planning Assistant** | AI-assisted financial goal setting with realistic timelines, required savings rates, and milestone tracking. | Medium | Planned |

**Architecture Considerations:**
- Provider-agnostic AI abstraction layer (already partially implemented)
- Prompt versioning and A/B testing framework
- Cost monitoring and budget controls per organization
- Local model support for privacy-sensitive deployments
- Response caching for common queries

---

### 2.8 Advanced Reporting

Flexible, powerful reporting for all financial analysis needs.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Custom Report Builder** | Drag-and-drop report builder with customizable dimensions, metrics, filters, and visualizations. Save and share report templates. | High | Planned |
| **Scheduled Report Delivery** | Automated report generation and delivery via email, Slack, or webhook on configurable schedules (daily, weekly, monthly, quarterly). | Medium | Planned |
| **Export to Multiple Formats** | Export reports to PDF, Excel, CSV, Google Sheets, and interactive HTML. Branded PDF reports with custom logos and colors. | High | Planned |
| **Visual Report Templates** | Pre-built report templates for common use cases: monthly financial review, annual summary, investment performance, budget vs. actual. | Medium | Planned |
| **Comparative Analysis** | Period-over-period comparisons, year-over-year trends, and benchmark comparisons in a single view. | Medium | Planned |
| **Drill-Down Capabilities** | Click through summary numbers to underlying transactions. Multi-level drill-down from annual to transaction level. | High | Planned |

**Architecture Considerations:**
- Report definition stored as JSON for portability
- Background job processing for large report generation
- Caching layer for frequently accessed reports
- Template versioning and sharing permissions

---

### 2.9 Integration Ecosystem

Connect FinWise with the tools and services you already use.

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| **Third-Party Integrations** | Pre-built connectors for popular tools: QuickBooks, Xero, Stripe, PayPal, Shopify, Gusto, and more. | High | Planned |
| **Webhook Builder** | Configure outgoing webhooks for events: new transaction, budget exceeded, goal reached, AI insight generated. Retry logic and delivery guarantees. | Medium | Planned |
| **Zapier Integration** | Zapier app enabling no-code workflows connecting FinWise to 5,000+ apps. Triggers and actions for common use cases. | Medium | Planned |
| **Make (Integromat) Integration** | Make.com modules for advanced workflow automation with visual scenario builder. | Low | Planned |
| **API Marketplace** | Public API documentation with interactive explorer. API keys with scoped permissions. Rate limiting and usage analytics. | High | Planned |
| **SSO/SAML Integration** | Enterprise single sign-on via SAML 2.0, OAuth 2.0, and OpenID Connect. Support for Okta, Azure AD, Google Workspace. | Low | Planned |
| **Data Import/Export** | Comprehensive data import from Mint, YNAB, Monarch Money, and other platforms. Full data export for portability. | High | Planned |

**Architecture Considerations:**
- Integration framework with standardized connector interface
- OAuth app management for third-party authentication
- Webhook delivery service with dead letter queue
- API versioning strategy for backward compatibility
- Rate limiting and abuse prevention

---

## 3. Known Limitations

The following limitations exist in the current release. Workarounds are provided where available.

| Limitation | Impact | Workaround | Target Resolution |
|------------|--------|------------|-------------------|
| **No automatic bank sync** | Users must manually enter transactions or import CSV files. Time-consuming and error-prone. | Use CSV import from bank downloads. Leverage AI categorization to speed up review. | v2.0 |
| **Single currency support** | All amounts stored and displayed in a single currency (default: USD). No FX conversion. | Manually convert amounts before entry. Note currency in transaction description. | v2.1 |
| **No native mobile app** | Web application only. No optimized mobile experience or offline access. | Use responsive web interface on mobile browsers. Add to home screen as PWA. | v2.0 |
| **AI recommendations limited to text** | AI insights are text-based without interactive charts or visual analysis. | Use built-in charts alongside AI text recommendations. Export data for external analysis. | v1.5 |
| **OCR accuracy varies** | Receipt and invoice OCR accuracy depends on image quality, handwriting, and language. | Use high-quality, well-lit photos. Review and correct extracted data before saving. | Ongoing |
| **No real-time stock price fetching** | Investment values must be updated manually. No live market data. | Periodically update prices manually. Use external sources for current valuations. | v2.0 |
| **Limited internationalization** | UI primarily in English. Date/number formats follow US conventions. | — | v2.1 |
| **No offline mode on web** | Application requires internet connectivity. No cached data for offline viewing. | — | v2.0 (mobile) |
| **Connector stubs not implemented** | The connector framework exists but actual provider implementations are stubs. | Use manual entry and CSV import. | v2.0 |
| **No recurring transaction detection** | Recurring bills and subscriptions must be manually tracked. | Use transaction descriptions with consistent naming. Create rules for auto-categorization. | v1.5 |
| **Limited multi-organization support** | Organization switching works but cross-organization reporting is unavailable. | Generate reports per organization and consolidate externally. | v2.1 |
| **No audit log for data changes** | Changes to transactions and budgets are not tracked with full audit history. | Rely on database backups for recovery. | v1.5 |

---

## 4. Technical Debt

Areas of the codebase requiring refactoring, cleanup, or improvement to maintain long-term health.

### 4.1 Legacy API Route Cleanup

| Item | Description | Effort | Risk |
|------|-------------|--------|------|
| **Deprecated `/api/*` routes** | Legacy API routes coexist with newer Server Actions and tRPC procedures. All legacy routes should be migrated and removed. | Medium | Low |
| **Inconsistent response formats** | Some endpoints return different error/success structures. Standardize on a unified response envelope. | Low | Low |
| **Missing API versioning** | No versioning strategy for the public API. Breaking changes could affect integrations. | Medium | Medium |

### 4.2 Test Coverage Gaps

| Area | Current Coverage | Target | Notes |
|------|-----------------|--------|-------|
| **Server utilities** | ~60% | 90% | AI service, connector framework, and financial calculators need more tests |
| **Client components** | ~40% | 80% | Complex components (charts, forms, modals) need unit and integration tests |
| **Database operations** | ~50% | 85% | Repository layer and migration scripts need comprehensive test coverage |
| **API endpoints** | ~45% | 85% | Request validation, error handling, and edge cases need testing |
| **E2E flows** | ~20% | 60% | Critical user journeys need end-to-end test coverage |

### 4.3 Documentation Gaps

| Area | Status | Priority |
|------|--------|----------|
| **API documentation** | Partial — needs OpenAPI/Swagger spec generation | High |
| **Component documentation** | Minimal — needs Storybook or similar | Medium |
| **Deployment guides** | Basic — needs detailed environment-specific guides | High |
| **Contributing guide** | Missing — needs developer onboarding documentation | High |
| **Architecture Decision Records** | Missing — needs ADRs for key technical decisions | Medium |

### 4.4 Performance Bottlenecks

| Area | Issue | Impact | Mitigation |
|------|-------|--------|------------|
| **Large dataset queries** | Transaction queries without pagination degrade with 10K+ records | High | Implement cursor-based pagination, database indexing |
| **Chart rendering** | Complex charts with large datasets cause UI jank | Medium | Data sampling, virtualization, Web Workers |
| **AI response latency** | LLM API calls block UI during analysis | Medium | Streaming responses, optimistic UI, caching |
| **Bundle size** | Client bundle includes unused chart library code | Low | Code splitting, tree shaking, dynamic imports |
| **Database connection pooling** | Connection limits under high concurrent load | Medium | Implement connection pooling, query optimization |

### 4.5 Code Duplication

| Area | Description | Refactoring Approach |
|------|-------------|---------------------|
| **Validation schemas** | Zod schemas duplicated between client and server | Extract to shared package |
| **Type definitions** | TypeScript interfaces duplicated across modules | Centralize in shared types package |
| **Formatting utilities** | Date, currency, and number formatting repeated | Create shared utility library |
| **Chart components** | Similar chart configurations across multiple pages | Create reusable chart component library |
| **Error handling** | Error handling patterns inconsistent across routes | Standardize error middleware |

---

## 5. Community Requests

Features and improvements requested by users and the community.

> **Note:** As an open-source project, community feedback directly shapes the roadmap. Requests are tracked via GitHub Issues and discussions.

| Request | Description | Votes | Status |
|---------|-------------|-------|--------|
| **Dark mode** | Full dark theme support across all pages and components | High | Planned |
| **Keyboard shortcuts** | Power-user keyboard navigation for common actions | Medium | Planned |
| **Recurring transactions** | Automatic creation of recurring bills and income | High | Planned |
| **Goal tracking** | Visual savings goals with progress tracking | High | Planned |
| **Net worth dashboard** | Consolidated view of assets, liabilities, and net worth over time | Medium | Planned |
| **Split transactions** | Single transaction split across multiple categories | Medium | Planned |
| **Transfer tracking** | Track transfers between accounts without double-counting | Medium | Planned |
| **Custom categories** | User-defined transaction categories with custom icons and colors | High | Planned |
| **Data retention policies** | Configurable data retention and auto-deletion rules | Low | Research |
| **Accessibility improvements** | WCAG 2.1 AA compliance across all components | High | Ongoing |

---

## 6. Priority Matrix

Features plotted by priority and implementation effort to guide development sequencing.

### 6.1 Matrix Overview

```
                LOW EFFORT                    HIGH EFFORT
              ┌─────────────┬─────────────┐
    HIGH      │  DO FIRST   │   PLAN      │
    PRIORITY  │             │   CAREFULLY │
              ├─────────────┼─────────────┤
    LOW       │  FILL       │  CONSIDER   │
    PRIORITY  │  GAPS       │  LATER      │
              └─────────────┴─────────────┘
```

### 6.2 Detailed Classification

#### High Priority / Low Effort (Do First)

| Feature | Rationale | Estimated Effort |
|---------|-----------|-----------------|
| Custom transaction categories | High user demand, straightforward schema change | 1–2 weeks |
| Recurring transaction templates | Common request, builds on existing transaction model | 2–3 weeks |
| Transfer tracking between accounts | Prevents double-counting, simple logic addition | 1 week |
| Dark mode | High visibility, CSS variable migration | 2–3 weeks |
| Keyboard shortcuts | Power-user productivity, minimal backend changes | 1–2 weeks |
| Audit log for data changes | Compliance need, event-driven implementation | 2 weeks |
| Additional LLM providers | Extends existing AI abstraction layer | 1–2 weeks |
| Natural language queries | Leverages existing AI infrastructure | 2–3 weeks |

#### High Priority / High Effort (Plan Carefully)

| Feature | Rationale | Estimated Effort |
|---------|-----------|-----------------|
| Plaid bank integration | Core automation feature, significant integration work | 4–6 weeks |
| React Native mobile app | Major platform expansion, architecture decisions | 8–12 weeks |
| Multi-currency support | Fundamental schema changes, widespread impact | 4–6 weeks |
| AI predictive analytics | Complex modeling, data requirements | 4–6 weeks |
| Custom report builder | Complex UI, flexible data model | 4–6 weeks |
| Collaborative budgeting | Real-time sync, permission model extension | 6–8 weeks |
| Tax optimization engine | Jurisdiction complexity, compliance considerations | 6–8 weeks |
| Advanced investment analytics | Financial math complexity, data integrations | 4–6 weeks |

#### Low Priority / Low Effort (Fill Gaps)

| Feature | Rationale | Estimated Effort |
|---------|-----------|-----------------|
| Export to additional formats | Incremental improvement on existing export | 1 week |
| Budget templates | Reusable data, simple UI | 1 week |
| Comment threads on transactions | Social feature, straightforward implementation | 1–2 weeks |
| Make.com integration | Extends existing webhook system | 1–2 weeks |
| Scheduled report delivery | Builds on report generation infrastructure | 2 weeks |
| Rebalancing alerts | Extension of portfolio tracking | 1 week |
| Quarterly tax calculator | Simple calculations, reminder system | 1–2 weeks |

#### Low Priority / High Effort (Consider Later)

| Feature | Rationale | Estimated Effort |
|---------|-----------|-----------------|
| Tax-loss harvesting suggestions | Complex tax logic, limited audience | 6–8 weeks |
| SSO/SAML enterprise integration | Enterprise feature, complex security | 4–6 weeks |
| API marketplace | Developer platform, documentation overhead | 6–8 weeks |
| Document intelligence AI | Multimodal AI, complex extraction logic | 6–8 weeks |
| Direct OAuth bank connections | Per-bank implementation, maintenance burden | 8–12 weeks |
| Community template marketplace | Platform feature, moderation requirements | 4–6 weeks |

### 6.3 Priority Scoring

Features ranked by weighted score (Impact × Urgency ÷ Effort).

| Rank | Feature | Impact (1-5) | Urgency (1-5) | Effort (1-5) | Score |
|------|---------|--------------|---------------|--------------|-------|
| 1 | Custom categories | 5 | 4 | 2 | 10.0 |
| 2 | Recurring transactions | 5 | 4 | 2 | 10.0 |
| 3 | Dark mode | 4 | 4 | 2 | 8.0 |
| 4 | Transfer tracking | 4 | 3 | 1 | 12.0 |
| 5 | Keyboard shortcuts | 3 | 3 | 1 | 9.0 |
| 6 | Audit log | 4 | 3 | 2 | 6.0 |
| 7 | Additional LLM providers | 4 | 4 | 2 | 8.0 |
| 8 | Natural language queries | 5 | 3 | 3 | 5.0 |
| 9 | Plaid integration | 5 | 5 | 4 | 6.25 |
| 10 | Multi-currency support | 4 | 4 | 4 | 4.0 |
| 11 | Mobile app | 5 | 4 | 5 | 3.6 |
| 12 | Predictive analytics | 4 | 3 | 4 | 3.0 |
| 13 | Custom report builder | 4 | 3 | 4 | 3.0 |
| 14 | Collaborative budgeting | 3 | 3 | 4 | 2.25 |
| 15 | Tax optimization engine | 4 | 3 | 4 | 3.0 |
| 16 | Investment analytics | 3 | 3 | 4 | 2.25 |

---

## 7. Version Roadmap

Planned releases with target features and timelines.

### v1.4 — Stability & Polish (Q2 2026)

**Theme:** Harden the existing feature set and improve user experience.

| Feature | Type | Status |
|---------|------|--------|
| Dark mode | UI | Planned |
| Keyboard shortcuts | UX | Planned |
| Custom transaction categories | Feature | Planned |
| Recurring transaction templates | Feature | Planned |
| Transfer tracking | Feature | Planned |
| Audit log for data changes | Infrastructure | Planned |
| Performance optimizations (pagination, indexing) | Performance | Planned |
| Test coverage improvements (target: 70%) | Quality | Planned |
| Accessibility improvements (WCAG 2.1 AA) | Quality | Planned |
| Legacy API route cleanup | Technical Debt | Planned |

### v1.5 — AI & Intelligence (Q3 2026)

**Theme:** Expand AI capabilities and introduce predictive features.

| Feature | Type | Status |
|---------|------|--------|
| Additional LLM providers (Claude, Gemini, local) | AI | Planned |
| Natural language financial queries | AI | Planned |
| Predictive cash flow analytics | AI | Planned |
| Anomaly detection for transactions | AI | Planned |
| Personalized financial coaching | AI | Planned |
| Recurring transaction detection | Feature | Planned |
| Net worth dashboard | Feature | Planned |
| Goal tracking with progress | Feature | Planned |
| Split transaction support | Feature | Planned |
| Export to PDF and Excel | Reporting | Planned |

### v2.0 — Connectivity & Mobility (Q4 2026)

**Theme:** Bank integrations and mobile application launch.

| Feature | Type | Status |
|---------|------|--------|
| Plaid bank integration | Integration | Planned |
| Automatic transaction import | Integration | Planned |
| React Native mobile app (iOS + Android) | Platform | Planned |
| Offline-first mobile architecture | Platform | Planned |
| Biometric authentication | Security | Planned |
| Push notifications | Platform | Planned |
| Real-time stock price fetching | Data | Planned |
| XIRR/TWRR investment metrics | Analytics | Planned |
| Asset allocation visualization | Analytics | Planned |
| Webhook builder | Integration | Planned |
| Zapier integration | Integration | Planned |
| Data import from competitors (Mint, YNAB) | Migration | Planned |

### v2.1 — Global & Collaborative (Q1 2027)

**Theme:** Multi-currency, internationalization, and team features.

| Feature | Type | Status |
|---------|------|--------|
| Multi-currency accounts | Feature | Planned |
| Live exchange rates | Data | Planned |
| FX gain/loss tracking | Analytics | Planned |
| Internationalization (i18n) | Platform | Planned |
| Shared budget management | Collaboration | Planned |
| Budget approval workflows | Collaboration | Planned |
| Department/team budgets | Collaboration | Planned |
| Budget variance alerts | Collaboration | Planned |
| Tink integration (EU banks) | Integration | Planned |
| Comparative analysis reports | Reporting | Planned |

### v2.2 — Enterprise & Ecosystem (Q2 2027)

**Theme:** Enterprise features and integration marketplace.

| Feature | Type | Status |
|---------|------|--------|
| SSO/SAML integration | Security | Planned |
| API marketplace | Platform | Planned |
| Custom report builder | Reporting | Planned |
| Scheduled report delivery | Reporting | Planned |
| Tax optimization engine | Feature | Planned |
| Tax report generation | Feature | Planned |
| Third-party connector marketplace | Integration | Planned |
| Advanced investment analytics | Analytics | Planned |
| Tax-loss harvesting suggestions | Analytics | Planned |
| Voice input support | AI | Planned |

---

## 8. How to Contribute to Roadmap

We welcome community input on the roadmap. Here's how you can influence the direction of FinWise.

### 8.1 Suggesting Features

1. **Search existing issues** — Check [GitHub Issues](https://github.com/your-org/finwise/issues) to see if your feature has already been requested
2. **Create a new issue** — Use the "Feature Request" template with:
   - Clear description of the problem you're solving
   - Proposed solution or approach
   - Use cases and examples
   - Any relevant mockups or diagrams
3. **Tag appropriately** — Use labels like `feature-request`, `enhancement`, or `integration`

### 8.2 Voting on Features

- **React to issues** — Add a 👍 reaction to feature requests you support
- **Comment with context** — Share your use case to help prioritize
- **Participate in discussions** — Join roadmap discussions in GitHub Discussions

### 8.3 Contributing Code

1. **Check the roadmap** — Look for features marked "Planned" that align with your interests
2. **Find a good first issue** — Issues labeled `good-first-issue` are great for new contributors
3. **Fork and develop** — Follow the [Contributing Guide](./CONTRIBUTING.md) for setup and standards
4. **Submit a PR** — Reference the related issue and describe your changes

### 8.4 Roadmap Review Process

| Step | Description | Timeline |
|------|-------------|----------|
| **Community suggestions** | Features submitted via GitHub Issues | Ongoing |
| **Maintainer triage** | Core team reviews and categorizes requests | Monthly |
| **Priority scoring** | Features scored using the priority matrix | Quarterly |
| **Roadmap update** | Version roadmap updated based on scores and capacity | Quarterly |
| **Community announcement** | Updated roadmap shared via GitHub Discussions | After each review |

### 8.5 Decision Criteria

Features are evaluated based on:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **User impact** | 30% | How many users benefit and how significantly |
| **Strategic alignment** | 25% | How well the feature aligns with project vision |
| **Technical feasibility** | 20% | Complexity, dependencies, and maintenance burden |
| **Community demand** | 15% | Number of requests, votes, and discussion activity |
| **Resource availability** | 10% | Available developer capacity and expertise |

### 8.6 Contact

- **GitHub Issues:** Feature requests and bug reports
- **GitHub Discussions:** Roadmap conversations and community feedback
- **Discord/Slack:** Real-time community chat (if available)
- **Email:** Core team contact for sensitive or complex proposals

---

*This document is a living roadmap and will be updated as features are completed, priorities shift, and new requirements emerge. Last reviewed: March 2026.*
