# Personal Finance

Personal Finance is a full-stack money management platform with:

- A React client for dashboards, analytics, chat, content, and workflows
- An Express API for finance data, auth, organizations, automation, and realtime events
- A Python AI Core for multi-agent financial reasoning, OCR, and tool-driven guidance

This repository is organized as a single workspace so the client, server, shared contracts, and AI runtime can evolve together.

## Architecture

```text
personal-finance/
|- client/                 React + Vite application
|- server/                 Express + TypeScript API
|  |- AI_Core/             Python FastAPI + LangGraph AI service
|- packages/contracts/     Shared OpenAPI and TypeScript contracts
|- docs/                   Project documentation
```

High-level request flow:

1. The client calls the Express API through typed API helpers and React Query.
2. The server handles auth, org context, validation, persistence, and SSE events.
3. AI-related requests are forwarded to the AI Core over HTTP.
4. The AI Core routes work across specialist agents and provider/model failover chains.
5. Responses are cached and reflected back into the UI through query invalidation and realtime events.

## Major capabilities

- Personal finance tracking: transactions, goals, debts, budgets, analytics, exports
- Collaborative workspaces: organizations, invites, comments, activity, notifications
- AI features: chat, insights, scenarios, financial stories, OCR, handwriting parsing
- Automation: workflows, domain events, background jobs, scheduled processing
- Content: blogs and growth stories with detail pages and media support

## Local development

### Prerequisites

- Node.js 18+
- npm 9+
- MongoDB 6+
- Redis 7+
- Python 3.11+ for AI features

### Client

```bash
cd client
npm install
npm run dev
```

### Server

```bash
cd server
npm install
npm run dev
```

Optional worker:

```bash
cd server
npm run worker:dev
```

### AI Core

```bash
cd server/AI_Core
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python api_service.py
```

## Validation commands

Client:

```bash
cd client
npm run build
```

Server:

```bash
cd server
npm run check
```

AI Core:

```bash
cd server/AI_Core
pytest tests/test_provider_env.py
```

## Documentation index

Core guides:

- [Setup](./docs/SETUP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [API](./docs/API.md)
- [Database](./docs/DATABASE.md)
- [Frontend](./docs/FRONTEND.md)
- [AI Core](./docs/AI_CORE.md)
- [Services](./docs/SERVICES.md)
- [Middleware](./docs/MIDDLEWARE.md)
- [Testing](./docs/TESTING.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Environment variables](./docs/ENV_VARIABLES.md)

Focused project guides:

- [Complete project onboarding](./docs/COMPLETE_PROJECT_ONBOARDING.md)
- [AI providers and failover](./docs/AI_PROVIDERS_AND_FAILOVER.md)
- [Dashboard, theming, and media](./docs/DASHBOARD_AND_THEME.md)

Project references:

- [Contributing](./docs/CONTRIBUTING.md)
- [Changelog](./docs/CHANGELOG.md)
- [Observability](./docs/OBSERVABILITY.md)
- [Security](./docs/SECURITY.md)
- [Plugin system](./docs/PLUGIN_SYSTEM.md)

## Recent implementation notes

- The dashboard is intentionally simplified around financial vitals and AI-generated insights.
- The UI theme is now standardized around a dark monochrome visual system.
- Blog and growth-story images use normalized media helpers and stronger fallback handling.
- The AI Core supports provider-level failover across Gemini, OpenRouter, Groq, Grok, Together, and Mistral when configured.

## License

This project is licensed under the MIT License unless noted otherwise in repository contents.
