import logging
from typing import Dict, Any, Optional
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings
from utils import RateLimitedLLM, get_fallback_response

logger = logging.getLogger(__name__)


class FinancialEducatorAgent:
    """Explains financial concepts clearly with optional request-context relevance."""

    def __init__(self):
        self.llm = RateLimitedLLM(
            model=settings.MODEL_NAME,
            temperature=settings.get_agent_config("educator")["temperature"],
        )
        self.system_prompt = SystemMessage(
            content=(
                "You are a clear and concise Financial Educator. "
                "Explain concepts simply with short practical examples. "
                "Do not provide personalized financial advice."
            )
        )

    def explain_concept(self, user_input: str, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Explain a concept with one LLM call and guaranteed fallback."""
        logger.info("Explaining financial concept: %s...", user_input[:100])

        concept = self._simple_concept_extraction(user_input)
        profile_context = self._get_profile_context(user_profile)

        prompt = f"""
Explain the concept: "{concept}"

User context (for relevance only, not advice):
{profile_context}

Original question:
"{user_input}"

Return a short response with:
1) Definition
2) Why it matters
3) Simple example
"""

        fallback = get_fallback_response("financial_education")
        response, fallback_used = self.llm.invoke_with_fallback(
            [self.system_prompt, HumanMessage(content=prompt)],
            fallback,
        )

        explanation = response.content.strip() if hasattr(response, "content") else str(response)

        return {
            "concept_explained": concept,
            "explanation": explanation,
            "fallback_used": fallback_used,
        }

    def _simple_concept_extraction(self, user_input: str) -> str:
        """Simple deterministic concept extraction without LLM fan-out."""
        financial_terms = [
            "tax", "budget", "investment", "stocks", "bonds", "mutual funds", "etf",
            "savings", "debt", "loan", "credit card", "mortgage", "retirement",
            "insurance", "inflation", "interest", "compound interest", "income", "expense",
            "emergency fund", "net worth", "portfolio", "diversification", "dividends",
        ]

        user_lower = (user_input or "").lower()

        for term in financial_terms:
            if term in user_lower:
                return term

        for prefix in ["what is ", "what are ", "how does ", "how do ", "explain ", "what's "]:
            if user_lower.startswith(prefix):
                return user_input[len(prefix):].strip("?").strip()

        return user_input[:60] if user_input else "personal finance"

    def _get_profile_context(self, user_profile: Optional[Dict[str, Any]]) -> str:
        if user_profile is None:
            return "No personal context provided."

        context_parts = []
        if user_profile.get("age"):
            context_parts.append(f"Age: {user_profile['age']}")
        if user_profile.get("financial_goals"):
            goals = [goal.get("name", "goal") for goal in user_profile["financial_goals"]]
            context_parts.append("Goals: " + ", ".join(goals))

        return " | ".join(context_parts) if context_parts else "No personal context provided."
