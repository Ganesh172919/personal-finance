"""
Structured model catalog backed by external JSON data.
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


class ModelCapability(Enum):
    ROUTING = "routing"
    SUMMARIZATION = "summarization"
    ANALYSIS = "analysis"
    REASONING = "reasoning"
    PREMIUM = "premium"
    CODE = "code"
    VISION = "vision"
    EMBEDDING = "embedding"


class SpeedTier(Enum):
    FAST = "fast"
    MEDIUM = "medium"
    SLOW = "slow"


class CostTier(Enum):
    FREE = "free"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    PREMIUM = "premium"


class ReasoningStrength(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"


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
    description: str = ""
    tags: List[str] = field(default_factory=list)
    cost_input_per_1k: float = 0.0
    cost_output_per_1k: float = 0.0

    def matches_capability(self, capability: ModelCapability) -> bool:
        return capability in self.capabilities

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


MODEL_CATALOG: Dict[str, ModelEntry] = {}


def _catalog_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "model_catalog.json"


def _enum_set(enum_cls: Any, values: Iterable[str]) -> Set[Any]:
    result = set()
    for value in values:
        try:
            result.add(enum_cls(str(value)))
        except ValueError:
            continue
    return result


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
        description=str(merged.get("description", "")),
        tags=[str(tag) for tag in merged.get("tags", [])],
        cost_input_per_1k=float(merged.get("cost_input_per_1k", 0.0)),
        cost_output_per_1k=float(merged.get("cost_output_per_1k", 0.0)),
    )


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


def get_model_by_id(model_id: str) -> Optional[ModelEntry]:
    return MODEL_CATALOG.get(model_id)


def get_all_models() -> List[ModelEntry]:
    return sorted(MODEL_CATALOG.values(), key=_sorting_tuple)


def get_enabled_models() -> List[ModelEntry]:
    return [model for model in get_all_models() if model.enabled]


def get_models_by_provider(provider: str) -> List[ModelEntry]:
    provider_name = str(provider).strip().lower()
    return [model for model in get_enabled_models() if model.provider == provider_name]


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


def get_cheapest_model_for_task(capability: ModelCapability) -> Optional[ModelEntry]:
    models = get_models_for_task(capability)
    if not models:
        return None

    cost_order = [CostTier.FREE, CostTier.LOW, CostTier.MEDIUM, CostTier.HIGH, CostTier.PREMIUM]
    return min(models, key=lambda model: cost_order.index(model.cost_tier))


def get_fastest_model_for_task(capability: ModelCapability) -> Optional[ModelEntry]:
    models = get_models_for_task(capability)
    if not models:
        return None

    speed_order = [SpeedTier.FAST, SpeedTier.MEDIUM, SpeedTier.SLOW]
    return min(models, key=lambda model: speed_order.index(model.speed_tier))


def get_best_model_for_task(capability: ModelCapability) -> Optional[ModelEntry]:
    models = get_models_for_task(capability)
    return models[0] if models else None


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


def _auto_enable_models() -> None:
    for model in MODEL_CATALOG.values():
        model.enabled = _provider_configured(model.provider)


_load_catalog()

logger.info(
    "Model catalog initialized: %d total, %d enabled",
    len(MODEL_CATALOG),
    sum(1 for model in MODEL_CATALOG.values() if model.enabled),
)
