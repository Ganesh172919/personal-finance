"""
registry/models.py - Versioned artifact schemas for the self-improvement loop
=============================================================================

Three artifact kinds, all sharing the lifecycle fields of ``ArtifactBase``:

* ``PromptArtifact``  - text for one named prompt slot (see ``defaults.py``).
* ``RoutingConfig``   - a *bounded* set of routing weights / thresholds.
* ``ExemplarSet``     - few-shot examples (redacted, digit-free) for a prompt slot.

SAFETY: none of these can express numeric computation.  Routing parameters are
integer/float knobs with hard bounds, prompts are linted (``lint.py``), and the
number-safety guard in ``utils/agent_helpers.py`` is never configurable.

Lifecycle::

    draft -> (gate) -> shadow? -> canary -> active -> retired
                          \_________________________^ (rollback restores the previous active)
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

ArtifactKind = Literal["prompt", "routing", "exemplar"]
ArtifactStatus = Literal["draft", "shadow", "canary", "active", "retired"]
ArtifactScope = Literal["global", "org"]

ROUTING_KEY = "routing"

_PHRASE_RE = re.compile(r"^[a-z][a-z ]{2,39}$")


# Returns current timezone-aware UTC datetime timestamp.
# Standardizes creation and update timestamps across artifacts.
# Returns datetime object initialized to current UTC time.
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Generates unique prefixed identifier string for new artifact.
# Combines artifact kind abbreviation with random hex uuid string.
# Returns formatted identifier string for artifact identity tracking.
def new_artifact_id(kind: str) -> str:
    return f"art_{kind[:3]}_{uuid.uuid4().hex[:12]}"


# Base Pydantic model for all versioned registry artifacts.
# Manages lifecycle states, scoping, canary rollout progress, and notes.
# Provides common identity and persistence serialization helpers.
class ArtifactBase(BaseModel):
    id: str = ""
    kind: ArtifactKind
    key: str
    version: int = 0
    parent: Optional[str] = None
    status: ArtifactStatus = "draft"
    scope: ArtifactScope = "global"
    org_id: Optional[str] = None
    eval_report_id: Optional[str] = None
    gate_passed: bool = False
    created_by: str = "manual"
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    previous_active_id: Optional[str] = None
    # Canary progress: {percent, step, startedAt, ...}; managed by learning/rollout.py
    rollout: Dict[str, Any] = Field(default_factory=dict)
    # Aggregate evidence only (cluster keys + counts); never raw user text.
    evidence: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""

    # Normalizes and sanitizes organization identifier string.
    # Strips whitespace characters and converts blank strings to None.
    # Returns trimmed organization identifier or None if empty.
    @field_validator("org_id")
    @classmethod
    def _strip_org(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    # Validates artifact scoping and assigns default ID post-initialization.
    # Ensures org-scoped artifacts possess valid non-empty org_id values.
    # Clears org_id for global artifacts and assigns identifier if missing.
    def model_post_init(self, __context: Any) -> None:
        if not self.id:
            self.id = new_artifact_id(self.kind)
        if self.scope == "org" and not self.org_id:
            raise ValueError("org-scoped artifacts require org_id")
        if self.scope == "global":
            self.org_id = None

    # -- persistence -------------------------------------------------------
    # Returns payload dictionary specific to underlying artifact kind.
    # Serves as base hook overridden by Prompt, Routing, and Exemplar sets.
    # Returns empty dictionary on base artifact class instance.
    def content(self) -> Dict[str, Any]:  # pragma: no cover - overridden
        return {}

    # Serializes artifact model into MongoDB document representation.
    # Dumps model attributes and maps ID attribute to document _id key.
    # Returns dictionary suitable for database collection insertion.
    def to_doc(self) -> Dict[str, Any]:
        doc = self.model_dump()
        doc["_id"] = self.id
        return doc


# Artifact representing versioned prompt template text for agent slot.
# Contains text payload constrained to maximum allowed character length.
# Inherits lifecycle and scoping metadata from ArtifactBase model.
class PromptArtifact(ArtifactBase):
    kind: ArtifactKind = "prompt"
    text: str = Field(default="", max_length=6000)

    # Returns prompt text encapsulated in standardized content dictionary.
    # Exposes text attribute for artifact payload inspection and API export.
    # Returns dictionary containing single text key with prompt string.
    def content(self) -> Dict[str, Any]:
        return {"text": self.text}


# Artifact defining bounded routing parameters and complexity thresholds.
# Governs agent decomposition criteria, trigger phrases, and cache TTLs.
# Enforces strictly bounded parameters to ensure safe workflow execution.
class RoutingConfig(ArtifactBase):
    """Bounded routing knobs lifted out of ``master_agent`` / ``task_decomposer``.

    The defaults reproduce the pre-registry behaviour exactly.
    """

    kind: ArtifactKind = "routing"
    key: str = ROUTING_KEY

    # ``MasterFinancialStrategistAgent._should_decompose`` thresholds.
    decompose_min_domains: int = Field(default=3, ge=2, le=5)
    plan_language_min_domains: int = Field(default=2, ge=1, le=4)
    complex_profile_min_domains: int = Field(default=2, ge=1, le=4)
    # Extra trigger phrases (additive only; the built-ins can never be removed).
    extra_broad_phrases: List[str] = Field(default_factory=list, max_length=12)
    extra_plan_phrases: List[str] = Field(default_factory=list, max_length=12)
    # ``task_decomposer.COMPLEXITY_THRESHOLD``.
    decomposer_complexity_threshold: float = Field(default=0.5, ge=0.3, le=0.9)
    # Educator concept-cache TTL (cache / threshold tuner).
    educator_cache_ttl_seconds: int = Field(default=1800, ge=60, le=21600)

    # Validates and cleans routing trigger phrases against regex format.
    # Strips whitespace, normalizes to lowercase, and removes duplicates.
    # Returns list of validated distinct routing trigger phrase strings.
    @field_validator("extra_broad_phrases", "extra_plan_phrases")
    @classmethod
    def _phrases(cls, v: List[str]) -> List[str]:
        cleaned: List[str] = []
        for item in v:
            item = (item or "").strip().lower()
            if not _PHRASE_RE.match(item):
                raise ValueError(f"invalid routing phrase: {item!r}")
            if item not in cleaned:
                cleaned.append(item)
        return cleaned

    # Extracts all configurable routing parameters as dictionary.
    # Pulls defined parameter fields specified in ROUTING_PARAM_FIELDS.
    # Returns parameter mapping dictionary ready for agent application.
    def params(self) -> Dict[str, Any]:
        return {name: getattr(self, name) for name in ROUTING_PARAM_FIELDS}

    # Exports routing configuration parameter dictionary as content payload.
    # Delegates parameter extraction to internal params helper method.
    # Returns dictionary representing full routing configuration values.
    def content(self) -> Dict[str, Any]:
        return self.params()


ROUTING_PARAM_FIELDS = (
    "decompose_min_domains",
    "plan_language_min_domains",
    "complex_profile_min_domains",
    "extra_broad_phrases",
    "extra_plan_phrases",
    "decomposer_complexity_threshold",
    "educator_cache_ttl_seconds",
)


# Represents individual input-output few-shot demonstration example.
# Enforces maximum character limits on both input and output fields.
# Ensures prompt examples remain compact and free of verbose data.
class ExemplarExample(BaseModel):
    input: str = Field(max_length=400)
    output: str = Field(max_length=700)


# Artifact containing curated few-shot example pairs for prompt slot.
# Holds bounded collection of ExemplarExample models and synthetic flag.
# Provides few-shot context while strictly adhering to safety rails.
class ExemplarSet(ArtifactBase):
    kind: ArtifactKind = "exemplar"
    examples: List[ExemplarExample] = Field(default_factory=list, max_length=3)
    synthetic: bool = False

    # Serializes few-shot exemplar examples into standardized content dictionary.
    # Converts contained example models to dictionaries and includes synthetic flag.
    # Returns dictionary containing examples list and synthetic boolean indicator.
    def content(self) -> Dict[str, Any]:
        return {"examples": [e.model_dump() for e in self.examples], "synthetic": self.synthetic}


# Deserializes MongoDB document into appropriate concrete ArtifactBase subclass.
# Inspects kind field and validates data against corresponding Pydantic model.
# Returns instantiated PromptArtifact, RoutingConfig, or ExemplarSet instance.
def artifact_from_doc(doc: Dict[str, Any]) -> ArtifactBase:
    data = {k: v for k, v in doc.items() if k != "_id"}
    kind = data.get("kind")
    if kind == "prompt":
        return PromptArtifact.model_validate(data)
    if kind == "routing":
        return RoutingConfig.model_validate(data)
    if kind == "exemplar":
        return ExemplarSet.model_validate(data)
    raise ValueError(f"unknown artifact kind: {kind!r}")


_CAMEL_RE = re.compile(r"_([a-z])")


# Converts snake_case string identifier into camelCase representation.
# Uses regex substitution to uppercase characters preceded by underscores.
# Returns camelCase formatted string suitable for client JSON responses.
def camel(name: str) -> str:
    return _CAMEL_RE.sub(lambda m: m.group(1).upper(), name)


# Recursively transforms dictionary keys to camelCase and dates to ISO strings.
# Traverses nested dictionaries, lists, and datetime instances recursively.
# Returns normalized JSON-compatible structure with camelCase keys.
def to_camel_json(value: Any) -> Any:
    """Recursively camelCase dict keys and ISO-format datetimes for API output."""
    if isinstance(value, dict):
        return {camel(str(k)) if not str(k).startswith("_") else str(k): to_camel_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_camel_json(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


# Formats complete artifact model into camelCase response for API consumers.
# Normalizes lifecycle attributes and embeds structured content payload.
# Returns formatted dictionary matching frontend API response specifications.
def artifact_to_api(artifact: ArtifactBase) -> Dict[str, Any]:
    doc = artifact.model_dump()
    # Keep prompt text / params / examples under stable top-level keys.
    out = to_camel_json(doc)
    out["content"] = to_camel_json(artifact.content())
    return out
