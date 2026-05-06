"""
master_agent.py - Master Financial Strategist Agent
====================================================

The ``MasterFinancialStrategistAgent`` is the **coordinator** of the multi-agent
financial advisory system.  It has two primary responsibilities:

1. **Routing** -- Given a user's free-text query, determine which specialist
   agent (income analyser, budget planner, investment advisor, debt optimiser,
   financial educator) should handle it, or whether a comprehensive analysis
   involving all agents is needed.

2. **Synthesis** -- After specialist agents have produced their analyses, the
   master combines them into a single, coherent financial plan.  It optionally
   asks the LLM to polish the deterministic plan into friendlier prose, but
   only if the LLM does not introduce new numbers (a safety guard).

Design philosophy
-----------------
- Routing is **entirely deterministic** (keyword + regex scoring).  No LLM
  call is made during routing, which keeps latency and cost near zero.
- Synthesis follows a **tool-first** approach: the structured plan is built
  deterministically by ``tools.build_plan()``; the LLM is only used to
  rewrite it into markdown prose.  If the LLM introduces new numbers or is
  unavailable, the deterministic markdown is used as-is.
- Tool calls (automation suggestions) are generated deterministically from
  the plan's key metrics.

Key methods
-----------
- ``determine_analysis_type()`` -- deterministic routing (no LLM call)
- ``synthesize_plan()``          -- tool-first synthesis with optional LLM polish
- ``_build_tool_calls()``        -- generate low-risk automation suggestions
"""

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from config import settings
from graph.state import AnalysisType
from tools import PlanInputs, build_plan, render_plan_markdown
from utils import create_llm

logger = logging.getLogger(__name__)


class MasterFinancialStrategistAgent:
    """Coordinates analysis routing and synthesizes the final financial plan.

    This agent sits at the root of the LangGraph workflow.  It receives the
    user's query, decides which specialist(s) should analyse it, and then
    merges their outputs into a single actionable plan.
    """

    def __init__(self):
        # The LLM is used only for optional narrative polish -- not for routing.
        self.llm = create_llm("master")

        self.system_prompt = SystemMessage(
            content=(
                "You are the Master Financial Strategist. "
                "Synthesize deterministic specialist outputs into a clear and actionable plan. "
                "Be concise, practical, and specific."
            )
        )

    def determine_analysis_type(
        self,
        user_input: str,
        user_profile: Dict[str, Any],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        session_summary: Optional[str] = None,
    ) -> AnalysisType:
        """Deterministic keyword/rule-based routing (no LLM call).

        Classifies the user's query into one of the ``AnalysisType`` enum
        values by scoring domain keywords and applying a priority rule-set.

        Routing rules (evaluated in order):
        1. If the query looks educational AND is not personal/action-seeking
           AND has no amounts/timelines -> ``FINANCIAL_EDUCATION``.
        2. If the query is educational but no domain keywords matched ->
           ``FINANCIAL_EDUCATION``.
        3. If the query contains broad-plan phrases ("analyze my finances",
           "comprehensive", etc.) -> ``COMPREHENSIVE``.
        4. If 2+ domain categories matched -> ``COMPREHENSIVE``.
        5. If exactly 1 domain matched -> that domain's analysis type.
        6. If no profile is available -> ``FINANCIAL_EDUCATION`` (can't do
           personalised analysis without data).
        7. Fallback -> ``COMPREHENSIVE``.

        Parameters
        ----------
        user_input : str
            The raw user query.
        user_profile : dict
            The user's financial profile (may be empty/None).
        conversation_history : list[dict], optional
            Prior messages for context on follow-up queries.
        session_summary : str, optional
            A compact summary of the conversation so far.

        Returns
        -------
        AnalysisType
            The determined analysis category.
        """
        text = (user_input or "").lower().strip()
        has_profile = bool(user_profile)

        # --- Context enrichment ---
        # For ambiguous follow-ups like "what about investing?", the previous
        # user message and session summary provide crucial context.  We append
        # them to the query text for keyword matching without making an LLM call.
        context_parts: List[str] = []
        if session_summary:
            context_parts.append(str(session_summary))
        if conversation_history:
            for msg in reversed(conversation_history):
                if str(msg.get("role", "")).lower() == "user" and msg.get("content"):
                    context_parts.append(str(msg.get("content")))
                    break

        text_with_context = f"{text} {' '.join(context_parts)}".strip().lower() if context_parts else text

        # --- Educational intent detection ---
        # These patterns catch general knowledge questions like "what is a
        # mutual fund?" or "explain compound interest".
        education_patterns = [
            r"\bwhat is\b",
            r"\bhow does\b",
            r"\bexplain\b",
            r"\bdefine\b",
            r"\bwhy\b",
        ]

        # --- Personal / action-seeking detection ---
        # Queries containing "my", "should I", "help me", etc. are asking for
        # personalised advice, not general education -- even if they use
        # educational-sounding phrasing.
        def _is_personal_or_action_seeking(prompt: str) -> bool:
            patterns = [
                r"\bmy\b",
                r"\bi\b",
                r"\bi'm\b",
                r"\bim\b",
                r"\bshould i\b",
                r"\bhelp me\b",
                r"\boptimi[sz]e\b",
                r"\bfor me\b",
                r"\bwhat should i\b",
                r"\bcan i\b",
            ]
            return any(re.search(pattern, prompt) for pattern in patterns)

        # --- Amount / timeline detection ---
        # If the user mentions specific numbers (currency amounts, percentages,
        # lakhs/crores, time periods, years), the query is almost certainly
        # about their personal finances -- not a general knowledge question.
        def _has_amounts_or_timelines(prompt: str) -> bool:
            # Indian currency symbols and abbreviations
            if re.search(r"(₹|rs\.?|inr)\s*\d", prompt):
                return True
            # Percentages
            if re.search(r"\b\d+(?:\.\d+)?\s*%\b", prompt):
                return True
            # Indian number units (k, lakh, crore)
            if re.search(r"\b\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|lakhs|cr|crore|crores)\b", prompt):
                return True
            # Time periods
            if re.search(r"\b\d+\s*(?:day|days|week|weeks|month|months|year|years)\b", prompt):
                return True
            # Calendar years (e.g. "2025", "2030")
            if re.search(r"\b(19|20)\d{2}\b", prompt):
                return True

            return False

        # --- Domain keyword scoring ---
        # Each analysis type has a set of keywords.  The query (plus enriched
        # context) is scanned for each keyword and the matching type gets +1.
        # This simple bag-of-words approach works well for financial queries
        # because domain vocabulary is fairly specific.
        domain_keywords = {
            AnalysisType.INCOME_EXPENSE: [
                "expense", "spend", "spending", "income", "cash flow", "cashflow", "transaction",
            ],
            AnalysisType.BUDGET_PLANNING: [
                "budget", "save", "savings", "allocation", "monthly plan", "cut costs",
            ],
            AnalysisType.INVESTMENT_ADVICE: [
                "invest", "portfolio", "stock", "etf", "mutual fund", "retirement", "sip",
            ],
            AnalysisType.DEBT_OPTIMIZATION: [
                "debt", "loan", "credit card", "interest", "repay", "repayment", "emi",
            ],
        }

        scores = {analysis_type: 0 for analysis_type in domain_keywords.keys()}

        for analysis_type, keywords in domain_keywords.items():
            for keyword in keywords:
                if keyword in text_with_context:
                    scores[analysis_type] += 1

        # --- Broad-plan / comprehensive intent detection ---
        # Phrases like "analyze my finances" or "give me a roadmap" signal
        # that the user wants a holistic view, not a single-domain analysis.
        personal_or_comprehensive = any(
            phrase in text
            for phrase in [
                "analyze my", "my finances", "financial plan", "improve my", "overall", "comprehensive",
                "full analysis", "roadmap", "strategy",
            ]
        )

        # Compute final flags
        looks_educational = any(re.search(pattern, text_with_context) for pattern in education_patterns)
        personal_or_action_seeking = _is_personal_or_action_seeking(text)
        has_amounts_or_timelines = _has_amounts_or_timelines(text)

        non_zero_domains = [domain for domain, score in scores.items() if score > 0]
        best_domain = max(scores, key=lambda key: scores[key]) if scores else AnalysisType.COMPREHENSIVE

        # --- Routing decision tree (priority order matters) ---

        # Rule 1: Pure educational query (no personal context, no numbers)
        if looks_educational and not personal_or_action_seeking and not has_amounts_or_timelines:
            return AnalysisType.FINANCIAL_EDUCATION

        # Rule 2: Educational phrasing but no domain keywords matched
        if looks_educational and len(non_zero_domains) == 0:
            return AnalysisType.FINANCIAL_EDUCATION

        # Rule 3: Broad / comprehensive request
        if personal_or_comprehensive:
            return AnalysisType.COMPREHENSIVE

        # Rule 4: Multiple domains matched -> comprehensive
        if len(non_zero_domains) >= 2:
            return AnalysisType.COMPREHENSIVE

        # Rule 5: Exactly one domain matched -> that specialist
        if len(non_zero_domains) == 1:
            return non_zero_domains[0]

        # Rule 6: No profile data available -> can only educate
        if not has_profile:
            return AnalysisType.FINANCIAL_EDUCATION

        # Rule 7: Fallback to best-scoring domain or comprehensive
        return best_domain if scores.get(best_domain, 0) > 0 else AnalysisType.COMPREHENSIVE

    def synthesize_plan(
        self,
        user_profile: Dict[str, Any],
        analyses: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Tool-first synthesis: build a deterministic plan, then optionally
        ask the LLM to polish the prose.

        The synthesis pipeline is:
        1. Filter out analyses that errored.
        2. Call ``tools.build_plan()`` to produce a structured ``Plan`` object
           with executive summary, key metrics, action items, etc.
        3. Render the plan as deterministic markdown via
           ``tools.render_plan_markdown()``.
        4. If narrative mode is enabled, send the markdown to the LLM with
           strict instructions: "improve wording but do NOT change any numbers".
        5. **Number guard** -- compare every numeric token in the LLM output
           against the deterministic version.  If the LLM introduced new
           numbers, discard its output and use the deterministic version.
        6. Return the final markdown plus structured metadata (action type,
           priority, insights, tool calls, plan dict).

        Parameters
        ----------
        user_profile : dict
            The user's financial profile.
        analyses : dict
            Specialist outputs keyed by analysis type (e.g. "income_analysis").
        context : dict, optional
            Session summary, conversation history, and options.

        Returns
        -------
        dict
            A dictionary containing ``response`` (markdown), ``agent``,
            ``actionType``, ``priority``, ``insights``, ``fallback_used``,
            ``plan``, ``tool_calls``, and ``llm_route``.
        """
        logger.info("Master agent synthesizing comprehensive financial plan")

        # Filter out analyses that contain errors (those should not be included in the plan).
        valid_analyses = {k: v for k, v in analyses.items() if v is not None and not v.get("error")}

        # Step 1-2: Build the structured Plan object deterministically.
        inputs = PlanInputs(
            user_profile=user_profile if user_profile else None,
            income_analysis=valid_analyses.get("income_analysis"),
            budget_plan=valid_analyses.get("budget_plan"),
            investment_advice=valid_analyses.get("investment_advice"),
            debt_optimization=valid_analyses.get("debt_optimization"),
        )
        plan = build_plan(inputs)

        # Step 3: Render as deterministic markdown (currency-aware).
        currency_code = "USD"
        candidate_currency = str((user_profile or {}).get("currency") or "").strip().upper()
        if len(candidate_currency) == 3 and candidate_currency.isalpha():
            currency_code = candidate_currency
        deterministic_markdown = render_plan_markdown(plan, currency_code=currency_code)

        # Check if narrative mode is enabled (can be disabled by the caller
        # to skip the LLM polish step and save latency/cost).
        narrative_enabled = True
        if context and isinstance(context, dict):
            options = context.get("options", {})
            if isinstance(options, dict) and options.get("narrative") is False:
                narrative_enabled = False

        final_markdown = deterministic_markdown
        fallback_used = False

        # Step 4-5: Optional LLM narrative polish with number safety guard.
        if narrative_enabled:
            session_summary = ""
            history = []
            if context and isinstance(context, dict):
                session_summary = str(context.get("session_summary") or "")
                history = context.get("conversation_history") if isinstance(context.get("conversation_history"), list) else []

            # The prompt is deliberately strict: the LLM must NOT change,
            # add, or remove any numeric values.  This prevents the LLM from
            # hallucinating different amounts, percentages, or timelines.
            prompt = f"""
Rewrite the following financial plan for clarity and readability.

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

            # invoke_with_fallback returns (response, was_fallback_used).
            # If the LLM is unreachable, the deterministic markdown is returned
            # as the fallback response (llm_fallback_used=True).
            llm_response, llm_fallback_used = self.llm.invoke_with_fallback(
                [self.system_prompt, HumanMessage(content=prompt)],
                deterministic_markdown,
            )

            candidate = llm_response.content if hasattr(llm_response, "content") else str(llm_response)
            candidate = candidate.strip() + "\n"

            # --- Number safety guard ---
            # Extract every numeric token from both the LLM output and the
            # deterministic version.  If the LLM introduced ANY new number
            # that was not in the original, discard its output entirely.
            if llm_fallback_used or not self._numbers_are_subset(candidate, deterministic_markdown):
                if not llm_fallback_used:
                    logger.warning("LLM output introduced new numbers; falling back to deterministic markdown.")
                final_markdown = deterministic_markdown
                fallback_used = True
            else:
                final_markdown = candidate
                fallback_used = False

        return {
            "response": final_markdown,
            "agent": "master",
            "actionType": self._determine_action_type(valid_analyses),
            "priority": self._determine_priority(valid_analyses),
            "insights": self._extract_key_insights(valid_analyses),
            "fallback_used": fallback_used,
            "plan": plan.model_dump(),
            "tool_calls": self._build_tool_calls(plan.model_dump(), user_profile),
            "llm_route": self.llm.get_route_metadata(),
        }

    def _tool_id(self, seed: str) -> str:
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
        return digest[:12]

    def _build_tool_calls(self, plan: Dict[str, Any], user_profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Build deterministic, low-risk tool calls that improve retention and execution.

        These are **suggestions only** -- the client presents them to the user
        and execution always requires explicit confirmation.  All generated
        calls must be safe-by-default (no money movement, no destructive
        actions).

        The same logic exists in ``api_service._build_default_tool_calls()``
        as a fallback when the master agent does not emit tool calls.
        """
        tool_calls: List[Dict[str, Any]] = []

        if not user_profile or not isinstance(user_profile, dict):
            return tool_calls

        # Extract key metrics that drive conditional tool-call generation.
        key_metrics = plan.get("key_metrics") if isinstance(plan, dict) else {}
        monthly_net_cash_flow = None
        emergency_fund_months = None
        total_debt = None

        if isinstance(key_metrics, dict):
            monthly_net_cash_flow = key_metrics.get("monthly_net_cash_flow")
            emergency_fund_months = key_metrics.get("emergency_fund_months")
            total_debt = key_metrics.get("total_debt")

        # 1) Weekly review workflow (always valuable -- consistency habit)
        tool_calls.append(
            {
                "id": self._tool_id("workflow:weekly-review:v1"),
                "title": "Enable weekly money check-in",
                "description": "Creates a weekly automation that adds a short review task so you stay on track.",
                "tool": "workflows.create",
                "requires_confirmation": True,
                "risk": "low",
                "args": {
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
            }
        )

        # 2) Emergency fund top-up reminder (only when runway is low)
        try:
            fund_months = float(emergency_fund_months) if emergency_fund_months is not None else None
        except Exception:
            fund_months = None

        if fund_months is not None and fund_months < 3:
            tool_calls.append(
                {
                    "id": self._tool_id("workflow:emergency-fund-topup:v1"),
                    "title": "Enable emergency fund top-up reminder",
                    "description": "Creates a monthly automation that reminds you to build your emergency fund runway.",
                    "tool": "workflows.create",
                    "requires_confirmation": True,
                    "risk": "low",
                    "args": {
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
                                "expected_impact": "Improves resilience and prevents high-cost debt.",
                                "kind": "cashflow",
                                "due_days": 30,
                            }
                        ],
                    },
                }
            )

        # 3) Debt payoff cadence check (only when debt exists)
        try:
            debt_total = float(total_debt) if total_debt is not None else None
        except Exception:
            debt_total = None

        if debt_total is not None and debt_total > 0:
            tool_calls.append(
                {
                    "id": self._tool_id("workflow:debt-payoff-checkin:v1"),
                    "title": "Enable monthly debt payoff check-in",
                    "description": "Creates a monthly automation that keeps your debt payoff plan moving forward.",
                    "tool": "workflows.create",
                    "requires_confirmation": True,
                    "risk": "low",
                    "args": {
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
                }
            )

        # 4) Transaction review loop (only when cash flow is negative)
        try:
            net_flow = float(monthly_net_cash_flow) if monthly_net_cash_flow is not None else None
        except Exception:
            net_flow = None

        if net_flow is not None and net_flow < 0:
            tool_calls.append(
                {
                    "id": self._tool_id("workflow:transaction-created-review:v1"),
                    "title": "Enable new-transaction review (event trigger)",
                    "description": "Creates an automation that adds a short review task when you add a new transaction.",
                    "tool": "workflows.create",
                    "requires_confirmation": True,
                    "risk": "low",
                    "args": {
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
                }
            )

        return tool_calls[:5]

    def _numbers_are_subset(self, candidate: str, reference: str) -> bool:
        """Check that every number in *candidate* already exists in *reference*.

        Used by the number safety guard: the LLM is allowed to omit numbers
        but not to introduce new ones.
        """
        reference_nums = self._extract_numbers(reference)
        candidate_nums = self._extract_numbers(candidate)
        return candidate_nums.issubset(reference_nums)

    def _extract_numbers(self, text: str) -> set[str]:
        """Extract and normalise all numeric tokens from a string.

        Captures integers, decimals, comma-separated thousands, and optional
        currency/percentage suffixes.  Normalises by stripping the rupee sign
        and commas so that "₹1,00,000" and "100000" compare as equal.
        """
        tokens = re.findall(r"₹?\d[\d,]*(?:\.\d+)?%?", text)
        normalized = set()
        for token in tokens:
            normalized.add(token.replace("₹", "").replace(",", ""))
        return normalized

    def _determine_action_type(self, analyses: Dict[str, Any]) -> str:
        """Map the set of completed analyses to a single action type string.

        The action type tells the frontend which primary CTA to show.
        Priority order: debt > investment > budget > income > review.
        """
        if "debt_optimization" in analyses:
            return "manage_debt"
        if "investment_advice" in analyses:
            return "invest"
        if "budget_plan" in analyses:
            return "review_budget"
        if "income_analysis" in analyses:
            return "optimize_spending"
        return "review"

    def _determine_priority(self, analyses: Dict[str, Any]) -> str:
        """Determine the urgency level of the financial plan.

        - **high**   -- debt-to-income > 40% or savings rate is negative
        - **medium** -- savings rate below 10%
        - **low**    -- everything else
        """
        if "debt_optimization" in analyses:
            debt_ratio = analyses["debt_optimization"].get("current_debt_situation", {}).get("debt_to_income_ratio", 0)
            if debt_ratio > 40:
                return "high"

        if "income_analysis" in analyses:
            savings_rate = analyses["income_analysis"].get("summary_metrics", {}).get("savings_rate", 0)
            if savings_rate < 0:
                return "high"
            if savings_rate < 10:
                return "medium"

        return "low"

    def _extract_key_insights(self, analyses: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract one headline insight per completed analysis.

        Each insight is a small dict with ``agent``, ``title``,
        ``description``, and ``actionType``.  The frontend uses these to
        render summary cards above the full plan.
        """
        insights = []

        for analysis_type, analysis_data in analyses.items():
            if not analysis_data or analysis_data.get("error"):
                continue

            try:
                insight = None

                if analysis_type == "income_analysis":
                    summary_metrics = analysis_data.get("summary_metrics", {})
                    net_flow = summary_metrics.get("net_cash_flow", 0) if isinstance(summary_metrics, dict) else 0
                    insight = {
                        "agent": "income_expense_analyzer",
                        "title": "Cash Flow Analysis",
                        "description": f"Monthly net cash flow: INR {net_flow:,.2f}",
                        "actionType": "optimize_spending" if net_flow < 0 else "increase_savings",
                    }

                elif analysis_type == "budget_plan":
                    savings_rate = analysis_data.get("savings_rate", 0)
                    insight = {
                        "agent": "budget_planner",
                        "title": "Budget Optimization",
                        "description": f"Current savings rate: {float(savings_rate):.1f}%",
                        "actionType": "review_budget",
                    }

                elif analysis_type == "investment_advice":
                    risk_profile = str(analysis_data.get("risk_profile", "moderate"))
                    insight = {
                        "agent": "investment_advisor",
                        "title": "Investment Strategy",
                        "description": f"Recommended {risk_profile} portfolio",
                        "actionType": "invest",
                    }

                elif analysis_type == "debt_optimization":
                    strategy = analysis_data.get("recommended_strategy", {}).get("recommended_method", "snowball")
                    insight = {
                        "agent": "debt_optimizer",
                        "title": "Debt Management",
                        "description": f"Use {strategy} method for optimized repayment",
                        "actionType": "manage_debt",
                    }

                if insight:
                    insights.append(insight)

            except Exception as exc:
                logger.warning("Error extracting insight from %s: %s", analysis_type, exc)

        return insights

    def _prepare_synthesis_data(self, user_profile: Dict[str, Any], analyses: Dict[str, Any]) -> Dict[str, str]:
        return {
            "user_profile": self._format_user_profile_for_synthesis(user_profile),
            "analyses_summary": self._format_analyses_summary(analyses),
            "key_metrics": self._extract_key_metrics(analyses, user_profile),
        }

    def _format_user_profile_for_synthesis(self, user_profile: Dict[str, Any]) -> str:
        if not user_profile:
            return "No user profile available."

        lines = []
        if user_profile.get("age"):
            lines.append(f"Age: {user_profile['age']}")

        income = float(user_profile.get("annual_income", 0))
        expenses = float(user_profile.get("monthly_expenses", 0)) * 12
        savings = float(user_profile.get("savings", 0))

        lines.append(f"Annual Income: INR {income:,.2f}")
        lines.append(f"Annual Expenses: INR {expenses:,.2f}")
        lines.append(f"Current Savings: INR {savings:,.2f}")

        debts = user_profile.get("debts", [])
        if debts:
            total_debt = sum(float(debt.get("balance", 0)) for debt in debts)
            lines.append(f"Total Debt: INR {total_debt:,.2f}")

        goals = user_profile.get("financial_goals", [])
        if goals:
            lines.append("Financial Goals:")
            for goal in goals:
                lines.append(
                    f"- {goal.get('name', 'Goal')}: INR {float(goal.get('target', 0)):,.2f} "
                    f"in {int(goal.get('timeline_months', 0))} months"
                )

        return "\n".join(lines)

    def _format_analyses_summary(self, analyses: Dict[str, Any]) -> str:
        summary_parts = []

        for analysis_type, analysis_data in analyses.items():
            if analysis_data and not analysis_data.get("error"):
                key_insight = self._extract_key_insight(analysis_type, analysis_data)
                if key_insight:
                    summary_parts.append(f"- {analysis_type.replace('_', ' ').title()}: {key_insight}")

        return "\n".join(summary_parts) if summary_parts else "No detailed analyses available"

    def _extract_key_insight(self, analysis_type: str, analysis_data: Dict[str, Any]) -> str:
        if analysis_type == "income_analysis":
            net_cash_flow = analysis_data.get("summary_metrics", {}).get("net_cash_flow", 0)
            return f"Net cash flow: INR {float(net_cash_flow):,.2f} monthly"

        if analysis_type == "budget_plan":
            savings_target = analysis_data.get("savings_plan", {}).get("total_monthly_savings", 0)
            return f"Recommended monthly goal savings: INR {float(savings_target):,.2f}"

        if analysis_type == "investment_advice":
            risk_profile = analysis_data.get("risk_profile", "moderate")
            return f"Risk-aligned {risk_profile} allocation"

        if analysis_type == "debt_optimization":
            strategy = analysis_data.get("recommended_strategy", {}).get("recommended_method", "snowball")
            return f"Optimal payoff method: {strategy}"

        return "Analysis completed"

    def _extract_key_metrics(self, analyses: Dict[str, Any], user_profile: Dict[str, Any]) -> str:
        metrics: List[str] = []

        if "income_analysis" in analyses:
            income_data = analyses["income_analysis"]
            net_cash_flow = income_data.get("summary_metrics", {}).get("net_cash_flow", 0)
            savings_rate = income_data.get("summary_metrics", {}).get("savings_rate", 0)
            metrics.append(f"Monthly Net Cash Flow: INR {float(net_cash_flow):,.2f}")
            metrics.append(f"Savings Rate: {float(savings_rate):.1f}%")

        if "budget_plan" in analyses:
            budget_data = analyses["budget_plan"]
            monthly_goal_savings = budget_data.get("savings_plan", {}).get("total_monthly_savings", 0)
            metrics.append(f"Monthly Goal Savings Need: INR {float(monthly_goal_savings):,.2f}")

        if user_profile and "debt_optimization" in analyses:
            debt_data = analyses["debt_optimization"]
            total_debt = debt_data.get("current_debt_situation", {}).get("total_debt", 0)
            metrics.append(f"Total Debt: INR {float(total_debt):,.2f}")

        return "\n".join(metrics) if metrics else "Key metrics unavailable"

    def _format_final_output(self, raw_plan: str, analyses: Dict[str, Any]) -> str:
        header = "FINANCIAL PLAN\n" + "=" * 50 + "\n\n"
        sources = ", ".join(key.replace("_", " ") for key in analyses.keys())
        footer = f"\n\nSources: {sources}" if sources else ""
        return header + raw_plan + footer

    def _create_fallback_plan(self, analyses: Dict[str, Any]) -> str:
        plan_parts = ["AI narrative is temporarily unavailable. Use this deterministic plan:"]

        if "income_analysis" in analyses:
            net_flow = analyses["income_analysis"].get("summary_metrics", {}).get("net_cash_flow", 0)
            plan_parts.append(f"- Monthly net cash flow: INR {float(net_flow):,.2f}")

        if "budget_plan" in analyses:
            monthly_goal_savings = analyses["budget_plan"].get("savings_plan", {}).get("total_monthly_savings", 0)
            plan_parts.append(f"- Target monthly goal savings: INR {float(monthly_goal_savings):,.2f}")

        if "debt_optimization" in analyses:
            method = analyses["debt_optimization"].get("recommended_strategy", {}).get("recommended_method", "avalanche")
            plan_parts.append(f"- Debt repayment method: {method}")

        if "investment_advice" in analyses:
            risk_profile = analyses["investment_advice"].get("risk_profile", "moderate")
            plan_parts.append(f"- Portfolio risk profile: {risk_profile}")

        plan_parts.extend(
            [
                "",
                "Immediate next steps:",
                "1. Keep expenses below income each month",
                "2. Protect emergency savings",
                "3. Prioritize high-interest debt",
                "4. Invest consistently in diversified assets",
            ]
        )

        return "\n".join(plan_parts)


# ============================================================================
# END-OF-FILE SUMMARY -- master_agent.py
# ============================================================================
# Key takeaways:
#
# 1. The master agent is the **traffic controller** of the multi-agent system.
#    It decides which specialist handles each query (routing) and merges their
#    outputs into a single plan (synthesis).
#
# 2. Routing is **100% deterministic** -- keyword scoring + regex patterns.
#    No LLM call is made, keeping latency under 1ms and cost at zero.
#
# 3. Synthesis is **tool-first**: the structured plan is built by
#    ``tools.build_plan()`` before any LLM call.  The LLM only rewrites
#    prose; if it introduces new numbers, its output is discarded.
#
# 4. The **number safety guard** (``_numbers_are_subset``) is a critical
#    defence against LLM hallucination of financial figures.  It extracts
#    every numeric token and verifies the LLM output is a subset of the
#    deterministic version.
#
# 5. Tool calls (automation suggestions) are generated deterministically
#    from the plan's key metrics and are always low-risk, requiring user
#    confirmation before execution.
# ============================================================================
