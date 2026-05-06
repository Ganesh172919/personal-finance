"""
income_expense_analyzer.py - Income & Expense Analyzer Agent
=============================================================

The ``IncomeExpenseAnalyzerAgent`` performs a comprehensive analysis of a
user's transaction history, categorising income vs. expenses, detecting
spending trends, identifying anomalies, and computing key financial
metrics (savings rate, cash flow, fixed vs. discretionary ratio).

Key responsibilities
--------------------
- Categorise transactions into income, expenses, investments, transfers.
- Analyse spending trends over time (monthly breakdown).
- Detect anomalous transactions using z-score statistical method.
- Identify recurring income/expense patterns.
- Compute a financial health score (0-100) based on savings rate,
  cash flow, and fixed expense ratio.
- Generate deterministic insight text (no LLM calls).

Design decisions
----------------
- Uses ``pandas`` for efficient groupby/aggregate operations on
  transaction DataFrames.
- The ``_serialize_dict`` helper ensures all outputs are JSON-safe
  (converts pandas Series/DataFrames to plain dicts/lists).
- Financial health scoring uses a weighted point system: savings rate
  contributes up to 30 points, cash flow +/- 15-20, fixed expense
  ratio +/- 10-20, plus bonuses for detected strengths/concerns.
"""

import logging
from typing import Any, Dict, List

import pandas as pd
from dateutil.parser import parse as parse_date

from tools import DataProcessor, FinancialCalculators

logger = logging.getLogger(__name__)


class IncomeExpenseAnalyzerAgent:
    """Comprehensive income and expense analysis with trend detection and optimization insights.

    This agent is part of the multi-agent financial advisory system.
    It receives a list of transaction dicts and returns a structured
    analysis with metrics, patterns, insights, and a health score.
    """

    def __init__(self):
        self.data_processor = DataProcessor()
        self.calculators = FinancialCalculators()
    # ============================================================
    # === MAIN ENTRYPOINT ========================================
    # ============================================================
    def analyze_finances(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Comprehensive analysis of income, expenses, and financial health"""
        logger.info(f"Analyzing {len(transactions)} transactions for financial insights")

        try:
            if not transactions:
                return self._get_empty_analysis_response()

            categorized_data = self._process_transactions(transactions)
            financial_metrics = self._calculate_financial_metrics(categorized_data)
            patterns = self._detect_financial_patterns(categorized_data, financial_metrics)
            insights = self._generate_comprehensive_insights(categorized_data, financial_metrics, patterns)

            result = {
                "categorized_data": categorized_data,
                "financial_metrics": financial_metrics,
                "patterns_detected": patterns,
                "insights": insights,
                "summary_metrics": self._create_summary_metrics(financial_metrics, patterns),
                "health_score": self._calculate_financial_health_score(financial_metrics, patterns)
            }

            # JSON-safe return
            return self._serialize_dict(result)

        except Exception as e:
            logger.error(f"Error in financial analysis: {str(e)}", exc_info=True)
            return self._get_error_analysis_response(str(e))

    # ============================================================
    # === CORE PROCESSING ========================================
    # ============================================================
    def _process_transactions(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Process and categorize transactions with detailed analysis"""
        categorized = self.data_processor.categorize_transactions(transactions)
        spending_trends = self.data_processor.analyze_spending_trends(transactions, "monthly")
        anomalies = self.data_processor.detect_anomalies(transactions)
        category_analysis = self._analyze_categories(categorized)
        recurring = self._identify_recurring_transactions(transactions)

        data = {
            "categorized_transactions": categorized,
            "spending_trends": spending_trends,
            "anomalies": anomalies,
            "category_analysis": category_analysis,
            "recurring_transactions": recurring,
            "time_period_analysis": self._analyze_time_periods(transactions)
        }

        return self._serialize_dict(data)

    def _analyze_categories(self, categorized: Dict[str, List[Dict]]) -> Dict[str, float]:
        """Analyze spending by category with percentages"""
        total_expenses = sum(abs(t.get('amount', 0)) for t in categorized.get('expenses', []))
        category_totals = {}
        for transaction in categorized.get('expenses', []):
            cat = str(transaction.get('category', 'Uncategorized'))
            category_totals[cat] = category_totals.get(cat, 0) + abs(transaction.get('amount', 0))
        return {k: round((v / total_expenses) * 100, 1) for k, v in category_totals.items()} if total_expenses > 0 else {}

    def _identify_recurring_transactions(self, transactions: List[Dict[str, Any]]) -> Dict[str, List[Dict]]:
        """Identify recurring income and expense patterns"""
        recurring = {"income": [], "expenses": []}
        groups = {}
        for t in transactions:
            key = f"{t.get('description', '').lower()}_{abs(t.get('amount', 0))}"
            groups.setdefault(key, []).append(t)

        for key, group in groups.items():
            if len(group) >= 2:
                first = group[0]
                t_type = "income" if first.get('amount', 0) > 0 else "expenses"
                recurring[t_type].append({
                    "description": str(first.get('description', 'Unknown')),
                    "amount": float(abs(first.get('amount', 0))),
                    "frequency": "monthly",
                    "occurrences": len(group),
                    "last_date": str(max(t.get('date', '') for t in group))
                })
        return recurring

    def _analyze_time_periods(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze financial patterns across different months"""
        if not transactions:
            return {}

        monthly_data = {}
        for t in transactions:
            try:
                date = parse_date(str(t.get('date', '')))
                key = date.strftime("%Y-%m")
                amt = float(t.get('amount', 0))
                monthly_data.setdefault(key, {"income": 0.0, "expenses": 0.0})
                if amt > 0:
                    monthly_data[key]["income"] += amt
                else:
                    monthly_data[key]["expenses"] += abs(amt)
            except Exception:
                continue

        return {
            "monthly_breakdown": monthly_data,
            "analysis_period": f"{min(monthly_data.keys())} to {max(monthly_data.keys())}" if monthly_data else "",
            "months_analyzed": len(monthly_data)
        }

    # ============================================================
    # === METRICS, PATTERNS, LLM INSIGHTS ========================
    # ============================================================
    def _calculate_financial_metrics(self, categorized_data: Dict[str, Any]) -> Dict[str, float]:
        categorized = categorized_data.get("categorized_transactions", {})
        total_income = sum(t.get('amount', 0) for t in categorized.get('income', []) if t.get('amount', 0) > 0)
        total_expenses = sum(abs(t.get('amount', 0)) for t in categorized.get('expenses', []) if t.get('amount', 0) < 0)
        net_cash_flow = total_income - total_expenses
        savings_rate = (net_cash_flow / total_income * 100) if total_income > 0 else 0

        recurring_exp = categorized_data.get("recurring_transactions", {}).get("expenses", [])
        fixed_exp = sum(e.get("amount", 0) for e in recurring_exp)
        discretionary = total_expenses - fixed_exp
        fixed_ratio = (fixed_exp / total_income * 100) if total_income > 0 else 0
        disc_ratio = (discretionary / total_income * 100) if total_income > 0 else 0

        months = len(categorized_data.get("time_period_analysis", {}).get("monthly_breakdown", {})) or 1
        return {
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "savings_rate": round(savings_rate, 1),
            "fixed_expenses": round(fixed_exp, 2),
            "discretionary_expenses": round(discretionary, 2),
            "fixed_expense_ratio": round(fixed_ratio, 1),
            "discretionary_ratio": round(disc_ratio, 1),
            "average_monthly_income": round(total_income / months, 2),
            "average_monthly_expenses": round(total_expenses / months, 2)
        }

    def _detect_financial_patterns(self, categorized_data: Dict[str, Any], metrics: Dict[str, float]) -> Dict[str, Any]:
        """Detect spending strengths, concerns, opportunities"""
        patterns = {"strengths": [], "concerns": [], "opportunities": [], "anomalies": categorized_data.get("anomalies", [])}

        sr = metrics.get("savings_rate", 0)
        if sr >= 20:
            patterns["strengths"].append("Excellent savings rate (>=20%)")
        elif sr >= 10:
            patterns["strengths"].append("Good savings rate (10-20%)")
        elif sr < 0:
            patterns["concerns"].append("Negative savings rate - spending exceeds income")

        fr = metrics.get("fixed_expense_ratio", 0)
        if fr > 50:
            patterns["concerns"].append("High fixed expenses (>50% of income)")
        elif fr < 30:
            patterns["strengths"].append("Low fixed expenses (<30% of income)")

        for cat, pct in categorized_data.get("category_analysis", {}).items():
            if pct > 30:
                patterns["concerns"].append(f"High spending in {cat} ({pct}% of expenses)")
            elif pct < 5:
                patterns["opportunities"].append(f"Low spending in {cat} - optimization possible")

        flow = metrics.get("net_cash_flow", 0)
        if flow > 0:
            patterns["strengths"].append(f"Positive cash flow: {flow:,.2f} monthly")
        else:
            patterns["concerns"].append(f"Negative cash flow: {abs(flow):,.2f} monthly deficit")

        return patterns

    def _generate_comprehensive_insights(self, categorized_data: Dict[str, Any],
                                         metrics: Dict[str, float],
                                         patterns: Dict[str, Any]) -> str:
        """Generate deterministic insights without additional LLM calls."""
        total_income = metrics.get("total_income", 0)
        total_expenses = metrics.get("total_expenses", 0)
        net_cash_flow = metrics.get("net_cash_flow", 0)
        savings_rate = metrics.get("savings_rate", 0)

        top_categories = sorted(
            categorized_data.get("category_analysis", {}).items(),
            key=lambda item: item[1],
            reverse=True,
        )[:3]

        lines = [
            "Executive Summary:",
            (
                f"- Monthly income INR {total_income:,.2f}, expenses INR {total_expenses:,.2f}, "
                f"net cash flow INR {net_cash_flow:,.2f}."
            ),
            f"- Savings rate is {savings_rate:.1f}%.",
            "",
            "Cash Flow Analysis:",
            (
                "- Cash flow is healthy and positive."
                if net_cash_flow >= 0
                else "- Cash flow is negative; immediate expense correction is required."
            ),
            "",
            "Spending Optimization:",
        ]

        if top_categories:
            for category, percentage in top_categories:
                lines.append(f"- {category}: {percentage:.1f}% of expense mix.")
        else:
            lines.append("- Not enough categorized expense data yet.")

        concerns = patterns.get("concerns", [])
        opportunities = patterns.get("opportunities", [])

        lines.extend(
            [
                "",
                "Immediate Actions (30 days):",
                "- Cap non-essential categories by 10-15%.",
                "- Set automatic transfer to savings on income day.",
            ]
        )

        if concerns:
            lines.append("- Address highest-impact concern first: " + concerns[0])
        if opportunities:
            lines.append("- Fast optimization opportunity: " + opportunities[0])

        lines.extend(
            [
                "",
                "Long-term Recommendations:",
                "- Keep fixed expenses below 50% of income.",
                "- Target minimum 20% savings rate when feasible.",
                "- Review anomaly alerts monthly.",
            ]
        )

        return "\\n".join(lines)
    # ============================================================
    # === SUMMARIES & SCORING ===================================
    # ============================================================
    def _create_summary_metrics(self, metrics: Dict[str, float], patterns: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "monthly_net_flow": metrics.get("net_cash_flow", 0),
            "net_cash_flow": metrics.get("net_cash_flow", 0),
            "savings_rate": metrics.get("savings_rate", 0),
            "financial_health": (
                "Excellent" if metrics.get("savings_rate", 0) >= 15
                else "Good" if metrics.get("savings_rate", 0) >= 5
                else "Needs Improvement"
            ),
            "key_strengths": len(patterns.get("strengths", [])),
            "key_concerns": len(patterns.get("concerns", [])),
            "optimization_opportunities": len(patterns.get("opportunities", []))
        }

    def _calculate_financial_health_score(self, metrics: Dict[str, float], patterns: Dict[str, Any]) -> int:
        score = 50
        sr = metrics.get("savings_rate", 0)
        if sr >= 20:
            score += 30
        elif sr >= 15:
            score += 25
        elif sr >= 10:
            score += 20
        elif sr >= 5:
            score += 10
        elif sr < 0:
            score -= 20

        flow = metrics.get("net_cash_flow", 0)
        score += 20 if flow > 0 else -15

        fr = metrics.get("fixed_expense_ratio", 0)
        if fr < 40:
            score += 20
        elif fr < 50:
            score += 10
        elif fr > 60:
            score -= 15

        score += len(patterns.get("strengths", [])) * 2
        score -= len(patterns.get("concerns", [])) * 3
        return max(0, min(100, score))

    def _serialize_dict(self, obj: Any) -> Any:
        """Recursively convert all pandas/complex structures to JSON-safe types"""
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, pd.Series):
            return {str(k): float(v) for k, v in obj.to_dict().items()}
        if isinstance(obj, pd.DataFrame):
            return [self._serialize_dict(r.to_dict()) for _, r in obj.iterrows()]
        if isinstance(obj, dict):
            return {str(k): self._serialize_dict(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._serialize_dict(v) for v in obj]
        if hasattr(obj, "__dict__"):
            return self._serialize_dict(obj.__dict__)
        return str(obj)

    def _get_empty_analysis_response(self) -> Dict[str, Any]:
        return {
            "categorized_data": {},
            "financial_metrics": {},
            "patterns_detected": {"strengths": [], "concerns": [], "opportunities": [], "anomalies": []},
            "insights": "No transaction data available for analysis. Please provide data to generate insights.",
            "summary_metrics": {"financial_health": "Unknown", "key_strengths": 0, "key_concerns": 0},
            "health_score": 0
        }

    def _get_error_analysis_response(self, msg: str) -> Dict[str, Any]:
        return {
            "error": msg,
            "insights": f"I encountered an error while analyzing your financial data: {msg}",
            "summary_metrics": {"financial_health": "Analysis Failed", "key_strengths": 0, "key_concerns": 0},
            "health_score": 0
        }
