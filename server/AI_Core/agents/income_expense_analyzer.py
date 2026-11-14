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

MINDMAP FLOW
------------
::

    IncomeExpenseAnalyzerAgent
    ├── 1. Transaction Ingestion & Preprocessing
    │   ├── Raw JSON List -> Pandas DataFrame Conversion
    │   ├── DateTime Normalization (ISO parser)
    │   └── Data Cleansing (NaN filling, absolute amounts, category standardizing)
    ├── 2. Categorization & Aggregations
    │   ├── Cash Inflow (Salary, Dividends, Transfers)
    │   ├── Cash Outflow (Fixed Bills, Needs, Discretionary Wants)
    │   └── Monthly Time-Series Groupings
    ├── 3. Statistical Pattern & Anomaly Detection
    │   ├── Category-wise Z-Score Computation (Threshold > 2.0 or 2.5)
    │   ├── Recurring Charge & Subscription Identification
    │   └── Period-over-Period Variance Tracking
    ├── 4. Financial Vital Health Scoring (0 - 100)
    │   ├── Savings Rate Component (up to 30 pts)
    │   ├── Net Cashflow Stability Component (+/- 20 pts)
    │   ├── Fixed Expense Burden Ratio (Target < 50%)
    │   └── Discretionary Ratio Adjustments
    └── 5. Serialization & Reporting
        ├── Deterministic Markdown Generation
        ├── JSON-Safe Data Conversion (_serialize_dict, NumPy/Pandas casts)
        └── Output Dictionary Packaging for Workflow & UI Charts

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |            Input: Transaction List [ {date, amount, ...} ]    |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |             Pandas DataFrame Loading & Normalization          |
    |  - Convert date strings to timestamps                         |
    |  - Validate amount column and transaction types               |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                    Transaction Aggregation                    |
    |  - Total Income, Total Expenses, Net Cash Flow                |
    |  - Breakdown by Category (Needs vs Wants)                     |
    |  - Monthly Historical Trend Timeseries                        |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                  Advanced Pattern Detection                   |
    +-------------------------------+-------------------------------+
            |                                               |
            v                                               v
     [Anomaly Detection]                            [Recurring Patterns]
     - Compute category Z-scores                    - Group by merchant / amount
     - Flag outlier high charges                    - Flag active subscriptions
            |                                               |
            +-----------------------+-----------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |              Financial Health Score (0 - 100)                 |
    |  - Savings Rate + Cashflow Ratio + Fixed Burden Matrix        |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    | Assemble Output: { overview, category_breakdown, trends,      |
    |   anomalies, recurring, health_score, recommendations }       |
    +---------------------------------------------------------------+

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
from calendar import monthrange
from typing import Any, Dict, List, Optional

import pandas as pd

from tools import DataProcessor, FinancialCalculators
from tools.data_processors import parse_recorded_date

logger = logging.getLogger(__name__)


# Financial transaction intelligence agent analyzing cashflow and spending habits.
# Categorizes debits and credits, detects recurring merchants, and identifies anomalies.
# Computes composite financial health scores and actionable budget optimizations.
class IncomeExpenseAnalyzerAgent:
    """Comprehensive income and expense analysis with trend detection and optimization insights.

    This agent is part of the multi-agent financial advisory system.
    It receives a list of transaction dicts and returns a structured
    analysis with metrics, patterns, insights, and a health score.
    """

    # Initializes income and expense analyzer with helper calculation tools.
    # Connects to transaction categorizer, trend processor, and ratio calculators.
    # Prepares statistical utilities for anomaly and recurring transaction detection.
    def __init__(self):
        self.data_processor = DataProcessor()
        self.calculators = FinancialCalculators()
    # ============================================================
    # === MAIN ENTRYPOINT ========================================
    # ============================================================
    # Main entrypoint executing full financial health analysis across recorded transactions.
    # Normalizes currency codes, detects spending patterns, and computes cashflow metrics.
    # Returns serializable dictionary containing categorized data, insights, and health score.
    def analyze_finances(self, transactions: List[Dict[str, Any]], currency_code: Optional[str] = None) -> Dict[str, Any]:
        """Comprehensive analysis of income, expenses, and financial health"""
        logger.info(f"Analyzing {len(transactions)} transactions for financial insights")

        try:
            if not transactions:
                return self._get_empty_analysis_response()

            # Keep currency request-local. Untagged amounts must not silently
            # acquire INR (or another user's currency) in the narrative.
            currency = str(currency_code or "").strip().upper()
            if len(currency) != 3 or not currency.isascii() or not currency.isalpha():
                currencies = {str(t.get("currency") or "").strip().upper() for t in transactions}
                currency = next(iter(currencies)) if len(currencies) == 1 else ""
                if len(currency) != 3 or not currency.isascii() or not currency.isalpha():
                    currency = ""
            categorized_data = self._process_transactions(transactions)
            financial_metrics = self._calculate_financial_metrics(categorized_data)
            patterns = self._detect_financial_patterns(categorized_data, financial_metrics)
            insights = self._generate_comprehensive_insights(categorized_data, financial_metrics, patterns, currency)

            result = {
                "categorized_data": categorized_data,
                "financial_metrics": financial_metrics,
                "patterns_detected": patterns,
                "insights": insights,
                "summary_metrics": self._create_summary_metrics(financial_metrics, patterns),
                "health_score": self._calculate_financial_health_score(financial_metrics, patterns),
                "data_warnings": categorized_data["time_period_analysis"].get("data_warnings", []),
            }

            # JSON-safe return
            return self._serialize_dict(result)

        except Exception as e:
            logger.error(f"Error in financial analysis: {str(e)}", exc_info=True)
            return self._get_error_analysis_response(str(e))

    # ============================================================
    # === CORE PROCESSING ========================================
    # ============================================================
    # Categorizes transactions and extracts time trends, anomalies, and recurring charges.
    # Invokes DataProcessor to identify monthly expense patterns and statistical outliers.
    # Assembles processed transaction records into structured analytical structures.
    def _process_transactions(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Process and categorize transactions with detailed analysis"""
        categorized = self.data_processor.categorize_transactions(transactions)
        spending_trends = self.data_processor.analyze_spending_trends(categorized["expenses"], "monthly")
        anomalies = self.data_processor.detect_anomalies(transactions)
        category_analysis = self._analyze_categories(categorized)
        recurring = self._identify_recurring_transactions(transactions)

        return {
            "categorized_transactions": categorized,
            "spending_trends": spending_trends,
            "anomalies": anomalies,
            "category_analysis": category_analysis,
            "recurring_transactions": recurring,
            "time_period_analysis": self._analyze_time_periods(transactions)
        }

    # Calculates relative expense percentages across individual spending categories.
    # Sums outflow amounts by category and normalizes against total expenses.
    # Returns dictionary of category names mapped to their percentage shares.
    def _analyze_categories(self, categorized: Dict[str, List[Dict]]) -> Dict[str, float]:
        """Analyze spending by category with percentages"""
        total_expenses = sum(abs(t.get('amount', 0)) for t in categorized.get('expenses', []))
        category_totals = {}
        for transaction in categorized.get('expenses', []):
            cat = str(transaction.get('category', 'Uncategorized'))
            category_totals[cat] = category_totals.get(cat, 0) + abs(transaction.get('amount', 0))
        return {k: round((v / total_expenses) * 100, 1) for k, v in category_totals.items()} if total_expenses > 0 else {}

    # Identifies repeating subscriptions, regular deposits, and scheduled payments.
    # Groups transactions by description key and exact monetary amount match.
    # Identifies items appearing two or more times as recurring monthly cash flows.
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

    # Aggregates income and expense data chronologically by calendar month.
    # Checks date validity and computes continuous calendar months spanned.
    # Flags boundary month anomalies and missing intermediate period records.
    def _analyze_time_periods(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze financial patterns across different months"""
        if not transactions:
            return {}

        monthly_data = {}
        dates = []
        invalid_dates = 0
        for t in transactions:
            try:
                date = parse_recorded_date(t.get('date'))
                key = date.strftime("%Y-%m")
                amt = float(t.get('amount', 0))
                dates.append(date)
                monthly_data.setdefault(key, {"income": 0.0, "expenses": 0.0})
                if amt > 0:
                    monthly_data[key]["income"] += amt
                else:
                    monthly_data[key]["expenses"] += abs(amt)
            except Exception:
                invalid_dates += 1
                continue

        calendar_months = 0
        warnings = []
        if dates:
            first, last = min(dates), max(dates)
            calendar_months = (last.year - first.year) * 12 + last.month - first.month + 1
            if len(monthly_data) < calendar_months:
                warnings.append(
                    f"Transactions span {calendar_months} calendar months, but only {len(monthly_data)} have records; "
                    "months without records are not confirmed as zero activity."
                )
            if first.day != 1 or last.day != monthrange(last.year, last.month)[1]:
                warnings.append("Boundary months may be incomplete; monthly averages describe recorded transactions only.")
        if invalid_dates:
            warnings.append("Some transaction dates are missing or invalid; monthly averages are unavailable.")

        return {
            "monthly_breakdown": monthly_data,
            "analysis_period": f"{min(monthly_data.keys())} to {max(monthly_data.keys())}" if monthly_data else "",
            "months_analyzed": len(monthly_data),
            "calendar_months_spanned": calendar_months,
            "invalid_date_count": invalid_dates,
            "data_warnings": warnings,
        }

    # ============================================================
    # === METRICS, PATTERNS, LLM INSIGHTS ========================
    # ============================================================
    # Computes core financial ratios including net flow, savings rate, and fixed costs.
    # Segregates fixed recurring expenses from flexible discretionary spending.
    # Computes monthly averages normalized across spanned calendar months.
    def _calculate_financial_metrics(self, categorized_data: Dict[str, Any]) -> Dict[str, Any]:
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

        coverage = categorized_data.get("time_period_analysis", {})
        months = coverage.get("calendar_months_spanned", 0)
        monthly_known = months > 0 and coverage.get("invalid_date_count", 0) == 0
        return {
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "savings_rate": round(savings_rate, 1),
            "fixed_expenses": round(fixed_exp, 2),
            "discretionary_expenses": round(discretionary, 2),
            "fixed_expense_ratio": round(fixed_ratio, 1),
            "discretionary_ratio": round(disc_ratio, 1),
            "average_monthly_income": round(total_income / months, 2) if monthly_known else None,
            "average_monthly_expenses": round(total_expenses / months, 2) if monthly_known else None,
            "average_monthly_net_cash_flow": round(net_cash_flow / months, 2) if monthly_known else None,
            "calendar_months_spanned": months,
        }

    # Identifies financial behavioral patterns, strengths, warnings, and opportunities.
    # Evaluates savings rate thresholds, fixed overhead burdens, and category overspending.
    # Flags negative net cashflow deficits and highlights optimization avenues.
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

        flow = metrics.get("average_monthly_net_cash_flow")
        if flow is not None and flow > 0:
            patterns["strengths"].append(f"Positive recorded cash flow: {flow:,.2f} monthly average")
        elif flow is not None and flow < 0:
            patterns["concerns"].append(f"Negative recorded cash flow: {abs(flow):,.2f} monthly average deficit")

        return patterns

    # Compiles comprehensive written financial health insights without external LLM calls.
    # Outlines executive cashflow summaries, top spending categories, and 30-day action steps.
    # Formats monetary numbers with localized currency symbols and comma separators.
    def _generate_comprehensive_insights(self, categorized_data: Dict[str, Any],
                                         metrics: Dict[str, float],
                                         patterns: Dict[str, Any], currency_code: str = "") -> str:
        """Generate deterministic insights without additional LLM calls."""
        total_income = metrics.get("total_income", 0)
        total_expenses = metrics.get("total_expenses", 0)
        net_cash_flow = metrics.get("net_cash_flow", 0)
        savings_rate = metrics.get("savings_rate", 0)
        currency_prefix = f"{currency_code} " if currency_code else ""
        monthly_flow = metrics.get("average_monthly_net_cash_flow")

        top_categories = sorted(
            categorized_data.get("category_analysis", {}).items(),
            key=lambda item: item[1],
            reverse=True,
        )[:3]

        lines = [
            "Executive Summary:",
            (
                f"- Recorded transaction totals: income {currency_prefix}{total_income:,.2f}, "
                f"expenses {currency_prefix}{total_expenses:,.2f}, net cash flow {currency_prefix}{net_cash_flow:,.2f}."
            ),
            (
                f"- Recorded monthly average net cash flow: {currency_prefix}{monthly_flow:,.2f} "
                f"across {metrics['calendar_months_spanned']} calendar months."
                if monthly_flow is not None else "- Monthly average cash flow is unavailable without valid transaction dates."
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
    # Creates high-level summary metrics card data for dashboard overview displays.
    # Summarizes monthly net flow, overall health status tier, and detected pattern counts.
    # Evaluates whether personal finances qualify as Excellent, Good, or Needs Improvement.
    def _create_summary_metrics(self, metrics: Dict[str, float], patterns: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "monthly_net_flow": metrics.get("average_monthly_net_cash_flow"),
            "average_monthly_net_cash_flow": metrics.get("average_monthly_net_cash_flow"),
            "net_cash_flow": metrics.get("net_cash_flow", 0),
            "calendar_months_spanned": metrics.get("calendar_months_spanned", 0),
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

    # Computes numerical financial vitality score ranging from 0 to 100 points.
    # Scores positive cashflow, low fixed ratios, savings rates, and detected strengths.
    # Penalizes negative cashflow, high fixed expense overhead, and deficit spending.
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

    # Recursively sanitizes data objects into native JSON-serializable primitives.
    # Converts pandas Series, DataFrames, and NumPy values into standard dicts and floats.
    # Prevents serialization crashes when dispatching results across API boundaries.
    def _serialize_dict(self, obj: Any) -> Any:
        """Recursively convert all pandas/complex structures to JSON-safe types"""
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, pd.Series):
            return {str(k): float(v) for k, v in obj.to_dict().items()}
        if isinstance(obj, pd.DataFrame):
            return obj.to_dict(orient="records")
        if isinstance(obj, dict):
            return {str(k): self._serialize_dict(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._serialize_dict(v) for v in obj]
        if hasattr(obj, "__dict__"):
            return self._serialize_dict(obj.__dict__)
        return str(obj)

    # Returns fallback structured payload when input transaction history is empty.
    # Supplies safe default metrics, zero health score, and helpful prompt guidance.
    # Prevents analytical pipeline errors when onboarding users without transactions.
    def _get_empty_analysis_response(self) -> Dict[str, Any]:
        return {
            "categorized_data": {},
            "financial_metrics": {},
            "patterns_detected": {"strengths": [], "concerns": [], "opportunities": [], "anomalies": []},
            "insights": "No transaction data available for analysis. Please provide data to generate insights.",
            "summary_metrics": {"financial_health": "Unknown", "key_strengths": 0, "key_concerns": 0},
            "health_score": 0
        }

    # Produces standardized error fallback payload when analytical computation fails.
    # Packages exception details, zero health score, and diagnostic explanation strings.
    # Enables front-end components to display graceful failure feedback to users.
    def _get_error_analysis_response(self, msg: str) -> Dict[str, Any]:
        return {
            "error": msg,
            "insights": f"I encountered an error while analyzing your financial data: {msg}",
            "summary_metrics": {"financial_health": "Analysis Failed", "key_strengths": 0, "key_concerns": 0},
            "health_score": 0
        }
