# Personal Finance

Personal Finance is a local-first full-stack finance workspace with a React client, an Express API, and a Python AI Core. It combines budgeting, transactions, collaboration, automation, and a real multi-agent finance assistant that routes requests through specialist agents before returning a final plan.

## What The Project Does

- Tracks transactions, budgets, debts, goals, exports, journals, receipts, and financial summaries.
- Supports secure onboarding, email verification, Google OAuth, organizations, invites, comments, notifications, and activity feeds.
- Runs AI chat, financial analysis, scenario reasoning, receipt/OCR flows, workflow automation, and autopilot planning.
- Includes marketplace and plugin foundations for extensibility.

## What Was Improved In This Local Build

- Fixed AI Core environment loading so provider keys in `server/.env` are picked up correctly by the Python service.
- Verified the multi-agent flow executes end-to-end through master routing, specialist analysis, synthesis, and tool calls.
- Fixed local auth friction by treating `localhost` and `127.0.0.1` as equivalent development origins.
- Upgraded the onboarding and chat UX, including redesigned register and verify-email screens.
- Made local email verification faster by surfacing the OTP in non-production.
- Added regression coverage for the local origin alias handling.

## Architecture

```text
personal-finance/
|- client/                 React + Vite application
|- server/                 Express + TypeScript API
|  |- AI_Core/             FastAPI + LangGraph AI service
|- packages/contracts/     Shared OpenAPI and TypeScript contracts
|- docs/                   Architecture and implementation guides
|- research_survey/        Survey-style project summaries
|- research_references/    Paper-style and reference summaries
```

## Verified AI Flow

The AI pipeline is working locally:

1. The client sends a finance prompt through the Express API.
2. The server resolves auth, org context, validation, and profile shaping.
3. The Python AI Core selects an available provider chain from `server/.env`.
4. The master agent routes work to specialist agents such as:
   - `income_expense_analyzer`
   - `budget_planner`
   - `investment_advisor`
   - `debt_optimizer`
   - `financial_educator`
5. The workflow ends with synthesis and returns `workflow_trace`, `agents_involved`, and tool activity metadata.

Current local provider failover order, when keys are configured:

```text
gemini -> openrouter -> groq -> grok -> together
```

## Local Setup

### 1. Start the server

```bash
cd server
npm install
npm run dev
```

### 2. Start the client

```bash
cd client
npm install
npm run dev
```

### 3. Start the AI Core

```bash
cd server/AI_Core
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python api_service.py
```

### 4. Open the app

Use either of these local URLs:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

## Environment Notes

- `server/.env` is the main local configuration file for the Node server and AI provider keys.
- The AI Core now reads provider settings from `server/.env` first, then falls back to `server/AI_Core/.env`.
- If `LLM_PROVIDER` is blank, the AI Core automatically chooses the first configured provider.
- In local development, email verification still runs, but the OTP is also surfaced in the UI so onboarding does not depend on inbox access.

## Example Local Usage

1. Open the app and create an account.
2. Copy the six-digit OTP shown on the verify screen and finish onboarding.
3. Go to the chat workspace and ask a finance question such as:

```text
I earn 90000 per month, spend 55000, and have a 12% loan balance. What should I do over the next 6 months?
```

4. Review the AI answer, workflow status, and agent trace.
5. Create a workflow or autopilot plan from the dashboard and monitor the run history.

## Sample Output

Typical AI response metadata from a successful local run:

```json
{
  "success": true,
  "provider": "gemini",
  "agents_involved": [
    "master_agent",
    "income_expense_analyzer",
    "budget_planner",
    "investment_advisor",
    "debt_optimizer",
    "master_synthesis"
  ],
  "workflow_trace": [
    { "agent": "master_agent" },
    { "agent": "income_expense_analyzer" },
    { "agent": "budget_planner" },
    { "agent": "investment_advisor" },
    { "agent": "debt_optimizer" },
    { "agent": "master_synthesis" }
  ]
}
```

## Validation Commands

Client:

```bash
cd client
npm test
npm run build
```

Server:

```bash
cd server
npm run check
npm run test:ci
```

AI Core:

```bash
cd server/AI_Core
pytest tests/test_provider_env.py
```

## Key Local Features

- Financial dashboard and analytics
- Multi-agent AI chat and plan synthesis
- Workflow automation and scheduler support
- Autopilot planning and execution surfaces
- Organizations, invites, and collaboration flows
- Receipt and journal ingestion paths
- Plugin marketplace and permission sandbox
- Shared OpenAPI contracts and typed frontend access

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [AI Core](./docs/AI_CORE.md)
- [Workflows](./docs/WORKFLOWS.md)
- [Plugin System](./docs/PLUGIN_SYSTEM.md)
- [Security](./docs/SECURITY.md)
- [Setup](./docs/SETUP.md)
- [Environment Variables](./docs/ENV_VARIABLES.md)

## License

This project is licensed under the MIT License unless noted otherwise in the repository.
