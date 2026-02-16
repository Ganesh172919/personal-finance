from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple
import logging

from langgraph.graph import END, StateGraph

from .state import AgentState, AnalysisType

logger = logging.getLogger(__name__)


class FinancialWorkflow:
    """Orchestrates the multi-agent financial workflow."""

    def __init__(self):
        from agents.master_agent import MasterFinancialStrategistAgent
        from agents.income_expense_analyzer import IncomeExpenseAnalyzerAgent
        from agents.budget_planner import BudgetPlannerAgent
        from agents.investment_advisor import InvestmentAdvisorAgent
        from agents.debt_optimizer import DebtOptimizerAgent
        from agents.financial_educator import FinancialEducatorAgent

        self.master_agent = MasterFinancialStrategistAgent()
        self.income_analyzer = IncomeExpenseAnalyzerAgent()
        self.budget_planner = BudgetPlannerAgent()
        self.investment_advisor = InvestmentAdvisorAgent()
        self.debt_optimizer = DebtOptimizerAgent()
        self.financial_educator = FinancialEducatorAgent()
        self.workflow = self._build_workflow()

    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(AgentState)

        workflow.add_node("master_agent", self._master_agent_node)
        workflow.add_node("income_analyzer", self._income_analyzer_node)
        workflow.add_node("budget_planner", self._budget_planner_node)
        workflow.add_node("investment_advisor", self._investment_advisor_node)
        workflow.add_node("debt_optimizer", self._debt_optimizer_node)
        workflow.add_node("financial_educator", self._financial_educator_node)
        workflow.add_node("comprehensive_analysis", self._comprehensive_analysis_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_entry_point("master_agent")
        workflow.add_conditional_edges(
            "master_agent",
            self._route_based_on_analysis,
            {
                AnalysisType.INCOME_EXPENSE.value: "income_analyzer",
                AnalysisType.BUDGET_PLANNING.value: "budget_planner",
                AnalysisType.INVESTMENT_ADVICE.value: "investment_advisor",
                AnalysisType.DEBT_OPTIMIZATION.value: "debt_optimizer",
                AnalysisType.FINANCIAL_EDUCATION.value: "financial_educator",
                AnalysisType.COMPREHENSIVE.value: "comprehensive_analysis",
                "end": END,
            },
        )

        workflow.add_edge("income_analyzer", "synthesize")
        workflow.add_edge("budget_planner", "synthesize")
        workflow.add_edge("investment_advisor", "synthesize")
        workflow.add_edge("debt_optimizer", "synthesize")
        workflow.add_edge("comprehensive_analysis", "synthesize")
        workflow.add_edge("financial_educator", END)
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _utc_now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _build_trace_entry(
        self,
        agent_name: str,
        started_at: str,
        ended_at: str,
        status: str,
        error: Optional[str] = None,
    ) -> Dict[str, Any]:
        entry: Dict[str, Any] = {
            "agent": agent_name,
            "startedAt": started_at,
            "endedAt": ended_at,
            "status": status,
        }
        if error:
            entry["error"] = error
        return entry

    def _execute_with_trace(
        self,
        state: AgentState,
        agent_name: str,
        handler: Callable[[], Dict[str, Any]],
    ) -> Dict[str, Any]:
        trace = list(state.get("workflow_trace") or [])
        started_at = self._utc_now_iso()

        try:
            updates = handler() or {}
            ended_at = self._utc_now_iso()
            status = "error" if updates.get("error") else "success"
            trace.append(self._build_trace_entry(agent_name, started_at, ended_at, status, updates.get("error")))
            updates["workflow_trace"] = trace
            return updates
        except Exception as exc:
            ended_at = self._utc_now_iso()
            trace.append(self._build_trace_entry(agent_name, started_at, ended_at, "error", str(exc)))
            logger.exception("%s node failed", agent_name)
            raise

    def _route_based_on_analysis(self, state: AgentState) -> str:
        analysis_type = str(state.get("current_analysis", {}).get("type") or AnalysisType.COMPREHENSIVE.value).lower()
        if not state.get("user_profile") and analysis_type == AnalysisType.COMPREHENSIVE.value:
            return AnalysisType.FINANCIAL_EDUCATION.value
        return analysis_type

    def _run_master(self, state: AgentState) -> Dict[str, Any]:
        user_input = state.get("user_input", "")
        user_profile = state.get("user_profile")
        conversation_history = state.get("conversation_history") or []
        session_summary = state.get("session_summary")
        analysis_type = self.master_agent.determine_analysis_type(
            user_input,
            user_profile,
            conversation_history=conversation_history,
            session_summary=session_summary,
        )
        analysis_value = analysis_type.value if hasattr(analysis_type, "value") else str(analysis_type).lower()
        return {"current_analysis": {"type": analysis_value}, "next_agent": analysis_value}

    def _master_agent_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Master agent processing request")
        return self._execute_with_trace(state, "master_agent", lambda: self._run_master(state))

    def _run_income_analysis(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"income_analysis": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        transactions = user_profile.get("transactions", [])
        return {"income_analysis": self.income_analyzer.analyze_finances(transactions), "next_agent": "synthesize"}

    def _income_analyzer_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Income analyzer processing request")
        return self._execute_with_trace(
            state,
            "income_expense_analyzer",
            lambda: self._run_income_analysis(state.get("user_profile")),
        )

    def _run_budget_plan(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"budget_plan": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        return {"budget_plan": self.budget_planner.create_budget_plan(user_profile), "next_agent": "synthesize"}

    def _budget_planner_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Budget planner processing request")
        return self._execute_with_trace(
            state,
            "budget_planner",
            lambda: self._run_budget_plan(state.get("user_profile")),
        )

    def _run_investment_advice(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"investment_advice": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        return {"investment_advice": self.investment_advisor.provide_advice(user_profile), "next_agent": "synthesize"}

    def _investment_advisor_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Investment advisor processing request")
        return self._execute_with_trace(
            state,
            "investment_advisor",
            lambda: self._run_investment_advice(state.get("user_profile")),
        )

    def _run_debt_optimization(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"debt_optimization": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        debts = user_profile.get("debts", [])
        return {"debt_optimization": self.debt_optimizer.optimize_repayment(debts, user_profile), "next_agent": "synthesize"}

    def _debt_optimizer_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Debt optimizer processing request")
        return self._execute_with_trace(
            state,
            "debt_optimizer",
            lambda: self._run_debt_optimization(state.get("user_profile")),
        )

    def _run_financial_education(self, state: AgentState) -> Dict[str, Any]:
        user_input = state.get("user_input", "")
        user_profile = state.get("user_profile")
        result = self.financial_educator.explain_concept(user_input, user_profile)
        final_answer = result.get("error") or result.get("explanation", "")
        return {
            "financial_education": result,
            "final_output": final_answer,
            "fallback_used": bool(result.get("fallback_used")),
        }

    def _financial_educator_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Financial educator processing request")
        return self._execute_with_trace(state, "financial_educator", lambda: self._run_financial_education(state))

    def _run_with_subtrace(
        self,
        trace: list[Dict[str, Any]],
        agent_name: str,
        handler: Callable[[], Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], list[Dict[str, Any]]]:
        started_at = self._utc_now_iso()
        try:
            updates = handler() or {}
            ended_at = self._utc_now_iso()
            status = "error" if updates.get("error") else "success"
            trace.append(self._build_trace_entry(agent_name, started_at, ended_at, status, updates.get("error")))
            return updates, trace
        except Exception as exc:
            ended_at = self._utc_now_iso()
            trace.append(self._build_trace_entry(agent_name, started_at, ended_at, "error", str(exc)))
            raise

    def _comprehensive_analysis_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Comprehensive analysis: running all deterministic specialists")
        trace = list(state.get("workflow_trace") or [])
        comprehensive_started = self._utc_now_iso()

        user_profile = state.get("user_profile")
        income_updates, trace = self._run_with_subtrace(
            trace,
            "income_expense_analyzer",
            lambda: self._run_income_analysis(user_profile),
        )
        budget_updates, trace = self._run_with_subtrace(
            trace,
            "budget_planner",
            lambda: self._run_budget_plan(user_profile),
        )
        investment_updates, trace = self._run_with_subtrace(
            trace,
            "investment_advisor",
            lambda: self._run_investment_advice(user_profile),
        )
        debt_updates, trace = self._run_with_subtrace(
            trace,
            "debt_optimizer",
            lambda: self._run_debt_optimization(user_profile),
        )

        comprehensive_ended = self._utc_now_iso()
        trace.append(
            self._build_trace_entry(
                "comprehensive_analysis",
                comprehensive_started,
                comprehensive_ended,
                "success",
            )
        )

        return {
            "income_analysis": income_updates.get("income_analysis"),
            "budget_plan": budget_updates.get("budget_plan"),
            "investment_advice": investment_updates.get("investment_advice"),
            "debt_optimization": debt_updates.get("debt_optimization"),
            "workflow_trace": trace,
        }

    def _run_synthesis(self, state: AgentState) -> Dict[str, Any]:
        user_profile = state.get("user_profile")
        analyses = {
            "income_analysis": state.get("income_analysis"),
            "budget_plan": state.get("budget_plan"),
            "investment_advice": state.get("investment_advice"),
            "debt_optimization": state.get("debt_optimization"),
        }
        valid_analyses = {key: value for key, value in analyses.items() if value}
        context = {
            "conversation_history": state.get("conversation_history") or [],
            "session_summary": state.get("session_summary"),
            "options": state.get("options") or {},
        }
        final_plan = self.master_agent.synthesize_plan(user_profile, valid_analyses, context=context)
        return {
            "final_output": final_plan,
            "next_agent": "end",
            "fallback_used": bool(final_plan.get("fallback_used")) if isinstance(final_plan, dict) else False,
        }

    def _synthesize_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Synthesizing final financial plan")
        return self._execute_with_trace(state, "master_synthesis", lambda: self._run_synthesis(state))

    def process_request(
        self,
        user_input: str,
        user_profile: Optional[Dict[str, Any]],
        conversation_history: Optional[list[Dict[str, str]]] = None,
        session_summary: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        initial_state = AgentState(
            user_input=user_input,
            user_profile=user_profile,
            conversation_history=conversation_history or [],
            session_summary=session_summary,
            options=options or {"narrative": True},
            current_analysis={},
            income_analysis=None,
            budget_plan=None,
            investment_advice=None,
            debt_optimization=None,
            financial_education=None,
            next_agent="master_agent",
            final_output=None,
            fallback_used=False,
            workflow_trace=[],
            error=None,
        )

        try:
            return self.workflow.invoke(initial_state)
        except Exception as exc:
            logger.error("Workflow execution failed: %s", exc)
            return {
                "final_output": f"I encountered an error while processing your request: {exc}",
                "fallback_used": True,
                "workflow_trace": initial_state.get("workflow_trace", []),
                "error": str(exc),
            }


def create_financial_workflow() -> FinancialWorkflow:
    return FinancialWorkflow()
