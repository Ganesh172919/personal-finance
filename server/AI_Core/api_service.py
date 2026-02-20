from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, Literal
import uvicorn
import logging
import os
import hashlib
from datetime import datetime
from dotenv import load_dotenv
import sys
from contextlib import asynccontextmanager
import pandas as pd  # For serializer
from uuid import uuid4
from time import perf_counter

from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

# Ensure UTF-8 output on Windows without breaking pytest capture.
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Load environment variables
load_dotenv()

# Import your existing modules
from config import settings
from graph.workflow import create_financial_workflow
from graph.state import UserProfile, FinancialGoal
from contracts import Plan, ProcessResponse, WorkflowTraceEntry, ToolCall
from tools import PlanInputs, build_plan, render_plan_markdown
from utils import (
    setup_logging,
    get_rate_limiter_status,
    reset_rate_limiter,
    begin_request_metrics,
    get_llm_call_count,
    get_llm_usage,
)
from utils.finwise_server import FinWiseServerHttpError, simulate_tool_call
from utils.prometheus_metrics import FALLBACK_TOTAL, LLM_CALLS_TOTAL, REQUEST_DURATION_MS
from vision.engine import get_vision_dependency_status, ocr_image_to_lines
from vision.errors import VisionDependencyError
from vision.receipt_parser import extract_receipt
from vision.handwriting_parser import extract_handwriting

# Setup logging
logger = setup_logging()

_memory_store = None
_extract_memories = None
try:
    from memory import MemoryStore, extract_memories as _extract_memories

    _memory_store = MemoryStore(db_path=settings.MEMORY_DB_PATH)
except Exception as _mem_exc:
    try:
        logger.warning("AI Core memory store disabled (%s)", str(_mem_exc)[:200])
    except Exception:
        pass
    _memory_store = None
    _extract_memories = None

def _tool_id(seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return digest[:12]


def _build_default_tool_calls(plan: Plan, user_profile: Dict[str, Any]) -> List[ToolCall]:
    """
    Build deterministic, low-risk tool calls to improve retention and execution.

    This is used as a fallback when the routed agent does not emit tool calls.
    All returned calls must be safe-by-default and require explicit user confirmation.
    """

    if not user_profile or not isinstance(user_profile, dict):
        return []

    plan_dict = plan.model_dump() if hasattr(plan, "model_dump") else {}
    key_metrics = plan_dict.get("key_metrics") if isinstance(plan_dict, dict) else {}

    monthly_net_cash_flow = None
    emergency_fund_months = None
    total_debt = None

    if isinstance(key_metrics, dict):
        monthly_net_cash_flow = key_metrics.get("monthly_net_cash_flow")
        emergency_fund_months = key_metrics.get("emergency_fund_months")
        total_debt = key_metrics.get("total_debt")

    tool_calls: List[ToolCall] = []

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

    return tool_calls[:5]

# Validate API key
try:
    settings.validate_api_key()
except ValueError as e:
    logger.warning(f"Startup warning: {str(e)}")
    logger.warning("Continuing in fallback-capable mode (deterministic outputs + no LLM narrative).")

# Lifespan for startup (fixes deprecation)
@asynccontextmanager
async def lifespan(app: FastAPI):
    global workflow
    logger.info("Initializing FinWise AI Core...")
    workflow = create_financial_workflow()
    logger.info("AI Core ready!")
    yield
    logger.info("Shutting down FinWise AI Core...")

app = FastAPI(title="FinWise AI Core", version="1.0.0", lifespan=lifespan)

# Add CORS middleware
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
    token = (os.getenv("AI_CORE_METRICS_TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=404, detail="Metrics disabled")

    header = (authorization or "").strip()
    if not header.startswith("Bearer ") or header[len("Bearer "):] != token:
        raise HTTPException(status_code=403, detail="Forbidden")

    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.middleware("http")
async def attach_request_id(request: Request, call_next):
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
    """Recursively simplify objects for JSON serialization (pandas-safe)"""
    if obj is None:
        return None
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    elif isinstance(obj, pd.Series):
        return _simplify_for_json(obj.to_dict())
    elif isinstance(obj, pd.DataFrame):
        return [_simplify_for_json(row.to_dict()) for _, row in obj.iterrows()]
    elif isinstance(obj, dict):
        # === ENHANCED: Str keys to avoid unhashable ===
        cleaned = {}
        for k, v in obj.items():
            str_k = str(k)
            cleaned[str_k] = _simplify_for_json(v)
        return cleaned
    elif isinstance(obj, (list, tuple)):
        return [_simplify_for_json(item) for item in obj]
    elif hasattr(obj, 'model_dump'):
        return _simplify_for_json(obj.model_dump())
    elif hasattr(obj, '__dict__'):
        return _simplify_for_json(obj.__dict__)
    else:
        return str(obj)

# Request/Response Models (unchanged)
class FinancialGoalRequest(BaseModel):
    name: str
    target: float
    timeline_months: int
    priority: int = 1

class DebtRequest(BaseModel):
    name: str
    balance: float
    interest_rate: float
    minimum_payment: float

class TransactionRequest(BaseModel):
    amount: float
    category: str
    description: str
    date: str
    type: Optional[str] = None

class UserProfileRequest(BaseModel):
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
    role: str
    content: str

class ProcessOptions(BaseModel):
    narrative: bool = False

class ProcessRequest(BaseModel):
    user_input: str
    user_profile: Optional[UserProfileRequest] = None
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    conversation_history: List[ConversationMessage] = Field(default_factory=list)
    session_summary: Optional[str] = None
    options: ProcessOptions = Field(default_factory=ProcessOptions)

class ScenarioAssumptions(BaseModel):
    months: int = Field(default=12, ge=1, le=120)
    expected_return_pct: Optional[float] = Field(default=None, ge=-100, le=100)
    inflation_pct: Optional[float] = Field(default=None, ge=-50, le=100)

class WhatIfScenarioRequest(BaseModel):
    user_profile: UserProfileRequest
    scenario_type: Literal["expense", "income", "investment"]
    amount: float = Field(gt=0)
    description: Optional[str] = ""
    assumptions: ScenarioAssumptions = Field(default_factory=ScenarioAssumptions)

@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint"""
    vision_status = get_vision_dependency_status()
    return {
        "status": "healthy",
        "service": "FinWise AI Core",
        "vision": vision_status,
        "request_id": request.state.request_id
    }


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

@app.get("/api/rate-limit/status")
async def rate_limit_status(request: Request):
    """Get current rate limiter status - useful for monitoring API usage"""
    try:
        status = get_rate_limiter_status()
        return {
            "success": True,
            "rate_limit_status": status,
            "message": "Rate limiter is active. Requests are automatically throttled.",
            "request_id": request.state.request_id
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
            "request_id": request.state.request_id
        }
    except Exception as e:
        logger.error(f"[requestId={request.state.request_id}] Error resetting rate limiter: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents/process", response_model=ProcessResponse)
async def process_financial_request(request: ProcessRequest, http_request: Request):
    """Main endpoint to process financial requests through multi-agent system"""
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
            for goal in user_profile_dict.get('financial_goals', []):
                goals.append(FinancialGoal(
                    name=goal['name'],
                    target=goal['target'],
                    timeline_months=goal['timeline_months'],
                    priority=goal.get('priority', 1)
                ))
            
            # Create UserProfile instance
            profile_instance = UserProfile(
                age=user_profile_dict['age'],
                annual_income=user_profile_dict['annual_income'],
                monthly_expenses=user_profile_dict['monthly_expenses'],
                savings=user_profile_dict['savings'],
                debts=user_profile_dict['debts'],
                financial_goals=goals,
                risk_tolerance=user_profile_dict['risk_tolerance'],
                investment_experience=user_profile_dict['investment_experience'],
                time_horizon=user_profile_dict['time_horizon'],
                transactions=user_profile_dict.get('transactions', []),
                currency=user_profile_dict.get('currency'),
                locale=user_profile_dict.get('locale'),
                timezone=user_profile_dict.get('timezone'),
            )
            profile_data_for_workflow = profile_instance.model_dump()
        else:
            profile_data_for_workflow = None

        conversation_history = [msg.model_dump() for msg in request.conversation_history] if request.conversation_history else []
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
                        f"- {m.key}: {m.value} (confidence {m.confidence:.2f}, source {m.source})"
                        for m in memories
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
            conversation_history=conversation_history,
            session_summary=session_summary,
            options=options,
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
                            "actionType": str(item.get("actionType", "review"))
                        }
                        insights.append(clean_insight)
        else:
            response_text = str(final_output)
            agent = "financial_educator"
            action_type = "start_learning"
            priority = "medium"
            insights = []
            fallback_used = bool(result.get("fallback_used"))
        
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
        
        # === FIX: Clean analysis_type (enum → str) ===
        analysis_raw = result.get("current_analysis", {}).get("type", "comprehensive")
        analysis_type = str(analysis_raw).split('.')[-1].lower() if hasattr(analysis_raw, 'name') else str(analysis_raw).lower()
        
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

        if (
            not tool_call_models
            and profile_data_for_workflow
            and isinstance(profile_data_for_workflow, dict)
        ):
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
        )
        
    except Exception as e:
        logger.error(
            f"[requestId={request_id}] Error processing request: {str(e)}",
            exc_info=True
        )
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
        )

@app.post("/api/agents/what-if-scenario")
async def process_what_if_scenario(request: WhatIfScenarioRequest, http_request: Request):
    """Process what-if financial scenarios"""
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
    """Get budget recommendations"""
    try:
        from agents.budget_planner import BudgetPlannerAgent
        agent = BudgetPlannerAgent()
        user_profile_dict = request.model_dump()
        budget_plan = agent.create_budget_plan(user_profile_dict)
        return {
            "success": True,
            "budget_plan": _simplify_for_json(budget_plan)
        }
    except Exception as e:
        logger.error(f"Error creating budget: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents/investment")
async def get_investment_advice(request: UserProfileRequest):
    """Get investment recommendations"""
    try:
        from agents.investment_advisor import InvestmentAdvisorAgent
        agent = InvestmentAdvisorAgent()
        user_profile_dict = request.model_dump()
        investment_advice = agent.provide_advice(user_profile_dict)
        return {
            "success": True,
            "investment_advice": _simplify_for_json(investment_advice)
        }
    except Exception as e:
        logger.error(f"Error generating investment advice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents/debt")
async def optimize_debt(request: UserProfileRequest):
    """Get debt optimization strategy"""
    try:
        from agents.debt_optimizer import DebtOptimizerAgent
        agent = DebtOptimizerAgent()
        user_profile_dict = request.model_dump()
        debts = user_profile_dict.get('debts', [])
        debt_plan = agent.optimize_repayment(debts, user_profile_dict)
        return {
            "success": True,
            "debt_plan": _simplify_for_json(debt_plan)
        }
    except Exception as e:
        logger.error(f"Error optimizing debt: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
