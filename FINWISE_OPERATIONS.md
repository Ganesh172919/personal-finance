# FinWise chat, voice, and submission guide

FinWise combines a personal-finance ledger, a conversational assistant, and an Indic voice interface. The demo starts with a spoken expense, shows its effect on the saved budget, and records it after review. Finance Chat handles general questions, reads supported workspace records, and drafts PDF and UTF-8 text files.

## Run the local application

1. Use Node 24, Python 3.11, and a running MongoDB instance. Use an isolated database containing synthetic records for demos and provider tests.
2. Run `npm ci` in `server` and `client` if dependencies are missing. Create a Python 3.11 environment inside `server/AI_Core` and install `requirements.txt`. Use `requirements-dev.txt` for the Python test tools.
3. Copy the environment examples to the corresponding local `.env` files. Set the API database and JWT secret. Set the same `AI_CORE_INTERNAL_TOKEN` in Express and AI Core.
4. From the repository root, run `npm run dev`. The launcher starts AI Core at `127.0.0.1:8001`, the API at `127.0.0.1:3000`, and the Vite frontend at `127.0.0.1:5173`. It sets the gateway, proxy, and browser origins to match. It stops on a port conflict so the browser cannot silently connect to an older workspace.
5. Open `/chat`, `/voice`, or `/submission` at `http://127.0.0.1:5173`. Sign in to use the workspace and speech APIs. On a development API connected to synthetic MongoDB data, enable `DEMO_EVALUATOR_ENABLED=true` to show **Start a local demo workspace** at sign-in.

For independent services, activate the Python environment in `server/AI_Core` and run `python -m uvicorn api_service:app --host 127.0.0.1 --port 8001`. Run `npm run dev` in `server` with `PYTHON_API_URL` pointing to that origin. Set `CLIENT_URL` and `CORS_ORIGINS` to the exact frontend origin so the browser can obtain a WebSocket ticket. Run `npm run dev` in `client` with `VITE_API_PROXY_TARGET` pointing to the API.

AI Core exposes `GET /health` and `GET /openapi.json`. In the OpenAPI schema, both `ProcessOptions` and `ProcessResponse` should include `conversation_mode`. Restart AI Core after changing its code. Deploy the matching client, API, and AI Core revision together.

The local launcher checks Express at `/readyz`, which requires a MongoDB connection. Vite uses its `/api` proxy for HTTP and for the live-voice WebSocket. For a hosted deployment, configure HTTPS, the browser origin, WebSocket upgrades, persistent MongoDB, and separately managed secrets. Use a same-origin `/api` reverse proxy or set `VITE_API_BASE_URL` to the hosted API base when building the frontend. Keep AI Core private and authenticate the gateway with the shared internal token.

## Configure the models

| Provider | Configuration | Live verification |
| --- | --- | --- |
| Groq or another supported text provider | Set the provider key in `server/AI_Core/.env`. `GROQ_API_KEY` uses the existing provider pool. | Send an original question in Finance Chat and check its workflow trace for the model, provider, and number of calls. |
| Groq public web search | Configure a Groq key in the same pool. Public research uses browser search with `openai/gpt-oss-20b`. | Select **Search web** in Finance Chat, enter a public question, and open the source link in the reply. |
| Gnani Prisma and Timbre | Set `GNANI_API_KEY` in `server/.env`. The example lists the speech endpoints. Check the live model label on each result. If Timbre is unavailable, the receipt displays confirmation text and labels the fallback chime. | Run `npm run verify:gnani`. It sends a synthetic Hindi statement to Timbre and then transcribes the returned WAV through Prisma. |
| Gnani Evon v3.3 30B | Set `GNANI_REASONING_URL`, `GNANI_REASONING_API_KEY` if the endpoint requires it, and `GNANI_MODEL` in both service environments. Use the OpenAI-compatible base URL and the model ID served by the deployment. | Check Bharat Voice for endpoint configuration. Confirm live inference through the actual provider and model on a request trace. |

The test workspace uses Groq for conversation and public research, and Gnani for speech. Evon has provider contract coverage and requires a separate live deployment.

## Request paths

| Entry point | Request path | Behavior |
| --- | --- | --- |
| Finance Chat and completed Live Voice Chat turns | `POST /api/chat/sessions/:sessionId/messages` | The assistant uses recent conversation when relevant. Supported ledger, calculation, document, and planning requests have dedicated paths. |
| Local chat file download | `GET /api/chat/sessions/:sessionId/messages/:messageId/download` | Authenticates the owner and renders the saved draft directly for download. |
| Dashboard quick assistant and floating copilot | `POST /api/process-command` | Uses the same conversational routing. Explicit requests for a workspace plan can still return a financial plan. |
| Streaming command clients | `POST /api/ai/process/stream` | Proxies workflow events and persists an accepted completion. |
| Bharat Voice Q&A | `POST /api/v1/voice/query` | Uses saved ledger and budget data for supported questions, and AI Core for general questions. Timbre synthesizes the reply. |
| Voice expense review and save | `/api/v1/voice/transcribe`, `/api/v1/voice/expense-preview`, and `/api/v1/voice/log-expense` | Prisma produces a draft. The preview signs the reviewed expense. Saving records the ledger entry and returns confirmation audio. |
| Composer dictation and live speech relay | `/api/v1/voice/transcribe`, `/api/voice/live-ticket`, `/api/voice/live`, and `/api/v1/voice/synthesize` | Appends an editable transcript or relays speech through an authenticated WebSocket. Hands-free mode can send a completed turn and read the reply. |

Ordinary conversation takes one gateway request to AI Core and usually one model call. Failover can add attempts. Supported ledger totals and compound-interest calculations use zero model calls. Chat cache keys include workspace and thread state. Chat and dashboard cache keys changed with the routing contract. The API verifies that AI Core honored the conversational option before accepting a response, and the client preserves unsent drafts when it receives a retryable error.

Ordinary Finance Chat questions can cover general knowledge, coding, translation, writing, and financial education. If you attach a workspace file, the model can use its available text excerpts. For current facts or a public source, select **Search web** or begin the message with `Search the web for` or `/search`. Enter a self-contained public question. Only that question goes to the browsing model. Search skips the response cache, workspace files, finance context, and conversation history. The reply links to public pages the browsing tool opened. A missing source yields an explicit unverified result. A provider failure preserves the draft for retry.

## Generate files from Chat

**Local files** opens `/chat/local`. Ask for a PDF or a text file, preview the draft, and download it to your device. The draft stays in the signed-in chat history so you can download it again. The downloadable binary is rendered on demand and stays outside the Files catalog and GridFS.

**Cloud files** opens `/chat/cloud`. The older `/chat` URLs open this view as well. Created files are stored in the deployment's workspace database and can be opened, downloaded, or reused for questions in Files. Configure `MONGO_URI` for the database that should hold the workspace's documents. A local deployment can use local MongoDB. A hosted deployment can use managed MongoDB and GridFS. The test run used local MongoDB for both paths.

Switch views to choose the destination for the next file. Both views use the same authenticated chat history, provider settings, ledger tools, and live voice controls. Use **New session** when you want a separate thread. Local files mode controls where the file is delivered. Chat drafting still uses the configured AI Core provider. For on-machine inference, configure AI Core to use a locally served provider, such as a compatible Evon deployment.

- Ask `Create a PDF titled Water Cycle Field Notes. Write three short bullets explaining evaporation, condensation, and precipitation.` FinWise drafts the body once with the model.
- Ask `Create a text file titled Tea Note. Content: चाय के लिए ₹50 रखें।` FinWise uses the supplied text with zero model calls. TXT preserves Unicode.
- A request for saved goals or activity uses the available workspace snapshot. A bare `Create a PDF` asks what the file should contain.

Diagnosis uses `chat.document.prepared`, `chat.document.downloaded`, and `chat.document.failed`. The logs include request tracking, destination, timing, and source type. Cloud PDF indexing reads the rendered bytes in memory rather than downloading the same file again from the database.

Live Voice Chat uses Prisma for speech-in and Timbre for speech-out. Its completed utterances enter the same thread as typed messages. Bharat Voice Q&A handles individual questions and sends general questions through AI Core. Expense preview and save use a signed draft tied to the workspace and user so the ledger receives the details the user reviewed.

If Timbre returns a successful HTTP response with malformed WAV data, the server makes one retry within the original 15-second synthesis budget. Check `voice.timbre.invalid_audio` for the attempt and byte count. If usable audio stays unavailable, the interface labels the fallback chime and preserves the generated text.

## Verify the application

1. Open Finance Chat and send `hi`, an English public-topic question, and a Hindi question. Check that each addresses its prompt and shows the conversational assistant in the trace.
   Try `Translate the phrase “my budget” into French` and a request for a short Python function. Then enable **Search web** and ask for the date in the official IIIT Dharwad Seventh Convocation invitation. Check the PDF link in the answer.
2. Ask `How much did I spend this month?` and compare it with the ledger in the same reporting currency. The saved-record answer should show zero model calls.
3. Open the dashboard quick assistant and send a different question. Check the answer and the `ai.command.completed` event in the Express log.
4. Ask a question in Bharat Voice and replay the Timbre answer. Set a Food & Dining allocation of INR 835, start with no dining spending, and preview a ₹50 expense. The expected remainder is ₹785.
5. Use **Import audio for dictation** in the composer. Confirm the transcription becomes editable text before sending. In **Live voice chat**, enable **Hands-free conversation** and import a follow-up clip to verify automatic submission and spoken playback. Microphone capture depends on browser permission. Live Voice Chat is turn-based.
6. Switch between black and white themes. Open Dashboard, Transactions, Finance, Files, Settings, Bharat Voice, and the demo page. Generate a model-written PDF in Local files and verify its download. Generate a model-written TXT in Cloud files, open it from the chat card, and check its extracted contents in Files.

Run these checks from the repository root. Activate the AI Core virtual environment before the last command.

```text
npm run check
npm run build:client
npm run build --prefix server
npm run test --prefix client
npm run test:ci --prefix server -- src/test/chatV1.test.ts src/test/aiStreamProxy.test.ts src/test/aiCoreTransport.test.ts src/test/e2e src/test/services/gnaniVoiceService.test.ts
cd server/AI_Core
python -m pytest -q
```

The browser observations and limitations are recorded in [SUBMISSION_QA.md](SUBMISSION_QA.md).

## Diagnose a repeated reply

Open the workflow trace and compare the route with the question. A ledger or calculator reply can be correct with zero model calls. A greeting that shows a full financial plan indicates a routing problem. Try **Regenerate** against the current build. If new messages show a retryable error, check the compatibility schema, API and Core health, provider configuration, and provider limits.

Correlate Express and AI Core using the request ID. Look for `chat.turn.completed`, `chat.ai_context.built`, `public_web_research_completed`, `public_web_research_failed`, `ai.command.completed`, `voice.reasoning.completed`, `voice.query.completed`, `voice.expense.saved`, and `llm_call_success`. Check route, provider, model, duration, model-call count, source count, fallback, and cache-hit fields. Keep credentials, local logs, and real account records out of the public submission.

## Submit

Use [the timed text script](DEMO_PRESENTATION.txt), [the public post drafts](DEMO_AND_POST.md), and [the verification report](SUBMISSION_QA.md). Run `npm run verify:submission` and `npm run package:submission`. The ZIP goes to `dist/submission`.

Gnani lists November 15, 2026 at 6:00 p.m. IST as the deadline. Publish the working demo on LinkedIn or X before submitting. Tag Gnani AI and include `#GnaniAI` and `#GreatIndianAIInternshipChallenge`. Include the video, written project explanation, APIs shown, each participant’s contribution, and one nominated public post link per platform. [Official rules](https://www.gnani.ai/internship) · [Submission form](https://forms.cloud.microsoft/r/dfFShbp7W7)
