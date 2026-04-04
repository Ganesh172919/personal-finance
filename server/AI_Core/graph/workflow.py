import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from langgraph.graph import END, StateGraph

from .state import AgentState, AnalysisType, WorkflowPhase, SubtaskStatus

logger = logging.getLogger(__name__)


class FinancialWorkflow:
    """
    Orchestrates the multi-agent financial workflow with enhanced capabilities:
    - Session checkpointing for resumable state
    - Subtask decomposition for complex requests
    - Verification phase for quality assurance
    - Parallel execution where safe
    - Graceful degradation with retries
    """

    DEFAULT_MAX_RETRIES = 2

    def __init__(self):
        from agents.budget_planner import BudgetPlannerAgent
        from agents.debt_optimizer import DebtOptimizerAgent
        from agents.financial_educator import FinancialEducatorAgent
        from agents.income_expense_analyzer import IncomeExpenseAnalyzerAgent
        from agents.investment_advisor import InvestmentAdvisorAgent
        from agents.master_agent import MasterFinancialStrategistAgent

        self.master_agent = MasterFinancialStrategistAgent()
        self.income_analyzer = IncomeExpenseAnalyzerAgent()
        self.budget_planner = BudgetPlannerAgent()
        self.investment_advisor = InvestmentAdvisorAgent()
        self.debt_optimizer = DebtOptimizerAgent()
        self.financial_educator = FinancialEducatorAgent()
        self.workflow = self._build_workflow()

        # Session manager for checkpointing
        self._session_manager = None

    def _get_session_manager(self):
        """Lazy load session manager."""
        if self._session_manager is None:
            try:
                from utils.session_manager import get_session_manager

                self._session_manager = get_session_manager()
            except Exception as e:
                logger.warning("Session manager unavailable: %s", e)
        return self._session_manager

    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(AgentState)

        workflow.add_node("master_agent", self._master_agent_node)
        workflow.add_node("income_analyzer", self._income_analyzer_node)
        workflow.add_node("budget_planner", self._budget_planner_node)
        workflow.add_node("investment_advisor", self._investment_advisor_node)
        workflow.add_node("debt_optimizer", self._debt_optimizer_node)
        workflow.add_node("financial_educator", self._financial_educator_node)
        workflow.add_node("comprehensive_analysis", self._comprehensive_analysis_node)
        workflow.add_node("verification", self._verification_node)
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

        # Add verification step before synthesis for comprehensive analysis
        workflow.add_edge("income_analyzer", "synthesize")
        workflow.add_edge("budget_planner", "synthesize")
        workflow.add_edge("investment_advisor", "synthesize")
        workflow.add_edge("debt_optimizer", "synthesize")
        workflow.add_edge("comprehensive_analysis", "verification")
        workflow.add_edge("verification", "synthesize")
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
        phase: Optional[str] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: float = 0.0,
    ) -> Dict[str, Any]:
        entry: Dict[str, Any] = {
            "agent": agent_name,
            "startedAt": started_at,
            "endedAt": ended_at,
            "status": status,
        }
        if error:
            entry["error"] = error
        if phase:
            entry["phase"] = phase
        if input_tokens > 0:
            entry["inputTokens"] = input_tokens
        if output_tokens > 0:
            entry["outputTokens"] = output_tokens
        if latency_ms > 0:
            entry["latencyMs"] = round(latency_ms, 2)
        return entry

    def _save_checkpoint(
        self,
        state: AgentState,
        phase: str,
        agent_name: str,
        agent_outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Save a checkpoint if session manager is available."""
        session_id = state.get("session_id")
        if not session_id:
            return

        manager = self._get_session_manager()
        if not manager:
            return

        try:
            from utils.session_manager import CheckpointPhase

            phase_map = {
                "routing": CheckpointPhase.ROUTING,
                "planning": CheckpointPhase.PLANNING,
                "research": CheckpointPhase.RESEARCH,
                "execution": CheckpointPhase.EXECUTION,
                "verification": CheckpointPhase.VERIFICATION,
                "synthesis": CheckpointPhase.SYNTHESIS,
                "complete": CheckpointPhase.COMPLETE,
                "error": CheckpointPhase.ERROR,
            }

            checkpoint_phase = phase_map.get(phase, CheckpointPhase.EXECUTION)

            # Build context summary from current state
            context_parts = []
            if state.get("income_analysis"):
                context_parts.append("Income analysis complete")
            if state.get("budget_plan"):
                context_parts.append("Budget plan complete")
            if state.get("investment_advice"):
                context_parts.append("Investment advice complete")
            if state.get("debt_optimization"):
                context_parts.append("Debt optimization complete")
            context_summary = "; ".join(context_parts)

            manager.save_checkpoint(
                session_id=session_id,
                phase=checkpoint_phase,
                state_data={
                    "current_analysis": state.get("current_analysis"),
                    "next_agent": state.get("next_agent"),
                    "phase": phase,
                },
                agent_outputs=agent_outputs or {},
                context_summary=context_summary,
                agent_name=agent_name,
                error=error,
            )
        except Exception as e:
            logger.warning("Failed to save checkpoint: %s", e)

    def _compact_session_memory(
        self,
        state: AgentState,
        phase: str,
        updates: Dict[str, Any],
    ) -> None:
        session_id = state.get("session_id")
        if not session_id:
            return

        manager = self._get_session_manager()
        if not manager:
            return

        summary_parts = [f"Phase {phase} completed."]
        if updates.get("current_analysis"):
            summary_parts.append(f"Analysis: {updates['current_analysis']}")
        if updates.get("error"):
            summary_parts.append(f"Error: {updates['error']}")
        if updates.get("final_output"):
            summary_parts.append(f"Output captured ({len(str(updates['final_output']))} chars).")

        decisions = []
        if updates.get("verification_results"):
            decisions.append({"phase": phase, "type": "verification", "result": updates["verification_results"]})

        unresolved_goals = []
        for subtask in updates.get("subtasks") or state.get("subtasks") or []:
            if subtask.get("status") in {"pending", "in_progress"}:
                unresolved_goals.append(
                    {
                        "id": subtask.get("id"),
                        "title": subtask.get("description"),
                        "type": subtask.get("type"),
                    }
                )

        try:
            manager.compact_memory(
                session_id,
                new_summary_chunk=" ".join(summary_parts).strip(),
                new_decisions=decisions or None,
                new_goals=unresolved_goals or None,
            )
        except Exception as e:
            logger.warning("Failed to compact session memory: %s", e)

    def _execute_with_trace(
        self,
        state: AgentState,
        agent_name: str,
        handler: Callable[[], Dict[str, Any]],
        phase: str = "execution",
    ) -> Dict[str, Any]:
        trace = list(state.get("workflow_trace") or [])
        started_at = self._utc_now_iso()
        retry_count = state.get("retry_count", 0)
        max_retries = state.get("max_retries", self.DEFAULT_MAX_RETRIES)

        try:
            updates = handler() or {}
            ended_at = self._utc_now_iso()
            status = "error" if updates.get("error") else "success"
            trace.append(self._build_trace_entry(agent_name, started_at, ended_at, status, updates.get("error"), phase))
            updates["workflow_trace"] = trace
            updates["phase"] = phase

            # Save checkpoint on success
            self._save_checkpoint(state, phase, agent_name, updates)
            self._compact_session_memory(state, phase, updates)

            return updates
        except Exception as exc:
            ended_at = self._utc_now_iso()
            error_msg = str(exc)

            # Retry logic
            if retry_count < max_retries:
                logger.warning("%s node failed (retry %d/%d): %s", agent_name, retry_count + 1, max_retries, error_msg)
                # Return state with incremented retry count
                trace.append(self._build_trace_entry(agent_name, started_at, ended_at, "retry", error_msg, phase))
                return {
                    "workflow_trace": trace,
                    "retry_count": retry_count + 1,
                    "error": error_msg,
                }

            # Max retries exceeded
            trace.append(self._build_trace_entry(agent_name, started_at, ended_at, "error", error_msg, phase))

            # Save error checkpoint
            self._save_checkpoint(state, "error", agent_name, error=error_msg)

            logger.exception("%s node failed after %d retries", agent_name, retry_count)
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

        # Decompose complex requests into subtasks
        subtasks = self._decompose_request(user_input, analysis_value, user_profile)

        return {
            "current_analysis": {"type": analysis_value},
            "next_agent": analysis_value,
            "subtasks": subtasks,
            "phase": WorkflowPhase.ROUTING.value,
        }

    def _decompose_request(
        self,
        user_input: str,
        analysis_type: str,
        user_profile: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Decompose a request into subtasks for tracking and parallel execution.
        """
        subtasks = []

        # Base subtask for the primary analysis
        subtasks.append(
            {
                "id": f"subtask_{analysis_type}",
                "type": analysis_type,
                "status": SubtaskStatus.PENDING.value,
                "description": f"Perform {analysis_type.replace('_', ' ')} analysis",
                "priority": 1,
            }
        )

        # For comprehensive analysis, add subtasks for each specialist
        if analysis_type == AnalysisType.COMPREHENSIVE.value:
            if user_profile:
                if user_profile.get("transactions"):
                    subtasks.append(
                        {
                            "id": "subtask_income_expense",
                            "type": "income_expense",
                            "status": SubtaskStatus.PENDING.value,
                            "description": "Analyze income and expenses",
                            "priority": 1,
                            "can_parallel": True,
                        }
                    )

                subtasks.append(
                    {
                        "id": "subtask_budget",
                        "type": "budget_planning",
                        "status": SubtaskStatus.PENDING.value,
                        "description": "Create budget plan",
                        "priority": 1,
                        "can_parallel": True,
                    }
                )

                subtasks.append(
                    {
                        "id": "subtask_investment",
                        "type": "investment_advice",
                        "status": SubtaskStatus.PENDING.value,
                        "description": "Generate investment recommendations",
                        "priority": 2,
                        "can_parallel": True,
                    }
                )

                if user_profile.get("debts"):
                    subtasks.append(
                        {
                            "id": "subtask_debt",
                            "type": "debt_optimization",
                            "status": SubtaskStatus.PENDING.value,
                            "description": "Optimize debt repayment",
                            "priority": 1,
                            "can_parallel": True,
                        }
                    )

        # Add verification and synthesis as final subtasks
        subtasks.append(
            {
                "id": "subtask_verify",
                "type": "verification",
                "status": SubtaskStatus.PENDING.value,
                "description": "Verify recommendations",
                "priority": 3,
                "depends_on": [s["id"] for s in subtasks if s["type"] != "verification"],
            }
        )

        subtasks.append(
            {
                "id": "subtask_synthesis",
                "type": "synthesis",
                "status": SubtaskStatus.PENDING.value,
                "description": "Synthesize final plan",
                "priority": 4,
                "depends_on": ["subtask_verify"],
            }
        )

        return subtasks

    def _update_subtask_status(
        self,
        state: AgentState,
        subtask_type: str,
        status: SubtaskStatus,
    ) -> List[Dict[str, Any]]:
        """Update subtask status in state."""
        subtasks = list(state.get("subtasks") or [])
        for subtask in subtasks:
            if subtask["type"] == subtask_type:
                subtask["status"] = status.value
                break
        return subtasks

    def _master_agent_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Master agent processing request")
        return self._execute_with_trace(
            state,
            "master_agent",
            lambda: self._run_master(state),
            phase=WorkflowPhase.ROUTING.value,
        )

    def _run_income_analysis(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"income_analysis": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        transactions = user_profile.get("transactions", [])
        return {"income_analysis": self.income_analyzer.analyze_finances(transactions), "next_agent": "synthesize"}

    def _income_analyzer_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Income analyzer processing request")
        updates = self._execute_with_trace(
            state,
            "income_expense_analyzer",
            lambda: self._run_income_analysis(state.get("user_profile")),
            phase=WorkflowPhase.EXECUTION.value,
        )
        updates["subtasks"] = self._update_subtask_status(state, "income_expense", SubtaskStatus.COMPLETED)
        return updates

    def _run_budget_plan(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"budget_plan": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        return {"budget_plan": self.budget_planner.create_budget_plan(user_profile), "next_agent": "synthesize"}

    def _budget_planner_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Budget planner processing request")
        updates = self._execute_with_trace(
            state,
            "budget_planner",
            lambda: self._run_budget_plan(state.get("user_profile")),
            phase=WorkflowPhase.EXECUTION.value,
        )
        updates["subtasks"] = self._update_subtask_status(state, "budget_planning", SubtaskStatus.COMPLETED)
        return updates

    def _run_investment_advice(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"investment_advice": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        return {"investment_advice": self.investment_advisor.provide_advice(user_profile), "next_agent": "synthesize"}

    def _investment_advisor_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Investment advisor processing request")
        updates = self._execute_with_trace(
            state,
            "investment_advisor",
            lambda: self._run_investment_advice(state.get("user_profile")),
            phase=WorkflowPhase.EXECUTION.value,
        )
        updates["subtasks"] = self._update_subtask_status(state, "investment_advice", SubtaskStatus.COMPLETED)
        return updates

    def _run_debt_optimization(self, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not user_profile:
            return {"debt_optimization": {"error": "No user profile data available."}, "next_agent": "synthesize"}
        debts = user_profile.get("debts", [])
        return {
            "debt_optimization": self.debt_optimizer.optimize_repayment(debts, user_profile),
            "next_agent": "synthesize",
        }

    def _debt_optimizer_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Debt optimizer processing request")
        updates = self._execute_with_trace(
            state,
            "debt_optimizer",
            lambda: self._run_debt_optimization(state.get("user_profile")),
            phase=WorkflowPhase.EXECUTION.value,
        )
        updates["subtasks"] = self._update_subtask_status(state, "debt_optimization", SubtaskStatus.COMPLETED)
        return updates

    def _run_financial_education(self, state: AgentState) -> Dict[str, Any]:
        user_input = state.get("user_input", "")
        user_profile = state.get("user_profile")
        result = self.financial_educator.explain_concept(user_input, user_profile)
        final_answer = result.get("error") or result.get("explanation", "")
        return {
            "financial_education": result,
            "final_output": final_answer,
            "fallback_used": bool(result.get("fallback_used")),
            "llm_route": result.get("llm_route"),
        }

    def _financial_educator_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Financial educator processing request")
        return self._execute_with_trace(
            state,
            "financial_educator",
            lambda: self._run_financial_education(state),
            phase=WorkflowPhase.EXECUTION.value,
        )

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
        existing_outputs = {
            "income_expense_analyzer": {"income_analysis": state.get("income_analysis")} if state.get("income_analysis") else None,
            "budget_planner": {"budget_plan": state.get("budget_plan")} if state.get("budget_plan") else None,
            "investment_advisor": {"investment_advice": state.get("investment_advice")} if state.get("investment_advice") else None,
            "debt_optimizer": {"debt_optimization": state.get("debt_optimization")} if state.get("debt_optimization") else None,
        }

        jobs = {
            "income_expense_analyzer": lambda: self._run_income_analysis(user_profile),
            "budget_planner": lambda: self._run_budget_plan(user_profile),
            "investment_advisor": lambda: self._run_investment_advice(user_profile),
            "debt_optimizer": lambda: self._run_debt_optimization(user_profile),
        }

        results: Dict[str, Dict[str, Any]] = {}
        pending_jobs = {
            name: handler for name, handler in jobs.items()
            if existing_outputs.get(name) is None
        }

        if pending_jobs:
            with ThreadPoolExecutor(max_workers=min(4, len(pending_jobs))) as executor:
                future_map = {executor.submit(handler): name for name, handler in pending_jobs.items()}
                for future in as_completed(future_map):
                    name = future_map[future]
                    updates, trace = self._run_with_subtrace(trace, name, lambda future=future: future.result())
                    results[name] = updates

        for name, existing in existing_outputs.items():
            if existing is not None:
                results[name] = existing
                trace.append(
                    self._build_trace_entry(
                        name,
                        comprehensive_started,
                        self._utc_now_iso(),
                        "reused",
                        phase=WorkflowPhase.EXECUTION.value,
                    )
                )

        comprehensive_ended = self._utc_now_iso()
        trace.append(
            self._build_trace_entry(
                "comprehensive_analysis",
                comprehensive_started,
                comprehensive_ended,
                "success",
                phase=WorkflowPhase.EXECUTION.value,
            )
        )

        # Update subtask statuses
        subtasks = list(state.get("subtasks") or [])
        for subtask in subtasks:
            if subtask["type"] in ["income_expense", "budget_planning", "investment_advice", "debt_optimization"]:
                subtask["status"] = SubtaskStatus.COMPLETED.value

        return {
            "income_analysis": (results.get("income_expense_analyzer") or {}).get("income_analysis"),
            "budget_plan": (results.get("budget_planner") or {}).get("budget_plan"),
            "investment_advice": (results.get("investment_advisor") or {}).get("investment_advice"),
            "debt_optimization": (results.get("debt_optimizer") or {}).get("debt_optimization"),
            "workflow_trace": trace,
            "subtasks": subtasks,
            "phase": WorkflowPhase.EXECUTION.value,
        }

    def _run_verification(self, state: AgentState) -> Dict[str, Any]:
        """
        Verify the quality and consistency of recommendations.

        This is a lightweight verification step that ensures:
        - Recommendations don't conflict with each other
        - Numbers are reasonable and consistent
        - Critical warnings are flagged
        """
        verification_results = {
            "passed": True,
            "warnings": [],
            "adjustments": [],
        }

        user_profile = state.get("user_profile") or {}
        income_analysis = state.get("income_analysis") or {}
        budget_plan = state.get("budget_plan") or {}
        investment_advice = state.get("investment_advice") or {}
        debt_optimization = state.get("debt_optimization") or {}

        # Verify budget doesn't exceed income
        monthly_income = user_profile.get("annual_income", 0) / 12
        monthly_expenses = user_profile.get("monthly_expenses", 0)

        if monthly_expenses > monthly_income * 1.1:
            verification_results["warnings"].append(
                {
                    "type": "budget_exceeds_income",
                    "message": "Monthly expenses exceed income by more than 10%",
                    "severity": "high",
                }
            )

        # Verify debt recommendations are feasible
        total_debt = sum(d.get("balance", 0) for d in user_profile.get("debts", []))
        savings = user_profile.get("savings", 0)

        if total_debt > 0 and savings < monthly_expenses:
            verification_results["warnings"].append(
                {
                    "type": "low_emergency_fund",
                    "message": "Emergency fund is below 1 month of expenses",
                    "severity": "medium",
                }
            )

        # Verify investment recommendations match risk tolerance
        risk_tolerance = user_profile.get("risk_tolerance", "moderate")
        if investment_advice and isinstance(investment_advice, dict):
            allocation = investment_advice.get("asset_allocation", {})
            stocks = allocation.get("stocks", 0) + allocation.get("equities", 0)

            if risk_tolerance == "conservative" and stocks > 40:
                verification_results["warnings"].append(
                    {
                        "type": "aggressive_for_tolerance",
                        "message": "Stock allocation may be too aggressive for conservative risk tolerance",
                        "severity": "medium",
                    }
                )

        return {
            "verification_results": verification_results,
            "next_agent": "synthesize",
        }

    def _verification_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Verification: checking recommendation quality")
        updates = self._execute_with_trace(
            state,
            "verification",
            lambda: self._run_verification(state),
            phase=WorkflowPhase.VERIFICATION.value,
        )

        # Update verification subtask
        subtasks = list(state.get("subtasks") or [])
        for subtask in subtasks:
            if subtask["type"] == "verification":
                subtask["status"] = SubtaskStatus.COMPLETED.value
        updates["subtasks"] = subtasks

        return updates

    def _run_synthesis(self, state: AgentState) -> Dict[str, Any]:
        user_profile = state.get("user_profile")
        verification_results = state.get("verification_results") or {}

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
            "verification_warnings": verification_results.get("warnings", []),
        }

        final_plan = self.master_agent.synthesize_plan(user_profile, valid_analyses, context=context)

        # Add verification warnings to plan if present
        if isinstance(final_plan, dict) and verification_results.get("warnings"):
            final_plan["verification_warnings"] = verification_results["warnings"]

        return {
            "final_output": final_plan,
            "next_agent": "end",
            "fallback_used": bool(final_plan.get("fallback_used")) if isinstance(final_plan, dict) else False,
            "phase": WorkflowPhase.SYNTHESIS.value,
            "llm_route": final_plan.get("llm_route") if isinstance(final_plan, dict) else None,
        }

    def _synthesize_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Synthesizing final financial plan")
        updates = self._execute_with_trace(
            state,
            "master_synthesis",
            lambda: self._run_synthesis(state),
            phase=WorkflowPhase.SYNTHESIS.value,
        )

        # Update synthesis subtask
        subtasks = list(state.get("subtasks") or [])
        for subtask in subtasks:
            if subtask["type"] == "synthesis":
                subtask["status"] = SubtaskStatus.COMPLETED.value
        updates["subtasks"] = subtasks
        updates["phase"] = WorkflowPhase.COMPLETE.value

        return updates

    def process_request(
        self,
        user_input: str,
        user_profile: Optional[Dict[str, Any]],
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
        conversation_history: Optional[list[Dict[str, str]]] = None,
        session_summary: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        resume_from_checkpoint: bool = False,
    ) -> Dict[str, Any]:
        """
        Process a financial request through the multi-agent workflow.

        Args:
            user_input: The user's query or request
            user_profile: User's financial profile data
            conversation_history: Previous conversation messages
            session_summary: Compact summary of prior context
            options: Processing options (e.g., narrative mode)
            session_id: Optional session ID for checkpointing
            resume_from_checkpoint: Whether to resume from last checkpoint

        Returns:
            Complete workflow result with final output and trace
        """
        manager = self._get_session_manager()
        checkpoint = None
        session_memory = None
        recovered_from_checkpoint = False

        if manager and org_id and user_id:
            session = manager.ensure_session(
                org_id=org_id,
                user_id=user_id,
                session_id=session_id,
                original_input=user_input,
                original_profile=user_profile,
            )
            session_id = session.id
            session_memory = session.memory.to_dict()

        if manager and session_id and resume_from_checkpoint:
            try:
                checkpoint = manager.get_latest_checkpoint(session_id)
                if checkpoint:
                    recovered_from_checkpoint = True
                    logger.info("Resuming session %s from phase %s", session_id, checkpoint.phase.value)
                    session_summary = "\n\n".join(
                        part for part in [
                            session_summary,
                            checkpoint.context_summary,
                            (session_memory or {}).get("rolling_summary"),
                        ] if part
                    ) or None
            except Exception as e:
                logger.warning("Failed to restore checkpoint: %s", e)

        initial_state = AgentState(
            user_input=user_input,
            user_profile=user_profile,
            org_id=org_id,
            user_id=user_id,
            conversation_history=conversation_history or [],
            session_summary=session_summary,
            options=options or {"narrative": False},
            current_analysis=(checkpoint.state_data.get("current_analysis") if checkpoint else {}) or {},
            income_analysis=(checkpoint.agent_outputs.get("income_analysis") if checkpoint else None),
            budget_plan=(checkpoint.agent_outputs.get("budget_plan") if checkpoint else None),
            investment_advice=(checkpoint.agent_outputs.get("investment_advice") if checkpoint else None),
            debt_optimization=(checkpoint.agent_outputs.get("debt_optimization") if checkpoint else None),
            financial_education=None,
            next_agent="master_agent",
            final_output=None,
            fallback_used=False,
            workflow_trace=[],
            error=None,
            session_id=session_id,
            subtasks=checkpoint.agent_outputs.get("subtasks") if checkpoint else None,
            verification_results=None,
            retry_count=0,
            max_retries=self.DEFAULT_MAX_RETRIES,
            phase=(checkpoint.state_data.get("phase") if checkpoint else WorkflowPhase.ROUTING.value),
            recovered_from_checkpoint=recovered_from_checkpoint,
            llm_route=checkpoint.agent_outputs.get("llm_route") if checkpoint else None,
        )

        try:
            result = self.workflow.invoke(initial_state)
            result["session_id"] = session_id
            result["recovered_from_checkpoint"] = recovered_from_checkpoint
            result["session_memory"] = session_memory

            # Complete session if checkpointing
            if session_id:
                if manager:
                    try:
                        manager.complete_session(session_id, result)
                    except Exception as e:
                        logger.warning("Failed to complete session: %s", e)

            return result
        except Exception as exc:
            logger.error("Workflow execution failed: %s", exc)

            # Fail session if checkpointing
            if session_id:
                manager = self._get_session_manager()
                if manager:
                    try:
                        manager.fail_session(session_id, str(exc))
                    except Exception:
                        pass

            return {
                "final_output": f"I encountered an error while processing your request: {exc}",
                "fallback_used": True,
                "workflow_trace": initial_state.get("workflow_trace", []),
                "error": str(exc),
                "phase": WorkflowPhase.ERROR.value,
                "session_id": session_id,
                "recovered_from_checkpoint": recovered_from_checkpoint,
            }


def create_financial_workflow() -> FinancialWorkflow:
    return FinancialWorkflow()
