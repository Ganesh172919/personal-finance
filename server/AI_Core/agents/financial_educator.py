import logging
from collections import OrderedDict
from time import time
from typing import Any, Dict, Optional, Tuple

from langchain_core.messages import HumanMessage, SystemMessage

from config import settings
from utils import create_llm, get_fallback_response

logger = logging.getLogger(__name__)


class FinancialEducatorAgent:
    """Explains financial concepts clearly with optional request-context relevance."""

    _CACHE_MAX_SIZE = 256
    _CACHE_TTL_SECONDS = 30 * 60

    def __init__(self):
        self.llm = create_llm("educator")
        self.system_prompt = SystemMessage(
            content=(
                "You are a clear and concise Financial Educator. "
                "Explain concepts simply with short practical examples. "
                "Do not provide personalized financial advice."
            )
        )

        # In-memory (process-local) cache keyed by extracted concept.
        # Value: (inserted_at_epoch_seconds, response_payload)
        self._concept_cache: "OrderedDict[str, Tuple[float, Dict[str, Any]]]" = OrderedDict()

    def explain_concept(self, user_input: str, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Explain a concept with one LLM call and guaranteed fallback."""
        logger.info("Explaining financial concept (input_length=%s)", len(user_input or ""))

        concept = self._simple_concept_extraction(user_input)
        cached = self._cache_get(concept)
        if cached is not None:
            return cached

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

        payload = {
            "concept_explained": concept,
            "explanation": explanation,
            "fallback_used": fallback_used,
            "llm_route": self.llm.get_route_metadata(),
        }

        self._cache_set(concept, payload)
        return payload

    def _cache_get(self, concept: str) -> Optional[Dict[str, Any]]:
        entry = self._concept_cache.get(concept)
        if entry is None:
            return None

        inserted_at, payload = entry
        if time() - inserted_at > self._CACHE_TTL_SECONDS:
            del self._concept_cache[concept]
            return None

        self._concept_cache.move_to_end(concept)
        return dict(payload)

    def _cache_set(self, concept: str, payload: Dict[str, Any]) -> None:
        self._concept_cache[concept] = (time(), dict(payload))
        self._concept_cache.move_to_end(concept)

        while len(self._concept_cache) > self._CACHE_MAX_SIZE:
            self._concept_cache.popitem(last=False)

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
