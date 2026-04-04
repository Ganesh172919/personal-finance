# FinWise — Documentation Index

> Complete documentation for the FinWise personal finance platform.

---

## Getting Started

| Document | Description | Audience |
| -------- | ----------- | -------- |
| [README](../README.md) | Project overview, quick start, tech stack | Everyone |
| [Quick Start](./QUICK_START.md) | 5-minute setup guide | Developers |
| [Setup Guide](./SETUP.md) | Detailed environment configuration | Developers |
| [Environment Variables](./ENV_VARIABLES.md) | Complete env var reference | Developers |
| [User Manual](./COMPREHENSIVE_USER_MANUAL.md) | End-user guide | Users |
| [Onboarding](./COMPLETE_PROJECT_ONBOARDING.md) | Project onboarding guide | New team members |

---

## Architecture & Design

| Document | Description | Key Topics |
| -------- | ----------- | ---------- |
| [Architecture](./ARCHITECTURE.md) | System architecture and design decisions | 3-tier design, data flow, security |
| [Database](./DATABASE.md) | All 49 Mongoose models | Schema reference, migrations |
| [API Reference](./API.md) | Complete REST API documentation | 100+ endpoints, auth, errors |
| [Frontend](./FRONTEND.md) | React client architecture | Routing, state, components |
| [Services](./SERVICES.md) | Business logic service catalog | 49 services, patterns |
| [Middleware](./MIDDLEWARE.md) | Express middleware stack | 13 modules, ordering |

---

## AI System

| Document | Description | Key Topics |
| -------- | ----------- | ---------- |
| [AI Core](./AI_CORE.md) | Multi-agent AI engine | LangGraph, agents, tools |
| [AI Providers & Failover](./AI_PROVIDERS_AND_FAILOVER.md) | Provider configuration | key pools, model failover, provider failover |
| [Mega AI Core Deep Dive](./MEGA_AI_CORE_DEEP_DIVE.md) | AI system deep dive | Implementation details |

---

## Platform Features

| Document | Description | Key Topics |
| -------- | ----------- | ---------- |
| [Workflows](./WORKFLOWS.md) | Automation system | Cron, events, actions |
| [Plugin System](./PLUGIN_SYSTEM.md) | Extensibility architecture | Sandbox, permissions |
| [Realtime](./REALTIME.md) | SSE and domain events | Event bus, fanout |
| [Security](./SECURITY.md) | Security architecture | 2FA, audit, CSP |
| [Dashboard & Theme](./DASHBOARD_AND_THEME.md) | Dashboard and theming | Light/dark, tokens |

---

## Operations

| Document | Description | Key Topics |
| -------- | ----------- | ---------- |
| [Deployment](./DEPLOYMENT.md) | Production deployment | Docker, scaling, security |
| [Observability](./OBSERVABILITY.md) | Monitoring and alerting | Metrics, logging, tracing |
| [Testing](./TESTING.md) | Testing strategy | Vitest, pytest, MSW |

---

## Development

| Document | Description | Key Topics |
| -------- | ----------- | ---------- |
| [Contributing](./CONTRIBUTING.md) | Contribution guidelines | Branching, commits, PRs |
| [Changelog](./CHANGELOG.md) | Release history | v1.0.0 to v1.5.0 |

---

## Mega Guides (Comprehensive References)

| Document | Description | Size |
| -------- | ----------- | ---- |
| [Mega Project Guide](./MEGA_PROJECT_GUIDE.md) | Comprehensive project reference | Full project overview |
| [Mega Codebase Reference](./MEGA_CODEBASE_REFERENCE.md) | Code-level details | File-by-file breakdown |
| [Mega Data Model Compendium](./MEGA_DATA_MODEL_COMPENDIUM.md) | Data model reference | All models, relationships |
| [Mega API Playbook](./MEGA_API_PLAYBOOK.md) | API deep dive | Endpoint details |
| [Mega Frontend UI Atlas](./MEGA_FRONTEND_UI_ATLAS.md) | UI components | All components, patterns |
| [Mega Developer Recipes](./MEGA_DEVELOPER_RECIPES.md) | How-to guides | Common tasks |
| [Mega Operations Runbook](./MEGA_OPERATIONS_RUNBOOK.md) | Operations guide | Production procedures |
| [Mega Security Runbook](./MEGA_SECURITY_RUNBOOK.md) | Security details | Threat model, hardening |
| [Mega Testing Playbook](./MEGA_TESTING_PLAYBOOK.md) | Testing guide | Test strategies, examples |

---

## Quick Reference

### Ports

| Service | Port | Protocol |
| ------- | ---- | -------- |
| Client (Vite) | 5173 | HTTP |
| Server (Express) | 3000 | HTTP |
| AI Core (FastAPI) | 8001 | HTTP |
| MongoDB | 27017 | TCP |
| Redis | 6379 | TCP |

### Key Commands

```bash
# Server
cd server && npm run dev          # Start dev server
cd server && npm run check        # Type check
cd server && npm test             # Run tests

# Client
cd client && npm run dev          # Start dev server
cd client && npm run build        # Build for production
cd client && npm test             # Run tests

# AI Core
cd server/AI_Core && python api_service.py  # Start AI Core
cd server/AI_Core && pytest tests/ -v       # Run tests
```

### Recent Documentation Focus

- multi-key AI provider pools and OpenRouter rotation
- 100+ entry model catalog and task-aware routing
- resumable AI sessions and checkpoint metadata
- AI status, model health, and failover visibility in the chat UI
- chat workspace layout updates for a larger conversation surface

### File Counts

| Area | Count |
| ---- | ----- |
| Mongoose models | 49 |
| API endpoints | 100+ |
| React pages | 34 |
| UI components | 36+ (47 primitives) |
| Custom hooks | 13 |
| Zustand stores | 6 |
| Server services | 49 |
| Server controllers | 44 |
| Middleware modules | 13 |
| Zod schemas | 35 |
| AI agents | 6 |
| AI Core tests | 15 |
| Server tests | 35 |
| Documentation files | 33 |

---

## Documentation Status

| Document | Last Updated | Completeness |
| -------- | ------------ | ------------ |
| README | Mar 2026 | Complete |
| ARCHITECTURE | Mar 2026 | Complete |
| AI_CORE | Mar 2026 | Complete |
| DATABASE | Mar 2026 | Complete |
| API | Mar 2026 | Complete |
| FRONTEND | Mar 2026 | Complete |
| SETUP | Mar 2026 | Complete |
| ENV_VARIABLES | Mar 2026 | Complete |
| SECURITY | Mar 2026 | Complete |
| TESTING | Mar 2026 | Complete |
| DEPLOYMENT | Mar 2026 | Complete |
| CONTRIBUTING | Mar 2026 | Complete |
| WORKFLOWS | Mar 2026 | Complete |
| PLUGIN_SYSTEM | Mar 2026 | Complete |
| REALTIME | Mar 2026 | Complete |
| OBSERVABILITY | Mar 2026 | Complete |
| MIDDLEWARE | Mar 2026 | Complete |
| SERVICES | Mar 2026 | Complete |
| QUICK_START | Mar 2026 | Complete |
| CHANGELOG | Mar 2026 | Complete |
| DASHBOARD_AND_THEME | Mar 2026 | Complete |
| AI_PROVIDERS_AND_FAILOVER | Mar 2026 | Complete |
| COMPREHENSIVE_USER_MANUAL | Mar 2026 | Complete |
| COMPLETE_PROJECT_ONBOARDING | Mar 2026 | Complete |

---

_See also_: [README](../README.md) · [Contributing](./CONTRIBUTING.md) · [Changelog](./CHANGELOG.md)
