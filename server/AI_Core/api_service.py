"""
api_service.py - FinWise AI Core HTTP Service Entry Point
=========================================================

This module is the FastAPI-based HTTP gateway for the FinWise AI Core.  It is
the single process that external callers (the Node/Express backend or a
browser via the backend proxy) talk to.  Every AI-powered feature -- financial
analysis, what-if scenarios, vision/OCR, session management, streaming
responses -- is exposed through the REST endpoints defined here.

Architecture overview
---------------------
1. **Lifespan** -- On startup the ``lifespan`` async context-manager creates a
   singleton ``FinancialWorkflow`` (the LangGraph multi-agent graph).  On
   shutdown it logs a goodbye message.

2. **Middleware** -- Two middleware layers are registered:
   - ``CORSMiddleware`` for cross-origin requests from the frontend.
   - A custom ``attach_request_id`` middleware that (a) assigns a UUID-based
     request-id to every request, (b) records Prometheus metrics for duration
     and LLM call counts, and (c) attaches structured log events.

3. **Endpoints** -- Grouped by concern:
   - ``/health``                      -- liveness probe
   - ``/metrics``                     -- Prometheus scrape endpoint (token-gated)
   - ``/api/providers``               -- list LLM providers
   - ``/api/ai/status``               -- comprehensive AI system diagnostics
   - ``/api/ai/sessions*``            -- session CRUD and resumption
   - ``/api/ai/models``               -- model catalog browsing
   - ``/api/vision/*``                -- receipt OCR, handwriting, generic OCR
   - ``/api/rate-limit/*``            -- rate-limiter introspection and reset
   - ``/api/agents/process``          -- main financial analysis pipeline
   - ``/api/agents/process/stream``   -- SSE streaming variant of the above
   - ``/api/agents/what-if-scenario`` -- deterministic scenario modelling
   - ``/api/agents/budget``           -- standalone budget agent
   - ``/api/agents/investment``       -- standalone investment agent
   - ``/api/agents/debt``             -- standalone debt agent

4. **Memory** -- An optional ``MemoryStore`` (SQLite-backed) enriches each
   request with user-specific memories (preferences, facts) and persists newly
   extracted memories after the workflow completes.

Key design decisions
--------------------
- The service degrades gracefully: if no LLM API key is configured, endpoints
  still respond using deterministic fallback logic.
- ``_simplify_for_json`` recursively converts pandas objects, Pydantic models,
  and arbitrary nested structures into plain JSON-safe dicts/lists/scalars.
- Tool-call validation against the FinWise server is optional and
  best-effort; connectivity failures silently disable validation rather than
  blocking the response.

File structure
--------------
- Windows UTF-8 workaround
- Memory store bootstrap
- Helper utilities (_tool_id, _simplify_for_json, etc.)
- Pydantic request/response models
- Endpoint definitions (grouped above)
- ``if __name__ == "__main__"`` runner
"""

import hashlib
import os
import sys
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

import pandas as pd  # Used by _simplify_for_json to handle Series/DataFrame objects
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

from config import settings
from contracts import Plan, ProcessResponse, ToolCall, WorkflowTraceEntry
from graph.state import FinancialGoal, UserProfile
from graph.workflow import create_financial_workflow
from tools import PlanInputs, build_plan, render_plan_markdown
from utils import (
    begin_request_metrics,
    get_llm_call_count,
    get_last_route_snapshot,
    get_llm_usage,
    get_rate_limiter_status,
    reset_rate_limiter,
    setup_logging,
)
from utils.finwise_server import FinWiseServerHttpError, simulate_tool_call
from utils.prometheus_metrics import FALLBACK_TOTAL, LLM_CALLS_TOTAL, REQUEST_DURATION_MS
from vision.engine import get_vision_dependency_status, ocr_image_to_lines
from vision.errors import VisionDependencyError
from vision.handwriting_parser import extract_handwriting
from vision.receipt_parser import extract_receipt

# --- Windows UTF-8 workaround ---
# On Windows the default console encoding is often cp1252, which cannot
# represent many Unicode characters the LLM may produce (e.g. currency
# symbols).  Reconfigure stdout/stderr to UTF-8 at import time.
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# --- Logging ---
logger = setup_logging()

# --- Memory store (optional) ---
# The memory store is a lightweight SQLite database that persists user-level
# facts and preferences extracted from past conversations.  It is enriched
# into the ``session_summary`` field so that downstream agents can personalise
# their responses.  If the dependency is missing or the DB cannot be opened,
# the entire memory subsystem is silently disabled.
_memory_store = None
_extract_memories = None
try:
    from memory import MemoryStore
    from memory import extract_memories as _extract_memories

    _memory_store = MemoryStore(db_path=settings.MEMORY_DB_PATH)
except Exception as _mem_exc:
    try:
        logger.warning("AI Core memory store disabled (%s)", str(_mem_exc)[:200])
    except Exception:
        pass
    _memory_store = None
    _extract_memories = None


def _tool_id(seed: str) -> str:
    """Generate a deterministic, short tool-call identifier from a human-readable seed.

    The SHA-256 digest is truncated to 12 hex characters so that every call
    with the same seed produces the same id, enabling idempotent tool
    execution on the client side.
    """
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return digest[:12]


def _build_default_tool_calls(plan: Plan, user_profile: Dict[str, Any]) -> List[ToolCall]:
    """
    Build deterministic, low-risk tool calls to improve retention and execution.

    This is used as a fallback when the routed agent does not emit tool calls
    (e.g. when the LLM is unavailable and a deterministic plan is generated).

    Each tool call is a **suggestion** that the client may present to the user.
    They all set ``requires_confirmation=True`` and ``risk="low"`` to ensure
    that no money-moving or destructive action happens without explicit consent.

    The calls are conditionally added based on the user's financial metrics:
    - Weekly money check-in       -- always added (consistency habit)
    - Emergency fund top-up       -- only when runway < 3 months
    - Debt payoff check-in        -- only when total debt > 0
    - Transaction review trigger  -- only when monthly cash flow is negative

    Returns at most 5 tool calls to avoid overwhelming the user.
    """

    # Guard: no profile means no personalised suggestions are possible.
    if not user_profile or not isinstance(user_profile, dict):
        return []

    # Extract key metrics from the structured Plan object.
    plan_dict = plan.model_dump() if hasattr(plan, "model_dump") else {}
    key_metrics = plan_dict.get("key_metrics") if isinstance(plan_dict, dict) else {}

    # Pull the three metrics that drive conditional tool-call generation.
    monthly_net_cash_flow = None
    emergency_fund_months = None
    total_debt = None

    if isinstance(key_metrics, dict):
        monthly_net_cash_flow = key_metrics.get("monthly_net_cash_flow")
        emergency_fund_months = key_metrics.get("emergency_fund_months")
        total_debt = key_metrics.get("total_debt")

    tool_calls: List[ToolCall] = []

    # --- Tool call 1: Weekly money check-in (always included) ---
    # Rationale: a short weekly review habit is universally beneficial and has
    # no negative financial side-effects.  The cron trigger fires every Monday
    # at 09:00 UTC.
    tool_calls.append(
        ToolCall(
            id=_tool_id("workflow:weekly-review:v1"),
            title="Enable weekly money check-in",
            description="Creates a weekly automation that adds a short review task so you stay on track.",
            tool="workflows.create",
            requires_confirmation=True,
            risk="low",
            args={
                "name": "Weekly money check-in",
                "enabled": True,
                "trigger": {"type": "cron", "cron": "0 9 * * 1"},
                "actions": [
                    {
                        "type": "create_task",
                        "bucket": 7,
                        "title": "Weekly money check-in",
                        "why": "A short weekly review improves follow-through and prevents drift.",
                        "steps": [
                            "Review your last 7 days of transactions and top spending categories",
                            "Check your cash flow vs. plan and adjust one category cap",
                            "Apply or dismiss one high-impact task",
                        ],
                        "priority": "medium",
                        "expected_impact": "Improves consistency and reduces overspending via a lightweight habit loop.",
                        "kind": "cashflow",
                        "due_days": 7,
                    }
                ],
            },
        )
    )

    # --- Tool call 2: Emergency fund top-up (conditional) ---
    # Only triggered when the user's emergency fund covers fewer than 3 months
    # of expenses -- a widely accepted minimum threshold for financial
    # resilience.
    try:
        fund_months = float(emergency_fund_months) if emergency_fund_months is not None else None
    except Exception:
        fund_months = None

    if fund_months is not None and fund_months < 3:
        tool_calls.append(
            ToolCall(
                id=_tool_id("workflow:emergency-fund-topup:v1"),
                title="Enable emergency fund top-up reminder",
                description="Creates a monthly automation that reminds you to build your emergency fund runway.",
                tool="workflows.create",
                requires_confirmation=True,
                risk="low",
                args={
                    "name": "Emergency fund top-up",
                    "enabled": True,
                    "trigger": {"type": "cron", "cron": "0 9 1 * *"},
                    "actions": [
                        {
                            "type": "create_task",
                            "bucket": 30,
                            "title": "Emergency fund top-up",
                            "why": "A stronger buffer reduces the chance of needing new debt for surprises.",
                            "steps": [
                                "Set a realistic monthly top-up amount",
                                "Automate a transfer to your emergency fund",
                                "Re-evaluate runway after any income/expense change",
                            ],
                            "priority": "high",
                            "expected_impact": "Improves resilience and reduces the need for expensive short-term debt.",
                            "kind": "goal",
                            "due_days": 30,
                        }
                    ],
                },
            )
        )

    # --- Tool call 3: Debt payoff check-in (conditional) ---
    # Only included when the user carries any outstanding debt.  A monthly
    # reminder to confirm minimums and direct surplus toward the highest-rate
    # debt accelerates payoff.
    try:
        debt_total = float(total_debt) if total_debt is not None else None
    except Exception:
        debt_total = None

    if debt_total is not None and debt_total > 0:
        tool_calls.append(
            ToolCall(
                id=_tool_id("workflow:debt-checkin:v1"),
                title="Enable monthly debt payoff check-in",
                description="Creates a monthly automation to keep your debt payoff plan on track.",
                tool="workflows.create",
                requires_confirmation=True,
                risk="low",
                args={
                    "name": "Debt payoff check-in",
                    "enabled": True,
                    "trigger": {"type": "cron", "cron": "0 9 1 * *"},
                    "actions": [
                        {
                            "type": "create_task",
                            "bucket": 30,
                            "title": "Debt payoff check-in",
                            "why": "Small monthly adjustments compound into faster payoff.",
                            "steps": [
                                "Confirm minimum payments are scheduled",
                                "Direct extra money to the highest-interest debt (avalanche) or smallest balance (snowball)",
                                "Update balances in Goals & Debts after payment",
                            ],
                            "priority": "high",
                            "expected_impact": "Reduces interest and accelerates payoff timeline.",
                            "kind": "debt",
                            "due_days": 30,
                        }
                    ],
                },
            )
        )

    # --- Tool call 4: Transaction review trigger (conditional) ---
    # When the user's monthly cash flow is negative (expenses > income),
    # an event-based automation reviews each new transaction to help
    # establish a rapid feedback loop and reduce impulse spending.
    try:
        net_flow = float(monthly_net_cash_flow) if monthly_net_cash_flow is not None else None
    except Exception:
        net_flow = None

    if net_flow is not None and net_flow < 0:
        tool_calls.append(
            ToolCall(
                id=_tool_id("workflow:transaction-created-review:v1"),
                title="Enable new-transaction review (event trigger)",
                description="Creates an automation that adds a short review task when you add a new transaction.",
                tool="workflows.create",
                requires_confirmation=True,
                risk="low",
                args={
                    "name": "New transaction review",
                    "enabled": True,
                    "trigger": {"type": "event", "event_type": "TransactionCreated"},
                    "actions": [
                        {
                            "type": "create_task",
                            "bucket": 7,
                            "title": "Review your latest transaction",
                            "why": "Frequent quick reviews help stabilize cash flow during recovery.",
                            "steps": [
                                "Confirm the category and amount are correct",
                                "If it was avoidable, set a cap for that category this week",
                            ],
                            "priority": "medium",
                            "expected_impact": "Creates a fast feedback loop to reduce overspending.",
                            "kind": "budget",
                            "due_days": 2,
                        }
                    ],
                },
            )
        )

    # Cap at 5 to avoid overwhelming the client with too many suggestions.
    return tool_calls[:5]


# --- API key validation (non-fatal) ---
# At least one LLM provider key must be configured for AI features to work.
# If none is present we log a warning and continue in fallback-capable mode
# where all endpoints still respond using deterministic heuristics.
try:
    settings.validate_api_key()
except ValueError as e:
    logger.warning(f"Startup warning: {str(e)}")
    logger.warning("Continuing in fallback-capable mode (deterministic outputs + no LLM narrative).")


# --- Application lifespan ---
# FastAPI's ``lifespan`` context-manager replaces the deprecated
# ``@app.on_event("startup")`` pattern.  The code before ``yield`` runs once
# at startup; the code after ``yield`` runs once at shutdown.
@asynccontextmanager
async def lifespan(app: FastAPI):
    global workflow
    logger.info("Initializing FinWise AI Core...")
    # Create the LangGraph multi-agent workflow (expensive: instantiates all
    # specialist agents and compiles the state graph).
    workflow = create_financial_workflow()
    logger.info("AI Core ready!")
    yield
    logger.info("Shutting down FinWise AI Core...")


# --- FastAPI application ---
app = FastAPI(title="FinWise AI Core", version="1.0.0", lifespan=lifespan)

# --- CORS middleware ---
# Origins are configurable via the ``AI_CORE_ALLOWED_ORIGINS`` env var
# (comma-separated).  Defaults to the local Next.js dev server.
allowed_origins = [
    origin.strip()
    for origin in os.getenv("AI_CORE_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/metrics")
async def metrics(authorization: Optional[str] = Header(default=None)):
    """Prometheus scrape endpoint.

    Protected by a simple Bearer token (``AI_CORE_METRICS_TOKEN``).  If the
    token is not configured, the endpoint returns 404 so that unauthenticated
    scanners cannot even confirm its existence.
    """
    token = (os.getenv("AI_CORE_METRICS_TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=404, detail="Metrics disabled")

    header = (authorization or "").strip()
    if not header.startswith("Bearer ") or header[len("Bearer ") :] != token:
        raise HTTPException(status_code=403, detail="Forbidden")

    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    """Request-id middleware with Prometheus metric recording.

    For every HTTP request this middleware:
    1. Reads or generates a ``x-request-id`` header and stores it on
       ``request.state`` so downstream code can reference it.
    2. Calls ``begin_request_metrics`` to initialise per-request LLM usage
       counters.
    3. Times the request and records duration into a Prometheus histogram.
    4. Increments the LLM calls counter (aggregated across the request).
    5. Emits structured ``request_started`` / ``request_completed`` log
       events for observability.
    """
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    begin_request_metrics(request_id)

    started_at = perf_counter()
    logger.info(
        "request_started",
        extra={"event": "request_started", "method": request.method, "path": request.url.path},
    )

    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = int((perf_counter() - started_at) * 1000)
        REQUEST_DURATION_MS.labels(request.method, request.url.path, "500").observe(elapsed_ms)
        LLM_CALLS_TOTAL.inc(get_llm_call_count())
        logger.exception(
            "request_failed",
            extra={
                "event": "request_failed",
                "method": request.method,
                "path": request.url.path,
                "status": 500,
                "duration_ms": elapsed_ms,
            },
        )
        raise

    elapsed_ms = int((perf_counter() - started_at) * 1000)
    response.headers["X-Request-Id"] = request_id
    REQUEST_DURATION_MS.labels(request.method, request.url.path, str(response.status_code)).observe(elapsed_ms)
    LLM_CALLS_TOTAL.inc(get_llm_call_count())

    logger.info(
        "request_completed",
        extra={
            "event": "request_completed",
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": elapsed_ms,
        },
    )

    return response


def _simplify_for_json(obj: Any) -> Any:
    """Recursively convert an arbitrary object tree into JSON-safe primitives.

    The multi-agent workflow can produce a mix of Pydantic models, pandas
    Series/DataFrames, and plain dicts.  FastAPI's JSON encoder does not
    know how to serialise pandas objects, so this helper walks the tree and
    converts:
    - ``pd.Series``  -> dict
    - ``pd.DataFrame`` -> list of dicts (one per row)
    - Pydantic ``BaseModel`` -> dict via ``model_dump()``
    - objects with ``__dict__`` -> their attribute dict
    - everything else -> ``str(obj)``

    All dict keys are cast to ``str`` to avoid unhashable-key errors during
    serialisation.
    """
    if obj is None:
        return None
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    elif isinstance(obj, pd.Series):
        return _simplify_for_json(obj.to_dict())
    elif isinstance(obj, pd.DataFrame):
        return [_simplify_for_json(row.to_dict()) for _, row in obj.iterrows()]
    elif isinstance(obj, dict):
        # Cast keys to str to avoid unhashable-key serialisation errors.
        cleaned = {}
        for k, v in obj.items():
            str_k = str(k)
            cleaned[str_k] = _simplify_for_json(v)
        return cleaned
    elif isinstance(obj, (list, tuple)):
        return [_simplify_for_json(item) for item in obj]
    elif hasattr(obj, "model_dump"):
        # Pydantic v2 models
        return _simplify_for_json(obj.model_dump())
    elif hasattr(obj, "__dict__"):
        # Arbitrary Python objects -- fall back to attribute dict
        return _simplify_for_json(obj.__dict__)
    else:
        return str(obj)


# ---------------------------------------------------------------------------
# Pydantic Request / Response Models
# ---------------------------------------------------------------------------
# These models define the contract between the Node/Express backend (or any
# HTTP caller) and the AI Core service.  FastAPI uses them for automatic
# request body validation, OpenAPI schema generation, and response encoding.
# ---------------------------------------------------------------------------


class FinancialGoalRequest(BaseModel):
    """A single financial goal submitted by the caller (e.g. "emergency fund")."""

    name: str
    target: float
    timeline_months: int
    priority: int = 1


class DebtRequest(BaseModel):
    """A single debt entry (credit card, loan, etc.)."""

    name: str
    balance: float
    interest_rate: float
    minimum_payment: float


class TransactionRequest(BaseModel):
    """A single financial transaction."""

    amount: float
    category: str
    description: str
    date: str
    type: Optional[str] = None


class UserProfileRequest(BaseModel):
    """Complete financial profile of the requesting user.

    Passed to every agent so they can tailor recommendations.  All fields
    have sensible defaults so callers can send partial profiles.
    """

    age: int
    annual_income: float
    monthly_expenses: float
    savings: float
    debts: List[DebtRequest] = []
    financial_goals: List[FinancialGoalRequest] = []
    risk_tolerance: str = "moderate"
    investment_experience: str = "beginner"
    time_horizon: int = 10
    transactions: List[TransactionRequest] = []
    currency: Optional[str] = None
    locale: Optional[str] = None
    timezone: Optional[str] = None


class ConversationMessage(BaseModel):
    """A single message in a multi-turn conversation."""

    role: str
    content: str


class ProcessOptions(BaseModel):
    """Options that tweak workflow behaviour.

    ``narrative`` -- When True, the master agent asks the LLM to rewrite the
    deterministic plan into friendlier prose.  When False, the raw markdown
    plan is returned (cheaper and deterministic).
    """

    narrative: bool = False


class ProcessRequest(BaseModel):
    """Payload for the main ``/api/agents/process`` endpoint.

    At minimum ``user_input`` is required.  All other fields are optional and
    enable richer analysis (profile), multi-turn context (history), and
    session resumption (session_id + resume_from_checkpoint).
    """

    user_input: str
    user_profile: Optional[UserProfileRequest] = None
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    resume_from_checkpoint: bool = False
    conversation_history: List[ConversationMessage] = Field(default_factory=list)
    session_summary: Optional[str] = None
    options: ProcessOptions = Field(default_factory=ProcessOptions)


class ScenarioAssumptions(BaseModel):
    """Macro assumptions for what-if scenario modelling.

    ``months``              -- projection horizon (1-120 months)
    ``expected_return_pct`` -- annualised return assumption for investment scenarios
    ``inflation_pct``       -- annualised inflation assumption
    """

    months: int = Field(default=12, ge=1, le=120)
    expected_return_pct: Optional[float] = Field(default=None, ge=-100, le=100)
    inflation_pct: Optional[float] = Field(default=None, ge=-50, le=100)


class WhatIfScenarioRequest(BaseModel):
    """Request body for ``/api/agents/what-if-scenario``.

    Three scenario types are supported:
    - ``expense``    -- "What if I spent an extra X per month?"
    - ``income``     -- "What if I earned an extra X per month?"
    - ``investment`` -- "What if I invested X per month at Y% return?"
    """

    user_profile: UserProfileRequest
    scenario_type: Literal["expense", "income", "investment"]
    amount: float = Field(gt=0)
    description: Optional[str] = ""
    assumptions: ScenarioAssumptions = Field(default_factory=ScenarioAssumptions)


@app.get("/health")
async def health_check(request: Request):
    """Liveness probe endpoint.

    Returns basic service identity plus the active LLM provider/model and
    vision dependency status.  Used by container orchestrators (Docker,
    Kubernetes) and load balancers to decide whether this instance is ready
    to receive traffic.
    """
    vision_status = get_vision_dependency_status()
    from utils.provider_registry import _resolve_provider_name, get_provider_config, resolve_provider_chain

    active_provider = _resolve_provider_name()
    provider_config = get_provider_config(active_provider)
    return {
        "status": "healthy",
        "service": "FinWise AI Core",
        "llm_provider": provider_config.display_name,
        "llm_model": provider_config.default_model,
        "provider_chain": resolve_provider_chain(active_provider),
        "vision": vision_status,
        "request_id": request.state.request_id,
    }


@app.get("/api/providers")
async def list_llm_providers(request: Request):
    """List all available LLM providers and their status."""
    from utils.provider_registry import list_providers as _list_providers

    providers = _list_providers()
    return {
        "providers": providers,
        "request_id": request.state.request_id,
    }


@app.get("/api/ai/status")
async def get_ai_status(request: Request):
    """Comprehensive AI system diagnostics endpoint.

    Aggregates information from every subsystem and returns it in a single
    JSON payload.  Useful for debugging production issues:
    - **Provider** -- which LLM provider/model is active and its fallback chain
    - **Key pools** -- per-provider API key health, rotation stats, circuit breaker state
    - **Model catalog** -- how many models are known, enabled, etc.
    - **Model health** -- success rates and latency per model
    - **Sessions** -- active session count, checkpoint stats
    - **Rate limiter** -- current token-bucket fill levels
    - **LLM usage** -- token counts and estimated cost for the current request
    - **Vision** -- whether OCR dependencies are installed
    - **Memory** -- whether the SQLite memory store is available
    """
    from utils.provider_registry import (
        _resolve_provider_name,
        get_provider_config,
        resolve_provider_chain,
    )
    from utils.key_pool import get_all_key_pools, get_key_pool
    from utils.model_catalog import get_catalog_stats
    from utils.model_health import get_model_health_tracker
    from utils.session_manager import get_session_manager

    request_id = getattr(request.state, "request_id", str(uuid4()))

    # 1. Provider information
    active_provider = _resolve_provider_name()
    provider_config = get_provider_config(active_provider)
    provider_chain = resolve_provider_chain(active_provider)

    # 2. Key pool health for all initialized providers
    key_pools_status = {}
    all_pools = get_all_key_pools()
    for provider_name, pool in all_pools.items():
        key_pools_status[provider_name] = pool.get_stats()

    # Ensure the active provider's pool is initialized and included
    if active_provider not in key_pools_status:
        try:
            pool = get_key_pool(active_provider)
            key_pools_status[active_provider] = pool.get_stats()
        except Exception:
            pass

    # 3. Model catalog summary (use built-in stats function)
    catalog_stats = get_catalog_stats()

    # 4. Session manager stats
    session_stats = {}
    try:
        manager = get_session_manager()
        session_stats = manager.get_stats()
    except Exception as e:
        session_stats = {"error": str(e)[:200]}

    # 5. Rate limiter status
    rate_limit_status = {}
    try:
        rate_limit_status = get_rate_limiter_status()
    except Exception as e:
        rate_limit_status = {"error": str(e)[:200]}

    # 6. LLM usage for current request context
    llm_usage = {}
    try:
        llm_usage = get_llm_usage()
    except Exception:
        pass

    # 7. Vision status
    vision_status = get_vision_dependency_status()

    # 8. Memory store status
    memory_status = {"enabled": _memory_store is not None}
    model_health = get_model_health_tracker().get_stats()
    last_route = get_last_route_snapshot()

    return {
        "status": "healthy",
        "service": "FinWise AI Core",
        "request_id": request_id,
        "provider": {
            "active": active_provider,
            "display_name": provider_config.display_name,
            "default_model": provider_config.default_model,
            "fallback_chain": provider_chain,
        },
        "key_pools": key_pools_status,
        "model_catalog": catalog_stats,
        "model_health": model_health,
        "sessions": session_stats,
        "rate_limiter": rate_limit_status,
        "llm_usage": llm_usage,
        "last_route": last_route,
        "vision": vision_status,
        "memory": memory_status,
    }


@app.get("/api/ai/sessions")
async def list_ai_sessions(
    request: Request,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 20,
):
    """
    List resumable AI sessions for a user.

    Query params:
    - org_id: Organization ID (required for filtered results)
    - user_id: User ID (required for filtered results)
    - limit: Max sessions to return (default 20)
    """
    from utils.session_manager import get_session_manager

    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        manager = get_session_manager()

        if org_id and user_id:
            sessions = manager.get_resumable_sessions(
                org_id=org_id.strip(),
                user_id=user_id.strip(),
                limit=min(limit, 50),
            )
            return {
                "success": True,
                "sessions": [s.to_dict() for s in sessions],
                "count": len(sessions),
                "request_id": request_id,
            }
        else:
            # Return overall stats if no user filter
            stats = manager.get_stats()
            return {
                "success": True,
                "stats": stats,
                "message": "Provide org_id and user_id to list specific sessions",
                "request_id": request_id,
            }

    except Exception as e:
        logger.error(f"[requestId={request_id}] Error listing sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/sessions/{session_id}")
async def get_ai_session(session_id: str, request: Request):
    """
    Get details of a specific AI session including checkpoints.
    """
    from utils.session_manager import get_session_manager

    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        manager = get_session_manager()
        session = manager.get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        checkpoints = manager.get_checkpoints(session_id, limit=20)

        return {
            "success": True,
            "session": session.to_dict(),
            "checkpoints": [c.to_dict() for c in checkpoints],
            "request_id": request_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[requestId={request_id}] Error getting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/sessions/{session_id}/resume")
async def resume_ai_session(session_id: str, request: Request):
    """
    Resume a paused or in-progress session.
    Returns the session state and latest checkpoint for the client to continue.
    """
    from utils.session_manager import get_session_manager, SessionStatus

    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        manager = get_session_manager()
        session = manager.get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if session.status in (SessionStatus.COMPLETED, SessionStatus.EXPIRED):
            raise HTTPException(
                status_code=400,
                detail=f"Session cannot be resumed (status: {session.status.value})",
            )

        # Get latest checkpoint
        latest_checkpoint = manager.get_latest_checkpoint(session_id)

        # Update session to in_progress
        session.status = SessionStatus.IN_PROGRESS
        manager.update_session(session)

        return {
            "success": True,
            "session": session.to_dict(),
            "checkpoint": latest_checkpoint.to_dict() if latest_checkpoint else None,
            "message": "Session resumed successfully",
            "request_id": request_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[requestId={request_id}] Error resuming session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/sessions/cleanup")
async def cleanup_expired_sessions(request: Request):
    """
    Clean up expired sessions. Admin endpoint.
    """
    from utils.session_manager import get_session_manager

    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        manager = get_session_manager()
        count = manager.cleanup_expired()

        return {
            "success": True,
            "cleaned_up": count,
            "message": f"Cleaned up {count} expired sessions",
            "request_id": request_id,
        }

    except Exception as e:
        logger.error(f"[requestId={request_id}] Error cleaning sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/models")
async def list_ai_models(
    request: Request,
    provider: Optional[str] = None,
    capability: Optional[str] = None,
):
    """
    List available AI models from the catalog.

    Query params:
    - provider: Filter by provider (e.g., "openai", "anthropic")
    - capability: Filter by capability (e.g., "reasoning", "code", "vision")
    """
    from utils.model_catalog import (
        get_all_models,
        get_models_by_provider,
        get_models_for_task,
        ModelCapability,
    )

    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        models = get_all_models()

        # Filter by provider
        if provider:
            models = get_models_by_provider(provider.strip().lower())

        # Filter by capability
        if capability:
            try:
                cap = ModelCapability(capability.strip().lower())
                cap_models = get_models_for_task(cap)
                # Intersect with provider filter if applied
                if provider:
                    cap_model_ids = {m.model_id for m in cap_models}
                    models = [m for m in models if m.model_id in cap_model_ids]
                else:
                    models = cap_models
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid capability: {capability}. Valid options: {[c.value for c in ModelCapability]}",
                )

        # Convert to serializable format using the model's to_dict method
        model_list = [m.to_dict() for m in models]

        return {
            "success": True,
            "models": model_list,
            "count": len(model_list),
            "request_id": request_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[requestId={request_id}] Error listing models: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def _normalize_vision_lang(lang: Optional[str]) -> tuple[str, List[str]]:
    warnings: List[str] = []
    requested = (lang or "").strip() or settings.VISION_LANG_DEFAULT
    allowed = set(settings.VISION_LANG_ALLOWED or [settings.VISION_LANG_DEFAULT])
    if requested not in allowed:
        warnings.append(f"Unsupported lang '{requested}', falling back to '{settings.VISION_LANG_DEFAULT}'.")
        return settings.VISION_LANG_DEFAULT, warnings
    return requested, warnings


async def _read_image_payload(request: Request) -> bytes:
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Missing image payload")
    if len(body) > settings.VISION_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image payload too large")
    return body


@app.post("/api/vision/receipts/parse")
async def parse_receipt_image(request: Request, lang: Optional[str] = None, currencyHint: str = "USD"):
    """OCR + receipt field extraction from an uploaded image."""
    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        image_bytes = await _read_image_payload(request)
        resolved_lang, warnings = _normalize_vision_lang(lang)

        lines = ocr_image_to_lines(image_bytes, lang=resolved_lang)
        parsed = extract_receipt(lines, currency_hint=(currencyHint or "USD"))

        return {
            "success": True,
            "extracted": parsed.get("extracted", {}),
            "confidence": parsed.get("confidence", {}),
            "warnings": warnings + (parsed.get("warnings", []) or []),
            "request_id": request_id,
        }
    except HTTPException:
        raise
    except VisionDependencyError as e:
        logger.warning(f"[requestId={request_id}] Receipt OCR dependencies unavailable: {str(e)}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"[requestId={request_id}] Receipt OCR failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/vision/handwriting/recognize")
async def recognize_handwriting_image(request: Request, lang: Optional[str] = None):
    """Handwriting recognition + intent extraction from an uploaded image."""
    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        image_bytes = await _read_image_payload(request)
        resolved_lang, warnings = _normalize_vision_lang(lang)

        lines = ocr_image_to_lines(image_bytes, lang=resolved_lang)
        parsed = extract_handwriting(lines)

        return {
            "success": True,
            "recognized_text": parsed.get("recognized_text", ""),
            "confidence": parsed.get("confidence", {}),
            "detected_values": parsed.get("detected_values", {}),
            "warnings": warnings + (parsed.get("warnings", []) or []),
            "request_id": request_id,
        }
    except HTTPException:
        raise
    except VisionDependencyError as e:
        logger.warning(f"[requestId={request_id}] Handwriting dependencies unavailable: {str(e)}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"[requestId={request_id}] Handwriting recognition failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/vision/ocr/extract")
async def extract_generic_image_text(request: Request, lang: Optional[str] = None):
    """Generic OCR endpoint for arbitrary image uploads."""
    request_id = getattr(request.state, "request_id", str(uuid4()))

    try:
        image_bytes = await _read_image_payload(request)
        resolved_lang, warnings = _normalize_vision_lang(lang)

        lines = ocr_image_to_lines(image_bytes, lang=resolved_lang)
        normalized_lines = [
            {
                "text": line.text,
                "confidence": float(line.confidence),
            }
            for line in lines
        ]
        recognized_text = "\n".join(line.text for line in lines if getattr(line, "text", "")).strip()

        if not recognized_text:
            warnings.append("No text detected.")

        return {
            "success": True,
            "recognized_text": recognized_text,
            "lines": normalized_lines,
            "warnings": warnings,
            "request_id": request_id,
        }
    except HTTPException:
        raise
    except VisionDependencyError as e:
        logger.warning(f"[requestId={request_id}] Generic OCR dependencies unavailable: {str(e)}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"[requestId={request_id}] Generic OCR failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rate-limit/status")
async def rate_limit_status(request: Request):
    """Get current rate limiter status - useful for monitoring API usage"""
    try:
        status = get_rate_limiter_status()
        return {
            "success": True,
            "rate_limit_status": status,
            "message": "Rate limiter is active. Requests are automatically throttled.",
            "request_id": request.state.request_id,
        }
    except Exception as e:
        logger.error(f"[requestId={request.state.request_id}] Error getting rate limit status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/rate-limit/reset")
async def rate_limit_reset(request: Request):
    """Reset the rate limiter (useful after quota reset or for testing)"""
    try:
        reset_rate_limiter()
        return {
            "success": True,
            "message": "Rate limiter has been reset. Token buckets refilled.",
            "request_id": request.state.request_id,
        }
    except Exception as e:
        logger.error(f"[requestId={request.state.request_id}] Error resetting rate limiter: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/process", response_model=ProcessResponse)
async def process_financial_request(request: ProcessRequest, http_request: Request):
    """Main endpoint to process financial requests through the multi-agent system.

    High-level flow:
    1. Parse and validate the request body (Pydantic).
    2. Build a ``UserProfile`` domain object from the request.
    3. Enrich ``session_summary`` with persisted memories (if memory store is
       available).
    4. Invoke ``workflow.process_request(...)`` -- this runs the LangGraph
       state graph through routing -> specialist analysis -> verification ->
       synthesis.
    5. Extract memories from the user input and persist them for future calls.
    6. Build a structured ``Plan`` (always present) and optional tool calls.
    7. Optionally validate tool calls against the FinWise server (RBAC +
       eligibility checks).
    8. Return a ``ProcessResponse`` with the plan, narrative, trace, and
       metadata.

    If anything throws, a safe fallback response is returned (never a 500
    for the caller to handle -- the error is logged server-side).
    """
    request_id = getattr(http_request.state, "request_id", str(uuid4()))

    try:
        logger.info(
            "[requestId=%s] Processing request (input_length=%s, has_profile=%s, history_items=%s, narrative=%s)",
            request_id,
            len(request.user_input or ""),
            bool(request.user_profile),
            len(request.conversation_history or []),
            bool(getattr(request.options, "narrative", False)),
        )

        user_profile_dict = request.user_profile.model_dump() if request.user_profile else None

        profile_instance = None
        if user_profile_dict:
            # Convert financial goals
            goals = []
            for goal in user_profile_dict.get("financial_goals", []):
                goals.append(
                    FinancialGoal(
                        name=goal["name"],
                        target=goal["target"],
                        timeline_months=goal["timeline_months"],
                        priority=goal.get("priority", 1),
                    )
                )

            # Create UserProfile instance
            profile_instance = UserProfile(
                age=user_profile_dict["age"],
                annual_income=user_profile_dict["annual_income"],
                monthly_expenses=user_profile_dict["monthly_expenses"],
                savings=user_profile_dict["savings"],
                debts=user_profile_dict["debts"],
                financial_goals=goals,
                risk_tolerance=user_profile_dict["risk_tolerance"],
                investment_experience=user_profile_dict["investment_experience"],
                time_horizon=user_profile_dict["time_horizon"],
                transactions=user_profile_dict.get("transactions", []),
                currency=user_profile_dict.get("currency"),
                locale=user_profile_dict.get("locale"),
                timezone=user_profile_dict.get("timezone"),
            )
            profile_data_for_workflow = profile_instance.model_dump()
        else:
            profile_data_for_workflow = None

        conversation_history = (
            [msg.model_dump() for msg in request.conversation_history] if request.conversation_history else []
        )
        options = request.options.model_dump() if request.options else {"narrative": False}

        org_id = (request.org_id or "").strip() if hasattr(request, "org_id") else ""
        user_id = (request.user_id or "").strip() if hasattr(request, "user_id") else ""

        session_summary = request.session_summary
        if _memory_store is not None and _extract_memories is not None and org_id and user_id:
            try:
                memories = _memory_store.search(
                    org_id=org_id,
                    user_id=user_id,
                    query=request.user_input,
                    limit=int(getattr(settings, "MEMORY_TOP_K", 8)),
                )
                if memories:
                    lines = [
                        f"- {m.key}: {m.value} (confidence {m.confidence:.2f}, source {m.source})" for m in memories
                    ]
                    memory_block = "User memory (preferences/facts):\n" + "\n".join(lines)
                    base = (session_summary or "").strip()
                    session_summary = (base + "\n\n" + memory_block).strip() if base else memory_block
            except Exception:
                pass

        # Process through workflow
        result = workflow.process_request(
            request.user_input,
            profile_data_for_workflow,
            org_id=org_id or None,
            user_id=user_id or None,
            conversation_history=conversation_history,
            session_summary=session_summary,
            options=options,
            session_id=(request.session_id or "").strip() or None,
            resume_from_checkpoint=bool(request.resume_from_checkpoint),
        )

        if _memory_store is not None and _extract_memories is not None and org_id and user_id:
            try:
                extracted = _extract_memories(request.user_input)
                _memory_store.upsert_many(org_id=org_id, user_id=user_id, records=extracted)
            except Exception:
                pass

        final_output = result.get("final_output", "")
        workflow_trace = result.get("workflow_trace", []) or []
        llm_call_count = get_llm_call_count()

        def normalize_priority(value: Any) -> str:
            value_str = str(value or "medium").lower().strip()
            return value_str if value_str in {"low", "medium", "high"} else "medium"

        plan_dict: Optional[Dict[str, Any]] = None

        if isinstance(final_output, dict):
            response_text = final_output.get("response", str(final_output))
            agent = final_output.get("agent", "master")
            action_type = final_output.get("actionType")
            priority = normalize_priority(final_output.get("priority", "medium"))
            fallback_used = bool(final_output.get("fallback_used")) or bool(result.get("fallback_used"))
            plan_dict = final_output.get("plan") if isinstance(final_output.get("plan"), dict) else None

            # Ensure insights is clean list of dicts
            raw_insights = final_output.get("insights", [])
            insights = []
            if isinstance(raw_insights, list):
                for item in raw_insights:
                    if isinstance(item, dict):
                        clean_insight = {
                            "agent": str(item.get("agent", "unknown")),
                            "title": str(item.get("title", "Insight")),
                            "description": str(item.get("description", "")),
                            "actionType": str(item.get("actionType", "review")),
                        }
                        insights.append(clean_insight)
            llm_route = final_output.get("llm_route") if isinstance(final_output.get("llm_route"), dict) else None
        else:
            response_text = str(final_output)
            agent = "financial_educator"
            action_type = "start_learning"
            priority = "medium"
            insights = []
            fallback_used = bool(result.get("fallback_used"))
            llm_route = result.get("llm_route") if isinstance(result.get("llm_route"), dict) else None

        # Determine agents involved
        agents_involved = []
        if result.get("income_analysis"):
            agents_involved.append("income_expense_analyzer")
        if result.get("budget_plan"):
            agents_involved.append("budget_planner")
        if result.get("investment_advice"):
            agents_involved.append("investment_advisor")
        if result.get("debt_optimization"):
            agents_involved.append("debt_optimizer")
        if result.get("financial_education"):
            agents_involved.append("financial_educator")

        if not agents_involved and agent:
            agents_involved = [agent]
        elif not agents_involved:
            agents_involved = ["master"]

        if workflow_trace:
            traced_agents = []
            for trace_entry in workflow_trace:
                trace_agent = trace_entry.get("agent")
                if trace_agent and trace_agent not in traced_agents:
                    traced_agents.append(trace_agent)
            if traced_agents:
                agents_involved = traced_agents

        # Simplify detailed analysis (enhanced for pandas)
        detailed_analysis = {}
        for key in ["income_analysis", "budget_plan", "investment_advice", "debt_optimization", "financial_education"]:
            if result.get(key):
                try:
                    simplified = _simplify_for_json(result[key])
                    detailed_analysis[key] = simplified
                except Exception as e:
                    logger.warning(f"[requestId={request_id}] Error simplifying {key}: {str(e)}")
                    detailed_analysis[key] = {"error": str(e)}

        if llm_route:
            detailed_analysis["llm_route"] = _simplify_for_json(llm_route)
        if result.get("session_memory"):
            detailed_analysis["session_memory"] = _simplify_for_json(result.get("session_memory"))

        # === FIX: Clean analysis_type (enum → str) ===
        analysis_raw = result.get("current_analysis", {}).get("type", "comprehensive")
        analysis_type = (
            str(analysis_raw).split(".")[-1].lower() if hasattr(analysis_raw, "name") else str(analysis_raw).lower()
        )

        # Build structured plan (always present)
        if plan_dict is not None:
            plan = Plan.model_validate(plan_dict)
        else:
            plan = build_plan(
                PlanInputs(
                    user_profile=profile_data_for_workflow,
                    income_analysis=detailed_analysis.get("income_analysis"),
                    budget_plan=detailed_analysis.get("budget_plan"),
                    investment_advice=detailed_analysis.get("investment_advice"),
                    debt_optimization=detailed_analysis.get("debt_optimization"),
                    financial_education=detailed_analysis.get("financial_education"),
                )
            )

        currency_code = "USD"
        if profile_data_for_workflow and isinstance(profile_data_for_workflow, dict):
            candidate = str(profile_data_for_workflow.get("currency") or "").strip().upper()
            if len(candidate) == 3 and candidate.isalpha():
                currency_code = candidate

        if not str(response_text).strip():
            response_text = render_plan_markdown(plan, currency_code=currency_code)

        trace_simplified = _simplify_for_json(workflow_trace)
        trace_models: List[WorkflowTraceEntry] = []
        if isinstance(trace_simplified, list):
            for entry in trace_simplified:
                try:
                    trace_models.append(WorkflowTraceEntry.model_validate(entry))
                except Exception:
                    continue

        tool_calls_simplified = _simplify_for_json(result.get("tool_calls") or [])
        tool_call_models: List[ToolCall] = []
        if isinstance(tool_calls_simplified, list):
            for entry in tool_calls_simplified:
                try:
                    tool_call_models.append(ToolCall.model_validate(entry))
                except Exception:
                    continue

        if not tool_call_models and profile_data_for_workflow and isinstance(profile_data_for_workflow, dict):
            try:
                tool_call_models = _build_default_tool_calls(plan, profile_data_for_workflow)
            except Exception:
                tool_call_models = []

        # Optional: validate tool calls via FinWise server internal tools endpoint.
        # This drops tool calls the user cannot apply (RBAC) and suppresses actions that are ineligible (e.g., plan-gated).
        tool_validation: Dict[str, Any] = {"enabled": False}
        can_validate_tools = (
            bool(tool_call_models)
            and bool(org_id)
            and bool(user_id)
            and bool(settings.FINWISE_SERVER_URL)
            and bool(settings.FINWISE_TOOLS_TOKEN)
        )

        if can_validate_tools:
            validated: List[ToolCall] = []
            dropped: List[Dict[str, Any]] = []
            previews: List[Dict[str, Any]] = []
            aborted = False

            for call in tool_call_models:
                try:
                    sim = simulate_tool_call(
                        org_id=org_id,
                        user_id=user_id,
                        tool_call=call.model_dump(),
                        request_id=request_id,
                    )
                    preview = sim.get("preview")

                    # Convention: eligible=false preview blocks the action from being surfaced.
                    if isinstance(preview, dict) and preview.get("eligible") is False:
                        dropped.append({"id": call.id, "tool": call.tool, "reason": "ineligible"})
                        continue

                    validated.append(call)
                    previews.append(
                        {
                            "tool_call_id": call.id,
                            "tool": call.tool,
                            "preview": preview if isinstance(preview, (dict, list, str, int, float, bool)) else None,
                        }
                    )
                except FinWiseServerHttpError as exc:
                    # If token is misconfigured, skip validation (do not drop actions).
                    if exc.status_code in (401, 403) and (exc.code in ("FORBIDDEN", "NOT_FOUND")):
                        tool_validation = {"enabled": False, "reason": exc.code or "FORBIDDEN"}
                        aborted = True
                        break

                    dropped.append(
                        {
                            "id": call.id,
                            "tool": call.tool,
                            "status_code": exc.status_code,
                            "code": exc.code,
                            "message": exc.message,
                        }
                    )
                except Exception as exc:
                    # Connectivity/timeouts: skip validation entirely (do not drop actions).
                    tool_validation = {"enabled": False, "reason": "UNAVAILABLE", "error": str(exc)[:200]}
                    aborted = True
                    break

            if not aborted:
                tool_call_models = validated
                tool_validation = {
                    "enabled": True,
                    "validated": len(validated),
                    "dropped": len(dropped),
                    "dropped_items": dropped[:10],
                    "previews": previews[:10],
                }

            try:
                detailed_analysis["tool_validation"] = tool_validation
            except Exception:
                pass

        if fallback_used:
            FALLBACK_TOTAL.labels(endpoint="process").inc()

        session_status = None
        if result.get("phase") == "complete":
            session_status = "completed"
        elif result.get("phase") == "error":
            session_status = "failed"
        elif result.get("session_id"):
            session_status = "in_progress"

        return ProcessResponse(
            success=True,
            final_output=str(response_text),
            agent=str(agent or "master"),
            actionType=str(action_type) if action_type is not None else None,
            priority=normalize_priority(priority),
            insights=insights,
            analysis_type=str(analysis_type or "comprehensive"),
            agents_involved=agents_involved,
            detailed_analysis=detailed_analysis,
            workflow_trace=trace_models,
            fallback_used=bool(fallback_used),
            llm_call_count=int(llm_call_count or 0),
            request_id=str(request_id),
            plan=plan,
            usage=get_llm_usage(),
            tool_calls=tool_call_models,
            session_id=result.get("session_id"),
            session_status=session_status,
            workflow_phase=result.get("phase"),
            active_provider=llm_route.get("active_provider") if llm_route else None,
            active_model=llm_route.get("active_model") if llm_route else None,
            active_key_id=llm_route.get("active_key_id") if llm_route else None,
            fallback_path=llm_route.get("fallback_path") if llm_route else [],
            recovered_failures=llm_route.get("recovered_failures") if llm_route else [],
            recovered_from_checkpoint=bool(result.get("recovered_from_checkpoint")),
        )

    except Exception as e:
        logger.error(f"[requestId={request_id}] Error processing request: {str(e)}", exc_info=True)
        FALLBACK_TOTAL.labels(endpoint="process").inc()
        fallback_text = (
            "AI processing is temporarily degraded. Here is a safe fallback: "
            "stabilize cash flow, protect emergency savings, prioritize high-interest debt, "
            "and keep investing consistently in diversified assets."
        )

        plan = Plan(
            executive_summary=fallback_text,
            data_warnings=[str(e)],
        )

        return ProcessResponse(
            success=True,
            final_output=fallback_text,
            agent="master",
            actionType="review",
            priority="medium",
            insights=[],
            analysis_type="comprehensive",
            agents_involved=["master"],
            detailed_analysis={"error": str(e)},
            workflow_trace=[],
            fallback_used=True,
            llm_call_count=int(get_llm_call_count() or 0),
            request_id=str(request_id),
            plan=plan,
            usage=get_llm_usage(),
            session_id=(request.session_id or "").strip() or None,
            session_status="failed",
            workflow_phase="error",
        )


@app.post("/api/agents/what-if-scenario")
async def process_what_if_scenario(request: WhatIfScenarioRequest, http_request: Request):
    """Process what-if financial scenarios (deterministic, no LLM call).

    This endpoint is fully deterministic -- it performs arithmetic projection
    based on the user's current financial snapshot and the requested scenario.
    Three scenario types are supported:

    - **expense**    -- models the impact of a new recurring monthly expense
    - **income**     -- models the impact of a new recurring monthly income
    - **investment** -- models the projected value of recurring monthly
      investments at a given expected return rate

    The response includes baseline vs. delta metrics (surplus change, emergency
    fund runway change, goal timeline impact) and actionable recommendations.
    """
    try:
        request_id = http_request.state.request_id
        user_profile_dict = request.user_profile.model_dump()

        monthly_income = float(user_profile_dict.get("annual_income", 0.0)) / 12.0
        monthly_expenses = float(user_profile_dict.get("monthly_expenses", 0.0))
        monthly_surplus = monthly_income - monthly_expenses
        savings = float(user_profile_dict.get("savings", 0.0))
        debts = user_profile_dict.get("debts", []) or []
        total_debt = sum(float(debt.get("balance", 0.0)) for debt in debts if isinstance(debt, dict))

        assumptions = request.assumptions.model_dump()
        months = int(assumptions.get("months", 12))
        expected_return_pct = assumptions.get("expected_return_pct")
        inflation_pct = assumptions.get("inflation_pct")

        if expected_return_pct is None:
            expected_return_pct = 10.0 if request.scenario_type == "investment" else 0.0
        if inflation_pct is None:
            inflation_pct = 6.0

        amount = float(request.amount)
        monthly_surplus_change = 0.0
        savings_change_horizon = 0.0
        projected_investment_value = None
        recommendations: List[str] = []
        adjustments: List[Dict[str, float]] = []

        if request.scenario_type == "expense":
            monthly_surplus_change = -amount
            savings_change_horizon = -amount * months
            recommendations = [
                "Reduce discretionary spend in the top 2-3 categories to offset the new expense.",
                "Preserve emergency-fund contributions before discretionary purchases.",
                "Revisit this scenario if the expense is one-time versus recurring.",
            ]
            if amount > 1000:
                adjustments = [
                    {"category": "Entertainment", "reduction": round(amount * 0.3, 2)},
                    {"category": "Dining Out", "reduction": round(amount * 0.2, 2)},
                    {"category": "Shopping", "reduction": round(amount * 0.5, 2)},
                ]

        elif request.scenario_type == "income":
            monthly_surplus_change = amount
            savings_change_horizon = amount * months
            recommendations = [
                "Automate at least 50-70% of the income increase toward goals and debt reduction.",
                "Keep lifestyle inflation controlled for the first 3 months.",
                "Rebalance debt-payoff and investing allocations after 1 quarter.",
            ]

        elif request.scenario_type == "investment":
            monthly_surplus_change = -amount
            savings_change_horizon = -amount * months
            monthly_rate = (float(expected_return_pct) / 100.0) / 12.0
            if abs(monthly_rate) < 1e-9:
                projected_investment_value = amount * months
            else:
                projected_investment_value = amount * (((1 + monthly_rate) ** months - 1) / monthly_rate)
            recommendations = [
                "Ensure emergency-fund runway remains adequate before increasing monthly investments.",
                "Increase allocation gradually if monthly surplus turns negative.",
                "Prefer diversified instruments for recurring long-term investing.",
            ]

        new_monthly_surplus = monthly_surplus + monthly_surplus_change
        emergency_before = savings / monthly_expenses if monthly_expenses > 0 else None
        savings_after_horizon = savings + savings_change_horizon
        emergency_after = savings_after_horizon / monthly_expenses if monthly_expenses > 0 else None

        planning_buffer = max(abs(monthly_surplus) * 0.3, 1.0)
        if request.scenario_type == "income":
            goal_timeline_delta_months = -max(0, int(round(amount / planning_buffer)))
        elif request.scenario_type == "investment":
            goal_timeline_delta_months = max(0, int(round(amount / planning_buffer))) if new_monthly_surplus < 0 else 0
        else:
            goal_timeline_delta_months = max(0, int(round(amount / planning_buffer)))

        return {
            "scenario_type": request.scenario_type,
            "amount": amount,
            "description": request.description or "",
            "baseline": {
                "monthly_income": monthly_income,
                "monthly_expenses": monthly_expenses,
                "monthly_surplus": monthly_surplus,
                "savings": savings,
                "total_debt": total_debt,
            },
            "delta": {
                "monthly_surplus_change": monthly_surplus_change,
                "new_monthly_surplus": new_monthly_surplus,
                "savings_change_horizon": savings_change_horizon,
                "projected_investment_value": projected_investment_value,
                "emergency_fund_months_before": emergency_before,
                "emergency_fund_months_after": emergency_after,
                "goal_timeline_delta_months": goal_timeline_delta_months,
            },
            "assumptions": {
                "months": months,
                "expected_return_pct": float(expected_return_pct),
                "inflation_pct": float(inflation_pct),
            },
            "recommendations": recommendations,
            "originalBudget": monthly_surplus,
            "newBudget": new_monthly_surplus,
            "savingsImpact": monthly_surplus_change,
            "goalDelay": goal_timeline_delta_months,
            "adjustments": adjustments,
            "request_id": request_id,
        }

    except Exception as e:
        logger.error(
            f"[requestId={getattr(http_request.state, 'request_id', 'unknown')}] Error processing scenario: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/budget")
async def get_budget_recommendations(request: UserProfileRequest):
    """Standalone budget recommendation endpoint.

    Runs only the ``BudgetPlannerAgent`` without the full workflow graph.
    Useful for lightweight calls where only a budget plan is needed.
    """
    try:
        from agents.budget_planner import BudgetPlannerAgent

        agent = BudgetPlannerAgent()
        user_profile_dict = request.model_dump()
        budget_plan = agent.create_budget_plan(user_profile_dict)
        return {"success": True, "budget_plan": _simplify_for_json(budget_plan)}
    except Exception as e:
        logger.error(f"Error creating budget: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/investment")
async def get_investment_advice(request: UserProfileRequest):
    """Standalone investment advice endpoint.

    Runs only the ``InvestmentAdvisorAgent`` without the full workflow graph.
    """
    try:
        from agents.investment_advisor import InvestmentAdvisorAgent

        agent = InvestmentAdvisorAgent()
        user_profile_dict = request.model_dump()
        investment_advice = agent.provide_advice(user_profile_dict)
        return {"success": True, "investment_advice": _simplify_for_json(investment_advice)}
    except Exception as e:
        logger.error(f"Error generating investment advice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/debt")
async def optimize_debt(request: UserProfileRequest):
    """Standalone debt optimization endpoint.

    Runs only the ``DebtOptimizerAgent`` without the full workflow graph.
    """
    try:
        from agents.debt_optimizer import DebtOptimizerAgent

        agent = DebtOptimizerAgent()
        user_profile_dict = request.model_dump()
        debts = user_profile_dict.get("debts", [])
        debt_plan = agent.optimize_repayment(debts, user_profile_dict)
        return {"success": True, "debt_plan": _simplify_for_json(debt_plan)}
    except Exception as e:
        logger.error(f"Error optimizing debt: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/process/stream")
async def process_financial_request_stream(request: ProcessRequest, http_request: Request):
    """SSE streaming variant of ``/api/agents/process``.

    Instead of waiting for the entire workflow to finish, this endpoint emits
    Server-Sent Events (SSE) so the frontend can show a live progress
    indicator.  The event lifecycle is::

        1. ``phase:routing``  -- request accepted, routing to agents
        2. ``phase:trace``    -- one event per agent start/finish
        3. ``phase:complete`` -- full result payload (same shape as ProcessResponse)
        4. ``[DONE]``         -- sentinel that closes the stream

    If something goes wrong a ``phase:error`` event is emitted followed by
    ``[DONE]``.

    The response uses ``StreamingResponse`` with ``text/event-stream`` media
    type and ``Cache-Control: no-cache`` to ensure proxies do not buffer
    events.
    """
    import json as _json
    from starlette.responses import StreamingResponse

    request_id = getattr(http_request.state, "request_id", str(uuid4()))

    async def event_generator():
        # 1️⃣ Routing phase
        yield f"data: {_json.dumps({'phase': 'routing', 'request_id': request_id})}\n\n"

        try:
            user_profile_dict = request.user_profile.model_dump() if request.user_profile else None

            profile_instance = None
            if user_profile_dict:
                goals = [
                    FinancialGoal(
                        name=g["name"],
                        target=g["target"],
                        timeline_months=g["timeline_months"],
                        priority=g.get("priority", 1),
                    )
                    for g in user_profile_dict.get("financial_goals", [])
                ]
                profile_instance = UserProfile(
                    age=user_profile_dict["age"],
                    annual_income=user_profile_dict["annual_income"],
                    monthly_expenses=user_profile_dict["monthly_expenses"],
                    savings=user_profile_dict["savings"],
                    debts=user_profile_dict["debts"],
                    financial_goals=goals,
                    risk_tolerance=user_profile_dict["risk_tolerance"],
                    investment_experience=user_profile_dict["investment_experience"],
                    time_horizon=user_profile_dict["time_horizon"],
                    transactions=user_profile_dict.get("transactions", []),
                    currency=user_profile_dict.get("currency"),
                    locale=user_profile_dict.get("locale"),
                    timezone=user_profile_dict.get("timezone"),
                )
                profile_data_for_workflow = profile_instance.model_dump()
            else:
                profile_data_for_workflow = None

            conversation_history = (
                [msg.model_dump() for msg in request.conversation_history] if request.conversation_history else []
            )
            options = request.options.model_dump() if request.options else {"narrative": False}
            org_id = (request.org_id or "").strip() if hasattr(request, "org_id") else ""
            user_id = (request.user_id or "").strip() if hasattr(request, "user_id") else ""
            session_summary = request.session_summary

            # Memory retrieval
            if _memory_store is not None and _extract_memories is not None and org_id and user_id:
                try:
                    memories = _memory_store.search(
                        org_id=org_id,
                        user_id=user_id,
                        query=request.user_input,
                        limit=int(getattr(settings, "MEMORY_TOP_K", 8)),
                    )
                    if memories:
                        lines = [
                            f"- {m.key}: {m.value} (confidence {m.confidence:.2f}, source {m.source})" for m in memories
                        ]
                        memory_block = "User memory (preferences/facts):\n" + "\n".join(lines)
                        base = (session_summary or "").strip()
                        session_summary = (base + "\n\n" + memory_block).strip() if base else memory_block
                except Exception:
                    pass

            # 2️⃣ Yield a trace event for workflow start
            yield f"data: {_json.dumps({'phase': 'trace', 'entry': {'agent': 'master', 'startedAt': nowIso(), 'status': 'running'}})}\n\n"

            # Process through workflow (the heavy computation)
            result = workflow.process_request(
                request.user_input,
                profile_data_for_workflow,
                org_id=org_id or None,
                user_id=user_id or None,
                conversation_history=conversation_history,
                session_summary=session_summary,
                options=options,
                session_id=(request.session_id or "").strip() or None,
                resume_from_checkpoint=bool(request.resume_from_checkpoint),
            )

            # 3️⃣ Emit trace events for each agent that participated
            workflow_trace = result.get("workflow_trace", []) or []
            for entry in workflow_trace:
                safe_entry = _simplify_for_json(entry)
                yield f"data: {_json.dumps({'phase': 'trace', 'entry': safe_entry})}\n\n"

            # Memory extraction (fire-and-forget)
            if _memory_store is not None and _extract_memories is not None and org_id and user_id:
                try:
                    extracted = _extract_memories(request.user_input)
                    _memory_store.upsert_many(org_id=org_id, user_id=user_id, records=extracted)
                except Exception:
                    pass

            # Build the same response as the non-streaming endpoint
            final_output = result.get("final_output", "")

            def normalize_priority(value):
                v = str(value or "medium").lower().strip()
                return v if v in {"low", "medium", "high"} else "medium"

            if isinstance(final_output, dict):
                response_text = final_output.get("response", str(final_output))
                agent = final_output.get("agent", "master")
                action_type = final_output.get("actionType")
                priority = normalize_priority(final_output.get("priority", "medium"))
                fallback_used = bool(final_output.get("fallback_used")) or bool(result.get("fallback_used"))
                plan_dict = final_output.get("plan") if isinstance(final_output.get("plan"), dict) else None
                llm_route = final_output.get("llm_route") if isinstance(final_output.get("llm_route"), dict) else None
                raw_insights = final_output.get("insights", [])
                insights = []
                if isinstance(raw_insights, list):
                    for item in raw_insights:
                        if isinstance(item, dict):
                            insights.append(
                                {
                                    "agent": str(item.get("agent", "unknown")),
                                    "title": str(item.get("title", "Insight")),
                                    "description": str(item.get("description", "")),
                                    "actionType": str(item.get("actionType", "review")),
                                }
                            )
            else:
                response_text = str(final_output)
                agent = "financial_educator"
                action_type = "start_learning"
                priority = "medium"
                insights = []
                fallback_used = bool(result.get("fallback_used"))
                llm_route = result.get("llm_route") if isinstance(result.get("llm_route"), dict) else None

            agents_involved = []
            for key, name in [
                ("income_analysis", "income_expense_analyzer"),
                ("budget_plan", "budget_planner"),
                ("investment_advice", "investment_advisor"),
                ("debt_optimization", "debt_optimizer"),
                ("financial_education", "financial_educator"),
            ]:
                if result.get(key):
                    agents_involved.append(name)
            if not agents_involved:
                agents_involved = [agent or "master"]

            if workflow_trace:
                traced = [e.get("agent") for e in workflow_trace if e.get("agent")]
                if traced:
                    agents_involved = list(dict.fromkeys(traced))

            analysis_raw = result.get("current_analysis", {}).get("type", "comprehensive")
            analysis_type = (
                str(analysis_raw).split(".")[-1].lower() if hasattr(analysis_raw, "name") else str(analysis_raw).lower()
            )

            if plan_dict is not None:
                plan = Plan.model_validate(plan_dict)
            else:
                plan = build_plan(
                    PlanInputs(
                        user_profile=profile_data_for_workflow,
                        income_analysis=_simplify_for_json(result.get("income_analysis")),
                        budget_plan=_simplify_for_json(result.get("budget_plan")),
                        investment_advice=_simplify_for_json(result.get("investment_advice")),
                        debt_optimization=_simplify_for_json(result.get("debt_optimization")),
                        financial_education=_simplify_for_json(result.get("financial_education")),
                    )
                )

            currency_code = "USD"
            if profile_data_for_workflow and isinstance(profile_data_for_workflow, dict):
                candidate = str(profile_data_for_workflow.get("currency") or "").strip().upper()
                if len(candidate) == 3 and candidate.isalpha():
                    currency_code = candidate

            if not str(response_text).strip():
                response_text = render_plan_markdown(plan, currency_code=currency_code)

            # 4️⃣ Complete event with full result
            complete_payload = {
                "phase": "complete",
                "result": _simplify_for_json(
                    {
                        "success": True,
                        "final_output": str(response_text),
                        "agent": str(agent or "master"),
                        "actionType": str(action_type) if action_type else None,
                        "priority": normalize_priority(priority),
                        "insights": insights,
                        "analysis_type": str(analysis_type or "comprehensive"),
                        "agents_involved": agents_involved,
                        "workflow_trace": _simplify_for_json(workflow_trace),
                        "fallback_used": bool(fallback_used),
                        "llm_call_count": int(get_llm_call_count() or 0),
                        "request_id": str(request_id),
                        "plan": _simplify_for_json(plan.model_dump()),
                        "usage": _simplify_for_json(get_llm_usage()),
                        "session_id": result.get("session_id"),
                        "session_status": "completed" if result.get("phase") == "complete" else "in_progress",
                        "workflow_phase": result.get("phase"),
                        "active_provider": llm_route.get("active_provider") if llm_route else None,
                        "active_model": llm_route.get("active_model") if llm_route else None,
                        "active_key_id": llm_route.get("active_key_id") if llm_route else None,
                        "fallback_path": llm_route.get("fallback_path") if llm_route else [],
                        "recovered_failures": llm_route.get("recovered_failures") if llm_route else [],
                        "recovered_from_checkpoint": bool(result.get("recovered_from_checkpoint")),
                    }
                ),
            }
            yield f"data: {_json.dumps(complete_payload)}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"[requestId={request_id}] Streaming error: {str(e)}", exc_info=True)
            FALLBACK_TOTAL.labels(endpoint="process_stream").inc()
            error_payload = {"phase": "error", "message": str(e)[:500], "request_id": request_id}
            yield f"data: {_json.dumps(error_payload)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Request-Id": request_id,
        },
    )


def nowIso() -> str:
    """Return current UTC time as ISO 8601 string."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


# --- Direct execution ---
# When run as ``python api_service.py``, start a Uvicorn server on port 8001.
# In production, the process is typically started via ``uvicorn api_service:app``.
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)


# ============================================================================
# END-OF-FILE SUMMARY -- api_service.py
# ============================================================================
# Key takeaways:
#
# 1. This is the **single HTTP entry point** for the entire AI Core subsystem.
#    Every AI feature (analysis, vision, sessions, streaming) is accessed
#    through the REST endpoints defined above.
#
# 2. The service is **resilient by design**: if no LLM key is configured or
#    the LLM fails, endpoints still return useful deterministic responses
#    (never a bare 500 to the caller).
#
# 3. The main ``/api/agents/process`` endpoint follows a pipeline:
#    request validation -> memory enrichment -> LangGraph workflow invocation
#    -> memory extraction -> plan building -> tool-call validation -> response.
#
# 4. ``_simplify_for_json`` is a critical utility that bridges the gap between
#    the rich Python objects produced by agents (Pydantic, pandas) and the
#    plain JSON that HTTP clients expect.
#
# 5. Tool calls are **suggestions only** -- they are always low-risk, require
#    explicit user confirmation, and are optionally validated against the
#    FinWise server for RBAC compliance.
#
# 6. Observability is baked in: every request gets a UUID, Prometheus metrics
#    are recorded, and structured log events are emitted throughout.
# ============================================================================
