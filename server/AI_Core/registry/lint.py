"""
registry/lint.py - Candidate linting (prompts, exemplars, routing)
==================================================================

Hard rules enforced before an artifact may even enter the gate:

* required placeholders / safety phrases of a prompt slot are preserved;
* no instruction to invent, estimate or alter numbers, or to bypass the
  number-safety guard / verification / specialist outputs;
* exemplars carry no digits and no redaction placeholders (so they cannot seed
  new numbers into a generation);
* routing parameters stay inside their declared bounds (re-validated).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List

from .defaults import EXEMPLAR_KEYS, PROMPT_SPECS
from .models import ArtifactBase, ExemplarSet, PromptArtifact, RoutingConfig

_NEGATIONS = re.compile(r"(?:\bnot\b|\bnever\b|\bno\b|n't\b|\bwithout\b|\bavoid\b|\bforbid\w*\b)", re.I)

# (name, pattern).  A match is ignored when a negation directly precedes it.
_FORBIDDEN = (
    (
        "invent_numbers",
        re.compile(
            r"\b(?:invent|fabricate|make\s+up|made[- ]up|hallucinate|guess|estimate|approximate|round)\b"
            r"[^.\n]{0,40}\b(?:numbers?|figures?|amounts?|values?|statistics|percentages?|rates?)\b",
            re.I,
        ),
    ),
    (
        "new_numbers",
        re.compile(
            r"\b(?:add|introduce|include|insert|create|provide|invent|supply)\b[^.\n]{0,25}"
            r"\b(?:new|extra|additional|illustrative|example|sample|made[- ]up)\s+"
            r"(?:numbers?|figures?|statistics|amounts?|values?|calculations?)\b",
            re.I,
        ),
    ),
    (
        "change_numbers",
        re.compile(
            r"\b(?:change|alter|modify|recompute|recalculate|adjust|correct|update)\b[^.\n]{0,25}"
            r"\b(?:the\s+)?(?:numbers?|figures?|amounts?|values?)\b",
            re.I,
        ),
    ),
    (
        "bypass_guard",
        re.compile(
            r"\b(?:ignore|bypass|skip|disable|override|circumvent|disregard|turn\s+off|work\s+around)\b"
            r"[^.\n]{0,40}\b(?:guard|safety|verification|validator|validation|checks?|constraints?|"
            r"previous\s+instructions|system\s+prompt|rules?)\b",
            re.I,
        ),
    ),
    ("reveal_prompt", re.compile(r"\b(?:reveal|print|repeat)\b[^.\n]{0,30}\b(?:system\s+prompt|instructions)\b", re.I)),
    ("secrets", re.compile(r"\b(?:api[_ -]?key|password|secret|token)\s*[:=]", re.I)),
)

_DIGIT = re.compile(r"\d")
_REDACTION_TOKEN = re.compile(r"<(?:AMT|NUM|ACCT|EMAIL|PHONE|SECRET)>")


# Encapsulates outcome and validation diagnostics from linting an artifact.
# Tracks pass status boolean alongside collection of error messages.
# Provides serialization helper for reporting validation status.
@dataclass
class LintResult:
    ok: bool
    errors: List[str] = field(default_factory=list)

    # Serializes lint outcome instance into standard dictionary structure.
    # Copies error list to guarantee immutability of returned representation.
    # Returns dictionary indicating pass status and error descriptions.
    def to_dict(self) -> Dict[str, Any]:
        return {"ok": self.ok, "errors": list(self.errors)}


# Evaluates whether pattern match is negated in immediate preceding text.
# Inspects text window within current sentence boundary for negation keywords.
# Returns true if match should be treated as legitimate negative constraint.
def _negated(text: str, start: int) -> bool:
    window = text[max(0, start - 80):start]
    # only consider the current sentence/clause
    window = re.split(r"[.\n;:]", window)[-1]
    return bool(_NEGATIONS.search(window))


# Scans input text against set of forbidden adversarial instruction regexes.
# Verifies occurrences while disregarding instructions qualified by negation.
# Returns list of matched forbidden violation descriptions found in text.
def _forbidden_hits(text: str) -> List[str]:
    hits: List[str] = []
    for name, pattern in _FORBIDDEN:
        for match in pattern.finditer(text):
            if _negated(text, match.start()):
                continue
            hits.append(f"forbidden instruction ({name}): '{match.group(0)[:60]}'")
            break
    return hits


# Validates prompt template against structural and safety requirements.
# Verifies presence of mandatory placeholders, safety rules, and length limits.
# Returns LintResult summarizing validation success or detected violations.
def lint_prompt_text(key: str, text: str) -> LintResult:
    errors: List[str] = []
    spec = PROMPT_SPECS.get(key)
    if spec is None:
        return LintResult(False, [f"unknown prompt key '{key}'"])
    if not isinstance(text, str) or not text.strip():
        return LintResult(False, ["prompt text is empty"])
    if len(text) > spec.max_length:
        errors.append(f"prompt exceeds {spec.max_length} characters")
    for name in spec.required_placeholders:
        if "{" + name + "}" not in text:
            errors.append(f"missing required placeholder {{{name}}}")
    lowered = text.lower()
    for phrase in spec.required_phrases:
        if phrase.lower() not in lowered:
            errors.append(f"missing required safety phrase: '{phrase}'")
    errors.extend(_forbidden_hits(text))
    return LintResult(not errors, errors)


# Validates exemplar dataset against digit restrictions and safety rules.
# Confirms target slot permits few-shot exemplars and rejects numeric tokens.
# Returns LintResult indicating compliance with strict few-shot criteria.
def lint_exemplar_set(artifact: ExemplarSet) -> LintResult:
    errors: List[str] = []
    if artifact.key not in EXEMPLAR_KEYS:
        errors.append(f"exemplars are not allowed for '{artifact.key}'")
    if not artifact.examples:
        errors.append("exemplar set is empty")
    for idx, example in enumerate(artifact.examples):
        for side, text in (("input", example.input), ("output", example.output)):
            if _DIGIT.search(text):
                errors.append(f"example {idx} {side} contains digits")
            if _REDACTION_TOKEN.search(text):
                errors.append(f"example {idx} {side} contains a redaction placeholder")
            for hit in _forbidden_hits(text):
                errors.append(f"example {idx} {side}: {hit}")
    return LintResult(not errors, errors)


# Validates routing configuration parameter values against Pydantic schema.
# Checks that parameter thresholds fall within allowable operational bounds.
# Returns LintResult confirming schema adherence or capturing error message.
def lint_routing_config(artifact: RoutingConfig) -> LintResult:
    try:
        RoutingConfig.model_validate(artifact.model_dump())
    except Exception as exc:  # pydantic ValidationError
        return LintResult(False, [str(exc)[:300]])
    return LintResult(True, [])


# Dispatches artifact linting to specialized validator based on artifact type.
# Routes prompt, exemplar, or routing configuration to appropriate checker.
# Returns LintResult generated by dedicated domain-specific validator.
def lint_artifact(artifact: ArtifactBase) -> LintResult:
    if isinstance(artifact, PromptArtifact):
        return lint_prompt_text(artifact.key, artifact.text)
    if isinstance(artifact, ExemplarSet):
        return lint_exemplar_set(artifact)
    if isinstance(artifact, RoutingConfig):
        return lint_routing_config(artifact)
    return LintResult(False, ["unsupported artifact"])
