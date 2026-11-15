r"""
agent_routing.py - Deterministic Domain Selection and Routing Utilities
========================================================================

Shared, deterministic domain selection for routing and specialist planning.
Uses compiled regex patterns and profile availability rules to ensure
zero-latency, reproducible agent dispatching without LLM hallucinations.

Key responsibilities
--------------------
- Evaluate domain keyword densities across user queries and conversation context.
- Disambiguate follow-up queries using conversation history.
- Filter specialists based on actual user profile data availability
  (e.g., skip debt optimizer if user has zero debts).

MINDMAP FLOW
------------
::

    Agent Routing Engine
    ├── 1. Domain Regex Catalogs (DOMAIN_PATTERNS)
    │   ├── income_expense_analyzer: expenses, spend, cash flow, transactions
    │   ├── budget_planner: budget, savings, allocation, monthly plan, cut costs
    │   ├── investment_advisor: invest, portfolio, stocks, etfs, mutual funds, sip
    │   └── debt_optimizer: debts, loans, credit cards, interest, emi
    ├── 2. Intent Pattern Classifiers
    │   ├── _BROAD_REQUEST: comprehensive, holistic, full analysis
    │   ├── _ALL_DOMAINS: everything, all aspects, review my finances
    │   └── _FOLLOW_UP: and, what about, how about, continue, that, more
    ├── 3. Contextual Text Normalization (routing_text)
    │   ├── Direct Query Evaluation
    │   └── Conversational History Fallback for ambiguous follow-ups
    └── 4. Specialist Selection (select_specialists)
        ├── Check Profile Presence (fallback to financial_educator if missing)
        ├── Domain Score Filtering (score > 0)
        └── Profile Field Pruning (omit transaction analyzer if no transactions)

ASCII FLOW
----------
::

    +---------------------------------------------------------------+
    |                  Input: user_input + context                  |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                        routing_text()                         |
    |  - Is it a follow-up query without explicit keywords?         |
    |    * YES -> Merge with prior user turns / session summary     |
    |    * NO  -> Use current query text directly                   |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                       domain_scores()                         |
    |  - Count matches for income, budget, investment, debt regex   |
    +-------------------------------+-------------------------------+
                                    |
                                    v
    +---------------------------------------------------------------+
    |                     select_specialists()                      |
    +-------------------------------+-------------------------------+
                                    |
                       [Is user profile present?]
                               /          \
                             YES           NO
                             /              \
                            v                v
            [Matched specific domains?]  ['financial_educator']
                     /              \
                   YES               NO
                   /                  \
                  v                    v
         (Selected Domain List)  (Broad Review Mode)
                  |                    |
                  |              Filter by available profile data:
                  |              - Include income analyzer only if transactions exist
                  |              - Include debt optimizer only if debts exist
                  \                    /
                   \                  /
                    v                v
         +-------------------------------------+
         | Return List of Specialist Names     |
         +-------------------------------------+
"""

import re
from typing import Any, Dict, List, Optional

_EDUCATION = re.compile(r"\b(?:what is|how does|explain|define|hypothetical|worked example|generic examples?)\b", re.I)
_ILLUSTRATIVE_REQUEST = re.compile(
    r"\b(?:compare|explain|illustrate|describe|what (?:risk|benefit)s?\b|how (?:would|does)\b)"
    r".*\b(?:hypothetical|generic|worked) examples?\b",
    re.I,
)
_CONCEPT_COMPARISON = re.compile(
    r"^(?:compare|contrast)\s+(?:an?\s+)?(?:emergency funds?|sinking funds?)\s+(?:and|with|versus|vs\.?)\s+"
    r"(?:an?\s+)?(?:emergency funds?|sinking funds?)\b",
    re.I,
)
_DEBT_METHOD_EXPLANATION = re.compile(
    r"\b(?:explain|describe|define)\s+(?:the\s+)?(?:debt\s+)?(?:avalanche|snowball)\b",
    re.I,
)
_PERSONAL_DEBT_ACTION = re.compile(
    r"\b(?:should i|what should|help me|for me|my (?:debts?|credit cards?|loans?|payments?)|which (?:debt|card|loan))\b",
    re.I,
)
_PERSONAL = re.compile(r"\b(?:my|mine|our|ledger|saved transactions?|attached|should i|create|delete|transfer)\b", re.I)
_CLASSIFY_EXAMPLE = re.compile(
    r"^using (?:those|these|the) definitions,?\s+(?:how should i classify|how would you classify)\s+"
    r"(?:an?|the following)\s+",
    re.I,
)
_CHOOSE_EXAMPLE = re.compile(
    r"^which of (?:those|these|the) (?:two|options|examples)\s+"
    r"(?:should i use|would you use|would work|works|fits)\s+for\s+",
    re.I,
)
_EDUCATION_FOLLOW_UP = re.compile(
    r"^(?:(?:and )?(?:what|how) (?:about|if)\b|and (?:after|if|over|for|at)\b|"
    r"(?:can you )?(?:explain (?:that|it)|give (?:me )?(?:(?:a|one) (?:generic |simple |worked |hypothetical )?|an )example\b|"
    r"show (?:me )?the (?:math|calculation))|"
    r"(?:in (?:one|two|a) (?:short )?sentences?,\s*)?what happens (?:to|after|when)\b)",
    re.I,
)


def is_illustrative_education(question: str) -> bool:
    return not _PERSONAL.search(question) and (
        bool(_ILLUSTRATIVE_REQUEST.search(question) or _CONCEPT_COMPARISON.search(question))
        or bool(_DEBT_METHOD_EXPLANATION.search(question) and not _PERSONAL_DEBT_ACTION.search(question))
    )


def _is_education_follow_up(question: str) -> bool:
    example_prefix = _CLASSIFY_EXAMPLE.match(question) or _CHOOSE_EXAMPLE.match(question)
    subject = question[example_prefix.end():] if example_prefix else question
    return bool(example_prefix or _EDUCATION_FOLLOW_UP.search(question)) and not _PERSONAL.search(subject)


def education_follow_up(question: str, history: Optional[list[dict[str, str]]]) -> list[str]:
    """Keep a short chain of user examples when answering an educational follow-up."""
    if not _is_education_follow_up((question or "").strip()):
        return []
    turns = [turn.get("content", "") for turn in (history or []) if turn.get("role") == "user"]
    context = []
    for turn in reversed(turns[-3:]):
        if not isinstance(turn, str) or len(turn) > 700:
            break
        if _is_education_follow_up(turn.strip()):
            context.insert(0, turn.strip())
        elif not _PERSONAL.search(turn) and (_EDUCATION.search(turn) or is_illustrative_education(turn)):
            return [turn.strip(), *context]
        else:
            break
    return []

# Regex keyword patterns matching primary financial domain specialists.
# Organizes compiled expressions for cash flow, budgeting, investing, and debts.
# Provides baseline pattern catalog for evaluating user intent and domain scores.
DOMAIN_PATTERNS = {
    "income_expense_analyzer": (
        r"\bexpenses?\b", r"\bspend(?:ing)?\b", r"\bincome\b", r"\bcash\s*flow\b", r"\btransactions?\b",
    ),
    "budget_planner": (
        r"\bbudget(?:s|ing)?\b", r"\bsav(?:e|es|ing|ings)\b", r"\ballocation\b",
        r"\bmonthly plan\b", r"\bcut costs\b",
    ),
    "investment_advisor": (
        r"\binvest(?:s|ing|ment|ments)?\b", r"\bportfolio\b", r"\bstocks?\b", r"\betfs?\b",
        r"\bmutual funds?\b", r"\bretirement\b", r"\bsips?\b",
    ),
    "debt_optimizer": (
        r"\bdebts?\b", r"\bloans?\b", r"\bcredit cards?\b", r"\binterest\b",
        r"\brepay(?:ment|ments|ing)?\b", r"\bemis?\b",
    ),
}
_COMPILED_DOMAINS = {name: tuple(re.compile(pattern, re.I) for pattern in patterns)
                     for name, patterns in DOMAIN_PATTERNS.items()}
_BROAD_REQUEST = re.compile(
    r"\b(?:comprehensive|holistic|overall|everything|all aspects|financial plan|financial roadmap|"
    r"my finances|full analysis)\b", re.I,
)
_ALL_DOMAINS = re.compile(r"\b(?:everything|all aspects|full financial plan|analy[sz]e my finances|review my finances)\b", re.I)
_FOLLOW_UP = re.compile(
    r"^(?:and\b|what about\b|how about\b|continue\b)|"
    r"\b(?:that|this|those|these|it|more|same|instead|next year|next month)\b", re.I,
)


# Evaluates text query against domain patterns counting matching keywords.
# Iterates through pre-compiled regular expressions for each specialist domain.
# Returns dictionary mapping specialist names to match counts.
def domain_scores(text: str) -> Dict[str, int]:
    return {name: sum(bool(pattern.search(text or "")) for pattern in patterns)
            for name, patterns in _COMPILED_DOMAINS.items()}


# Constructs unified context text for intent routing from query and history.
# Inherits earlier user turn context only for ambiguous follow-up queries.
# Returns combined text string preserving user focus for domain classification.
def routing_text(
    user_input: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    session_summary: Optional[str] = None,
) -> str:
    """Inherit prior context only for follow-ups without an explicit domain.

    New, explicit questions take precedence over earlier topics. Broad requests
    retain their full scope rather than inheriting only the last domain.
    """
    text = (user_input or "").strip().lower()
    if any(domain_scores(text).values()) or _BROAD_REQUEST.search(text) or not _FOLLOW_UP.search(text):
        return text
    for message in reversed(conversation_history or []):
        if not isinstance(message, dict) or str(message.get("role", "")).lower() != "user":
            continue
        previous = str(message.get("content") or "").strip().lower()
        if previous and previous != text:
            if any(domain_scores(previous).values()):
                return f"{text}\n{previous}"
            break
    summary = str(session_summary or "").strip().lower()
    return f"{text}\n{summary}" if summary else text


# Selects optimal specialist agent names based on query and user data presence.
# Falls back to financial educator if no user profile information exists.
# Filters domain specialists according to availability of transactions or debts.
def select_specialists(
    user_input: str,
    user_profile: Optional[Dict[str, Any]],
    conversation_history: Optional[List[Dict[str, str]]] = None,
    session_summary: Optional[str] = None,
) -> List[str]:
    if not user_profile:
        return ["financial_educator"]
    text = routing_text(user_input, conversation_history, session_summary)
    selected = [name for name, score in domain_scores(text).items() if score]
    if selected and not _ALL_DOMAINS.search(user_input or ""):
        return selected
    # A broad review includes only specialists that have applicable input data.
    return [name for name in DOMAIN_PATTERNS
            if (name != "income_expense_analyzer" or user_profile.get("transactions"))
            and (name != "debt_optimizer" or user_profile.get("debts"))]
