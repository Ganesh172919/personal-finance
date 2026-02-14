from langchain_core.messages import SystemMessage, HumanMessage
from typing import Dict, Any, List
import logging
import re

from config import settings
from graph.state import AnalysisType
from utils import RateLimitedLLM

logger = logging.getLogger(__name__)


class MasterFinancialStrategistAgent:
    """Coordinates analysis routing and synthesizes the final plan."""

    def __init__(self):
        self.llm = RateLimitedLLM(
            model=settings.MODEL_NAME,
            temperature=settings.get_agent_config("master")["temperature"],
        )

        self.system_prompt = SystemMessage(
            content=(
                "You are the Master Financial Strategist. "
                "Synthesize deterministic specialist outputs into a clear and actionable plan. "
                "Be concise, practical, and specific."
            )
        )

    def determine_analysis_type(self, user_input: str, user_profile: Dict[str, Any]) -> AnalysisType:
        """Deterministic keyword/rule-based routing (no LLM call)."""
        text = (user_input or "").lower().strip()
        has_profile = bool(user_profile)

        # General educational intent detection
        education_patterns = [
            r"\bwhat is\b",
            r"\bhow does\b",
            r"\bexplain\b",
            r"\bdefine\b",
            r"\bwhy\b",
        ]

        # Domain scoring
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
                if keyword in text:
                    scores[analysis_type] += 1

        # Personal intent and broad-plan intent
        personal_or_comprehensive = any(
            phrase in text
            for phrase in [
                "analyze my", "my finances", "financial plan", "improve my", "overall", "comprehensive",
                "full analysis", "roadmap", "strategy",
            ]
        )

        looks_educational = any(re.search(pattern, text) for pattern in education_patterns)

        non_zero_domains = [domain for domain, score in scores.items() if score > 0]
        best_domain = max(scores, key=lambda key: scores[key]) if scores else AnalysisType.COMPREHENSIVE

        # Rules
        if looks_educational and not has_profile and not non_zero_domains:
            return AnalysisType.FINANCIAL_EDUCATION

        if looks_educational and len(non_zero_domains) == 0:
            return AnalysisType.FINANCIAL_EDUCATION

        if personal_or_comprehensive:
            return AnalysisType.COMPREHENSIVE

        if len(non_zero_domains) >= 2:
            return AnalysisType.COMPREHENSIVE

        if len(non_zero_domains) == 1:
            return non_zero_domains[0]

        if not has_profile:
            return AnalysisType.FINANCIAL_EDUCATION

        return best_domain if scores.get(best_domain, 0) > 0 else AnalysisType.COMPREHENSIVE

    def synthesize_plan(self, user_profile: Dict[str, Any], analyses: Dict[str, Any]) -> Dict[str, Any]:
        """Synthesize specialist outputs into one cohesive plan using one LLM call."""
        logger.info("Master agent synthesizing comprehensive financial plan")

        valid_analyses = {k: v for k, v in analyses.items() if v is not None and not v.get("error")}

        if not valid_analyses:
            return {
                "response": "I could not assemble enough analysis to build a personalized plan right now.",
                "agent": "master",
                "actionType": "review",
                "priority": "medium",
                "insights": [],
                "fallback_used": True,
            }

        synthesis_data = self._prepare_synthesis_data(user_profile, valid_analyses)

        prompt = f"""
Create a clear financial plan from the deterministic specialist outputs below.

USER PROFILE:
{synthesis_data['user_profile']}

SPECIALIST OUTPUT SUMMARY:
{synthesis_data['analyses_summary']}

KEY METRICS:
{synthesis_data['key_metrics']}

Return sections:
1. Executive summary
2. Immediate actions (next 30 days)
3. 3-6 month priorities
4. 12-month roadmap
5. Risks and safeguards
6. Tracking metrics

Use practical language and specific numbers when available.
"""

        fallback_plan = self._create_fallback_plan(valid_analyses)
        llm_response, fallback_used = self.llm.invoke_with_fallback(
            [self.system_prompt, HumanMessage(content=prompt)],
            fallback_plan,
        )

        synthesized_text = llm_response.content if hasattr(llm_response, "content") else str(llm_response)

        return {
            "response": self._format_final_output(synthesized_text, valid_analyses),
            "agent": "master",
            "actionType": self._determine_action_type(valid_analyses),
            "priority": self._determine_priority(valid_analyses),
            "insights": self._extract_key_insights(valid_analyses),
            "fallback_used": fallback_used,
        }

    def _determine_action_type(self, analyses: Dict[str, Any]) -> str:
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
