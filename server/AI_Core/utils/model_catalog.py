r"""
Structured model catalog backed by external JSON data.

================================================================================
MINDMAP FLOW: MODEL CATALOG & DYNAMIC ROUTING ENGINE
================================================================================
- Model Catalog Engine
    ├── 1. Data Ingestion & Schema Definition
    │   ├── model_catalog.json (Provider definitions, defaults, fallback rankings)
    │   ├── ModelEntry Dataclass (Model ID, capabilities, tokens, tiers, costs)
    │   └── Enums (ModelCapability, SpeedTier, CostTier, ReasoningStrength)
    ├── 2. Dynamic Provider Auto-Discovery
    │   ├── Environment Scanning (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, etc.)
    │   ├── Array Keys Check (OPENAI_API_KEYS, etc.)
    │   └── Indexed Keys Check (KEY_1 ... KEY_20)
    ├── 3. Health-Aware Multi-Criteria Sorting
    │   ├── ModelHealthTracker Integration (Health score: -1000 cooldown, -500 open)
    │   ├── Fallback Rank Ordering (Lowest integer = highest priority)
    │   ├── Reasoning Tier Weighting (EXTREME > HIGH > MEDIUM > LOW)
    │   ├── Speed Tier Weighting (FAST > MEDIUM > SLOW)
    │   ├── Cost Tier Weighting (FREE > LOW > MEDIUM > HIGH > PREMIUM)
    │   └── Context Window (Larger window favored as tiebreaker)
    ├── 4. Task-Specific Model Resolution
    │   ├── Capability Match (e.g., REASONING, ROUTING, ANALYSIS, SUMMARIZATION)
    │   ├── Cost & Speed Constraints (max_cost_tier, min_speed_tier)
    │   └── Provider Whitelisting (Optional provider filtering)
    └── 5. Resilient Fallback Chain Synthesis
        ├── Primary Model Selection
        ├── Capability Fallback Expansion
        └── Strict Capacity Capping (max_chain_length=5)

================================================================================
ASCII FLOW: MODEL RESOLUTION & FALLBACK CHAIN LIFECYCLE
================================================================================
               +--------------------------------------+
               |    Startup: _load_catalog()          |
               |  Reads data/model_catalog.json       |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |      _auto_enable_models()           |
               |  Scans ENV: Key, KeyS, Key_1..20     |
               +-------------------+------------------+
                                   |
                                   v
             [ MODEL_CATALOG Dictionary Populated ]
                                   |
    Task Request: get_models_for_task(capability, max_cost, min_speed)
                                   |
                                   v
               +--------------------------------------+
               |  Filter by Capability & Constraints  |
               |  Matches: capability in entry.caps   |
               |  Check: Cost <= max_cost             |
               |  Check: Speed >= min_speed           |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |        _sorting_tuple()              |
               |  1. -Health Score (HealthTracker)    |
               |  2. Fallback Rank (1..100)           |
               |  3. Reasoning Strength (EXTREME..LOW)|
               |  4. Speed Tier (FAST..SLOW)          |
               |  5. Cost Tier (FREE..PREMIUM)        |
               |  6. -Context Window                  |
               +-------------------+------------------+
                                   |
                                   v
         +--------------------------------------------------+
         | Top Candidate / Ordered Candidates Returned      |
         +-------------------------+------------------------+
                                   |
                 If Primary Fails during Ingestion:
                                   v
         +--------------------------------------------------+
         |      get_fallback_chain(primary_model_id)        |
         |  [Primary] -> [Healthy Alt 1] -> [Healthy Alt 2] |
         +--------------------------------------------------+
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from utils.model_health import get_model_health_tracker

logger = logging.getLogger(__name__)


# Enumeration of distinct LLM task capabilities supported across models.
# Defines capabilities including routing, summarization, analysis, and reasoning.
# Used for task-specific candidate filtering and optimal model selection.
class ModelCapability(Enum):
    ROUTING = "routing"
    SUMMARIZATION = "summarization"
    ANALYSIS = "analysis"
    REASONING = "reasoning"
    PREMIUM = "premium"
    CODE = "code"
    VISION = "vision"
    EMBEDDING = "embedding"


# Enumeration categorizing model execution latency and response throughput.
# Classifies models into fast, medium, and slow operational tiers.
# Enables latency constraints during candidate model resolution.
class SpeedTier(Enum):
    FAST = "fast"
    MEDIUM = "medium"
    SLOW = "slow"


# Enumeration classifying model financial expense tiers per token.
# Ranges across free, low, medium, high, and premium expenditure brackets.
# Enforces cost ceilings and economic prioritization during model routing.
class CostTier(Enum):
    FREE = "free"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    PREMIUM = "premium"


# Enumeration classifying model logical reasoning and problem-solving depth.
# Ranges from low reasoning up to extreme analytical capability levels.
# Directs complex reasoning tasks to adequately capable model candidates.
class ReasoningStrength(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"


# Dataclass encapsulating comprehensive metadata for a registered LLM model.
# Records provider, capabilities, context limits, costs, and feature flags.
# Powers health-aware ranking and dynamic fallback chain construction.
@dataclass
class ModelEntry:
    model_id: str
    provider: str
    display_name: str
    capabilities: Set[ModelCapability] = field(default_factory=set)
    context_window: int = 8192
    max_output_tokens: int = 4096
    speed_tier: SpeedTier = SpeedTier.MEDIUM
    cost_tier: CostTier = CostTier.MEDIUM
    reasoning_strength: ReasoningStrength = ReasoningStrength.MEDIUM
    modality: List[str] = field(default_factory=lambda: ["text"])
    supports_vision: bool = False
    supports_function_calling: bool = True
    supports_streaming: bool = True
    supports_json_mode: bool = False
    fallback_rank: int = 100
    enabled: bool = True
    retired: bool = False
    description: str = ""
    tags: List[str] = field(default_factory=list)
    cost_input_per_1k: float = 0.0
    cost_output_per_1k: float = 0.0

    # Evaluates whether the model supports a specified task capability.
    # Checks membership against the configured capabilities set.
    # Returns true if the model satisfies the requested capability.
    def matches_capability(self, capability: ModelCapability) -> bool:
        return capability in self.capabilities

    # Serializes model metadata into standard dictionary representation.
    # Converts enums and sets into JSON-serializable strings and lists.
    # Returns dictionary suitable for API responses and telemetry logging.
    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_id": self.model_id,
            "provider": self.provider,
            "display_name": self.display_name,
            "capabilities": sorted(cap.value for cap in self.capabilities),
            "context_window": self.context_window,
            "max_output_tokens": self.max_output_tokens,
            "speed_tier": self.speed_tier.value,
            "cost_tier": self.cost_tier.value,
            "reasoning_strength": self.reasoning_strength.value,
            "modality": self.modality,
            "supports_vision": self.supports_vision,
            "supports_function_calling": self.supports_function_calling,
            "supports_streaming": self.supports_streaming,
            "supports_json_mode": self.supports_json_mode,
            "fallback_rank": self.fallback_rank,
            "enabled": self.enabled,
            "description": self.description,
            "tags": self.tags,
            "cost_input_per_1k": self.cost_input_per_1k,
            "cost_output_per_1k": self.cost_output_per_1k,
        }


# In-memory dictionary registry mapping model IDs to ModelEntry instances.
# Populated from disk during startup and updated with provider health state.
# Serves as the central registry for model discovery and resolution.
MODEL_CATALOG: Dict[str, ModelEntry] = {}


# Resolves the absolute filesystem path to model catalog JSON definition.
# Navigates relative to current module location to locate data directory.
# Returns Path object pointing to model_catalog.json file.
def _catalog_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "model_catalog.json"


# Parses an iterable of string values into a validated set of enum members.
# Silently ignores invalid or unrecognized enum values during iteration.
# Returns set containing successfully parsed enum instances.
def _enum_set(enum_cls: Any, values: Iterable[str]) -> Set[Any]:
    result = set()
    for value in values:
        try:
            result.add(enum_cls(str(value)))
        except ValueError:
            continue
    return result


# Constructs a ModelEntry instance by merging provider defaults with model data.
# Parses capability enums, context limits, pricing details, and feature flags.
# Returns fully validated ModelEntry configured for catalog registration.
def _build_model_entry(provider: str, defaults: Dict[str, Any], model_data: Dict[str, Any]) -> ModelEntry:
    merged = dict(defaults)
    merged.update(model_data)
    model_name = str(merged["model"]).strip()

    return ModelEntry(
        model_id=f"{provider}/{model_name}",
        provider=provider,
        display_name=str(merged.get("display_name") or model_name),
        capabilities=_enum_set(ModelCapability, merged.get("capabilities", [])),
        context_window=int(merged.get("context_window", 8192)),
        max_output_tokens=int(merged.get("max_output_tokens", 4096)),
        speed_tier=SpeedTier(str(merged.get("speed_tier", "medium"))),
        cost_tier=CostTier(str(merged.get("cost_tier", "medium"))),
        reasoning_strength=ReasoningStrength(str(merged.get("reasoning_strength", "medium"))),
        modality=[str(item) for item in merged.get("modality", ["text"])],
        supports_vision=bool(merged.get("supports_vision", False)),
        supports_function_calling=bool(merged.get("supports_function_calling", True)),
        supports_streaming=bool(merged.get("supports_streaming", True)),
        supports_json_mode=bool(merged.get("supports_json_mode", False)),
        fallback_rank=int(merged.get("fallback_rank", 100)),
        retired=bool(merged.get("retired", False)),
        description=str(merged.get("description", "")),
        tags=[str(tag) for tag in merged.get("tags", [])],
        cost_input_per_1k=float(merged.get("cost_input_per_1k", 0.0)),
        cost_output_per_1k=float(merged.get("cost_output_per_1k", 0.0)),
    )


# Maps provider name string to its corresponding primary environment variable key.
# Identifies canonical credential variable name for each supported provider.
# Returns environment variable name string or none if provider is unsupported.
def _provider_env_key(provider: str) -> Optional[str]:
    provider_keys = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "groq": "GROQ_API_KEY",
        "grok": "XAI_API_KEY",
        "together": "TOGETHER_API_KEY",
        "mistral": "MISTRAL_API_KEY",
        "cohere": "COHERE_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
    }
    return provider_keys.get(provider)


# Evaluates whether credentials are configured for a given provider.
# Checks primary API key, array keys, and indexed key variants in environment.
# Returns true if at least one valid credential key exists for the provider.
def _provider_configured(provider: str) -> bool:
    env_var = _provider_env_key(provider)
    if not env_var:
        return False

    if os.getenv(env_var, "").strip():
        return True

    array_key = os.getenv(f"{env_var}S", "").strip()
    if array_key:
        return True

    for index in range(1, 21):
        if os.getenv(f"{env_var}_{index}", "").strip():
            return True

    return False


# Loads and parses model definitions from external JSON catalog file.
# Populates global MODEL_CATALOG registry and auto-enables configured models.
# Re-initializes registered models across all configured providers.
def _load_catalog() -> None:
    catalog_file = _catalog_path()
    raw = json.loads(catalog_file.read_text(encoding="utf-8"))

    MODEL_CATALOG.clear()
    for provider_block in raw.get("providers", []):
        provider = str(provider_block.get("provider", "")).strip()
        if not provider:
            continue

        defaults = provider_block.get("defaults", {})
        for model_data in provider_block.get("models", []):
            entry = _build_model_entry(provider, defaults, model_data)
            MODEL_CATALOG[entry.model_id] = entry

    _auto_enable_models()


# Generates multi-criteria comparison tuple for health-aware model ranking.
# Factors in health score, fallback rank, reasoning strength, speed, and cost.
# Returns ordered tuple used to sort candidate models by suitability.
def _sorting_tuple(model: ModelEntry) -> tuple[Any, ...]:
    speed_order = {SpeedTier.FAST: 0, SpeedTier.MEDIUM: 1, SpeedTier.SLOW: 2}
    cost_order = {
        CostTier.FREE: 0,
        CostTier.LOW: 1,
        CostTier.MEDIUM: 2,
        CostTier.HIGH: 3,
        CostTier.PREMIUM: 4,
    }
    reasoning_order = {
        ReasoningStrength.EXTREME: 0,
        ReasoningStrength.HIGH: 1,
        ReasoningStrength.MEDIUM: 2,
        ReasoningStrength.LOW: 3,
    }
    health_score = get_model_health_tracker().get_score(model.model_id)
    return (
        -health_score,
        model.fallback_rank,
        reasoning_order[model.reasoning_strength],
        speed_order[model.speed_tier],
        cost_order[model.cost_tier],
        -model.context_window,
    )


# Retrieves registered ModelEntry by its namespaced model identifier.
# Looks up model ID in global in-memory MODEL_CATALOG dictionary.
# Returns ModelEntry instance or none if identifier is not found.
def get_model_by_id(model_id: str) -> Optional[ModelEntry]:
    return MODEL_CATALOG.get(model_id)


# Returns list of all catalog models ordered by multi-criteria ranking.
# Sorts entries using current health scores and static configuration priorities.
# Returns comprehensive list of registered ModelEntry instances.
def get_all_models() -> List[ModelEntry]:
    return sorted(MODEL_CATALOG.values(), key=_sorting_tuple)


# Filters catalog for currently active and configured model candidates.
# Excludes disabled or retired models whose providers lack active credentials.
# Returns ordered list of enabled ModelEntry instances.
def get_enabled_models() -> List[ModelEntry]:
    return [model for model in get_all_models() if model.enabled]


# Retrieves enabled model candidates belonging to a specific provider.
# Filters enabled models by case-insensitive provider name comparison.
# Returns ordered list of ModelEntry instances for requested provider.
def get_models_by_provider(provider: str) -> List[ModelEntry]:
    provider_name = str(provider).strip().lower()
    return [model for model in get_enabled_models() if model.provider == provider_name]


# Filters and ranks available models matching capability and tier constraints.
# Applies cost ceiling, minimum speed requirements, and provider filters.
# Returns sorted list of compliant ModelEntry instances ordered by suitability.
def get_models_for_task(
    capability: ModelCapability,
    max_cost_tier: Optional[CostTier] = None,
    min_speed_tier: Optional[SpeedTier] = None,
    providers: Optional[List[str]] = None,
) -> List[ModelEntry]:
    cost_order = [CostTier.FREE, CostTier.LOW, CostTier.MEDIUM, CostTier.HIGH, CostTier.PREMIUM]
    speed_order = [SpeedTier.FAST, SpeedTier.MEDIUM, SpeedTier.SLOW]
    provider_filter = {provider.strip().lower() for provider in (providers or []) if provider.strip()}

    results: List[ModelEntry] = []
    for model in get_enabled_models():
        if not model.matches_capability(capability):
            continue
        if provider_filter and model.provider not in provider_filter:
            continue
        if max_cost_tier and cost_order.index(model.cost_tier) > cost_order.index(max_cost_tier):
            continue
        if min_speed_tier and speed_order.index(model.speed_tier) > speed_order.index(min_speed_tier):
            continue
        results.append(model)

    return sorted(results, key=_sorting_tuple)


# Builds prioritized fallback chain starting from requested primary model.
# Discovers alternate healthy models sharing matching task capabilities.
# Returns ordered list bounded by maximum chain length for resilient failover.
def get_fallback_chain(
    primary_model_id: str,
    capability: Optional[ModelCapability] = None,
    max_chain_length: int = 5,
) -> List[ModelEntry]:
    primary = get_model_by_id(primary_model_id)
    if not primary:
        return []

    if capability is None:
        for current in [
            ModelCapability.PREMIUM,
            ModelCapability.REASONING,
            ModelCapability.ANALYSIS,
            ModelCapability.SUMMARIZATION,
            ModelCapability.ROUTING,
        ]:
            if current in primary.capabilities:
                capability = current
                break

    capability = capability or ModelCapability.ANALYSIS
    candidates = get_models_for_task(capability)

    chain = [primary]
    for candidate in candidates:
        if len(chain) >= max_chain_length:
            break
        if candidate.model_id != primary_model_id:
            chain.append(candidate)
    return chain


# Resolves lowest cost model satisfying requested capability requirements.
# Evaluates enabled candidate models against cost tier priority ordering.
# Returns most economical ModelEntry candidate or none if none qualify.
def get_cheapest_model_for_task(capability: ModelCapability) -> Optional[ModelEntry]:
    models = get_models_for_task(capability)
    if not models:
        return None

    cost_order = [CostTier.FREE, CostTier.LOW, CostTier.MEDIUM, CostTier.HIGH, CostTier.PREMIUM]
    return min(models, key=lambda model: cost_order.index(model.cost_tier))


# Resolves highest throughput model satisfying requested capability.
# Evaluates candidate models against speed tier priority ordering.
# Returns fastest ModelEntry candidate or none if no models qualify.
def get_fastest_model_for_task(capability: ModelCapability) -> Optional[ModelEntry]:
    models = get_models_for_task(capability)
    if not models:
        return None

    speed_order = [SpeedTier.FAST, SpeedTier.MEDIUM, SpeedTier.SLOW]
    return min(models, key=lambda model: speed_order.index(model.speed_tier))


# Resolves top-ranked model candidate satisfying specified task capability.
# Returns optimal model according to multi-criteria health and rank sorting.
# Returns highest-scoring ModelEntry or none if no models qualify.
def get_best_model_for_task(capability: ModelCapability) -> Optional[ModelEntry]:
    models = get_models_for_task(capability)
    return models[0] if models else None


# Aggregates operational statistics and breakdowns across model catalog.
# Counts models by provider, capability, cost tier, and reasoning strength.
# Returns dictionary detailing catalog metrics and provider availability.
def get_catalog_stats() -> Dict[str, Any]:
    all_models = list(MODEL_CATALOG.values())
    enabled = [model for model in all_models if model.enabled]

    by_provider: Dict[str, int] = {}
    for model in enabled:
        by_provider[model.provider] = by_provider.get(model.provider, 0) + 1

    by_capability: Dict[str, int] = {}
    for capability in ModelCapability:
        count = sum(1 for model in enabled if capability in model.capabilities)
        if count:
            by_capability[capability.value] = count

    by_cost_tier: Dict[str, int] = {}
    for cost_tier in CostTier:
        count = sum(1 for model in enabled if model.cost_tier == cost_tier)
        if count:
            by_cost_tier[cost_tier.value] = count

    by_speed_tier: Dict[str, int] = {}
    for speed_tier in SpeedTier:
        count = sum(1 for model in enabled if model.speed_tier == speed_tier)
        if count:
            by_speed_tier[speed_tier.value] = count

    by_reasoning_strength: Dict[str, int] = {}
    for strength in ReasoningStrength:
        count = sum(1 for model in enabled if model.reasoning_strength == strength)
        if count:
            by_reasoning_strength[strength.value] = count

    return {
        "catalog_source": str(_catalog_path()),
        "total_models": len(all_models),
        "enabled_models": len(enabled),
        "by_provider": by_provider,
        "by_capability": by_capability,
        "by_cost_tier": by_cost_tier,
        "by_speed_tier": by_speed_tier,
        "by_reasoning_strength": by_reasoning_strength,
        "vision_models": sum(1 for model in enabled if model.supports_vision),
        "free_models": sum(1 for model in enabled if model.cost_tier == CostTier.FREE),
    }


# Synchronizes model enablement status with provider environment credentials.
# Activates unretired models that have configured credential keys present.
# Mutates enabled boolean attribute on ModelEntry instances in place.
def _auto_enable_models() -> None:
    for model in MODEL_CATALOG.values():
        model.enabled = not model.retired and _provider_configured(model.provider)


_load_catalog()

logger.info(
    "Model catalog initialized: %d total, %d enabled",
    len(MODEL_CATALOG),
    sum(1 for model in MODEL_CATALOG.values() if model.enabled),
)
