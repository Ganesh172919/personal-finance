"""Financial education with deterministic concept extraction and safe fallback.

The question and optional profile enter the model prompt. Do not cache an answer
by extracted concept: two people can ask about the same concept while supplying
different private financial context. Reuse, when safe, belongs to the separate
tenant-scoped LLM cache keyed on the full prompt.
"""

import logging
import re
from typing import Any, Dict, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from registry import get_exemplars, get_prompt, render_prompt
from utils import create_llm

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT = SystemMessage(content=(
    "You are the FinWise conversational assistant. Answer the user's actual question directly in their language. "
    "Respond naturally to greetings. Ask a short clarifying question when the request is incomplete. "
    "Follow the requested length and format. Use previous turns only when relevant to the current question. "
    "For public research, distinguish general knowledge from facts requiring verification. "
    "You have no live web access in this mode. Never claim to have checked a source or invent statistics or URLs. "
    "When exact figures require a source, explain what can be answered and identify the kind of official record to consult. "
    "You cannot access the user's live account or perform actions in this conversation."
))


# Educational AI agent explaining financial literacy concepts and terminology.
# Leverages natural language models with bounded provider failover resilience.
# Contextualizes explanations using user age, profile goals, and financial stage.
class FinancialEducatorAgent:
    """Explains financial concepts clearly with optional request-context relevance.

    This is the only specialist agent that makes an LLM call (for natural
    language generation).  All other agents are fully deterministic.
    """

    # Initializes educator agent with specialized natural language generation LLM.
    # Sets up fallback model routing and configurable system prompt overrides.
    # Maintains local state for dynamic runtime prompt registry resolution.
    def __init__(self):
        self.llm = create_llm("educator")
        # Resolved through the artifact registry at call time (baked-in default
        # when empty); assigning ``system_prompt`` overrides it.
        self._system_prompt_override: Optional[SystemMessage] = None

    def answer_chat(self, question: str, history: list[dict[str, str]]) -> Dict[str, Any]:
        """Use the existing provider and failover policy for conversational turns."""
        messages = [CHAT_SYSTEM_PROMPT]
        for message in history[-4:]:
            role = message.get("role")
            content = message.get("content", "").strip()[:1200]
            if content and role in {"user", "assistant"}:
                message_type = HumanMessage if role == "user" else AIMessage
                messages.append(message_type(content=content))
        messages.append(HumanMessage(content=question))
        unavailable = "The conversation service is temporarily unavailable. Try again shortly."
        reply, fallback = self.llm.invoke_with_fallback(messages, unavailable, max_attempts=3)
        answer = reply.content if hasattr(reply, "content") else str(reply)
        answer = answer.strip() if isinstance(answer, str) else ""
        return {
            "response": answer or unavailable,
            "fallback_used": fallback or not answer,
            "llm_route": self.llm.get_route_metadata(),
        }

    # Resolves educational system prompt guidelines from artifact registry.
    # Defines pedagogy, tone, clarity principles, and factual bounds.
    # Returns LangChain SystemMessage instance ready for LLM invocation.
    @property
    def system_prompt(self) -> SystemMessage:
        override = getattr(self, "_system_prompt_override", None)
        if override is not None:
            return override
        return SystemMessage(content=get_prompt("educator.system"))

    @system_prompt.setter
    def system_prompt(self, value: SystemMessage) -> None:
        self._system_prompt_override = value

    # Formats few-shot question and answer exemplars into a prompt text block.
    # Retrieves high-quality stylistic exemplars from the prompt registry.
    # Returns an empty string if no relevant exemplars are registered.
    @staticmethod
    def _exemplar_block() -> str:
        examples = get_exemplars("educator.explain")
        if not examples:
            return ""
        lines = ["", "Examples of the expected style (illustrative wording only):"]
        for example in examples:
            lines.append(f"Q: {example.input}")
            lines.append(f"A: {example.output}")
        return chr(10).join(lines) + chr(10)

    # Produces clear, accessible financial explanations for user questions.
    # Blends extracted financial concepts with user profile context and few-shot exemplars.
    # Executes LLM generation with multi-provider fallbacks and route telemetry tracking.
    def explain_concept(self, user_input: str, user_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Explain a concept with bounded provider failover."""
        logger.info("Explaining financial concept (input_length=%s)", len(user_input or ""))

        concept = self._simple_concept_extraction(user_input)
        # Never reuse an answer keyed only by concept: the full question and
        # profile may contain another tenant's private financial details.
        profile_context = self._get_profile_context(user_profile)

        prompt = render_prompt(
            get_prompt("educator.explain"),
            concept=concept,
            profile_context=profile_context,
            user_input=user_input,
        )
        if not re.search(r"\b(?:one|two|three|1|2|3)\s+(?:(?:short|brief)\s+)?(?:sentences?|bullets?)\b", user_input, re.I):
            prompt += self._exemplar_block()

        fallback = "The explanation service is temporarily unavailable. Try your question again in a moment."
        response, fallback_used = self.llm.invoke_with_fallback(
            [self.system_prompt, HumanMessage(content=prompt)],
            fallback,
            max_attempts=4,
        )

        explanation = response.content.strip() if hasattr(response, "content") else str(response)

        payload = {
            "concept_explained": concept,
            "explanation": explanation,
            "fallback_used": fallback_used,
            "llm_route": self.llm.get_route_metadata(),
        }

        return payload

    # Deterministically extracts the core financial concept keyword from user text.
    # Checks keyword dictionary and strips common conversational question prefixes.
    # Avoids expensive model fanout for straightforward vocabulary lookups.
    def _simple_concept_extraction(self, user_input: str) -> str:
        """Simple deterministic concept extraction without LLM fan-out."""
        financial_terms = [
            "tax", "budget", "investment", "stocks", "bonds", "mutual funds", "etf",
            "savings", "debt", "loan", "credit card", "mortgage", "retirement",
            "insurance", "inflation", "compound interest", "interest", "income", "expense",
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

    # Extracts relevant personalization metadata from the user profile.
    # Formats user age and active goal descriptions into a compact context string.
    # Returns safe placeholder when no profile information is available.
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
