from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import uvicorn
import logging
import os
from datetime import datetime
from dotenv import load_dotenv
import sys
import io
from contextlib import asynccontextmanager
import pandas as pd  # For serializer
from uuid import uuid4

# Set UTF-8 encoding for Windows console to handle emojis
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Load environment variables
load_dotenv()

# Import your existing modules
from config import settings
from graph.workflow import create_financial_workflow
from graph.state import UserProfile, FinancialGoal
from contracts import Plan, ProcessResponse, WorkflowTraceEntry
from tools import PlanInputs, build_plan, render_plan_markdown
from utils import (
    setup_logging,
    get_rate_limiter_status,
    reset_rate_limiter,
    begin_request_metrics,
    get_llm_call_count,
)

# Setup logging
logger = setup_logging()

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

@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id

    started_at = datetime.utcnow()
    logger.info(f"[requestId={request_id}] {request.method} {request.url.path} started")

    response = await call_next(request)

    elapsed_ms = int((datetime.utcnow() - started_at).total_seconds() * 1000)
    response.headers["X-Request-Id"] = request_id
    logger.info(
        f"[requestId={request_id}] {request.method} {request.url.path} completed "
        f"status={response.status_code} durationMs={elapsed_ms}"
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

class ConversationMessage(BaseModel):
    role: str
    content: str

class ProcessOptions(BaseModel):
    narrative: bool = True

class ProcessRequest(BaseModel):
    user_input: str
    user_profile: Optional[UserProfileRequest] = None
    conversation_history: List[ConversationMessage] = Field(default_factory=list)
    session_summary: Optional[str] = None
    options: ProcessOptions = Field(default_factory=ProcessOptions)

class WhatIfScenarioRequest(BaseModel):
    user_profile: UserProfileRequest
    scenario_type: str  # 'expense', 'income', 'investment'
    amount: float
    description: Optional[str] = ""

@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "FinWise AI Core",
        "request_id": request.state.request_id
    }

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
    begin_request_metrics(request_id)

    try:
        logger.info(f"[requestId={request_id}] Processing request: {request.user_input[:100]}...")
        
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
                transactions=user_profile_dict.get('transactions', [])
            )
            profile_data_for_workflow = profile_instance.model_dump()
        else:
            profile_data_for_workflow = None

        conversation_history = [msg.model_dump() for msg in request.conversation_history] if request.conversation_history else []
        options = request.options.model_dump() if request.options else {"narrative": True}

        # Process through workflow
        result = workflow.process_request(
            request.user_input,
            profile_data_for_workflow,
            conversation_history=conversation_history,
            session_summary=request.session_summary,
            options=options,
        )
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

        if not str(response_text).strip():
            response_text = render_plan_markdown(plan)

        trace_simplified = _simplify_for_json(workflow_trace)
        trace_models: List[WorkflowTraceEntry] = []
        if isinstance(trace_simplified, list):
            for entry in trace_simplified:
                try:
                    trace_models.append(WorkflowTraceEntry.model_validate(entry))
                except Exception:
                    continue

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
        )
        
    except Exception as e:
        logger.error(
            f"[requestId={request_id}] Error processing request: {str(e)}",
            exc_info=True
        )
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
        )

@app.post("/api/agents/what-if-scenario")
async def process_what_if_scenario(request: WhatIfScenarioRequest, http_request: Request):
    """Process what-if financial scenarios"""
    try:
        request_id = http_request.state.request_id
        user_profile_dict = request.user_profile.model_dump()
        
        original_budget = user_profile_dict['annual_income'] / 12 - user_profile_dict['monthly_expenses']
        
        impact = {
            "originalBudget": original_budget,
            "newBudget": original_budget,
            "savingsImpact": 0,
            "goalDelay": 0,
            "adjustments": []
        }
        
        if request.scenario_type == "expense":
            impact["newBudget"] = original_budget - request.amount
            impact["savingsImpact"] = -request.amount
            impact["goalDelay"] = round(request.amount / (original_budget * 0.3)) if original_budget > 0 else 0
            
            if request.amount > 1000:
                impact["adjustments"] = [
                    {"category": "Entertainment", "reduction": request.amount * 0.3},
                    {"category": "Dining Out", "reduction": request.amount * 0.2},
                    {"category": "Shopping", "reduction": request.amount * 0.5}
                ]
        
        elif request.scenario_type == "income":
            impact["newBudget"] = original_budget + request.amount
            impact["savingsImpact"] = request.amount * 0.7
            impact["goalDelay"] = -round(request.amount / (original_budget * 0.3)) if original_budget > 0 else 0
        
        return {
            **impact,
            "request_id": request_id
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
