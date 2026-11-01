r"""
workflow.py - LangGraph Multi-Agent Financial Workflow
======================================================

This module defines the ``FinancialWorkflow`` class, which is the **orchestrator**
of the entire multi-agent financial advisory system.  It uses LangGraph's
``StateGraph`` to wire together six specialist agents into a directed acyclic
graph with conditional routing, parallel execution, verification, and synthesis.

Architecture
------------
The graph has the following nodes::

    master_agent  ──(conditional)──>  income_analyzer    ──> synthesize ──> END
                                  |  budget_planner     ──> synthesize
                                  |  investment_advisor  ──> synthesize
                                  |  debt_optimizer      ──> synthesize
                                  |  financial_educator   ──> END
                                  |  comprehensive_analysis ──> verification ──> synthesize

Key features:
- **Session checkpointing** -- state can be persisted and resumed across
  requests, enabling long-running or interrupted workflows.
- **Subtask decomposition** -- complex requests are broken into tracked
  subtasks with status (pending/in_progress/completed/failed).
- **Verification phase** -- before synthesis, a lightweight QA step checks
  that recommendations are consistent and feasible.
- **Selective parallel execution** -- comprehensive and decomposed requests
  share a bounded specialist pool and run only relevant agents.
- **Retry with graceful degradation** -- each node is wrapped in
  ``_execute_with_trace`` which retries up to ``DEFAULT_MAX_RETRIES`` times
  before propagating the error.

MINDMAP FLOW
------------
::

    FinancialWorkflow (LangGraph StateGraph)
    ├── 1. Workflow Initialization & Component Registration
    │   ├── Agents Instantiation (Master, Income, Budget, Invest, Debt, Educator, Decomposer, Aggregator)
    │   ├── SubAgentManager & Execution Concurrency Pool
    │   ├── SessionManager Checkpointing (SQLite lazy-loaded store)
    │   └── StateGraph Nodes & Edge Bindings
    ├── 2. State Ingestion & Checkpoint Restoration
    │   ├── GraphState Ingestion (user_input, profile, context, traces)
    │   ├── Resume Check: Restore GraphState from Checkpoint if present
    │   └── Phase Tracking (INITIALIZED -> ROUTING -> EXECUTING -> VERIFYING -> SYNTHESIZING)
    ├── 3. Master Routing & Task Decomposition Node
    │   ├── Compute Deterministic Analysis Type (MasterAgent)
    │   ├── Request Complexity Evaluation (TaskDecomposer)
    │   │   ├── Simple Query -> Single Specialist Route
    │   │   └── Complex Query -> Subtask Decomposition DAG
    ├── 4. Parallel Specialist Execution Engine
    │   ├── Single Agent Branch: Dispatches to target specialist node
    │   └── Comprehensive Branch (_comprehensive_analysis_node):
    │       ├── Select Relevant Specialists via agent_routing
    │       ├── Concurrent ThreadPoolExecutor Execution
    │       ├── Resilient Exception Catching & Partial Output Preservation
    │       └── Structured Trace Logging (status, duration, error)
    ├── 5. Verification Phase Node (_verification_node)
    │   ├── Feasibility Check: Savings + Debt + Living Costs vs Total Income
    │   ├── Sanity Metric Validation
    │   └── Risk Flag Generation (e.g., negative free cashflow)
    └── 6. Synthesis & Final Response Node (_synthesize_node)
        ├── Aggregator or Master Synthesis
        ├── Tool Suggestions Attachment
        ├── Final Output State Serialization
        └── Checkpoint State Completion

ASCII FLOW
----------
::

    +-------------------------------------------------------------------+
    |                 FinancialWorkflow.run(initial_state)              |
    +---------------------------------+---------------------------------+
                                      |
                                      v
    +-------------------------------------------------------------------+
    |       1. Checkpoint Check: Resume Existing Session or Start Fresh |
    +---------------------------------+---------------------------------+
                                      |
                                      v
    +-------------------------------------------------------------------+
    |                      Node: master_agent                           |
    |  - Classify query into AnalysisType                               |
    |  - If complex, trigger TaskDecomposer (subtasks generated)        |
    +---------------------------------+---------------------------------+
                                      |
                      [Evaluate Conditional Edge Routing]
                 /            /           |           \            \
                /            /            |            \            \
               v            v             v             v            v
        +-----------+ +-----------+ +-----------+ +-----------+ +-------------+
        |  Income   | |  Budget   | | Invest.   | |   Debt    | | Financial   |
        |  Analyzer | |  Planner  | |  Advisor  | | Optimizer | | Educator    |
        +-----+-----+ +-----+-----+ +-----+-----+ +-----+-----+ +------+------+
              |             |             |             |              |
              \             |             /             /              v
               \            |            /             /        +-------------+
                \           |           /             /         | Return Edu. |
                 v          v          v             v          | Response    |
          +--------------------------------------------+        +------+------+
          | Or: comprehensive_analysis Node            |               |
          |  - Run required specialists in parallel    |               |
          |  - SubAgentManager topological execution   |               |
          |  - Collect all analyses & traces           |               |
          +---------------------+----------------------+               |
                                |                                      |
                                v                                      |
          +--------------------------------------------+               |
          |            Node: verification              |               |
          |  - Sanity check cash flow math             |               |
          |  - Validate recommendations consistency    |               |
          +---------------------+----------------------+               |
                                |                                      |
                                v                                      |
          +--------------------------------------------+               |
          |             Node: synthesize               |               |
          |  - Master / Aggregator synthesizes plan    |               |
          |  - Generate markdown & action tool calls   |               |
          +---------------------+----------------------+               |
                                |                                      |
                                +-------------------+------------------+
                                                    |
                                                    v
                                          +-------------------+
                                          |     Node: END     |
                                          | Final GraphState  |
                                          +-------------------+

Design decisions
----------------
- Agents are instantiated once in ``__init__`` and reused (stateless).
- The session manager is lazily loaded to avoid import errors when the
  checkpointing subsystem is unavailable.
- Every node execution is traced (timestamps, status, token counts) for
  observability.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from langgraph.graph import END, StateGraph

from utils.agent_execution import AgentExecution
from utils.agent_routing import select_specialists

from .state import AgentState, AnalysisType, SubtaskStatus, WorkflowPhase

logger = logging.getLogger(__name__)

# Lazy import to avoid circular dependency at module level.
_workflow_logger_cls = None


class WorkflowNodeError(RuntimeError):
    def __init__(self, message: str, workflow_trace: List[Dict[str, Any]]):
        super().__init__(message)
        self.workflow_trace = workflow_trace


def _get_workflow_logger(workflow_id: str, phase: Optional[str] = None):
    """Return a WorkflowLogger, importing the class on first use."""
    global _workflow_logger_cls
    if _workflow_logger_cls is None:
        from utils.helpers import WorkflowLogger
        _workflow_logger_cls = WorkflowLogger
    return _workflow_logger_cls(workflow_id=workflow_id, phase=phase)


class FinancialWorkflow:
    """Orchestrates the multi-agent financial workflow using LangGraph.

    Enhanced capabilities:
    - Session checkpointing for resumable state
    - Subtask decomposition for complex requests
    - Verification phase for quality assurance
    - Parallel execution where safe
    - Graceful degradation with retries
    """

    # Maximum number of retries per node before giving up.
    DEFAULT_MAX_RETRIES = 2

    def __init__(self):
        # Lazy imports to avoid circular dependencies -- agents import from
        # this module indirectly via the workflow factory.
        from agents.budget_planner import BudgetPlannerAgent
        from agents.debt_optimizer import DebtOptimizerAgent
        from agents.financial_educator import FinancialEducatorAgent
        from agents.income_expense_analyzer import IncomeExpenseAnalyzerAgent
        from agents.investment_advisor import InvestmentAdvisorAgent
        from agents.master_agent import MasterFinancialStrategistAgent
        from agents.sub_agent_manager import SubAgentManager
        from agents.task_decomposer import TaskDecomposerAgent

        # Instantiate all specialist agents (stateless, reusable).
        self.master_agent = MasterFinancialStrategistAgent()
        self.income_analyzer = IncomeExpenseAnalyzerAgent()
        self.budget_planner = BudgetPlannerAgent()
        self.investment_advisor = InvestmentAdvisorAgent()
        self.debt_optimizer = DebtOptimizerAgent()
        self.financial_educator = FinancialEducatorAgent()

        # Sub-agent architecture components.
        self.task_decomposer = TaskDecomposerAgent()
        self.sub_agent_manager = SubAgentManager(
            agent_registry={
                "income_expense_analyzer": self.income_analyzer,
                "budget_planner": self.budget_planner,
                "investment_advisor": self.investment_advisor,
                "debt_optimizer": self.debt_optimizer,
                "financial_educator": self.financial_educator,
            }
        )

        # Build and compile the LangGraph state graph.
        self.workflow = self._build_workflow()

        # Session manager for checkpointing (lazily loaded).
        self._session_manager = None

    def _get_session_manager(self):
        """Lazy-load the session manager singleton.

        Returns None if the session manager module is not available (e.g. in
        test environments or when the SQLite dependency is missing).
        """
        if self._session_manager is None:
            try:
                from utils.session_manager import get_session_manager

                self._session_manager = get_session_manager()
            except Exception as e:
                logger.warning("Session manager unavailable: %s", e)
        return self._session_manager

    def _build_workflow(self) -> StateGraph:
        """Build and compile the LangGraph state graph.

        The graph topology is::

            master_agent ─┬─> income_analyzer     ──────> synthesize ──> END
                          ├─> budget_planner       ──────> synthesize
                          ├─> investment_advisor   ──────> synthesize
                          ├─> debt_optimizer       ──────> synthesize
                          ├─> financial_educator   ──────> END
                          ├─> comprehensive_analysis ──> verification ──> synthesize
                          └─> task_decomposer ──> sub_agent_pool ──> verification ──> synthesize

        The ``master_agent`` node uses conditional edges to route to the
        appropriate specialist based on the analysis type determined by
        ``MasterFinancialStrategistAgent.determine_analysis_type()``.

        When the analysis type is ``DECOMPOSE`` (complex multi-domain request),
        the sub-agent pipeline is used: ``task_decomposer`` breaks the request
        into subtasks and ``sub_agent_pool`` executes them in parallel.
        Outputs are normalized for verification, followed by one final synthesis.

        Note: ``financial_educator`` goes directly to ``END`` (no synthesis
        needed) because educational responses are self-contained.
        """
        workflow = StateGraph(AgentState)

        # --- Register nodes ---
        workflow.add_node("master_agent", self._master_agent_node)
        workflow.add_node("income_analyzer", self._income_analyzer_node)
        workflow.add_node("budget_planner", self._budget_planner_node)
        workflow.add_node("investment_advisor", self._investment_advisor_node)
        workflow.add_node("debt_optimizer", self._debt_optimizer_node)
        workflow.add_node("financial_educator", self._financial_educator_node)
        workflow.add_node("comprehensive_analysis", self._comprehensive_analysis_node)
        workflow.add_node("task_decomposer", self._task_decomposer_node)
        workflow.add_node("sub_agent_pool", self._sub_agent_pool_node)
        workflow.add_node("verification", self._verification_node)
        workflow.add_node("synthesize", self._synthesize_node)

        # --- Entry point ---
        workflow.set_entry_point("master_agent")

        # --- Conditional routing from master_agent ---
        # The route function returns a string matching one of the dict keys.
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
                AnalysisType.DECOMPOSE.value: "task_decomposer",
                "end": END,
            },
        )

        # --- Static edges ---
        # Single-domain agents feed directly into synthesis.
        # Comprehensive analysis goes through verification first.
        # Financial educator is self-contained (no synthesis needed).
        workflow.add_edge("income_analyzer", "synthesize")
        workflow.add_edge("budget_planner", "synthesize")
        workflow.add_edge("investment_advisor", "synthesize")
        workflow.add_edge("debt_optimizer", "synthesize")
        workflow.add_edge("comprehensive_analysis", "verification")
        workflow.add_edge("verification", "synthesize")
        workflow.add_edge("financial_educator", END)
        workflow.add_edge("synthesize", END)

        # Sub-agent pipeline: plan -> execute -> verify -> synthesize once
        workflow.add_edge("task_decomposer", "sub_agent_pool")
        workflow.add_edge("sub_agent_pool", "verification")

        return workflow.compile()

    def _utc_now_iso(self) -> str:
        """Return the current UTC time as an ISO 8601 string."""
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _perf_counter() -> float:
        """Return a monotonic performance counter (seconds)."""
        return __import__("time").perf_counter()

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
        """Build a single trace entry for the workflow trace log.

        Each entry records which agent ran, when it started/finished, whether
        it succeeded or failed, and optional token/latency metrics.  The
        frontend uses these entries to render a live progress timeline.
        """
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
        """Persist a workflow checkpoint for session resumption.

        Checkpoints allow a workflow that was interrupted (e.g. by a timeout
        or client disconnect) to be resumed from the last successful phase
        instead of starting over.  The checkpoint includes:
        - The current phase (routing, execution, verification, etc.)
        - The agent's outputs so far
        - A human-readable context summary

        This is a no-op if no session manager is available or no session_id
        is set in the state.
        """
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
        """Execute an agent handler with tracing, checkpointing, and retry logic.

        This is the **universal wrapper** used by every graph node.  It:
        1. Records start/end timestamps for the trace log.
        2. Calls the ``handler`` (a zero-argument callable that runs the agent).
        3. On success: appends a trace entry, saves a checkpoint, compacts
           session memory, and returns the handler's output dict.
        4. On failure with retries remaining: retries the handler within this
           node before the graph can advance.
        5. On failure after max retries: saves an error checkpoint, logs the
           exception, and re-raises.

        Parameters
        ----------
        state : AgentState
            The current workflow state (read-only; updates are returned as a dict).
        agent_name : str
            Human-readable name for tracing (e.g. "income_expense_analyzer").
        handler : Callable
            Zero-argument function that performs the agent's work and returns
            a dict of state updates.
        phase : str
            The workflow phase label (e.g. "execution", "verification").

        Returns
        -------
        dict
            State updates to merge into the graph state.
        """
        trace = list(state.get("workflow_trace") or [])
        max_retries = max(0, int(state.get("max_retries", self.DEFAULT_MAX_RETRIES)))
        workflow_id = state.get("session_id") or "no-session"
        wf_logger = _get_workflow_logger(workflow_id, phase)

        # Retry in this node. Returning a partial update would advance the graph
        # to the next node rather than retrying the failed operation.
        for attempt in range(max_retries + 1):
            execution = AgentExecution(agent_name, phase)
            try:
                with execution:
                    updates = handler() or {}
                    execution.result = updates
            except Exception as exc:
                entry = dict(execution.trace)
                entry["status"] = "retry" if attempt < max_retries else "error"
                trace.append(entry)
                wf_logger.warning("node_failed: agent=%s attempt=%d error=%s", agent_name, attempt + 1, str(exc))
                if attempt < max_retries:
                    continue
                self._save_checkpoint(state, "error", agent_name, error=str(exc))
                raise WorkflowNodeError(str(exc), trace) from exc

            # Pool handlers include their worker traces; preserve those entries.
            child_trace = updates.get("workflow_trace")
            if child_trace:
                trace.extend(entry for entry in child_trace if entry not in trace)
            trace.append(execution.trace)
            updates["workflow_trace"] = trace
            updates["phase"] = phase
            updates["retry_count"] = 0
            updates["error"] = updates.get("error")
            wf_logger.info("node_completed: agent=%s status=%s latency_ms=%.1f", agent_name,
                           execution.trace["status"], execution.trace["latencyMs"])
            self._save_checkpoint(state, phase, agent_name, updates)
            self._compact_session_memory(state, phase, updates)
            return updates

    def _route_based_on_analysis(self, state: AgentState) -> str:
        """Conditional edge function: route to the appropriate specialist node.

        Reads the analysis type from the state (set by the master agent node)
        and returns the name of the next node to execute.  If no user profile
        is available and the type would be "comprehensive", fall back to
        "financial_education" since personalised analysis requires data.
        """
        analysis_type = str(state.get("current_analysis", {}).get("type") or AnalysisType.COMPREHENSIVE.value).lower()
        if not state.get("user_profile") and analysis_type in (AnalysisType.COMPREHENSIVE.value, AnalysisType.DECOMPOSE.value):
            return AnalysisType.FINANCIAL_EDUCATION.value
        return analysis_type

    def _run_master(self, state: AgentState) -> Dict[str, Any]:
        """Execute the master agent's routing logic.

        Calls ``determine_analysis_type()`` (deterministic, no LLM) and
        decomposes the request into subtasks for tracking.
        """
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
        if not user_profile and analysis_value in (AnalysisType.COMPREHENSIVE.value, AnalysisType.DECOMPOSE.value):
            analysis_value = AnalysisType.FINANCIAL_EDUCATION.value
        selected_agents = ["financial_educator"] if analysis_value == AnalysisType.FINANCIAL_EDUCATION.value else select_specialists(
            user_input, user_profile, conversation_history, session_summary
        )

        # Decompose complex requests into subtasks for progress tracking.
        subtasks = self._decompose_request(user_input, analysis_value, user_profile, selected_agents)

        return {
            "current_analysis": {"type": analysis_value, "selected_agents": selected_agents},
            "next_agent": analysis_value,
            "subtasks": subtasks,
            "phase": WorkflowPhase.ROUTING.value,
        }

    def _decompose_request(
        self,
        user_input: str,
        analysis_type: str,
        user_profile: Optional[Dict[str, Any]],
        selected_agents: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Decompose a request into subtasks for progress tracking.

        Each subtask has an ``id``, ``type``, ``status``, ``description``,
        and optional ``priority``/``depends_on``/``can_parallel`` fields.
        The frontend uses these to render a progress checklist.

        For comprehensive analysis, the subtask list includes one entry per
        specialist agent plus verification and synthesis.  For single-domain
        requests, only the primary analysis plus verify/synthesis are included.
        """
        subtasks = []

        # Base subtask for the primary analysis.
        subtasks.append(
            {
                "id": f"subtask_{analysis_type}",
                "type": analysis_type,
                "status": SubtaskStatus.PENDING.value,
                "description": f"Perform {analysis_type.replace('_', ' ')} analysis",
                "priority": 1,
            }
        )

        if analysis_type == AnalysisType.COMPREHENSIVE.value:
            task_types = {
                "income_expense_analyzer": "income_expense", "budget_planner": "budget_planning",
                "investment_advisor": "investment_advice", "debt_optimizer": "debt_optimization",
            }
            for agent in selected_agents or select_specialists(user_input, user_profile):
                if agent in task_types:
                    subtasks.append({
                        "id": f"subtask_{agent}", "type": task_types[agent],
                        "status": SubtaskStatus.PENDING.value,
                        "description": f"Run {agent.replace('_', ' ')} analysis",
                        "priority": 1, "can_parallel": True,
                    })

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
            if subtask.get("type") == subtask_type:
                subtask["status"] = status.value
                break
        return subtasks

    def _master_agent_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Master agent processing request")
        result = self._execute_with_trace(
            state,
            "master_agent",
            lambda: self._run_master(state),
            phase=WorkflowPhase.ROUTING.value,
        )
        analysis_type = result.get("current_analysis", {}).get("type", "unknown")
        logger.info(
            "Routing decision: type=%s",
            analysis_type,
            extra={"event": "routing_decision", "analysis_type": analysis_type, "agent_name": "master_agent"},
        )
        return result

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
        updates = self._execute_with_trace(
            state,
            "financial_educator",
            lambda: self._run_financial_education(state),
            phase=WorkflowPhase.EXECUTION.value,
        )
        updates["phase"] = WorkflowPhase.COMPLETE.value
        return updates

    def _comprehensive_analysis_node(self, state: AgentState) -> Dict[str, Any]:
        """Run relevant specialists once, with the shared timeout/retry policy."""
        user_profile = state.get("user_profile") or {}
        selected = (state.get("current_analysis") or {}).get("selected_agents") or select_specialists(
            state.get("user_input", ""), user_profile, state.get("conversation_history"), state.get("session_summary")
        )
        output_keys = {
            "income_expense_analyzer": "income_analysis", "budget_planner": "budget_plan",
            "investment_advisor": "investment_advice", "debt_optimizer": "debt_optimization",
        }
        trace = list(state.get("workflow_trace") or [])
        outputs = {key: None for key in output_keys.values()}
        tasks = []
        for agent in selected:
            key = output_keys.get(agent)
            if key is None:
                continue
            existing = state.get(key)
            if isinstance(existing, dict) and existing and not existing.get("error"):
                outputs[key] = existing
                trace.append(self._build_trace_entry(agent, self._utc_now_iso(), self._utc_now_iso(), "reused",
                                                     phase=WorkflowPhase.EXECUTION.value))
            else:
                tasks.append({"id": f"analysis_{agent}", "assigned_agent": agent, "dependencies": []})

        execution = AgentExecution("comprehensive_analysis")
        with execution:
            results = self.sub_agent_manager.execute_subtasks(tasks, user_profile, state.get("user_input", ""))
            outputs.update(self._extract_analysis_from_results(results))
            for result in results.values():
                trace.extend(result.get("execution_trace", []))
            execution.result = {"error": "Some specialists failed"} if any(result.get("error") for result in results.values()) else {}
        trace.append(execution.trace)
        subtasks = [dict(task) for task in state.get("subtasks") or []]
        for task in subtasks:
            key = {"income_expense": "income_analysis", "budget_planning": "budget_plan",
                   "investment_advice": "investment_advice", "debt_optimization": "debt_optimization"}.get(task.get("type"))
            if key:
                task["status"] = SubtaskStatus.COMPLETED.value if outputs.get(key) else SubtaskStatus.FAILED.value
        return {**outputs, "sub_agent_results": results, "workflow_trace": trace, "subtasks": subtasks,
                "phase": WorkflowPhase.EXECUTION.value}

    def _run_verification(self, state: AgentState) -> Dict[str, Any]:
        """Lightweight quality-assurance check on the specialist outputs.

        This step runs **after** the comprehensive analysis and **before**
        synthesis.  It does not call any LLM -- it is purely rule-based.

        Checks performed:
        1. Budget vs. income -- flag if monthly expenses exceed income by >10%.
        2. Emergency fund -- warn if savings cover <1 month of expenses.
        3. Risk tolerance alignment -- warn if stock allocation is too
           aggressive for a "conservative" risk profile.

        Returns a ``verification_results`` dict with ``passed`` (bool),
        ``warnings`` (list), and ``adjustments`` (list).
        """
        verification_results = {
            "passed": True,
            "warnings": [],
            "adjustments": [],
        }
        for result in (state.get("sub_agent_results") or {}).values():
            if isinstance(result, dict) and result.get("error"):
                verification_results["warnings"].append({
                    "type": "specialist_unavailable", "severity": "medium",
                    "message": f"{result.get('agent', 'Specialist')} analysis was unavailable; the plan uses the remaining data.",
                })

        user_profile = state.get("user_profile") or {}
        investment_advice = state.get("investment_advice") or {}

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
            allocation = investment_advice.get("portfolio_allocation") or investment_advice.get("asset_allocation") or {}
            # Match actual keys from InvestmentAdvisorAgent: "Domestic Equity", "International Equity"
            # as well as lowercase and generic equity/stocks aliases for compatibility
            equity_pct = (
                allocation.get("Domestic Equity", 0)
                + allocation.get("International Equity", 0)
                + allocation.get("domestic_equity", 0)
                + allocation.get("international_equity", 0)
                + allocation.get("stocks", 0)
                + allocation.get("equities", 0)
                + allocation.get("Equity", 0)
                + allocation.get("equity", 0)
            )

            if risk_tolerance == "conservative" and equity_pct > 40:
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
            if subtask.get("type") == "verification":
                subtask["status"] = SubtaskStatus.COMPLETED.value
        updates["subtasks"] = subtasks

        return updates

    def _run_synthesis(self, state: AgentState) -> Dict[str, Any]:
        """Synthesise the final financial plan by delegating to the master agent.

        Gathers all specialist outputs and verification warnings from the
        state, then calls ``master_agent.synthesize_plan()`` which produces
        a deterministic plan with optional LLM narrative polish.
        """
        user_profile = state.get("user_profile")
        verification_results = state.get("verification_results") or {}

        # Collect all specialist outputs that completed successfully.
        analyses = {
            "income_analysis": state.get("income_analysis"),
            "budget_plan": state.get("budget_plan"),
            "investment_advice": state.get("investment_advice"),
            "debt_optimization": state.get("debt_optimization"),
        }
        valid_analyses = {key: value for key, value in analyses.items() if value}

        context = {
            "user_input": state.get("user_input", ""),
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
            if subtask.get("type") == "synthesis":
                subtask["status"] = SubtaskStatus.COMPLETED.value
        updates["subtasks"] = subtasks
        updates["phase"] = WorkflowPhase.COMPLETE.value

        return updates

    # ------------------------------------------------------------------
    # Sub-agent pipeline nodes
    # ------------------------------------------------------------------

    def _run_task_decomposition(self, state: AgentState) -> Dict[str, Any]:
        """Decompose a complex request into subtasks for parallel execution.

        Uses a deterministic domain plan by default. LLM planning is explicit
        via options.llm_decomposition and is separate from narrative mode.
        """
        user_input = state.get("user_input", "")
        user_profile = state.get("user_profile")
        conversation_history = state.get("conversation_history") or []

        result = self.task_decomposer.decompose(
            user_input=user_input,
            user_profile=user_profile,
            conversation_history=conversation_history,
            session_summary=state.get("session_summary"),
            force=True,
            use_llm=bool((state.get("options") or {}).get("llm_decomposition", False)),
        )

        subtasks = result.get("subtasks", [])
        complexity_score = result.get("complexity_score", 0.0)
        decomposition_plan = result.get("decomposition_plan")

        return {
            "subtasks": subtasks,
            "complexity_score": complexity_score,
            "decomposition_plan": decomposition_plan,
            "next_agent": "sub_agent_pool",
        }

    def _task_decomposer_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Task decomposer: evaluating request complexity")
        return self._execute_with_trace(
            state,
            "task_decomposer",
            lambda: self._run_task_decomposition(state),
            phase=WorkflowPhase.PLANNING.value,
        )

    def _run_sub_agent_pool(self, state: AgentState) -> Dict[str, Any]:
        """Execute decomposed subtasks via the SubAgentManager.

        The manager groups subtasks by dependency level and runs each level
        in parallel using ``ThreadPoolExecutor``.
        """
        subtasks = state.get("subtasks") or []
        user_profile = state.get("user_profile") or {}
        user_input = state.get("user_input", "")

        # Filter to subtasks that have an assigned_agent (i.e. from the
        # decomposer, not the built-in progress-tracking subtasks).
        decomposed_subtasks = [
            s for s in subtasks if s.get("assigned_agent")
        ]

        if not decomposed_subtasks:
            return {
                "sub_agent_results": {},
                "next_agent": "verification",
            }

        results = self.sub_agent_manager.execute_subtasks(
            subtasks=decomposed_subtasks,
            user_profile=user_profile,
            user_input=user_input,
        )

        # Also populate the individual analysis fields in state so that the
        # verification and synthesis nodes can access them.
        analysis_updates = self._extract_analysis_from_results(results)

        return {
            "sub_agent_results": results,
            "workflow_trace": list(state.get("workflow_trace") or []) + [
                entry for result in results.values() for entry in result.get("execution_trace", [])
            ],
            "next_agent": "verification",
            **analysis_updates,
        }

    def _sub_agent_pool_node(self, state: AgentState) -> Dict[str, Any]:
        logger.info("Sub-agent pool: executing decomposed subtasks")
        updates = self._execute_with_trace(
            state,
            "sub_agent_pool",
            lambda: self._run_sub_agent_pool(state),
            phase=WorkflowPhase.EXECUTION.value,
        )

        # Update subtask statuses for completed decomposed subtasks.
        subtasks = list(state.get("subtasks") or [])
        sub_agent_results = updates.get("sub_agent_results", {})
        for subtask in subtasks:
            task_id = subtask.get("id", "")
            if task_id in sub_agent_results:
                result = sub_agent_results[task_id]
                if isinstance(result, dict) and result.get("error"):
                    subtask["status"] = SubtaskStatus.FAILED.value
                else:
                    subtask["status"] = SubtaskStatus.COMPLETED.value
        updates["subtasks"] = subtasks

        return updates

    @staticmethod
    def _extract_analysis_from_results(results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract individual analysis fields from sub-agent results.

        The sub-agent pool returns results keyed by subtask_id.  This method
        maps them back to the standard analysis fields in AgentState so that
        verification and synthesis nodes can access them.
        """
        analysis_updates: Dict[str, Any] = {}

        key_map = {
            "income_expense_analyzer": "income_analysis",
            "budget_planner": "budget_plan",
            "investment_advisor": "investment_advice",
            "debt_optimizer": "debt_optimization",
            "financial_educator": "financial_education",
        }

        for _subtask_id, result in results.items():
            if not isinstance(result, dict) or result.get("error"):
                continue

            agent_type = result.get("agent") or result.get("assigned_agent", "")
            analysis_key = key_map.get(agent_type)

            if analysis_key and analysis_key not in analysis_updates:
                if analysis_key in result:
                    analysis_updates[analysis_key] = result[analysis_key]
                else:
                    analysis_updates[analysis_key] = {key: value for key, value in result.items() if key != "execution_trace"}

        return analysis_updates

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
        finance_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Process a financial request through the multi-agent workflow.

        This is the **main entry point** called by ``api_service.py``.  It:
        1. Optionally creates or restores a session (for checkpointing).
        2. If ``resume_from_checkpoint`` is True, loads the latest checkpoint
           and merges its state into the initial state.
        3. Builds the ``AgentState`` TypedDict with all required fields.
        4. Invokes the compiled LangGraph workflow.
        5. On success: marks the session as completed and returns the result.
        6. On failure: marks the session as failed and returns a safe fallback
           response with ``fallback_used=True``.

        Parameters
        ----------
        user_input : str
            The user's free-text query.
        user_profile : dict, optional
            The user's financial profile (may be None for educational queries).
        org_id : str, optional
            Organisation identifier for multi-tenant session management.
        user_id : str, optional
            User identifier for session management.
        conversation_history : list[dict], optional
            Previous conversation messages for multi-turn context.
        session_summary : str, optional
            Compact summary of prior conversation (may include memory enrichments).
        options : dict, optional
            Processing options (e.g. ``{"narrative": True}``).
        session_id : str, optional
            Existing session ID to resume.
        resume_from_checkpoint : bool
            If True, load the latest checkpoint and skip already-completed phases.

        Returns
        -------
        dict
            The complete workflow result including ``final_output``,
            ``workflow_trace``, ``phase``, ``session_id``, and all
            specialist analysis outputs.
        """
        # HTTP middleware initializes usage before graph execution. Direct CLI
        # callers need their own scope before LangGraph copies the context.
        from utils.request_metrics import begin_request_metrics, get_request_id
        if get_request_id() is None:
            begin_request_metrics(None)
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

        workflow_id = session_id or str(uuid4())
        wf_logger = _get_workflow_logger(workflow_id, WorkflowPhase.ROUTING.value)
        wf_logger.info(
            "workflow_started: input_length=%d has_profile=%s session_id=%s recovered=%s",
            len(user_input or ""),
            bool(user_profile),
            session_id,
            recovered_from_checkpoint,
        )

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
            sub_agent_results=None,
            complexity_score=None,
            decomposition_plan=None,
        )

        workflow_start_perf = self._perf_counter()

        try:
            from utils.activity_review import activity_review_answer, wants_activity_review
            from utils.document_answers import document_passage_answer, wants_document_lookup
            from utils.metric_answers import direct_metric_answer
            answer_agent = None
            if (options or {}).get("task_type") == "conversation_insights":
                answer_agent = "conversation_summarizer"
            elif isinstance(finance_context, dict) and wants_activity_review(user_input):
                answer_agent = "activity_review"
            elif (isinstance(finance_context, dict)
                  and isinstance(finance_context.get("retrieval"), dict)
                  and isinstance(finance_context["retrieval"].get("top_chunks"), list)
                  and (options or {}).get("include_evidence", True)
                  and (options or {}).get("include_document_passages", True)
                  and wants_document_lookup(user_input) and not direct_metric_answer(user_input, user_profile)):
                answer_agent = "document_lookup"
            if answer_agent:
                from contracts.plan import Plan
                with AgentExecution(answer_agent, phase="synthesis") as execution:
                    if answer_agent == "conversation_summarizer":
                        from agents.conversation_summarizer import summarize_conversations
                        summary = summarize_conversations(finance_context, narrative=bool((options or {}).get("narrative")))
                    else:
                        summary = {}
                    output = {
                        "response": (summary["response"] if answer_agent == "conversation_summarizer" else
                                     activity_review_answer(user_input, user_profile, finance_context)
                                     if answer_agent == "activity_review" else document_passage_answer(user_input, finance_context)),
                        "agent": answer_agent,
                        "plan": Plan(executive_summary="Review the cited saved records.").model_dump(),
                        "fallback_used": summary.get("fallback_used", False),
                        "llm_route": summary.get("llm_route"),
                    }
                    execution.result = output
                result = {**initial_state, "final_output": output, "phase": WorkflowPhase.COMPLETE.value,
                          "current_analysis": {"type": answer_agent}, "workflow_trace": [execution.trace],
                          "income_analysis": None, "budget_plan": None, "investment_advice": None,
                          "debt_optimization": None, "tool_calls": []}
            else:
                result = self.workflow.invoke(initial_state)
            workflow_duration_ms = (self._perf_counter() - workflow_start_perf) * 1000.0

            result["session_id"] = session_id
            result["recovered_from_checkpoint"] = recovered_from_checkpoint
            result["session_memory"] = session_memory

            # Count distinct agents that participated
            workflow_trace = result.get("workflow_trace", []) or []
            agents_invoked = list(dict.fromkeys(
                entry.get("agent") for entry in workflow_trace if entry.get("agent")
            ))

            wf_logger.set_phase(WorkflowPhase.COMPLETE.value)
            wf_logger.info(
                "workflow_completed: duration_ms=%.1f agent_count=%d",
                workflow_duration_ms,
                len(agents_invoked),
                extra={
                    "duration_ms": round(workflow_duration_ms, 2),
                    "agent_name": "workflow",
                },
            )

            # Record workflow telemetry
            try:
                from utils.agent_telemetry import record_workflow_execution
                record_workflow_execution(
                    duration_ms=workflow_duration_ms,
                    agent_count=len(agents_invoked),
                )
            except Exception:
                pass

            # Complete session if checkpointing
            if session_id:
                if manager:
                    try:
                        manager.complete_session(session_id, result)
                    except Exception as e:
                        logger.warning("Failed to complete session: %s", e)

            return result
        except Exception as exc:
            workflow_duration_ms = (self._perf_counter() - workflow_start_perf) * 1000.0
            logger.error("Workflow execution failed: %s", exc)
            wf_logger.set_phase(WorkflowPhase.ERROR.value)
            wf_logger.error(
                "workflow_failed: duration_ms=%.1f error=%s",
                workflow_duration_ms,
                str(exc),
                extra={"duration_ms": round(workflow_duration_ms, 2), "agent_name": "workflow"},
            )

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
                "workflow_trace": getattr(exc, "workflow_trace", initial_state.get("workflow_trace", [])),
                "error": str(exc),
                "phase": WorkflowPhase.ERROR.value,
                "session_id": session_id,
                "recovered_from_checkpoint": recovered_from_checkpoint,
            }


def create_financial_workflow() -> FinancialWorkflow:
    """Factory function to create a ``FinancialWorkflow`` instance.

    Called once at application startup by ``api_service.py``.
    """
    return FinancialWorkflow()


# ============================================================================
# END-OF-FILE SUMMARY -- graph/workflow.py
# ============================================================================
# Key takeaways:
#
# 1. This module defines the **LangGraph state graph** that wires together
#    six specialist agents into a directed acyclic graph.  The graph is
#    compiled once at startup and reused for every request.
#
# 2. The graph has **conditional routing** from the master agent to the
#    appropriate specialist(s), and **static edges** for synthesis and
#    verification.
#
# 3. Both multi-domain paths use SubAgentManager to run relevant specialists
#    with one shared timeout/retry policy and worker-level measurements.
#
# 4. Every node is wrapped in ``_execute_with_trace`` which provides:
#    - Structured trace logging (timestamps, status, errors)
#    - Session checkpointing for resumption
#    - Retry logic with configurable max retries
#
# 5. The **verification node** is a lightweight, rule-based QA step that
#    checks for inconsistencies (e.g. budget exceeds income) before the
#    final synthesis.
#
# 6. Session checkpointing enables **resumable workflows**: if a request
#    times out or the client disconnects, the next call can pick up from
#    the last successful phase.
# ============================================================================
