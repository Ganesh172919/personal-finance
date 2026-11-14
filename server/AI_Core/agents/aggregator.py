r"""
aggregator.py - Sub-Agent Result Aggregator
=============================================

The ``AggregatorAgent`` merges the outputs of multiple specialist sub-agents
into a single, unified financial plan.  It follows the same **tool-first**
pattern as ``MasterFinancialStrategistAgent.synthesize_plan()``:

1. Use ``tools.build_plan()`` to produce a deterministic structured plan.
2. Render as deterministic markdown via ``tools.render_plan_markdown()``.
3. Optionally enhance with an LLM narrative (number safety guard included).
4. Return a unified response dict matching the existing response format.

MINDMAP FLOW
------------
::

    AggregatorAgent
    ├── 1. Ingestion of Sub-Agent Pool Outputs
    │   ├── Subtask ID Keyed Result Map
    │   ├── Execution Metadata & Traces
    │   └── User Financial Profile & Context
    ├── 2. Normalization Engine (_normalise_results)
    │   ├── Discard Failed or Error-Flagged Subtasks
    │   ├── Map Agent Types to Canonical Analysis Keys
    │   │   ├── income_expense_analyzer -> income_analysis
    │   │   ├── budget_planner          -> budget_plan
    │   │   ├── investment_advisor      -> investment_advice
    │   │   ├── debt_optimizer          -> debt_optimization
    │   │   └── financial_educator      -> financial_education
    │   └── Unnesting & Format Alignment
    ├── 3. Deterministic Synthesis Core
    │   ├── PlanInputs Model Construction
    │   ├── build_plan() Execution (Deterministic Math)
    │   ├── Currency Code Resolution (profile-aware)
    │   └── render_plan_markdown() (Structured Markdown)
    ├── 4. LLM Narrative & Safety Polish
    │   ├── Check Narrative Enablement Flag
    │   ├── Format Preservation Prompting
    │   ├── Number-Safety Invariant Enforcement (zero hallucinated digits)
    │   └── Fallback to Deterministic Markdown on LLM Error
    └── 5. Unified Response Packaging
        ├── actionType & priority Computation
        ├── Key Actionable Insights Extraction
        ├── Plan Model Dump (Pydantic Serialization)
        └── LLM Route Metadata & Telemetry Attachment

ASCII FLOW
----------
::

    +-------------------------------------------------------------+
    |           SubAgentManager Output (Dict of subtask results)  |
    +------------------------------+------------------------------+
                                   |
                                   v
    +-------------------------------------------------------------+
    |                    _normalise_results()                     |
    |  - Filter out subtasks with error keys                      |
    |  - Map agent roles to canonical analysis keys               |
    |  - Extract: income_analysis, budget_plan, investment_advice,|
    |             debt_optimization, financial_education          |
    +------------------------------+------------------------------+
                                   |
                                   v
    +-------------------------------------------------------------+
    |              tools.build_plan(PlanInputs(...))              |
    |  - Deterministic calculation of allocations & runway        |
    |  - Synthesizes unified financial structure                  |
    +------------------------------+------------------------------+
                                   |
                                   v
    +-------------------------------------------------------------+
    |               render_plan_markdown(plan, currency)          |
    |  - Generates structured, zero-hallucination Markdown text   |
    +------------------------------+------------------------------+
                                   |
                                   v
               [Is Narrative LLM Polish Enabled?]
                         /              \
                       YES               NO
                       /                  \
                      v                    v
        +----------------------------+  (Skip Polish)
        | _polish_with_llm():        |     |
        |  - Send to LLM with strict |     |
        |    number-preservation rule|     |
        +-------------+--------------+     |
                      |                    |
        [LLM Polish Succeeded?]            |
               /             \             |
             YES              NO           |
             /                 \           |
            v                   v          |
     (Use Polished Text)  (Use Determin.)  |
            \                   /          |
             \                 /           |
              v               v            |
        +----------------------------------+---------------------+
        | Assemble Unified Plan Response Dict:                   |
        |  - response (Markdown)                                 |
        |  - agent: "aggregator"                                 |
        |  - actionType & priority calculation                   |
        |  - insights list                                       |
        |  - plan: plan.model_dump()                             |
        |  - llm_route: route metadata                           |
        +--------------------------------------------------------+

Design decisions
----------------
- The aggregator reuses the existing ``build_plan`` and
  ``render_plan_markdown`` tools -- no new plan-building logic.
- The LLM narrative step is identical to the master agent's synthesis:
  "improve wording but do NOT change any numbers."
- The response dict shape matches what ``api_service.py`` expects,
  ensuring the downstream contract is unchanged.
"""

import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from registry import get_prompt, record_verification, render_prompt
from tools import PlanInputs, build_plan, render_plan_markdown
from utils import create_llm
from utils.agent_helpers import get_currency_code

logger = logging.getLogger(__name__)


# Synthesizes distributed sub-agent results into a cohesive financial strategy.
# Reconciles cross-domain recommendations from budget, debt, and investment agents.
# Validates narrative consistency against underlying mathematical calculations.
class AggregatorAgent:
    """Merges sub-agent results into a unified financial plan.

    This agent is invoked after the ``SubAgentManager`` has completed all
    subtasks.  It takes the collected results and produces the same response
    shape that ``MasterFinancialStrategistAgent.synthesize_plan()`` returns.
    """

    # Initializes aggregator agent with configured LLM instance and prompt overrides.
    # Connects to master strategy model with fallback provider resilience.
    # Maintains prompt override reference for testing and dynamic tuning.
    def __init__(self):
        self.llm = create_llm("master")

        # Resolved through the artifact registry at call time (baked-in default
        # when empty); assigning ``system_prompt`` overrides it.
        self._system_prompt_override: Optional[SystemMessage] = None

    # Resolves active system prompt from artifact registry or explicit overrides.
    # Enforces aggregator role guidelines and factual numerical synthesis constraints.
    # Yields LangChain SystemMessage instance for model invocation calls.
    @property
    def system_prompt(self) -> SystemMessage:
        override = getattr(self, "_system_prompt_override", None)
        if override is not None:
            return override
        return SystemMessage(content=get_prompt("aggregator.system"))

    @system_prompt.setter
    def system_prompt(self, value: SystemMessage) -> None:
        self._system_prompt_override = value

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    # Merges individual sub-agent recommendations into a complete financial action plan.
    # Normalizes diverse agent payloads, computes deterministic plan models, and polishes prose.
    # Returns standardized plan dictionary matching MasterFinancialStrategistAgent contracts.
    def aggregate(
        self,
        sub_agent_results: Dict[str, Any],
        user_profile: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Merge sub-agent results into a unified plan.

        Parameters
        ----------
        sub_agent_results : dict
            Outputs from each sub-agent keyed by subtask_id.  Each value
            is the agent's return dict (e.g. ``{"budget_plan": {...}}``).
        user_profile : dict
            The user's financial profile.
        context : dict, optional
            Conversation history, session summary, options.

        Returns
        -------
        dict
            Unified response matching the ``synthesize_plan`` output shape:
            ``response``, ``agent``, ``actionType``, ``priority``,
            ``insights``, ``fallback_used``, ``plan``, ``tool_calls``,
            ``llm_route``.
        """
        logger.info("Aggregator: merging %d sub-agent results", len(sub_agent_results))

        # Step 1: Normalise sub-agent results into the analyses dict format
        # expected by build_plan().
        analyses = self._normalise_results(sub_agent_results)

        # Step 2: Build the deterministic plan.
        inputs = PlanInputs(
            user_profile=user_profile if user_profile else None,
            income_analysis=analyses.get("income_analysis"),
            budget_plan=analyses.get("budget_plan"),
            investment_advice=analyses.get("investment_advice"),
            debt_optimization=analyses.get("debt_optimization"),
        )
        plan = build_plan(inputs)

        # Step 3: Render deterministic markdown.
        currency_code = get_currency_code(user_profile)
        deterministic_markdown = render_plan_markdown(plan, currency_code=currency_code)

        # Step 4: Optional LLM narrative polish (same pattern as master agent).
        narrative_enabled = True
        if context and isinstance(context, dict):
            options = context.get("options", {})
            if isinstance(options, dict) and options.get("narrative") is False:
                narrative_enabled = False

        final_markdown = deterministic_markdown
        fallback_used = False

        if narrative_enabled:
            final_markdown, fallback_used = self._polish_with_llm(
                deterministic_markdown, context
            )

        return {
            "response": final_markdown,
            "agent": "aggregator",
            "actionType": self._determine_action_type(analyses),
            "priority": self._determine_priority(analyses, user_profile),
            "insights": self._extract_key_insights(analyses, user_profile),
            "fallback_used": fallback_used,
            "plan": plan.model_dump(),
            "tool_calls": [],
            "llm_route": self.llm.get_route_metadata(),
        }

    # ------------------------------------------------------------------
    # Result normalisation
    # ------------------------------------------------------------------

    # Normalizes sub-agent dictionary keys into canonical analysis categories.
    # Maps task-keyed results to budget_plan, income_analysis, and debt_optimization.
    # Ensures compatibility with input specifications expected by build_plan.
    def _normalise_results(self, sub_agent_results: Dict[str, Any]) -> Dict[str, Any]:
        """Map subtask_id-keyed results to analysis-type-keyed results.

        Sub-agents may return their output under different keys depending
        on the agent type.  This method normalises them into the standard
        ``income_analysis``, ``budget_plan``, ``investment_advice``,
        ``debt_optimization`` keys that ``build_plan()`` expects.
        """
        normalised: Dict[str, Any] = {}

        key_map = {
            "income_expense_analyzer": "income_analysis",
            "budget_planner": "budget_plan",
            "investment_advisor": "investment_advice",
            "debt_optimizer": "debt_optimization",
            "financial_educator": "financial_education",
        }

        for subtask_id, result in sub_agent_results.items():
            if not isinstance(result, dict) or result.get("error"):
                continue

            # Try to determine the agent type from the result itself.
            agent_type = result.get("agent") or result.get("assigned_agent")
            analysis_key = key_map.get(agent_type)

            if analysis_key and analysis_key not in normalised:
                # Some agents nest their output under a specific key.
                if analysis_key in result:
                    normalised[analysis_key] = result[analysis_key]
                else:
                    # The result itself is the analysis output.
                    normalised[analysis_key] = result
            else:
                # Fallback: try each known key in the result dict.
                for agent_name, target_key in key_map.items():
                    if target_key in result and target_key not in normalised:
                        normalised[target_key] = result[target_key]
                        break

        return normalised

    # ------------------------------------------------------------------
    # LLM narrative polish (same pattern as master agent)
    # ------------------------------------------------------------------

    # Polishes deterministic markdown text using LLM narrative generation.
    # Preserves numerical facts strictly by rejecting hallucinations via canary guards.
    # Returns polished markdown and fallback flag indicating whether raw text was used.
    def _polish_with_llm(self, deterministic_markdown: str, context: Optional[Dict[str, Any]]) -> tuple:
        """Ask the LLM to improve prose without changing numbers.

        Returns (final_markdown, fallback_used).
        """
        session_summary = ""
        history = []
        if context and isinstance(context, dict):
            session_summary = str(context.get("session_summary") or "")
            history = context.get("conversation_history") if isinstance(context.get("conversation_history"), list) else []

        prompt = render_prompt(
            get_prompt("aggregator.polish"),
            session_summary=session_summary[:800],
            recent_messages=history[-6:],
            plan=deterministic_markdown,
        )

        llm_response, llm_fallback_used = self.llm.invoke_with_fallback(
            [self.system_prompt, HumanMessage(content=prompt)],
            deterministic_markdown,
        )

        candidate = llm_response.content if hasattr(llm_response, "content") else str(llm_response)
        candidate = candidate.strip() + "\n"

        guard_ok = (not llm_fallback_used) and self._numbers_are_subset(candidate, deterministic_markdown)
        if not llm_fallback_used:
            record_verification(guard_ok)
        if not guard_ok:
            if not llm_fallback_used:
                logger.warning("Aggregator: LLM introduced new numbers; using deterministic version.")
            return deterministic_markdown, True

        return candidate, False

    # Verifies that every number mentioned in generated prose exists in source reference.
    # Dispatches checks to production canary telemetry engine to record validation results.
    # Reverts to helper regex parsing if canary telemetry throws exceptions.
    def _numbers_are_subset(self, candidate: str, reference: str) -> bool:
        """Check that every number in candidate already exists in reference.

        Also records the verification event into continuous production canary telemetry.
        """
        try:
            from evals.canary_validator import production_canary_engine
            check = production_canary_engine.evaluate_candidate_narrative(
                candidate=candidate,
                reference=reference,
                source="aggregator_synthesis",
            )
            return check.passed
        except Exception as exc:
            logger.debug("Canary validation fallback to direct agent_helpers: %s", exc)
            from utils.agent_helpers import numbers_are_subset
            return numbers_are_subset(candidate, reference)

    # ------------------------------------------------------------------
    # Metadata helpers (delegated to shared agent_helpers)
    # ------------------------------------------------------------------

    # Infers primary financial action type from aggregated sub-agent analyses.
    # Delegates classification to shared agent helper routines.
    # Returns action identifier such as budget_rebalance or debt_payoff.
    def _determine_action_type(self, analyses: Dict[str, Any]) -> str:
        from utils.agent_helpers import determine_action_type
        return determine_action_type(analyses)

    # Evaluates composite urgency priority for the aggregated financial plan.
    # Considers debt interest rates, emergency fund coverage, and income buffers.
    # Returns standardized priority tier (high, medium, or low).
    def _determine_priority(self, analyses: Dict[str, Any], user_profile: Dict[str, Any]) -> str:
        from utils.agent_helpers import determine_priority
        return determine_priority(analyses, user_profile)

    # Extracts actionable key insight bullet points from aggregated analyses.
    # Normalizes currency representations according to user profile currency code.
    # Returns structured list of key insight items for front-end rendering.
    def _extract_key_insights(
        self, analyses: Dict[str, Any], user_profile: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        from utils.agent_helpers import extract_key_insights, get_currency_code
        currency_code = get_currency_code(user_profile)
        return extract_key_insights(analyses, currency_code=currency_code)
