# Personal Finance AI Core

FastAPI-based AI orchestration layer for FinWise. The AI Core now supports multi-provider routing, key pools, model failover, resumable long-running sessions, and deterministic financial fallbacks.

## Runtime

- Python: **3.11+**
- API server: FastAPI + Uvicorn
- Workflow engine: LangGraph-style orchestration with deterministic-first financial specialists
- Model registry: external JSON catalog at `data/model_catalog.json`

## Local Run

```bash
python -m venv .venv
. .venv/bin/activate  # On Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn api_service:app --host 0.0.0.0 --port 8001
```

## Configuration

The provider layer supports both single-key and pooled-key setups.

Examples:

```bash
GEMINI_API_KEY=...
OPENROUTER_API_KEY_1=...
OPENROUTER_API_KEY_2=...
GROQ_API_KEY=...
```

Or JSON-array format:

```bash
OPENROUTER_API_KEYS=["key-one","key-two"]
```

Notes:

- Keys are never exposed in logs or status payloads. Only redacted fingerprints are returned.
- Only providers with configured keys are enabled from the catalog.
- The catalog contains 100+ managed entries, but only configured entries are considered routable.

## Architecture

Core runtime pieces:

- `utils/provider_registry.py`: normalized provider configs and client adapters
- `utils/key_pool.py`: per-provider key rotation, cooldowns, and circuit breaking
- `utils/model_catalog.py`: capability-based external model catalog and ranking
- `utils/model_health.py`: per-model latency/error scoring and cooldown state
- `utils/llm_wrapper.py`: task-aware routing across models, keys, providers, then deterministic fallback
- `utils/session_manager.py`: resumable sessions, checkpoints, rolling summaries, and compact memory
- `graph/workflow.py`: richer multi-step orchestration with checkpoint persistence and resume support

## API Surfaces

Relevant operational endpoints:

- `/api/ai/status`: provider chain, last active route, key-pool stats, model health, session stats
- `/api/ai/models`: filtered catalog listing
- `/api/ai/sessions`: resumable session inventory
- `/api/agents/process`: synchronous processing with session continuity metadata
- `/api/agents/process/stream`: streaming processing with workflow/session status

The Node server proxies these under `/ai-core/...` for the web app.

## Reliability And Security

- Fails over across model, key, provider, and finally deterministic financial fallback
- Preserves request IDs, fallback paths, and recovered failure metadata for auditability
- Keeps action tools confirmable and server-side auditable
- Avoids logging secrets, raw API keys, or full sensitive token values
- Compacts memory into rolling summaries, user facts, decisions, unresolved goals, and artifact refs

## Quality Checks

```bash
ruff check tests
pytest -q
```

Useful focused suites:

```bash
pytest server/AI_Core/tests/test_key_pool.py -q
pytest server/AI_Core/tests/test_llm_wrapper.py -q
pytest server/AI_Core/tests/test_workflow_resume.py -q
```
