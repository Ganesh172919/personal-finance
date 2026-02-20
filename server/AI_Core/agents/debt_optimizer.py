import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List

from utils import format_currency

logger = logging.getLogger(__name__)


class DebtOptimizerAgent:
    """Optimizes debt repayment strategies and minimizes interest costs."""

    def optimize_repayment(self, debts: List[Dict[str, Any]], user_profile: Dict[str, Any]) -> Dict[str, Any]:
        """Create optimized debt repayment plan."""
        logger.info("Optimizing repayment for %s debts", len(debts))

        try:
            if not debts:
                return self._get_no_debt_response()

            debt_analysis = self._analyze_debt_situation(debts, user_profile)
            snowball_plan = self._calculate_snowball_method(debts, user_profile)
            avalanche_plan = self._calculate_avalanche_method(debts, user_profile)
            optimal_strategy = self._determine_optimal_strategy(snowball_plan, avalanche_plan, user_profile)
            consolidation_analysis = self._analyze_consolidation_options(debts, user_profile)
            recommendations = self._generate_debt_recommendations(
                debts,
                debt_analysis,
                optimal_strategy,
                consolidation_analysis,
                user_profile,
            )

            return {
                "current_debt_situation": debt_analysis,
                "snowball_method": snowball_plan,
                "avalanche_method": avalanche_plan,
                "recommended_strategy": optimal_strategy,
                "consolidation_options": consolidation_analysis,
                "detailed_recommendations": recommendations,
            }
        except Exception as exc:
            logger.error("Error optimizing debt repayment: %s", exc)
            return {"error": str(exc), "detailed_recommendations": "Unable to create debt optimization plan."}

    def _analyze_debt_situation(self, debts: List[Dict[str, Any]], user_profile: Dict[str, Any]) -> Dict[str, Any]:
        total_debt = sum(debt.get("balance", 0) for debt in debts)
        total_minimum_payments = sum(debt.get("minimum_payment", 0) for debt in debts)
        weighted_interest_rate = (
            sum(debt.get("balance", 0) * debt.get("interest_rate", 0) for debt in debts) / total_debt
            if total_debt > 0
            else 0
        )

        monthly_income = user_profile.get("annual_income", 0) / 12
        debt_to_income = (total_minimum_payments / monthly_income * 100) if monthly_income > 0 else 0

        return {
            "total_debt": total_debt,
            "total_minimum_payments": total_minimum_payments,
            "weighted_interest_rate": round(weighted_interest_rate, 2),
            "debt_to_income_ratio": round(debt_to_income, 2),
            "number_of_debts": len(debts),
            "high_interest_debts": len([debt for debt in debts if debt.get("interest_rate", 0) > 10]),
        }

    def _calculate_snowball_method(self, debts: List[Dict[str, Any]], user_profile: Dict[str, Any]) -> Dict[str, Any]:
        sorted_debts = sorted(debts, key=lambda item: item["balance"])

        extra_payment = self._calculate_extra_payment_capacity(user_profile)
        payoff_plan = []
        total_interest = 0.0
        current_month = 0

        for index, debt in enumerate(sorted_debts):
            balance = debt.get("balance", 0)
            interest_rate = debt.get("interest_rate", 0) / 100 / 12
            min_payment = debt.get("minimum_payment", 0)

            if index > 0:
                extra_payment += sorted_debts[index - 1].get("minimum_payment", 0)

            months = 0
            interest_paid = 0.0
            while balance > 0 and months < 600:
                monthly_interest = balance * interest_rate
                total_payment = min_payment + extra_payment
                if total_payment > balance + monthly_interest:
                    total_payment = balance + monthly_interest

                interest_paid += monthly_interest
                balance = balance + monthly_interest - total_payment
                months += 1

            payoff_plan.append(
                {
                    "debt_name": debt.get("name"),
                    "balance": debt.get("balance", 0),
                    "payoff_months": months,
                    "total_interest": round(interest_paid, 2),
                    "payoff_order": index + 1,
                }
            )
            total_interest += interest_paid
            current_month += months

        return {
            "payoff_plan": payoff_plan,
            "total_payoff_time_months": current_month,
            "total_interest_paid": round(total_interest, 2),
            "completion_date": self._calculate_completion_date(current_month),
        }

    def _calculate_avalanche_method(self, debts: List[Dict[str, Any]], user_profile: Dict[str, Any]) -> Dict[str, Any]:
        sorted_debts = sorted(debts, key=lambda item: item.get("interest_rate", 0), reverse=True)

        extra_payment = self._calculate_extra_payment_capacity(user_profile)
        total_interest = 0.0
        current_month = 0

        payoff_plan = []
        active_debts = [dict(debt) for debt in sorted_debts]

        while active_debts and current_month < 600:
            total_monthly_payment = sum(debt.get("minimum_payment", 0) for debt in active_debts) + extra_payment

            focus_debt = active_debts[0]
            focus_payment = total_monthly_payment - sum(
                debt.get("minimum_payment", 0) for debt in active_debts[1:]
            )

            balance = focus_debt.get("balance", 0)
            interest_rate = focus_debt.get("interest_rate", 0) / 100 / 12
            monthly_interest = balance * interest_rate

            if focus_payment > balance + monthly_interest:
                focus_payment = balance + monthly_interest

            balance = balance + monthly_interest - focus_payment
            focus_debt["balance"] = balance
            total_interest += monthly_interest

            if balance <= 0:
                payoff_plan.append(
                    {
                        "debt_name": focus_debt.get("name"),
                        "initial_balance": next(
                            (d.get("balance", 0) for d in debts if d.get("name") == focus_debt.get("name")),
                            0,
                        ),
                        "payoff_months": current_month + 1,
                        "payoff_order": len(payoff_plan) + 1,
                    }
                )
                active_debts.pop(0)

            current_month += 1

        return {
            "payoff_plan": payoff_plan,
            "total_payoff_time_months": current_month,
            "total_interest_paid": round(total_interest, 2),
            "completion_date": self._calculate_completion_date(current_month),
        }

    def _determine_optimal_strategy(
        self,
        snowball: Dict[str, Any],
        avalanche: Dict[str, Any],
        user_profile: Dict[str, Any],
    ) -> Dict[str, Any]:
        snowball_time = snowball.get("total_payoff_time_months", 0)
        avalanche_time = avalanche.get("total_payoff_time_months", 0)
        snowball_interest = snowball.get("total_interest_paid", 0)
        avalanche_interest = avalanche.get("total_interest_paid", 0)

        debt_count = len(user_profile.get("debts", []))
        user_psychology = user_profile.get("risk_tolerance", "moderate")

        if avalanche_interest < snowball_interest and avalanche_time <= snowball_time:
            optimal = "avalanche"
            savings = snowball_interest - avalanche_interest
        else:
            optimal = "snowball"
            savings = avalanche_interest - snowball_interest

        if debt_count > 3 and user_psychology == "conservative":
            optimal = "snowball"

        return {
            "recommended_method": optimal,
            "interest_savings": round(savings, 2),
            "time_savings_months": abs(snowball_time - avalanche_time),
            "rationale": self._get_strategy_rationale(optimal, savings),
        }

    def _analyze_consolidation_options(self, debts: List[Dict[str, Any]], _user_profile: Dict[str, Any]) -> Dict[str, Any]:
        total_debt = sum(debt.get("balance", 0) for debt in debts)
        weighted_rate = (
            sum(debt.get("balance", 0) * debt.get("interest_rate", 0) for debt in debts) / total_debt
            if total_debt > 0
            else 0
        )

        consolidation_options = []
        if total_debt > 5000:
            personal_loan_rate = max(6.0, weighted_rate - 2)
            consolidation_options.append(
                {
                    "type": "Personal Loan",
                    "estimated_rate": personal_loan_rate,
                    "potential_savings": self._calculate_consolidation_savings(debts, personal_loan_rate),
                    "eligibility": "Good credit required",
                    "considerations": "Fixed payments, no collateral needed",
                }
            )

        high_interest_debts = [debt for debt in debts if debt.get("interest_rate", 0) > 15]
        if high_interest_debts:
            consolidation_options.append(
                {
                    "type": "Balance Transfer Card",
                    "estimated_rate": 0.0,
                    "potential_savings": self._calculate_consolidation_savings(high_interest_debts, 0.0),
                    "eligibility": "Good to excellent credit",
                    "considerations": "Introductory period only, transfer fees may apply",
                }
            )

        return {
            "options": consolidation_options,
            "current_weighted_rate": round(weighted_rate, 2),
            "recommended": len(consolidation_options) > 0 and weighted_rate > 8.0,
        }

    def _calculate_extra_payment_capacity(self, user_profile: Dict[str, Any]) -> float:
        income = user_profile.get("annual_income", 0) / 12
        expenses = user_profile.get("monthly_expenses", 0)
        savings = user_profile.get("savings", 0)

        savings_goal = savings * 0.1
        return max(100, min(income * 0.15, (income - expenses) * 0.5, savings_goal))

    def _calculate_completion_date(self, months: int) -> str:
        return (datetime.now() + timedelta(days=months * 30)).strftime("%B %Y")

    def _calculate_consolidation_savings(self, debts: List[Dict[str, Any]], new_rate: float) -> float:
        current_interest = sum(debt.get("balance", 0) * debt.get("interest_rate", 0) / 100 for debt in debts)
        new_interest = sum(debt.get("balance", 0) for debt in debts) * new_rate / 100
        return max(0, current_interest - new_interest)

    def _get_strategy_rationale(self, method: str, savings: float) -> str:
        rationales = {
            "snowball": f"Psychological momentum from quick wins outweighs {format_currency(savings)} in potential savings.",
            "avalanche": f"Mathematically optimal strategy saving approximately {format_currency(savings)} in interest.",
        }
        return rationales.get(method, "Balanced approach considering both math and motivation.")

    def _get_no_debt_response(self) -> Dict[str, Any]:
        return {
            "current_debt_situation": {"total_debt": 0, "debt_to_income_ratio": 0},
            "recommended_strategy": {"recommended_method": "none", "rationale": "No outstanding debts to optimize"},
            "detailed_recommendations": "No outstanding debts. Focus on emergency savings and investing.",
        }

    def _generate_debt_recommendations(
        self,
        debts: List[Dict[str, Any]],
        analysis: Dict[str, Any],
        strategy: Dict[str, Any],
        consolidation: Dict[str, Any],
        user_profile: Dict[str, Any],
    ) -> str:
        """Generate deterministic debt recommendations without specialist LLM calls."""

        monthly_income = user_profile.get("annual_income", 0) / 12
        method = strategy.get("recommended_method", "avalanche")
        interest_savings = strategy.get("interest_savings", 0)
        consolidation_options = consolidation.get("options", [])

        debt_lines = []
        sorted_debts = sorted(debts, key=lambda item: item.get("interest_rate", 0), reverse=True)
        for debt in sorted_debts:
            debt_lines.append(
                f"- {debt.get('name', 'Debt')}: {format_currency(debt.get('balance', 0))} at {debt.get('interest_rate', 0)}% "
                f"(minimum {format_currency(debt.get('minimum_payment', 0))})"
            )

        consolidation_lines = [
            f"- {option.get('type', 'Option')}: est. rate {option.get('estimated_rate', 0)}%, "
            f"potential savings {format_currency(option.get('potential_savings', 0))}"
            for option in consolidation_options[:3]
        ] or ["- No consolidation option is clearly beneficial right now."]

        first_focus = sorted_debts[0].get("name", "highest-interest debt") if sorted_debts else "top priority debt"

        return "\n".join(
            [
                "Debt Optimization Plan (Deterministic)",
                "",
                f"Total debt: {format_currency(analysis.get('total_debt', 0))}",
                f"Debt-to-income ratio: {analysis.get('debt_to_income_ratio', 0)}%",
                f"Weighted rate: {analysis.get('weighted_interest_rate', 0)}%",
                f"Recommended method: {method.upper()}",
                f"Estimated interest savings vs alternative: {format_currency(interest_savings)}",
                "",
                "Debt inventory:",
                *debt_lines,
                "",
                "Step-by-step execution:",
                "1) Pay all minimums on time every month.",
                f"2) Direct all extra payment to {first_focus}.",
                "3) After each payoff, roll freed payment into next target debt.",
                "4) Recalculate plan every month and after income changes.",
                "",
                "Cashflow and risk controls:",
                f"- Monthly income baseline: {format_currency(monthly_income)}",
                "- Keep a basic emergency buffer while accelerating repayment.",
                "- Avoid new high-interest debt while payoff plan is active.",
                "",
                "Consolidation review:",
                *consolidation_lines,
                "",
                "Progress tracking:",
                "- Track total debt balance monthly.",
                "- Track weighted interest rate trend.",
                "- Track months-to-debt-free projection after each payment cycle.",
            ]
        )