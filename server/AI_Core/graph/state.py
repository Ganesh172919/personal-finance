"""
state.py - LangGraph State Definition and Domain Models
========================================================

This module defines the **shared state** that flows through the LangGraph
workflow and the **domain models** used by the specialist agents.

AgentState (TypedDict)
----------------------
``AgentState`` is the TypedDict that LangGraph uses as the state schema for
the ``StateGraph``.  Every node reads from and writes to this dictionary.
The state is the **single source of truth** for the entire workflow execution.

State fields are grouped into:
- **Input fields** -- populated before the workflow starts (user_input,
  user_profile, conversation_history, etc.)
- **Analysis outputs** -- populated by specialist agents as they complete
  (income_analysis, budget_plan, investment_advice, debt_optimization,
  financial_education)
- **Control fields** -- used by the graph machinery (next_agent, phase,
  retry_count, error)
- **Session fields** -- for checkpointing and resumption (session_id,
  subtasks, recovered_from_checkpoint)
- **Output fields** -- populated by the synthesis node (final_output,
  workflow_trace, fallback_used, llm_route)

Enums
-----
- ``WorkflowPhase`` -- labels for each phase of the workflow (routing,
  planning, research, execution, verification, synthesis, complete, error)
- ``SubtaskStatus`` -- lifecycle states for subtask tracking
- ``AnalysisType`` -- the six types of financial analysis

Pydantic Models
---------------
- ``FinancialGoal`` -- a single financial goal (name, target, timeline, priority)
- ``UserProfile`` -- the complete financial profile of a user
- ``FinancialPlan`` -- a structured financial plan with recommendations,
  action items, risk assessment, timeline, and metrics
"""

from enum import Enum
from typing import Any, Dict, List, Optional, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class AgentState(TypedDict):
    """State for the multi-agent financial system.

    This TypedDict is the **state schema** for the LangGraph ``StateGraph``.
    Every node in the graph receives a copy of this dict and returns a partial
    dict of updates that LangGraph merges back into the state.

    Field groups:
    - Input: user_input, user_profile, org_id, user_id, conversation_history,
      session_summary, options
    - Analysis outputs: income_analysis, budget_plan, investment_advice,
      debt_optimization, financial_education
    - Control: next_agent, phase, retry_count, max_retries, error
    - Session: session_id, subtasks, verification_results,
      recovered_from_checkpoint
    - Output: final_output, fallback_used, workflow_trace, llm_route
    """

    # --- Input fields (populated before workflow invocation) ---
    user_input: str                           # The user's free-text query
    user_profile: Dict[str, Any]              # Financial profile (age, income, debts, etc.)
    org_id: Optional[str]                     # Organisation ID (multi-tenant)
    user_id: Optional[str]                    # User ID (session/memory scoping)
    conversation_history: List[Dict[str, str]]  # Prior messages [{role, content}]
    session_summary: Optional[str]            # Compact summary of prior context
    options: Dict[str, Any]                   # Processing options (e.g. narrative mode)

    # --- Analysis outputs (populated by specialist agents) ---
    current_analysis: Dict[str, Any]          # Routing decision {"type": "..."}
    income_analysis: Optional[Dict[str, Any]] # Output from IncomeExpenseAnalyzerAgent
    budget_plan: Optional[Dict[str, Any]]     # Output from BudgetPlannerAgent
    investment_advice: Optional[Dict[str, Any]]  # Output from InvestmentAdvisorAgent
    debt_optimization: Optional[Dict[str, Any]]  # Output from DebtOptimizerAgent
    financial_education: Optional[Dict[str, Any]] # Output from FinancialEducatorAgent

    # --- Control fields (managed by the graph machinery) ---
    next_agent: str                           # Name of the next agent to run
    final_output: Optional[Any]               # The synthesised plan (markdown or dict)
    fallback_used: bool                       # True if LLM was unavailable
    workflow_trace: List[Dict[str, Any]]      # Timestamped trace of agent executions
    error: Optional[str]                      # Error message if workflow failed

    # --- Session fields (for checkpointing and resumption) ---
    session_id: Optional[str]                 # Unique session identifier
    subtasks: Optional[List[Dict[str, Any]]]  # Decomposed subtask list with statuses
    verification_results: Optional[Dict[str, Any]]  # QA check results
    retry_count: int                          # Current retry count for the active node
    max_retries: int                          # Maximum retries before giving up
    phase: Optional[str]                      # Current workflow phase label
    recovered_from_checkpoint: bool           # True if resumed from a checkpoint
    llm_route: Optional[Dict[str, Any]]       # LLM provider/model/key routing metadata


class WorkflowPhase(str, Enum):
    """Phases in the enhanced workflow.

    Each phase corresponds to a logical stage of the request lifecycle.
    The ``phase`` field in ``AgentState`` is set to one of these values
    after each node completes.
    """

    ROUTING = "routing"          # Master agent determining analysis type
    PLANNING = "planning"        # Subtask decomposition (future)
    RESEARCH = "research"        # Data gathering (future)
    EXECUTION = "execution"      # Specialist agents running
    VERIFICATION = "verification"  # QA checks on specialist outputs
    SYNTHESIS = "synthesis"      # Master agent combining into final plan
    COMPLETE = "complete"        # Workflow finished successfully
    ERROR = "error"              # Workflow failed


class SubtaskStatus(str, Enum):
    """Lifecycle status of a subtask.

    Subtasks are created during request decomposition and updated as
    specialist agents complete their work.
    """

    PENDING = "pending"          # Not yet started
    IN_PROGRESS = "in_progress"  # Currently being processed
    COMPLETED = "completed"      # Successfully finished
    FAILED = "failed"            # Encountered an error
    SKIPPED = "skipped"          # Intentionally skipped (e.g. no profile data)


class AnalysisType(str, Enum):
    """The six types of financial analysis the system can perform.

    Used by the master agent's routing logic to determine which specialist
    agent(s) should handle a request.
    """

    INCOME_EXPENSE = "income_expense"      # Cash flow analysis
    BUDGET_PLANNING = "budget_planning"    # Budget creation and optimisation
    INVESTMENT_ADVICE = "investment_advice"  # Portfolio and investment recommendations
    DEBT_OPTIMIZATION = "debt_optimization"  # Debt repayment strategy
    FINANCIAL_EDUCATION = "financial_education"  # General financial knowledge
    COMPREHENSIVE = "comprehensive"        # All of the above


class FinancialGoal(BaseModel):
    """A single financial goal (e.g. "Save 50,000 for emergency fund in 12 months").

    Attributes
    ----------
    name : str
        Human-readable goal name.
    target : float
        Target amount in the user's currency.
    timeline_months : int
        Number of months to achieve the goal.
    priority : int
        Priority level from 1 (lowest) to 5 (highest).
    """

    name: str
    target: float
    timeline_months: int
    priority: int = Field(ge=1, le=5)


class UserProfile(BaseModel):
    """Complete financial profile of a user.

    This is the primary data structure passed to every specialist agent.
    It contains all the information needed to generate personalised financial
    advice: income, expenses, savings, debts, goals, risk tolerance, and
    transaction history.

    Attributes
    ----------
    age : int
        User's age (affects investment horizon and risk recommendations).
    annual_income : float
        Gross annual income.
    monthly_expenses : float
        Average monthly expenses.
    savings : float
        Current total savings.
    debts : list[dict]
        List of debt entries (each with balance, interest_rate, minimum_payment).
    financial_goals : list[FinancialGoal]
        User's financial goals.
    risk_tolerance : str
        One of "conservative", "moderate", "aggressive".
    investment_experience : str
        One of "beginner", "intermediate", "advanced".
    time_horizon : int
        Investment time horizon in years.
    transactions : list[dict]
        Recent transaction history for cash flow analysis.
    currency : str, optional
        ISO 4217 currency code (e.g. "USD", "INR").
    locale : str, optional
        User's locale for formatting.
    timezone : str, optional
        User's timezone.
    """

    age: int
    annual_income: float
    monthly_expenses: float
    savings: float
    debts: List[Dict[str, Any]]
    financial_goals: List[FinancialGoal]
    risk_tolerance: str
    investment_experience: str
    time_horizon: int
    transactions: List[Dict[str, Any]] = []
    currency: Optional[str] = None
    locale: Optional[str] = None
    timezone: Optional[str] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "age": 30,
                "annual_income": 75000,
                "monthly_expenses": 3500,
                "savings": 15000,
                "debts": [
                    {"type": "student_loan", "balance": 25000, "interest_rate": 4.5},
                    {"type": "credit_card", "balance": 5000, "interest_rate": 18.9},
                ],
                "financial_goals": [
                    {"name": "emergency_fund", "target": 15000, "timeline_months": 12},
                    {"name": "down_payment", "target": 50000, "timeline_months": 36},
                ],
                "risk_tolerance": "moderate",
                "investment_experience": "beginner",
                "time_horizon": 10,
            }
        }
    )


class FinancialPlan(BaseModel):
    """Comprehensive financial plan produced by the synthesis node.

    This model represents the structured output of the multi-agent workflow.
    It is distinct from the ``Plan`` model in ``contracts.py`` (which is the
    HTTP response shape).  This model is used internally for validation and
    schema documentation.

    Attributes
    ----------
    summary : str
        High-level executive summary of the plan.
    recommendations : list[str]
        Bullet-point recommendations.
    action_items : list[dict]
        Concrete next steps with priority and timeline.
    risk_assessment : str
        Assessment of the user's financial risk profile.
    timeline : dict
        Short/medium/long-term timeline milestones.
    metrics : dict
        Key financial metrics (savings rate, debt-free date, etc.).
    """

    summary: str
    recommendations: List[str]
    action_items: List[Dict[str, Any]]
    risk_assessment: str
    timeline: Dict[str, Any]
    metrics: Dict[str, float]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "summary": "Comprehensive financial plan focusing on debt reduction and savings growth",
                "recommendations": [
                    "Build 3-month emergency fund",
                    "Pay down high-interest credit card debt",
                    "Start retirement investing with 70/30 stock/bond allocation",
                ],
                "action_items": [
                    {"action": "Set up automatic savings", "priority": "high", "timeline": "immediate"},
                    {"action": "Create debt repayment plan", "priority": "high", "timeline": "1 week"},
                ],
                "risk_assessment": "Moderate risk tolerance suitable for balanced portfolio",
                "timeline": {
                    "short_term": "3-6 months",
                    "medium_term": "1-3 years",
                    "long_term": "5+ years",
                },
                "metrics": {
                    "savings_rate": 20.0,
                    "debt_free_date": "2026-12-01",
                    "retirement_projection": 850000,
                },
            }
        }
    )


# ============================================================================
# END-OF-FILE SUMMARY -- graph/state.py
# ============================================================================
# Key takeaways:
#
# 1. ``AgentState`` is the **single source of truth** for the entire workflow.
#    Every node reads from and writes to this TypedDict.  LangGraph handles
#    the merging of partial updates back into the state.
#
# 2. The state is divided into **input**, **analysis output**, **control**,
#    **session**, and **output** field groups.  Understanding which group a
#    field belongs to helps reason about when it is populated and consumed.
#
# 3. The three enums (``WorkflowPhase``, ``SubtaskStatus``, ``AnalysisType``)
#    define the vocabulary for workflow control.  They are ``str`` subclasses
#    so they serialise naturally to JSON.
#
# 4. The Pydantic models (``FinancialGoal``, ``UserProfile``,
#    ``FinancialPlan``) provide type-safe validation and JSON schema
#    generation.  ``UserProfile`` is the most important -- it is the data
#    contract between the HTTP layer and the specialist agents.
#
# 5. ``model_config = ConfigDict(json_schema_extra={...})`` on the Pydantic
#    models provides example payloads for the OpenAPI documentation.
# ============================================================================
