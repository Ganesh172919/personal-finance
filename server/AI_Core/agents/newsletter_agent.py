r"""
newsletter_agent.py - Newsletter Content Agent
================================================

The ``NewsletterAgent`` generates personalized newsletter content sections.
It produces deterministic sections from raw financial data (spending summary,
budget alerts, upcoming bills, health score) and uses an LLM call via
``invoke_with_fallback`` for financial tips and action items.

Key responsibilities
--------------------
- Build a spending summary from transaction data (deterministic).
- Flag budgets that are warning or exceeded (deterministic).
- List upcoming bills due within the next 7 days (deterministic).
- Compute a financial health score from available metrics (deterministic).
- Generate a financial tip and actionable recommendations via LLM.
- Fall back to template-based content if the LLM is unavailable.

MINDMAP FLOW
------------
::

    NewsletterAgent
    ├── 1. Context & Preferences Ingestion
    │   ├── Financial Context (spending, alerts, bills, transactions, score)
    │   └── Content Preferences (includeTips, includeActions, etc.)
    ├── 2. Deterministic Section Construction
    │   ├── Spending Summary (_build_spending_summary)
    │   │   ├── Total spend across timeframe
    │   │   ├── Top spending category breakdown
    │   │   └── Period-over-period delta calculation
    │   ├── Budget Alerts (_build_budget_alerts)
    │   │   ├── Warning thresholds (>80% consumed)
    │   │   └── Exceeded thresholds (>100% consumed)
    │   ├── Upcoming Recurring Bills (_build_upcoming_bills)
    │   │   ├── 7-day payment window filtering
    │   │   └── Critical due date tagging
    │   └── Health Score Aggregation (_build_health_score)
    │       ├── Savings rate weight
    │       ├── Debt-to-income balance
    │       └── Emergency runway score
    ├── 3. LLM Reasoning & Synthesis
    │   ├── Financial Tip Generation (_generate_financial_tip)
    │   │   ├── Friendly, educational tone
    │   │   └── Context-aware advice (no investment/tax advice)
    │   └── Action Items Generation (_generate_action_items)
    │       ├── 2-3 specific, measurable, achievable tasks
    │       └── 7-day execution horizon
    └── 4. Resilience & Fallback Engine
        ├── Template-based fallback tips when LLM is unavailable
        ├── Generic action items fallback
        └── Structured Pydantic-compatible result packaging

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |   Input: Financial Context + User Content Preferences         |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |              Step 1: Deterministic Pipeline                   |
    |  - Extract & compute:                                         |
    |    * spending_summary (total, categories, trends)             |
    |    * budget_alerts (exceeded / warning thresholds)            |
    |    * upcoming_bills (bills due within 7 days)                 |
    |    * health_score (numeric score & grade)                     |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |         Step 2: Preference Check & LLM Generation             |
    +-------------------------------+-------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
     [Include Tips?]                                [Include Actions?]
       /         \                                    /           \
     YES          NO                                YES            NO
     /             \                                /               \
    v               v                              v                 v
  +-----------+  (Skip Tip)                   +-------------+  (Skip Actions)
  | Query LLM |                               | Query LLM   |        |
  +-----+-----+                               +------+------+        |
        |                                            |               |
   [LLM OK?]                                    [LLM OK?]            |
     /    \                                       /    \             |
   YES     NO                                   YES     NO           |
   /        \                                   /        \           |
  v          v                                 v          v          |
 (LLM Tip) (Template Tip)               (LLM Actions) (Template Act.)|
  \          /                                 \          /          |
   \        /                                   \        /           |
    v      v                                     v      v            |
    +------+-------------------------------------+------+------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |              Step 3: Response Assembly & Return               |
    |  - Assemble structured newsletter dictionary                  |
    |  - Return to caller (NewsletterService / Worker)              |
    +---------------------------------------------------------------+

Design decisions
----------------
- Deterministic sections ensure the newsletter always has meaningful content
  even when the LLM is unreachable.
- LLM prompts are constrained to produce concise, actionable output suitable
  for email rendering (no long essays).
- The agent returns a structured dict matching the Pydantic response model
  expected by the API endpoint.
"""

import logging
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage, SystemMessage

from utils import create_llm

logger = logging.getLogger(__name__)


class NewsletterAgent:
    """Generates personalized daily newsletter content.

    Deterministic sections are built from raw financial data.
    LLM is used only for financial_tip and action_items.
    """

    def __init__(self):
        self.llm = create_llm("newsletter")
        self.system_prompt = SystemMessage(
            content=(
                "You are a concise financial newsletter writer for FinWise. "
                "Write in a friendly, professional tone. "
                "Keep tips to 2-3 sentences. "
                "Action items should be specific, time-bound, and achievable. "
                "Do not provide investment advice or tax guidance. "
                "Focus on spending awareness, budgeting, and savings habits."
            )
        )

    def generate(
        self,
        financial_context: Dict[str, Any],
        content_preferences: Dict[str, bool],
    ) -> Dict[str, Any]:
        """Generate all newsletter sections from financial context.

        Args:
            financial_context: Contains spending_summary, budget_alerts,
                upcoming_bills, health_score, transactions.
            content_preferences: Dict with keys like financialTips,
                actionableRecommendations indicating which sections to generate.

        Returns:
            Dict with keys: spending_summary, budget_alerts, upcoming_bills,
            financial_tip, health_score, action_items.
        """
        logger.info("Generating newsletter content")

        result: Dict[str, Any] = {}

        # Deterministic sections
        spending = financial_context.get("spending_summary", {})
        if content_preferences.get("spendingSummary", True):
            result["spending_summary"] = self._build_spending_summary(spending)

        if content_preferences.get("budgetAlerts", True):
            result["budget_alerts"] = financial_context.get("budget_alerts", [])

        if content_preferences.get("upcomingBills", True):
            result["upcoming_bills"] = financial_context.get("upcoming_bills", [])

        if content_preferences.get("weeklyHealthScore", True):
            result["health_score"] = financial_context.get("health_score", self._default_health_score())

        # LLM-generated sections
        if content_preferences.get("financialTips", True):
            result["financial_tip"] = self._generate_financial_tip(financial_context)

        if content_preferences.get("actionableRecommendations", True):
            result["action_items"] = self._generate_action_items(financial_context)

        return result

    # ── Deterministic Builders ────────────────────────────────────────

    @staticmethod
    def _build_spending_summary(spending: Dict[str, Any]) -> Dict[str, Any]:
        """Build a clean spending summary from raw data."""
        return {
            "totalSpent": spending.get("totalSpent", 0),
            "totalIncome": spending.get("totalIncome", 0),
            "netCashFlow": spending.get("netCashFlow", 0),
            "topCategories": spending.get("topCategories", []),
            "transactionCount": spending.get("transactionCount", 0),
            "currency": spending.get("currency", "USD"),
        }

    @staticmethod
    def _default_health_score() -> Dict[str, Any]:
        """Return a neutral health score when data is unavailable."""
        return {
            "score": 65,
            "label": "Getting Started",
            "highlights": ["Keep tracking your finances to get a personalized health score."],
        }

    # ── LLM-Generated Sections ───────────────────────────────────────

    def _generate_financial_tip(self, ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a financial tip using the LLM with fallback."""
        spending = ctx.get("spending_summary", {})
        alerts = ctx.get("budget_alerts", [])
        bills = ctx.get("upcoming_bills", [])

        context_parts = []
        if spending:
            net = spending.get("netCashFlow", 0)
            context_parts.append(f"Net cash flow (24h): {net}")
            context_parts.append(f"Transaction count: {spending.get('transactionCount', 0)}")
        if alerts:
            exceeded = [a for a in alerts if a.get("status") == "exceeded"]
            if exceeded:
                context_parts.append(f"Budgets exceeded: {len(exceeded)}")
        if bills:
            due_soon = [b for b in bills if b.get("daysUntilDue", 99) <= 2]
            if due_soon:
                context_parts.append(f"Bills due within 2 days: {len(due_soon)}")

        context_str = "; ".join(context_parts) if context_parts else "No recent financial data available."

        prompt = f"""
Generate a short financial tip for today's newsletter.

User context: {context_str}

Return your response as:
Title: <one-line title, max 8 words>
Category: <one word: Savings, Budgeting, Spending, Goals, Debt, or General>
Body: <2-3 sentence tip, practical and actionable>
"""

        try:
            response, fallback_used = self.llm.invoke_with_fallback(
                [self.system_prompt, HumanMessage(content=prompt)],
                fallback_response="",
            )
            content = response.content.strip()
            if fallback_used or not content:
                return self._fallback_tip(ctx)
            return self._parse_tip_response(content)
        except Exception as e:
            logger.warning("LLM tip generation failed, using fallback: %s", e)
            return self._fallback_tip(ctx)

    def _generate_action_items(self, ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate action items using the LLM with fallback."""
        alerts = ctx.get("budget_alerts", [])
        bills = ctx.get("upcoming_bills", [])
        spending = ctx.get("spending_summary", {})

        context_parts = []
        for a in alerts:
            if a.get("status") in ("warning", "exceeded"):
                context_parts.append(
                    f"Budget '{a.get('budgetName')}' is {a.get('status')} "
                    f"at {a.get('percentage')}% ({a.get('spent')}/{a.get('limit')})"
                )
        for b in bills:
            if b.get("daysUntilDue", 99) <= 3:
                context_parts.append(
                    f"Bill '{b.get('name')}' of {b.get('amount')} due in {b.get('daysUntilDue')} days"
                )
        if spending:
            net = spending.get("netCashFlow", 0)
            if net < 0:
                context_parts.append(f"Negative cash flow of {abs(net)}")

        context_str = "; ".join(context_parts) if context_parts else "No urgent financial items."

        prompt = f"""
Generate 1-3 actionable recommendations for today's newsletter.

Context: {context_str}

For each item, return:
ITEM
Title: <short title, max 8 words>
Description: <1-2 sentence actionable recommendation>
Priority: high|medium|low
Category: <Budget, Bills, Spending, Savings, or Goals>

Separate items with a blank line. Keep it concise.
"""

        try:
            response, fallback_used = self.llm.invoke_with_fallback(
                [self.system_prompt, HumanMessage(content=prompt)],
                fallback_response="",
            )
            content = response.content.strip()
            if fallback_used or not content:
                return self._fallback_action_items(ctx)
            return self._parse_action_items(content)
        except Exception as e:
            logger.warning("LLM action items generation failed, using fallback: %s", e)
            return self._fallback_action_items(ctx)

    # ── Response Parsing ──────────────────────────────────────────────

    @staticmethod
    def _parse_tip_response(text: str) -> Dict[str, Any]:
        """Parse LLM tip response into structured format."""
        title = "Financial Tip"
        category = "General"
        body = text

        for line in text.split("\n"):
            line = line.strip()
            if line.lower().startswith("title:"):
                title = line.split(":", 1)[1].strip()
            elif line.lower().startswith("category:"):
                category = line.split(":", 1)[1].strip()
            elif line.lower().startswith("body:"):
                body = line.split(":", 1)[1].strip()

        # If body is still the full text, extract just the body portion
        if body == text:
            lines = text.split("\n")
            body_lines = []
            in_body = False
            for line in lines:
                if line.strip().lower().startswith("body:"):
                    body_lines.append(line.split(":", 1)[1].strip())
                    in_body = True
                elif in_body:
                    body_lines.append(line.strip())
            if body_lines:
                body = " ".join(body_lines)

        return {
            "title": title[:100],
            "body": body[:500],
            "category": category[:30],
        }

    @staticmethod
    def _parse_action_items(text: str) -> List[Dict[str, Any]]:
        """Parse LLM action items response into structured format."""
        items = []
        current: Dict[str, str] = {}

        for line in text.split("\n"):
            line = line.strip()
            if not line:
                if current.get("title"):
                    items.append({
                        "title": current.get("title", "Action")[:100],
                        "description": current.get("description", "")[:300],
                        "priority": current.get("priority", "medium"),
                        "category": current.get("category", "General")[:30],
                    })
                    current = {}
                continue

            if line.upper() == "ITEM":
                if current.get("title"):
                    items.append({
                        "title": current.get("title", "Action")[:100],
                        "description": current.get("description", "")[:300],
                        "priority": current.get("priority", "medium"),
                        "category": current.get("category", "General")[:30],
                    })
                    current = {}
                continue

            if line.lower().startswith("title:"):
                current["title"] = line.split(":", 1)[1].strip()
            elif line.lower().startswith("description:"):
                current["description"] = line.split(":", 1)[1].strip()
            elif line.lower().startswith("priority:"):
                p = line.split(":", 1)[1].strip().lower()
                current["priority"] = p if p in ("high", "medium", "low") else "medium"
            elif line.lower().startswith("category:"):
                current["category"] = line.split(":", 1)[1].strip()

        # Don't forget the last item
        if current.get("title"):
            items.append({
                "title": current.get("title", "Action")[:100],
                "description": current.get("description", "")[:300],
                "priority": current.get("priority", "medium"),
                "category": current.get("category", "General")[:30],
            })

        return items[:5]  # Cap at 5 items

    # ── Fallback Content ──────────────────────────────────────────────

    @staticmethod
    def _fallback_tip(ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a fallback financial tip when LLM is unavailable."""
        spending = ctx.get("spending_summary", {})
        net = spending.get("netCashFlow", 0)

        if net < 0:
            return {
                "title": "Review Your Expenses",
                "body": (
                    f"Your spending exceeded your income by {abs(net):.0f} recently. "
                    "Take a few minutes to review your recent transactions and identify "
                    "any non-essential expenses you can reduce."
                ),
                "category": "Spending",
            }

        if spending.get("transactionCount", 0) == 0:
            return {
                "title": "A Day of Savings",
                "body": (
                    "No transactions recorded recently -- that is a win for your wallet! "
                    "Use this time to review your budget and set aside a small amount for savings."
                ),
                "category": "Savings",
            }

        return {
            "title": "Stay Financially Aware",
            "body": (
                "Checking your spending regularly is one of the best habits for financial health. "
                "Take a moment today to review your recent transactions and ensure they align with your goals."
            ),
            "category": "General",
        }

    @staticmethod
    def _fallback_action_items(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate fallback action items when LLM is unavailable."""
        items: List[Dict[str, Any]] = []
        alerts = ctx.get("budget_alerts", [])
        bills = ctx.get("upcoming_bills", [])

        for a in alerts:
            if a.get("status") == "exceeded":
                items.append({
                    "title": f"Review {a.get('budgetName', 'budget')} spending",
                    "description": (
                        f"This budget is at {a.get('percentage', 0)}% usage. "
                        "Consider reducing discretionary spending in this category."
                    ),
                    "priority": "high",
                    "category": "Budget",
                })

        for b in bills:
            if b.get("daysUntilDue", 99) <= 2:
                items.append({
                    "title": f"Pay {b.get('name', 'bill')}",
                    "description": (
                        f"Due {'today' if b.get('daysUntilDue') == 0 else 'tomorrow'} -- "
                        f"ensure you have sufficient funds."
                    ),
                    "priority": "high",
                    "category": "Bills",
                })

        if not items:
            items.append({
                "title": "Review your financial goals",
                "description": (
                    "Take a moment to check your progress toward your savings "
                    "and investment goals. Small adjustments add up over time."
                ),
                "priority": "low",
                "category": "Goals",
            })

        return items[:5]
