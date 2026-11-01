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

from tools import PlanInputs, build_plan, render_plan_markdown
from utils import create_llm
from utils.agent_helpers import get_currency_code

logger = logging.getLogger(__name__)


class AggregatorAgent:
    """Merges sub-agent results into a unified financial plan.

    This agent is invoked after the ``SubAgentManager`` has completed all
    subtasks.  It takes the collected results and produces the same response
    shape that ``MasterFinancialStrategistAgent.synthesize_plan()`` returns.
    """

    def __init__(self):
        self.llm = create_llm("master")

        self.system_prompt = SystemMessage(
            content=(
                "You are a financial plan synthesizer. "
                "Combine multiple specialist analyses into a clear, actionable plan. "
                "Be concise, practical, and specific. "
                "Do NOT introduce any new numbers or change existing values."
            )
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

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

    def _polish_with_llm(self, deterministic_markdown: str, context: Optional[Dict[str, Any]]) -> tuple:
        """Ask the LLM to improve prose without changing numbers.

        Returns (final_markdown, fallback_used).
        """
        session_summary = ""
        history = []
        if context and isinstance(context, dict):
            session_summary = str(context.get("session_summary") or "")
            history = context.get("conversation_history") if isinstance(context.get("conversation_history"), list) else []

        prompt = f"""Rewrite the following financial plan for clarity and readability.

Rules (critical):
- Do NOT introduce any new numbers. Keep every numeric value exactly as provided.
- Do NOT change currency/percent values or add extra numeric examples.
- Keep the same structure and meaning; you may improve wording and formatting only.

Optional chat context (for relevance; do not add new facts):
Session summary: {session_summary[:800]}
Recent messages: {history[-6:]}

PLAN (do not change numbers):
{deterministic_markdown}
"""

        llm_response, llm_fallback_used = self.llm.invoke_with_fallback(
            [self.system_prompt, HumanMessage(content=prompt)],
            deterministic_markdown,
        )

        candidate = llm_response.content if hasattr(llm_response, "content") else str(llm_response)
        candidate = candidate.strip() + "\n"

        if llm_fallback_used or not self._numbers_are_subset(candidate, deterministic_markdown):
            if not llm_fallback_used:
                logger.warning("Aggregator: LLM introduced new numbers; using deterministic version.")
            return deterministic_markdown, True

        return candidate, False

    def _numbers_are_subset(self, candidate: str, reference: str) -> bool:
        """Check that every number in candidate already exists in reference."""
        from utils.agent_helpers import numbers_are_subset
        return numbers_are_subset(candidate, reference)

    # ------------------------------------------------------------------
    # Metadata helpers (delegated to shared agent_helpers)
    # ------------------------------------------------------------------

    def _determine_action_type(self, analyses: Dict[str, Any]) -> str:
        from utils.agent_helpers import determine_action_type
        return determine_action_type(analyses)

    def _determine_priority(self, analyses: Dict[str, Any], user_profile: Dict[str, Any]) -> str:
        from utils.agent_helpers import determine_priority
        return determine_priority(analyses, user_profile)

    def _extract_key_insights(
        self, analyses: Dict[str, Any], user_profile: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        from utils.agent_helpers import extract_key_insights, get_currency_code
        currency_code = get_currency_code(user_profile)
        return extract_key_insights(analyses, currency_code=currency_code)
