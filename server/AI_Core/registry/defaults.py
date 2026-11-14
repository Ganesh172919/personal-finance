"""
registry/defaults.py - Baked-in prompt / routing / exemplar defaults
====================================================================

An empty database MUST reproduce the pre-registry behaviour byte-for-byte, so
every default below is the verbatim text that used to be inlined in the agent
modules.  Templates use ``{name}`` placeholders filled by ``render_prompt``
(single pass, only known names, so JSON braces in a template are untouched).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Tuple

from .models import RoutingConfig


# Specification defining metadata and validation criteria for a prompt template.
# Declares required placeholders, safety phrases, and maximum length constraints.
# Used by prompt registry to validate candidates and enforce safety guidelines.
@dataclass(frozen=True)
class PromptSpec:
    key: str
    default: str
    description: str = ""
    required_placeholders: Tuple[str, ...] = ()
    # Case-insensitive substrings every candidate must keep (safety rails).
    required_phrases: Tuple[str, ...] = ()
    max_length: int = 4000
    is_template: bool = False


_NUMBER_RULES = (
    "do not introduce any new numbers",
    "do not change currency/percent values",
)

_POLISH_PLACEHOLDERS = ("plan", "session_summary", "recent_messages")

# Default narrative polish prompt template for master strategy agent.
# Strictly instructs LLM to preserve all numeric values without changes.
# Injects session summary, recent message history, and raw financial plan.
MASTER_POLISH_DEFAULT = """
Rewrite the following financial plan for clarity and readability.

Rules (critical):
- Do NOT introduce any new numbers. Keep every numeric value exactly as provided.
- Do NOT change currency/percent values or add extra numeric examples.
- Keep the same structure and meaning; you may improve wording and formatting only.

Optional chat context (for relevance; do not add new facts):
Session summary: {session_summary}
Recent messages: {recent_messages}

PLAN (do not change numbers):
{plan}
"""

# Default template for aggregator polish node synthesizing multi-agent plans.
# Enforces strict non-introduction and non-modification of numeric data.
# Formats raw synthesized plan using recent conversational context.
AGGREGATOR_POLISH_DEFAULT = """Rewrite the following financial plan for clarity and readability.

Rules (critical):
- Do NOT introduce any new numbers. Keep every numeric value exactly as provided.
- Do NOT change currency/percent values or add extra numeric examples.
- Keep the same structure and meaning; you may improve wording and formatting only.

Optional chat context (for relevance; do not add new facts):
Session summary: {session_summary}
Recent messages: {recent_messages}

PLAN (do not change numbers):
{plan}
"""

# Default prompt template for financial concept explanation requests.
# Directs educator model to generate definition, significance, and examples.
# Injects concept name, relevant user profile facts, and original question.
EDUCATOR_EXPLAIN_DEFAULT = """
Explain the concept: "{concept}"

User context (for relevance only, not advice):
{profile_context}

Original question:
"{user_input}"

Answer the original question directly. If it specifies a language, length, or format, follow those requirements. If it asks for a comparison, explain the differences first.
Otherwise, give a short definition and a practical example when helpful.
"""

# Default prompt template instructing decomposer to break tasks into subtasks.
# Maps user financial objectives across registered specialist agents.
# Requires structured JSON output with agent assignments and priority.
DECOMPOSER_DECOMPOSE_DEFAULT = """Decompose the following financial request into 2-5 discrete subtasks.

User request: {user_input}

User profile summary:
{profile_summary}

Available specialist agents:
- income_expense_analyzer: Cash flow, spending trends, anomalies
- budget_planner: Budget allocations, savings plans, expense optimization
- investment_advisor: Portfolio allocation, risk assessment, retirement planning
- debt_optimizer: Repayment strategies, consolidation analysis
- financial_educator: Concept explanations, financial literacy

For each subtask, provide:
- id: a short unique string (e.g. "subtask_001")
- description: what the subtask should accomplish (1-2 sentences)
- assigned_agent: one of the agents listed above
- priority: 1 (highest) to 5 (lowest)
- dependencies: list of subtask ids that must complete first (empty list if none)

Respond with a JSON object: {"subtasks": [...], "rationale": "..."}
"""

# Registry mapping prompt template keys to their formal PromptSpec models.
# Defines required placeholders and safety assertions for each registered prompt.
# Serves as baseline specification for validating candidate prompt artifacts.
PROMPT_SPECS: Dict[str, PromptSpec] = {
    spec.key: spec
    for spec in (
        PromptSpec(
            key="master.system",
            default=(
                "You are the Master Financial Strategist. "
                "Synthesize deterministic specialist outputs into a clear and actionable plan. "
                "Be concise, practical, and specific."
            ),
            description="System prompt for the master agent narrative polish.",
        ),
        PromptSpec(
            key="master.polish",
            default=MASTER_POLISH_DEFAULT,
            description="Master agent narrative-polish template.",
            required_placeholders=_POLISH_PLACEHOLDERS,
            required_phrases=_NUMBER_RULES,
            is_template=True,
        ),
        PromptSpec(
            key="aggregator.system",
            default=(
                "You are a financial plan synthesizer. "
                "Combine multiple specialist analyses into a clear, actionable plan. "
                "Be concise, practical, and specific. "
                "Do NOT introduce any new numbers or change existing values."
            ),
            description="System prompt for the sub-agent aggregator.",
            required_phrases=("do not introduce any new numbers",),
        ),
        PromptSpec(
            key="aggregator.polish",
            default=AGGREGATOR_POLISH_DEFAULT,
            description="Aggregator narrative-polish template.",
            required_placeholders=_POLISH_PLACEHOLDERS,
            required_phrases=_NUMBER_RULES,
            is_template=True,
        ),
        PromptSpec(
            key="educator.system",
            default=(
                "You are a clear and concise Financial Educator. "
                "Explain concepts simply with short practical examples. "
                "Do not provide personalized financial advice."
            ),
            description="System prompt for the financial educator.",
            required_phrases=("do not provide personalized financial advice",),
        ),
        PromptSpec(
            key="educator.explain",
            default=EDUCATOR_EXPLAIN_DEFAULT,
            description="Financial educator request template.",
            required_placeholders=("concept", "profile_context", "user_input"),
            is_template=True,
        ),
        PromptSpec(
            key="decomposer.system",
            default=(
                "You are a financial task decomposition assistant. "
                "Given a user's financial request, break it into 2-5 discrete subtasks. "
                "Each subtask must be assigned to exactly one specialist agent. "
                "Respond ONLY with valid JSON -- no markdown fences, no commentary."
            ),
            description="System prompt for the task decomposer.",
            required_phrases=("valid json",),
        ),
        PromptSpec(
            key="decomposer.decompose",
            default=DECOMPOSER_DECOMPOSE_DEFAULT,
            description="Task decomposer request template.",
            required_placeholders=("user_input", "profile_summary"),
            required_phrases=("assigned_agent", "dependencies"),
            is_template=True,
        ),
    )
}

# Prompt slots that may carry few-shot exemplars.  Deliberately only the
# educator: polish prompts must never see example numbers.
EXEMPLAR_KEYS: Tuple[str, ...] = ("educator.explain",)

# Synthetic (hand-written) exemplars: the only exemplar content global
# candidates may use (no user text ever crosses tenants).
# Defines curated few-shot examples for financial education and explanations.
# Contains safe synthetic question-answer pairs free of cross-tenant data.
# Provides domain context for improving explanation quality and tone.
SYNTHETIC_EXEMPLARS: Dict[str, Tuple[Tuple[str, str], ...]] = {
    "educator.explain": (
        (
            "What is diversification?",
            "Definition: spreading your money across different kinds of investments.\n"
            "Why it matters: one bad investment hurts less when others hold up.\n"
            "Simple example: owning both stocks and bonds instead of only one company's shares.",
        ),
        (
            "Explain an emergency fund",
            "Definition: cash set aside only for surprises such as job loss or medical bills.\n"
            "Why it matters: it keeps you from borrowing at high interest when something goes wrong.\n"
            "Simple example: a savings account you do not touch for ordinary spending.",
        ),
    )
}


# Constructs default baseline RoutingConfig instance for multi-agent workflows.
# Sets initial version zero and marks scope as global active status.
# Returns clean fallback routing configuration when no override is present.
def default_routing_config() -> RoutingConfig:
    return RoutingConfig(id="default-routing", version=0, status="active", scope="global")


DEFAULT_ROUTING_PARAMS: Dict[str, Any] = default_routing_config().params()

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")


# Performs single-pass variable substitution on prompt template strings.
# Matches named placeholders while safely preserving unmatched braces.
# Returns completed prompt string with interpolated context parameters.
def render_prompt(template: str, **values: Any) -> str:
    """Single-pass ``{name}`` substitution; unknown braces are left alone."""

    def _sub(match: "re.Match[str]") -> str:
        name = match.group(1)
        if name in values:
            return str(values[name])
        return match.group(0)

    return _PLACEHOLDER_RE.sub(_sub, template)
