import logging
from typing import Any, Dict

from tools import FinancialCalculators, RiskProfile
from utils import format_currency

logger = logging.getLogger(__name__)


class InvestmentAdvisorAgent:
    """Provides personalized investment advice and portfolio recommendations."""

    def __init__(self):
        self.calculators = FinancialCalculators()

    def provide_advice(self, user_profile: Dict[str, Any]) -> Dict[str, Any]:
        """Provide comprehensive investment advice."""
        logger.info("Generating investment advice for user profile")

        try:
            risk_profile = self._assess_risk_profile(user_profile)
            strategy = self._create_investment_strategy(user_profile, risk_profile)
            portfolio = self._create_portfolio_allocation(risk_profile, user_profile)
            recommendations = self._generate_investment_recommendations(
                user_profile, risk_profile, strategy, portfolio
            )

            return {
                "risk_profile": risk_profile.value,
                "investment_strategy": strategy,
                "portfolio_allocation": portfolio,
                "recommendations": recommendations,
                "expected_returns": self._calculate_expected_returns(portfolio, risk_profile),
                "time_horizon": user_profile.get("time_horizon", 10),
            }
        except Exception as exc:
            logger.error("Error generating investment advice: %s", exc)
            return {"error": str(exc), "recommendations": "Unable to generate investment advice."}

    def _assess_risk_profile(self, user_profile: Dict[str, Any]) -> RiskProfile:
        age = user_profile.get("age", 30)
        risk_tolerance = user_profile.get("risk_tolerance", "moderate")
        investment_experience = user_profile.get("investment_experience", "beginner")
        time_horizon = user_profile.get("time_horizon", 10)

        return self.calculators.assess_risk_profile(
            age=age,
            investment_experience=investment_experience,
            time_horizon=time_horizon,
            risk_tolerance=risk_tolerance,
        )

    def _create_investment_strategy(
        self,
        user_profile: Dict[str, Any],
        risk_profile: RiskProfile,
    ) -> Dict[str, Any]:
        age = user_profile.get("age", 30)
        time_horizon = user_profile.get("time_horizon", 10)

        strategies = {
            RiskProfile.CONSERVATIVE: {
                "name": "Capital Preservation",
                "focus": "Low-risk income generation and principal protection",
                "approach": "Income-focused with bond-heavy allocation",
                "rebalancing": "Semi-annual rebalancing with risk controls",
            },
            RiskProfile.MODERATE: {
                "name": "Balanced Growth",
                "focus": "Balanced approach between growth and income",
                "approach": "60-70% equities with diversified bond exposure",
                "rebalancing": "Semi-annual rebalancing with tactical adjustments",
            },
            RiskProfile.AGGRESSIVE: {
                "name": "Growth Maximization",
                "focus": "Long-term capital appreciation",
                "approach": "80-90% equities with growth focus",
                "rebalancing": "Quarterly review with strategic tilts",
            },
        }

        strategy = dict(strategies.get(risk_profile, strategies[RiskProfile.MODERATE]))
        if age < 40 and time_horizon > 15:
            strategy["approach"] = "More aggressive growth orientation"
        elif age > 55:
            strategy["approach"] = "More conservative capital preservation"

        return strategy

    def _create_portfolio_allocation(
        self,
        risk_profile: RiskProfile,
        user_profile: Dict[str, Any],
    ) -> Dict[str, float]:
        base_allocations = {
            RiskProfile.CONSERVATIVE: {
                "Domestic Equity": 25.0,
                "International Equity": 10.0,
                "Bonds": 50.0,
                "Real Assets": 10.0,
                "Cash": 5.0,
            },
            RiskProfile.MODERATE: {
                "Domestic Equity": 45.0,
                "International Equity": 20.0,
                "Bonds": 25.0,
                "Real Assets": 7.0,
                "Cash": 3.0,
            },
            RiskProfile.AGGRESSIVE: {
                "Domestic Equity": 55.0,
                "International Equity": 25.0,
                "Bonds": 12.0,
                "Real Assets": 5.0,
                "Cash": 3.0,
            },
        }

        allocation = dict(base_allocations.get(risk_profile, base_allocations[RiskProfile.MODERATE]))

        if user_profile.get("investment_experience") == "expert":
            allocation["Domestic Equity"] = max(0.0, allocation["Domestic Equity"] - 5.0)
            allocation["Alternatives"] = 5.0

        return allocation

    def _calculate_expected_returns(
        self,
        portfolio: Dict[str, float],
        risk_profile: RiskProfile,
    ) -> Dict[str, float]:
        asset_returns = {
            "Domestic Equity": 9.0,
            "International Equity": 7.5,
            "Bonds": 4.5,
            "Real Assets": 6.0,
            "Cash": 2.0,
            "Alternatives": 8.0,
        }

        total_return = 0.0
        for asset, allocation in portfolio.items():
            if asset in asset_returns:
                total_return += (allocation / 100) * asset_returns[asset]

        risk_adjustments = {
            RiskProfile.CONSERVATIVE: -1.0,
            RiskProfile.MODERATE: 0.0,
            RiskProfile.AGGRESSIVE: 0.5,
        }
        adjusted_return = total_return + risk_adjustments.get(risk_profile, 0.0)

        return {
            "expected_annual_return": round(adjusted_return, 2),
            "inflation_adjusted_return": round(adjusted_return - 2.5, 2),
            "compounded_5yr": round(((1 + adjusted_return / 100) ** 5 - 1) * 100, 2),
            "compounded_10yr": round(((1 + adjusted_return / 100) ** 10 - 1) * 100, 2),
        }

    def _generate_investment_recommendations(
        self,
        user_profile: Dict[str, Any],
        risk_profile: RiskProfile,
        strategy: Dict[str, Any],
        portfolio: Dict[str, float],
    ) -> str:
        """Generate deterministic investment guidance without specialist LLM calls."""

        age = user_profile.get("age", 30)
        time_horizon = user_profile.get("time_horizon", 10)
        experience = user_profile.get("investment_experience", "beginner")

        portfolio_lines = [f"- {asset}: {allocation:.1f}%" for asset, allocation in portfolio.items()]
        goals = user_profile.get("financial_goals", [])
        goal_lines = [
            f"- {goal.get('name', 'Goal')}: {format_currency(goal.get('target', 0))}"
            for goal in goals[:4]
        ] or ["- No explicit long-term goal provided yet."]

        vehicle_guidance = {
            RiskProfile.CONSERVATIVE: [
                "- Core: short-duration bond funds and high-quality debt funds.",
                "- Equity sleeve: broad-market index funds kept limited.",
            ],
            RiskProfile.MODERATE: [
                "- Core: diversified index funds (domestic + international).",
                "- Stability: investment-grade bond funds for drawdown control.",
            ],
            RiskProfile.AGGRESSIVE: [
                "- Core: broad-market equity index funds plus growth tilt.",
                "- Stability buffer: small bond/cash bucket for volatility periods.",
            ],
        }

        rebalance = "Quarterly review, rebalance if any asset drifts by >5 percentage points."
        if risk_profile == RiskProfile.CONSERVATIVE:
            rebalance = "Semi-annual review, rebalance if drift exceeds 4 percentage points."

        return "\n".join(
            [
                "Investment Recommendation (Deterministic)",
                "",
                f"Profile: age {age}, risk {risk_profile.value}, horizon {time_horizon} years, experience {experience}.",
                f"Strategy: {strategy.get('name', 'Balanced')} - {strategy.get('focus', 'Long-term growth with risk control')}",
                "",
                "Target allocation:",
                *portfolio_lines,
                "",
                "Suggested vehicle mix:",
                *vehicle_guidance.get(risk_profile, vehicle_guidance[RiskProfile.MODERATE]),
                "- Keep fees low and prefer diversified index-style exposure.",
                "",
                "Risk controls:",
                "- Maintain emergency fund before increasing risk assets.",
                "- Avoid concentration in single stocks/sectors >10% of portfolio.",
                "- Increase safe assets as major goal deadlines get closer.",
                "",
                "Rebalancing:",
                f"- {rebalance}",
                "",
                "Tax/implementation notes:",
                "- Use tax-advantaged options first where available.",
                "- Automate monthly investing (SIP style) to reduce timing risk.",
                "",
                "Current goals:",
                *goal_lines,
            ]
        )