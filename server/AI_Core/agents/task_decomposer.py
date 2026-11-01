r"""
task_decomposer.py - Task Decomposer Agent
============================================

The ``TaskDecomposerAgent`` evaluates the complexity of a user's financial
request and, when warranted, decomposes it into a set of discrete subtasks
that can be dispatched to specialist agents in parallel or in dependency
order.

Key responsibilities
--------------------
- Compute a deterministic **complexity score** (0.0-1.0) from keyword
  analysis, domain breadth, planning horizon, and profile signals.
- If the score is below the decomposition threshold (0.5), return early
  with an empty subtask list -- the standard routing handles it.
- Complex requests receive a deterministic plan containing only relevant
  specialists, with no duplicate agents or artificial dependencies.
- LLM decomposition is opt-in via ``use_llm=True`` and validates its plan
  before execution. The model is initialized only when that option is used.

MINDMAP FLOW
------------
::

    TaskDecomposerAgent
    ├── 1. Request Ingestion & Pre-processing
    │   ├── User Input & Natural Language Parsing
    │   ├── Conversation History & Session Summary Integration
    │   └── Financial Profile Context Injection
    ├── 2. Complexity Scoring Engine (Deterministic, 0.0 - 1.0)
    │   ├── Domain Breadth Analysis (0.0 - 0.3)
    │   │   ├── Budgeting & Saving
    │   │   ├── Investments & SIPs
    │   │   ├── Debt & Liabilities
    │   │   └── Tax / Education
    │   ├── Planning Horizon Estimation (0.15 for long-term / retirement)
    │   ├── Trade-off & Competing Goal Detection (0.10)
    │   ├── Comprehensive Planning Keywords (0.15)
    │   ├── Multi-account / Multi-entity Mentions (0.10)
    │   └── Profile Complexity Factor (0.20 for combined debts, goals, investments)
    ├── 3. Threshold Evaluation & Strategy Branching
    │   ├── Score < 0.5 & No Force Flag -> Fast Exit (Single Agent Routing)
    │   └── Score >= 0.5 or Force Flag -> Subtask Decomposition Mode
    ├── 4. Decomposition Generation Modes
    │   ├── Mode A: Deterministic Planning (_build_default_subtasks)
    │   │   ├── Specialist Identification via agent_routing
    │   │   ├── De-duplication of Agent Roles
    │   │   └── Natural DAG Dependency Construction
    │   └── Mode B: LLM-Driven Decomposition (_llm_decompose)
    │       ├── Structured JSON Prompting
    │       ├── Plan Extraction & Error Fallback
    │       └── Strict Plan Validation (_validate_decomposition)
    └── 5. Subtask Graph Output
        ├── Structured Subtask Definitions (id, agent, dependencies)
        ├── Execution Status Initialization (Pending)
        └── Hand-off to SubAgentManager

ASCII FLOW
----------
::

    +-------------------------------------------------------------+
    |           User Query + Profile + Conversation Context       |
    +------------------------------+------------------------------+
                                   |
                                   v
    +-------------------------------------------------------------+
    |               compute_complexity_score()                    |
    |  - Domain breadth: 2 domains (+0.15), >=3 domains (+0.30)   |
    |  - Long-term horizon (>1 year / retirement) (+0.15)         |
    |  - Trade-off / competing objectives (+0.10)                 |
    |  - Comprehensive keywords (+0.15)                           |
    |  - Profile signals: active debts + goals + assets (+0.20)   |
    +------------------------------+------------------------------+
                                   |
                                   v
             [Is Score >= 0.50 OR Force Flag Enabled?]
                         /                  \
                       YES                   NO
                       /                      \
                      v                        v
        [use_llm == True?]            +-----------------------+
            /         \               | Return empty subtasks |
          YES          NO             | (Direct single-agent  |
          /             \             | routing executes)     |
         v               v            +-----------------------+
    +--------------+  +--------------------------------+
    | LLM Planner: |  | Deterministic Planner:         |
    | Generate     |  | - select_specialists()         |
    | JSON Plan    |  | - Build independent/dependent  |
    | via Master   |  |   subtasks from domains        |
    +-------+------+  +---------------+----------------+
            |                         |
            v                         |
    +------------------+              |
    | Validate Plan    |              |
    | JSON & schemas   |              |
    +-------+----------+              |
            |                         |
     [Valid JSON Plan?]               |
         /        \                   |
       YES         NO                 |
       /            \                 |
      v              v                |
    (Use Plan)   (Fallback to Det.)   |
      \              /                |
       \            /                 |
        v          v                  |
    +---------------------------------+------------------------+
    | Return { complexity_score, subtasks, decomposition_plan }|
    +----------------------------------------------------------+

Design decisions
----------------
- Complexity scoring is **entirely deterministic** (keyword + regex).
  No LLM call is made for scoring, keeping latency near zero for
  simple requests.
- The workflow can force a targeted plan even when the complexity score is
  below threshold, avoiding a fallback to all specialists.
- Each subtask includes an ``assigned_agent`` field that maps directly
  to a specialist agent name in the workflow graph.
"""

import logging
import re
from threading import Lock
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from graph.state import SubtaskStatus
from utils import create_llm
from utils.agent_routing import domain_scores, routing_text, select_specialists

logger = logging.getLogger(__name__)

# Threshold above which LLM decomposition is triggered.
COMPLEXITY_THRESHOLD = 0.5

# Keywords that signal a comprehensive planning intent.
PLANNING_KEYWORDS = [
    "comprehensive",
    "plan",
    "strategy",
    "roadmap",
    "full analysis",
    "holistic",
    "complete picture",
    "overall",
    "everything",
    "all aspects",
]

# Multi-domain indicator sets -- each tuple is a pair of domain keyword
# groups whose co-occurrence raises complexity.
MULTI_DOMAIN_PATTERNS = [
    (["budget", "save", "savings", "allocation"], ["invest", "portfolio", "stock", "sip"]),
    (["budget", "save", "savings"], ["debt", "loan", "credit card", "emi"]),
    (["invest", "portfolio", "stock"], ["debt", "loan", "repay"]),
]


class TaskDecomposerAgent:
    """Evaluates request complexity and decomposes complex requests into subtasks.

    This agent sits between the master agent's routing decision and the
    specialist agent execution.  For simple requests it is a no-op; for
    complex multi-domain requests it produces a structured decomposition
    plan that the ``SubAgentManager`` executes.
    """

    def __init__(self):
        self._llm = None
        self._llm_lock = Lock()

        self.system_prompt = SystemMessage(
            content=(
                "You are a financial task decomposition assistant. "
                "Given a user's financial request, break it into 2-5 discrete subtasks. "
                "Each subtask must be assigned to exactly one specialist agent. "
                "Respond ONLY with valid JSON -- no markdown fences, no commentary."
            )
        )

    @property
    def llm(self):
        with self._llm_lock:
            if self._llm is None:
                self._llm = create_llm("master")
            return self._llm

    @llm.setter
    def llm(self, value):
        with self._llm_lock:
            self._llm = value

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def decompose(
        self,
        user_input: str,
        user_profile: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        *,
        session_summary: Optional[str] = None,
        force: bool = False,
        use_llm: bool = False,
    ) -> Dict[str, Any]:
        """Evaluate complexity and optionally decompose the request.

        Returns
        -------
        dict
            ``complexity_score`` (float), ``subtasks`` (list of SubtaskDefinition
            dicts), ``decomposition_plan`` (the raw LLM output or None).
        """
        score = self.compute_complexity_score(user_input, user_profile, conversation_history)
        logger.info("Task complexity score: %.2f (threshold %.2f)", score, COMPLEXITY_THRESHOLD)

        if score < COMPLEXITY_THRESHOLD and not force:
            return {
                "complexity_score": score,
                "subtasks": [],
                "decomposition_plan": None,
            }

        if use_llm:
            subtasks, plan = self._llm_decompose(user_input, user_profile, conversation_history)
        else:
            subtasks = self._build_default_subtasks(user_input, user_profile, conversation_history, session_summary)
            plan = {"subtasks": subtasks, "mode": "deterministic", "fallback": False,
                    "rationale": "Run each relevant specialist once; shared profile inputs allow parallel execution."}
        return {
            "complexity_score": score,
            "subtasks": subtasks,
            "decomposition_plan": plan,
        }

    # ------------------------------------------------------------------
    # Deterministic complexity scoring
    # ------------------------------------------------------------------

    def compute_complexity_score(
        self,
        user_input: str,
        user_profile: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> float:
        """Compute a 0.0-1.0 complexity score from deterministic signals.

        Signals evaluated:
        1. Number of distinct financial domains mentioned (0-0.3)
        2. Planning-horizon keywords (>1 year adds 0.15)
        3. Trade-off / competing-goal language (0.1)
        4. Comprehensive-plan keywords (0.15)
        5. Multiple amounts or accounts referenced (0.1)
        6. Profile complexity -- active goals AND debts AND investments (0.2)
        """
        text = (user_input or "").lower().strip()

        # Enrich text with conversation context for keyword matching.
        text_with_context = routing_text(user_input, conversation_history)

        score = 0.0

        # 1. Domain breadth (up to 0.3)
        domains_hit = sum(score > 0 for score in domain_scores(text_with_context).values())
        if domains_hit >= 3:
            score += 0.3
        elif domains_hit == 2:
            score += 0.15

        # 2. Planning horizon > 1 year (0.15)
        long_horizon_patterns = [
            r"\b\d+\s*(?:years?|yrs?)\b",
            r"\bretirement\b",
            r"\blong[\s-]?term\b",
            r"\b\d{4}\b",  # calendar year like 2030
        ]
        for pattern in long_horizon_patterns:
            if re.search(pattern, text_with_context):
                score += 0.15
                break

        # 3. Trade-off / competing goals (0.1)
        tradeoff_patterns = [
            r"\bbut\b",
            r"\bhowever\b",
            r"\bat the same time\b",
            r"\balso\b.*\balso\b",
            r"\bbalance\b.*(?:and|with)\b",
            r"\btrade[\s-]?off\b",
            r"\bprioriti[sz]e\b",
        ]
        if any(re.search(p, text_with_context) for p in tradeoff_patterns):
            score += 0.1

        # 4. Comprehensive-plan keywords (0.15)
        if any(kw in text for kw in PLANNING_KEYWORDS):
            score += 0.15

        # 5. Multiple amounts or accounts (0.1)
        amount_matches = re.findall(r"(?:₹|rs\.?|inr|\$|usd)?\s*\d[\d,]*(?:\.\d+)?", text_with_context)
        if len(amount_matches) >= 3:
            score += 0.1
        elif len(amount_matches) >= 2:
            score += 0.05

        # 6. Profile complexity -- goals AND debts AND investments (0.2)
        if user_profile:
            has_goals = bool(user_profile.get("financial_goals"))
            has_debts = bool(user_profile.get("debts"))
            has_investments = bool(
                user_profile.get("savings", 0) > 0
                or user_profile.get("time_horizon", 0) > 0
            )
            if has_goals and has_debts and has_investments:
                score += 0.2
            elif has_goals and has_debts:
                score += 0.1

        return min(1.0, round(score, 2))

    # ------------------------------------------------------------------
    # LLM decomposition
    # ------------------------------------------------------------------

    def _llm_decompose(
        self,
        user_input: str,
        user_profile: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> tuple:
        """Use the LLM to decompose a complex request into subtasks.

        Returns (subtasks_list, raw_plan_dict).
        """
        profile_summary = self._summarise_profile(user_profile)

        prompt = f"""Decompose the following financial request into 2-5 discrete subtasks.

User request: {user_input}

User profile summary:
{profile_summary}

Available specialist agents:
- income_expense_analyzer: Cash flow, spending trends, anomalies
- budget_planner: Budget allocations, savings plans, expense optimization
- investment_advisor: Portfolio allocation, risk assessment, retirement planning
- debt_optimizer: Repayment strategies, consolidation analysis
- financial_educator: Concept explanations, financial literacy

For each subtask, provide:
- id: a short unique string (e.g. "subtask_001")
- description: what the subtask should accomplish (1-2 sentences)
- assigned_agent: one of the agents listed above
- priority: 1 (highest) to 5 (lowest)
- dependencies: list of subtask ids that must complete first (empty list if none)

Respond with a JSON object: {{"subtasks": [...], "rationale": "..."}}
"""

        fallback_plan = {
            "subtasks": self._build_default_subtasks(user_input, user_profile),
            "rationale": "LLM unavailable; using default decomposition.",
            "fallback": True,
        }

        llm_response, was_fallback = self.llm.invoke_with_fallback(
            [self.system_prompt, HumanMessage(content=prompt)],
            str(fallback_plan),
        )

        if was_fallback:
            logger.warning("LLM decomposition failed; using default subtasks.")
            return fallback_plan["subtasks"], fallback_plan

        raw_content = llm_response.content if hasattr(llm_response, "content") else str(llm_response)
        parsed = self._parse_llm_output(raw_content)

        subtasks_raw = parsed.get("subtasks", [])
        validated_subtasks = self._validate_subtasks(subtasks_raw)

        if not validated_subtasks:
            logger.warning("LLM returned no valid subtasks; using defaults.")
            return fallback_plan["subtasks"], fallback_plan

        return validated_subtasks, {
            "subtasks": validated_subtasks,
            "rationale": parsed.get("rationale", ""),
            "fallback": False,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _summarise_profile(self, user_profile: Optional[Dict[str, Any]]) -> str:
        if not user_profile:
            return "No profile available."
        parts = []
        if user_profile.get("age"):
            parts.append(f"Age: {user_profile['age']}")
        income = user_profile.get("annual_income", 0)
        if income:
            parts.append(f"Annual income: {income:,.0f}")
        debts = user_profile.get("debts", [])
        if debts:
            parts.append(f"Debts: {len(debts)} outstanding")
        goals = user_profile.get("financial_goals", [])
        if goals:
            parts.append(f"Goals: {len(goals)} active")
        if user_profile.get("savings"):
            parts.append(f"Savings: {user_profile['savings']:,.0f}")
        return "; ".join(parts) if parts else "Minimal profile data."

    def _build_default_subtasks(
        self,
        user_input: str,
        user_profile: Optional[Dict[str, Any]],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        session_summary: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Select relevant specialists once, without artificial dependencies."""
        agents = select_specialists(user_input, user_profile, conversation_history, session_summary)
        return [{
            "id": f"subtask_{index:03d}",
            "description": f"Run {agent.replace('_', ' ')} analysis",
            "assigned_agent": agent,
            "priority": 1,
            "dependencies": [],
            "status": SubtaskStatus.PENDING.value,
        } for index, agent in enumerate(agents, 1)]

    def _parse_llm_output(self, raw: str) -> Dict[str, Any]:
        """Parse the LLM's JSON output, tolerating markdown fences."""
        import json

        cleaned = raw.strip()
        # Strip markdown code fences if present.
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            cleaned = "\n".join(lines)

        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            # Attempt to find a JSON object in the text.
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group())
                    return parsed if isinstance(parsed, dict) else {}
                except json.JSONDecodeError:
                    pass
            logger.warning("Failed to parse LLM decomposition output.")
            return {}

    def _validate_subtasks(self, raw_list: List[Any]) -> List[Dict[str, Any]]:
        """Validate and normalise subtask dicts from LLM output."""
        valid_agents = {
            "income_expense_analyzer",
            "budget_planner",
            "investment_advisor",
            "debt_optimizer",
            "financial_educator",
        }
        validated = []
        if not isinstance(raw_list, list):
            return validated
        seen_ids = set()
        seen_agents = set()
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            subtask_id = str(item.get("id", f"subtask_{len(validated)+1:03d}"))
            description = str(item.get("description", ""))
            assigned_agent = str(item.get("assigned_agent", ""))
            if assigned_agent not in valid_agents or assigned_agent in seen_agents or subtask_id in seen_ids:
                continue
            seen_agents.add(assigned_agent)
            seen_ids.add(subtask_id)
            try:
                priority = int(item.get("priority", 2))
            except (TypeError, ValueError):
                priority = 2
            priority = max(1, min(5, priority))
            dependencies = item.get("dependencies", [])
            if not isinstance(dependencies, list):
                dependencies = []

            validated.append({
                "id": subtask_id,
                "description": description,
                "assigned_agent": assigned_agent,
                "priority": priority,
                "dependencies": [str(d) for d in dependencies],
                "status": SubtaskStatus.PENDING.value,
            })

        # Invalid dependency graphs fall back to the deterministic plan.
        completed = set()
        while len(completed) < len(validated):
            ready = {item["id"] for item in validated if item["id"] not in completed
                     and set(item["dependencies"]).issubset(completed)}
            if not ready:
                return []
            completed.update(ready)
        return validated[:5]
