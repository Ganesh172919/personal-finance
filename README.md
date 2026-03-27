# Personal Finance

Personal Finance is a local-first full-stack finance workspace with a React client, an Express API, and a Python AI Core. This upgraded local build turns the repo into a chat-first finance assistant with multi-agent reasoning, file uploads, conversation insights, improved dashboard UX, and dual light/dark themes.

## What The App Does

- Tracks transactions, budgets, debts, goals, exports, journals, receipts, organization activity, and financial summaries.
- Runs a multi-agent finance assistant that routes prompts through specialist agents and returns a synthesized response with plans and workflow traces.
- Lets users upload files, analyze them with AI, attach them to chat, and keep them in a dedicated Files workspace.
- Surfaces conversation-level insights from recent chat history so the app can summarize themes, recommended actions, and next prompts.

## What Was Improved

- Added a true dual-theme system:
  - clean white light theme
  - pure black dark theme with no grid background
- Improved the dashboard to prioritize conversational workflows instead of burying chat behind analytics.
- Added a dedicated Files page for storing, opening, analyzing, and deleting uploaded files.
- Enabled chat file attachments so users can upload documents, spreadsheets, PDFs, images, code, and data files and ask AI about them.
- Added conversation insights generated from recent sessions.
- Fixed missing AI streaming route wiring on the server.
- Fixed session navigation in the chat history sidebar so switching chats updates the URL correctly.
- Extended the backend so uploaded files are persisted, text is extracted when possible, and AI analysis results are cached and stored.
- Updated the OpenAPI paths artifact so the documented API matches the mounted routes.

## Supported File Handling

The local app now supports storing any file type and extracting text when possible.

- Plain text, markdown, code, CSV, JSON, XML, YAML
- Excel-style spreadsheets with `xlsx`
- PDF files with `pdf-parse`
- DOCX files with `mammoth`
- Images through the AI Core OCR endpoint
- Other file types are still stored and can be attached in chat, even if deep extraction is unavailable

## Architecture

```text
personal-finance/
|- client/                 React + Vite frontend
|- server/                 Express + TypeScript API
|  |- AI_Core/             FastAPI + LangGraph AI service
|- packages/contracts/     Shared OpenAPI and typed contracts
|- docs/                   Project documentation
```

## Multi-Agent Flow

The local AI flow works end-to-end:

1. The client sends a chat or file-analysis request to the Express API.
2. The server loads auth, organization, financial context, and any attached files.
3. The Python AI Core chooses an available provider from the configured `.env` keys.
4. The master agent routes work to relevant specialists such as budgeting, debt, investing, education, and synthesis.
5. The final response comes back with narrative output, action items, workflow metadata, and agent trace details.

Configured local provider failover can use keys from `server/.env`, including OpenRouter and other providers already present in your environment.

## Local Setup

### 1. Install server dependencies

```bash
cd server
npm install
```

### 2. Install client dependencies

```bash
cd client
npm install
```

### 3. Install AI Core dependencies

```bash
cd server/AI_Core
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Configure environment

- Use `server/.env` for local API, auth, database, and model-provider keys.
- The AI Core reads model settings from `server/.env`, so existing OpenRouter and other provider keys can be reused locally.
- Optional upload sizing is controlled with `FILE_UPLOAD_MAX_BYTES` on the server.

### 5. Start the AI Core

```bash
cd server/AI_Core
.venv\Scripts\activate
python api_service.py
```

### 6. Start the server

```bash
cd server
npm run dev
```

### 7. Start the client

```bash
cd client
npm run dev
```

### 8. Open the app

- `http://localhost:5173`
- `http://127.0.0.1:5173`

## Example Usage

### Chat-first workflow

1. Open the dashboard and jump into the chat workspace.
2. Ask a finance question such as:

```text
I earn 90000 per month, spend 55000, and have two loans. Build me a 6 month debt payoff and savings plan.
```

3. Review the AI response, workflow trace, and action plan.
4. Check the conversation insights panel for repeated themes and suggested next steps.

### File-assisted workflow

1. Open the Files page.
2. Upload one or more files such as a PDF statement, CSV export, spreadsheet, screenshot, or notes document.
3. Run AI analysis from the file detail panel.
4. Attach uploaded files inside chat and ask for summaries, recommendations, or extraction help.

## Sample Output

Typical response metadata from the upgraded local AI flow:

```json
{
  "success": true,
  "provider": "openrouter",
  "agents_involved": [
    "master_agent",
    "income_expense_analyzer",
    "budget_planner",
    "debt_optimizer",
    "master_synthesis"
  ],
  "workflow_trace": [
    { "agent": "master_agent" },
    { "agent": "income_expense_analyzer" },
    { "agent": "budget_planner" },
    { "agent": "debt_optimizer" },
    { "agent": "master_synthesis" }
  ]
}
```

Typical conversation-insights result:

```text
Conversation pulse: You are focused on reducing monthly cash pressure while building a disciplined savings habit.
Repeated themes: debt payoff, budget tightening, emergency fund planning.
Recommended next moves: review subscriptions, set a weekly spending cap, upload recent statements for deeper analysis.
Suggested next prompt: Compare my last 3 months of expenses and identify categories I can cut first.
```

## Validation

These checks were run successfully on this local upgrade:

```bash
cd client
npm test
npm run build
```

```bash
cd server
npm run check
npm run test:ci
```

## Key Features

- Chat-first finance assistant
- Multi-agent analysis and synthesis
- Dedicated Files workspace
- AI analysis for uploaded files
- Conversation insights across chat history
- Receipt and OCR support
- Tasks, workflows, autopilot, analytics, exports, and collaboration features
- Dual white and pure-black themes for a better local portfolio presentation

## Notes

- This project is optimized for local use and demonstration, not production hardening.
- Some uploaded binary formats may be stored without deep text extraction, but they remain available in the Files workspace and chat attachments.

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
